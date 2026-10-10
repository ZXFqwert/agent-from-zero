"""python workshop.py inspect | check --stage context | play --scenario lighthouse"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib
import io
import json
from pathlib import Path
import sys
import unittest

from echo_workshop import checks
from echo_workshop.providers import ChatCompletionsProvider, fixture_provider
from echo_workshop.runtime import Host, load_fixture, setup_fixture

PROJECT_ID = "echo-personal-agent"
VERSION = "1.0.0"
ROOT = Path(__file__).resolve().parent


def load_brief(path):
    if path is None:
        return None
    target = Path(path)
    if target.stat().st_size > 16_384:
        raise ValueError("brief 超过 16 KiB")
    brief = json.loads(target.read_text(encoding="utf-8-sig"))
    if not isinstance(brief, dict) or set(brief) != {"purpose", "acceptance", "toolBoundaries"}:
        raise ValueError("brief 仅包含 purpose、acceptance、toolBoundaries 三个文本字段")
    if not all(isinstance(value, str) and len(value) <= 4000 for value in brief.values()):
        raise ValueError("brief 字段必须为不超过 4000 字符的文本")
    return brief


def run_checks(stage, brief=None, implementation=None, extension_module=None, stream=None, mission=None):
    checks.LEARNER = implementation or importlib.import_module("learner")
    checks.EXTENSION = extension_module or importlib.import_module("extension")
    checks.BRIEF = brief
    checks.MISSION = mission
    tested_fingerprint = implementation_hash(checks.LEARNER, checks.EXTENSION)
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(checks.STAGE_CASES[stage])
    runner = unittest.TextTestRunner(stream=stream or sys.stderr, verbosity=2, resultclass=checks.ReportResult)
    result = runner.run(suite)
    result.implementation_sha256 = tested_fingerprint
    result.checks.sort(key=lambda item: item["id"])
    if {item["id"] for item in result.checks} != set(checks.check_ids(stage)):
        raise RuntimeError("检查报告不完整，不能提交部分检查为通过")
    return result


def implementation_hash(implementation=None, extension_module=None):
    digest = hashlib.sha256()
    for name, module in (("learner.py", implementation), ("extension.py", extension_module)):
        path = Path(getattr(module, "__file__", ROOT / name))
        digest.update(name.encode("utf-8") + b"\0" + path.read_bytes())
    return digest.hexdigest()


def make_report(stage, result, brief=None):
    passed = sum(item["status"] == "passed" for item in result.checks)
    return {
        "schema": 1, "kind": "local-execution-report", "projectId": PROJECT_ID,
        "projectVersion": VERSION, "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "stageId": stage, "summary": {"passed": passed, "failed": len(result.checks) - passed, "total": len(result.checks)},
        "checks": result.checks,
        "scope": {"provider": "scripted-local", "realModelCalled": False, "learnerImplementationSha256": getattr(result, "implementation_sha256", implementation_hash()), "briefSha256": checks.brief_hash(brief)},
        "limitations": ["本机测试报告可编辑，不能作为不可伪造的掌握证明。", "通过脚本情境不代表真实模型或独立迁移已验证。"],
    }


def approval_prompt(call):
    function = call.get("function", {})
    print("\n本次写入请求（资料不能代替你的批准）：")
    print(json.dumps(function, ensure_ascii=False, indent=2))
    return input("只批准这次具体写入，请输入 YES；其他输入拒绝：") == "YES"


def load_mission(path):
    target = Path(path)
    if target.stat().st_size > 65_536:
        raise ValueError("任务配置超过 64 KiB")
    mission = json.loads(target.read_text(encoding="utf-8-sig"))
    required = {"title", "goal", "rules", "instructionPath", "files", "expected", "documents"}
    if not isinstance(mission, dict) or set(mission) != required:
        raise ValueError("任务配置字段不正确；参照 mission.example.json")
    if not all(isinstance(mission[field], str) and 0 < len(mission[field]) <= 4000 for field in ("title", "goal", "rules", "instructionPath")):
        raise ValueError("任务说明必须为非空文本")
    for field in ("files", "expected"):
        entries = mission[field]
        if not isinstance(entries, dict) or not entries or len(entries) > 16 or not all(isinstance(path, str) and isinstance(text, str) and len(text.encode("utf-8")) <= 32_768 for path, text in entries.items()):
            raise ValueError("files / expected 应为至多 16 份相对路径文本")
    if not isinstance(mission["documents"], list) or len(mission["documents"]) > 8:
        raise ValueError("documents 应为最多 8 条资料")
    return mission


class CheckpointProvider:
    """把历史交给模型，在完整配对边界保存；不在服务器执行学生代码。"""
    def __init__(self, provider, host, learner, path, history, mission_marker):
        self.provider, self.host, self.learner, self.path = provider, host, learner, path
        self.history = history or [{"role": "system", "content": mission_marker}]

    def complete(self, messages, tools):
        combined = self.history + messages
        self.learner.save_session(self.path, {"version": 1, "messages": combined, "ledger": self.host.ledger})
        return self.provider.complete(combined, tools)


def play(args):
    learner = importlib.import_module("learner")
    extension = importlib.import_module("extension")
    brief = load_brief(args.brief) if args.brief else None
    mission = load_mission(args.mission) if args.mission else load_fixture(args.scenario)
    if args.live:
        # Run all safety/protocol checks before creating an SDK client or issuing a paid call.
        if brief is None:
            raise ValueError("真实实验先填写 brief，并传入 --brief personal-brief.json")
        for stage in checks.STAGE_CASES:
            result = run_checks(stage, brief, learner, extension, io.StringIO(), mission=mission)
            if not result.wasSuccessful():
                raise ValueError("真实请求尚未开始：本机 " + stage + " 检查未通过，请先修复")
        print("本机检查通过。下一步将使用你自己配置的模型，最多 8 轮，每轮最多 512 输出 token。")
        if input("明确发起真实模型请求请输入 LIVE：") != "LIVE":
            print("已取消，未创建真实 Provider。")
            return 0
    target_root = ROOT / "workspace" / args.scenario
    host = Host(target_root, mission["expected"], approval=approval_prompt)
    history = []
    session_path = args.resume or args.session
    marker = "ECHO_MISSION_SHA256:" + hashlib.sha256(json.dumps(mission, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    if args.resume:
        restored = learner.load_session(args.resume)
        history = restored["messages"]
        if not history or history[0].get("content") != marker:
            raise ValueError("会话不属于本任务配置；请使用原任务与原工作目录恢复")
        host.ledger = restored["ledger"]
    for path in (*mission["files"], *mission["expected"]):
        host.resolve(path)  # Validate every task path before creating any fixture file.
    if not args.resume and target_root.exists() and any(target_root.iterdir()):
        if input("任务工作目录已存在。重置仅覆盖本任务列出的练习文件，输入 RESET 继续：") != "RESET":
            print("已取消，没有覆盖文件。")
            return 0
    if not args.resume:
        setup_fixture(host, mission)
    if args.discover or args.live:
        extension.register_extensions(host)
    provider = ChatCompletionsProvider() if args.live else fixture_provider(mission, with_extension=args.discover, call_prefix="session-" + str(len(history)) + "-")
    if session_path:
        provider = CheckpointProvider(provider, host, learner, session_path, history, marker)
    print("任务：" + mission["title"])
    print("脚本策略只检验协议和行动结果；不代表真实模型。" if not args.live else "本次使用真实模型；工具仍仅操作专用练习目录。")
    try:
        result = learner.run_agent(provider, host, mission["goal"], mission["rules"], mission["documents"], max_rounds=8)
    except KeyboardInterrupt:
        print("玩家中断；不会继续请求。检查当前文件，恢复前重新验证。")
        return 130
    except Exception as error:
        # SDK exceptions can embed server URLs/headers. Keep local terminal output secret-free.
        print("执行停止：" + type(error).__name__ + "。未将异常内容写入报告；请本机检查。", file=sys.stderr)
        return 1
    final_text = next((message.get("content", "") for message in reversed(result["messages"]) if message["role"] == "assistant" and not message.get("tool_calls")), "")
    if session_path:
        combined = provider.history + result["messages"]
        learner.save_session(session_path, {"version": 1, "messages": combined, "ledger": host.ledger})
        print("已在完整工具配对边界保存会话和业务账本。")
    accepted = learner.accept_personal_result(host, final_text)
    print(json.dumps({"reason": result["reason"], "rounds": result["rounds"], "verified": result["verified"], "acceptedByYourCode": accepted, "writeCount": host.write_count, "provider": "real-chat-completions" if args.live else "scripted-local"}, ensure_ascii=False, indent=2))
    print("真实文件位于：" + str(target_root))
    return 0 if accepted else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description="回声工坊：亲手实现一个个人 Agent；离线模式无依赖、无模型费用。")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("inspect", help="显示任务文件与每阶段检查")
    check = commands.add_parser("check", help="执行当前阶段的实际代码检查")
    check.add_argument("--stage", choices=list(checks.STAGE_CASES), default="context")
    check.add_argument("--brief", type=Path)
    check.add_argument("--report", type=Path)
    check.add_argument("--mission", type=Path)
    play_parser = commands.add_parser("play", help="运行实际文件任务；默认只使用本机脚本策略")
    play_parser.add_argument("--scenario", choices=["lighthouse", "greenhouse"], default="lighthouse")
    play_parser.add_argument("--mission", type=Path, help="自己的任务 JSON，参照 mission.example.json")
    play_parser.add_argument("--brief", type=Path)
    play_parser.add_argument("--live", action="store_true", help="本机所有检查通过并再次输入 LIVE 才请求真实模型")
    play_parser.add_argument("--discover", action="store_true", help="启用第 07 步注册的新工具")
    sessions = play_parser.add_mutually_exclusive_group()
    sessions.add_argument("--session", type=Path)
    sessions.add_argument("--resume", type=Path)
    args = parser.parse_args(argv)
    if args.command == "inspect":
        print("先编辑 learner.py 当前函数，再运行该阶段 check。默认不读取任何 .env、不调用网络。")
        for stage in checks.STAGE_CASES:
            print(stage + ": " + ", ".join(checks.check_ids(stage)))
        return 0
    if args.command == "check":
        brief = load_brief(args.brief) if args.brief else None
        mission = load_mission(args.mission) if args.mission else None
        result = run_checks(args.stage, brief, mission=mission)
        report = make_report(args.stage, result, brief)
        if args.report:
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print("本机执行报告已保存；可编辑文件，不代表不可伪造的掌握证明。")
        return 0 if result.wasSuccessful() else 1
    return play(args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError) as error:
        print("未开始或已停止：" + str(error), file=sys.stderr)
        raise SystemExit(2)
