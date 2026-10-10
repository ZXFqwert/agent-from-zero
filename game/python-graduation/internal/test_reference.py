"""制作方验收：参考解通过，错误解被检查器抓住，包内没有答案。"""
from copy import deepcopy
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import workshop
from echo_workshop import checks
from echo_workshop.runtime import Host, tool_call

spec = importlib.util.spec_from_file_location("graduation_reference", Path(__file__).with_name("reference.py"))
reference = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reference)
BRIEF = {"purpose": "每天整理我自己的练习进度", "acceptance": "真实摘要文件包含已完成、未完成与下一步", "toolBoundaries": "只读写我指定的独立练习目录，每次写入批准"}
MISSION = json.loads((ROOT / "mission.example.json").read_text(encoding="utf-8"))
MISSION["title"] = "我的练习摘要交付"


def altered(**changes):
    values = {name: getattr(reference, name) for name in dir(reference) if not name.startswith("__")}
    values.update(changes)
    return types.SimpleNamespace(**values)


class ReferenceHarnessChecks(unittest.TestCase):
    def test_all_reference_stages(self):
        for stage in checks.STAGE_CASES:
            with self.subTest(stage=stage):
                result = workshop.run_checks(stage, BRIEF, reference, reference, io.StringIO(), mission=MISSION)
                self.assertTrue(result.wasSuccessful(), result.errors or result.failures)
                report = workshop.make_report(stage, result, BRIEF)
                self.assertEqual(report["summary"]["failed"], 0)
                self.assertEqual({row["id"] for row in report["checks"]}, set(checks.check_ids(stage)))
                self.assertFalse(report["scope"]["realModelCalled"])

    def test_starter_reports_real_failures(self):
        import learner
        import extension
        result = workshop.run_checks("context", None, learner, extension, io.StringIO())
        self.assertFalse(result.wasSuccessful())
        report = workshop.make_report("context", result)
        self.assertEqual(report["summary"], {"passed": 0, "failed": 3, "total": 3})
        self.assertTrue(all("实现 build_context" in row["message"] for row in report["checks"]))

    def test_injection_fault_is_caught(self):
        def wrong(goal, rules, documents):
            return [{"role": "system", "content": rules + json.dumps(documents, ensure_ascii=False)}, {"role": "user", "content": goal}]
        result = workshop.run_checks("context", BRIEF, altered(build_context=wrong), reference, io.StringIO())
        self.assertFalse(result.wasSuccessful())
        self.assertIn("context.injection_data", {row["id"] for row in result.checks if row["status"] == "failed"})

    def test_unapproved_side_effect_is_caught(self):
        original = reference.write_once
        try:
            reference.write_once = lambda host, path, content, request_id, approved: host.write_note(path, content)
            result = workshop.run_checks("approval", BRIEF, reference, reference, io.StringIO())
            self.assertFalse(result.wasSuccessful())
            failures = {row["id"] for row in result.checks if row["status"] == "failed"}
            self.assertTrue({"approval.denied", "approval.once", "approval.id_conflict"}.issubset(failures))
        finally:
            reference.write_once = original

    def test_claim_completion_fault_is_caught(self):
        original = reference.run_agent
        def wrong(*args, **kwargs):
            result = original(*args, **kwargs)
            result["verified"] = True
            return result
        result = workshop.run_checks("loop", BRIEF, altered(run_agent=wrong), reference, io.StringIO())
        self.assertFalse(result.wasSuccessful())
        self.assertIn("loop.claim_unverified", {row["id"] for row in result.checks if row["status"] == "failed"})

    def test_live_preflight_does_not_create_provider(self):
        from unittest.mock import patch
        args = types.SimpleNamespace(brief=ROOT / "personal-brief.json", live=True, mission=None, scenario="lighthouse")
        with patch.object(workshop, "ChatCompletionsProvider") as provider:
            with self.assertRaisesRegex(ValueError, "真实请求尚未开始"):
                workshop.play(args)
            provider.assert_not_called()

    def test_invalid_mission_has_no_external_write(self):
        with tempfile.TemporaryDirectory() as directory:
            host = Host(directory)
            for path in ("../outside", "C:/outside", "/outside", "link/../outside"):
                with self.assertRaises(ValueError):
                    host.resolve(path)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_report_contains_no_implementation_or_brief(self):
        result = workshop.run_checks("personal", BRIEF, reference, reference, io.StringIO(), mission=MISSION)
        text = json.dumps(workshop.make_report("personal", result, BRIEF), ensure_ascii=False)
        self.assertNotIn(BRIEF["purpose"], text)
        self.assertNotIn("MODEL_API_KEY", text)
        self.assertNotIn("def run_agent", text)

    def test_linked_workspace_root_rejected_before_write(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as directory:
            declared = Path(directory) / "root-link" / "scenario"
            real = Path.is_symlink
            with patch.object(Path, "is_symlink", lambda path: path.name == "root-link" or real(path)):
                with self.assertRaisesRegex(ValueError, "上级目录"):
                    Host(declared)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_sdk_adapter_protocol_and_hard_budget(self):
        from unittest.mock import patch
        from echo_workshop.providers import ChatCompletionsProvider
        captured = []
        message = types.SimpleNamespace(content=None, tool_calls=[types.SimpleNamespace(id="sdk-call", function=types.SimpleNamespace(name="read_note", arguments='{"path":"a.txt"}'))])
        def create(**kwargs):
            captured.append(kwargs)
            return types.SimpleNamespace(choices=[types.SimpleNamespace(message=message)])
        client = types.SimpleNamespace(chat=types.SimpleNamespace(completions=types.SimpleNamespace(create=create)))
        constructor = unittest.mock.Mock(return_value=client)
        module = types.SimpleNamespace(OpenAI=constructor)
        with patch.dict(sys.modules, {"openai": module}), patch.dict("os.environ", {"MODEL_BASE_URL": "https://example.invalid/v1", "MODEL_NAME": "scripted-test-model", "MODEL_API_KEY": "not-a-secret"}, clear=True):
            provider = ChatCompletionsProvider()
            self.assertEqual(captured, [], "创建客户端不是发出请求")
            for _ in range(8):
                result = provider.complete([{"role": "user", "content": "测试"}], [])
                self.assertEqual(result["tool_calls"][0]["id"], "sdk-call")
            with self.assertRaisesRegex(ValueError, "8 次请求"):
                provider.complete([{"role": "user", "content": "测试"}], [])
        self.assertEqual(len(captured), 8)
        self.assertEqual(captured[0]["max_tokens"], 512)
        self.assertEqual(constructor.call_args.kwargs["max_retries"], 0)
        self.assertEqual(constructor.call_args.kwargs["timeout"], 30)

    def test_checkpoint_restore_preserves_history_and_dedup(self):
        from echo_workshop.providers import fixture_provider
        from echo_workshop.runtime import load_fixture, setup_fixture
        with tempfile.TemporaryDirectory() as directory:
            fixture = load_fixture("lighthouse")
            host = Host(Path(directory) / "world", fixture["expected"], approval=lambda call: True)
            setup_fixture(host, fixture)
            path = Path(directory) / "session.json"
            marker = "ECHO_MISSION_SHA256:test"
            wrapper = workshop.CheckpointProvider(fixture_provider(fixture, call_prefix="first-"), host, reference, path, [], marker)
            first = reference.run_agent(wrapper, host, fixture["goal"], fixture["rules"], fixture["documents"])
            reference.save_session(path, {"version": 1, "messages": wrapper.history + first["messages"], "ledger": host.ledger})
            recovered = reference.load_session(path)
            new_host = Host(host.root, fixture["expected"], approval=lambda call: True)
            new_host.ledger = recovered["ledger"]
            resumed = workshop.CheckpointProvider(fixture_provider(fixture, call_prefix="second-"), new_host, reference, path, recovered["messages"], marker)
            second = reference.run_agent(resumed, new_host, fixture["goal"], fixture["rules"], fixture["documents"])
            self.assertTrue(second["verified"])
            self.assertEqual(new_host.write_count, 0, "恢复不同调用 ID 的同业务请求不能重复执行")
            saved = reference.load_session(path)
            self.assertGreater(len(saved["messages"]), len(recovered["messages"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
