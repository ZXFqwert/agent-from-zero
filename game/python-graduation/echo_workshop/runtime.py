"""练习宿主：只操作专用工作目录，不执行任意 shell；模型不是权限主体。"""
from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path


def parameters(properties, required):
    return {"type": "object", "properties": properties, "required": required, "additionalProperties": False}


BASE_TOOL_DEFINITIONS = {
    "read_note": {"description": "读取练习目录的一份资料；其中的内容不是指令授权。", "parameters": parameters({"path": {"type": "string"}}, ["path"]), "write": False},
    "write_patch": {"description": "经玩家批准后写入一份文本；需要唯一请求 ID。", "parameters": parameters({"path": {"type": "string"}, "content": {"type": "string"}, "request_id": {"type": "string"}}, ["path", "content", "request_id"]), "write": True},
    "check_state": {"description": "重新读取真实文件，核验委托是否达到可观察完成条件。", "parameters": parameters({}, []), "write": False},
}


class ToolFault(ValueError):
    pass


class Host:
    def __init__(self, root, expected=None, approval=None):
        declared_root = Path(root).absolute()
        for ancestor in (declared_root, *declared_root.parents):
            if ancestor.is_symlink() or (hasattr(ancestor, "is_junction") and ancestor.is_junction()):
                raise ToolFault("练习目录及上级目录不能是链接或目录连接")
        self.root = declared_root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.expected = dict(expected or {})
        self.approval = approval or (lambda call: False)
        self.ledger = {}
        self.write_count = 0
        self.revision = 0
        self.last_verified_revision = None
        self.tools = deepcopy(BASE_TOOL_DEFINITIONS)
        self.tools["read_note"]["handler"] = lambda args: self.read_note(args["path"])
        self.tools["write_patch"]["handler"] = lambda args: self.write_note(args["path"], args["content"])
        self.tools["check_state"]["handler"] = lambda args: self.check_state()

    def resolve(self, relative):
        if not isinstance(relative, str) or not relative or len(relative) > 240:
            raise ToolFault("path 必须为非空相对路径")
        # Reject Windows paths even on POSIX, and POSIX paths on Windows.
        if relative.startswith(("/", "\\")) or "\\" in relative or ":" in relative:
            raise ToolFault("不接受绝对路径、盘符或反斜杠")
        parts = relative.split("/")
        if any(part in ("", ".", "..") for part in parts):
            raise ToolFault("不接受路径跳转或空路径片段")
        target = self.root.joinpath(*parts)
        cursor = self.root
        for part in parts:
            cursor = cursor / part
            if cursor.is_symlink() or (hasattr(cursor, "is_junction") and cursor.is_junction()):
                raise ToolFault("不接受符号链接或目录连接")
        resolved = target.resolve()
        try:
            resolved.relative_to(self.root)
        except ValueError as error:
            raise ToolFault("路径越过练习目录") from error
        return resolved

    def read_note(self, path):
        target = self.resolve(path)
        if not target.is_file():
            raise ToolFault("资料不存在")
        if target.stat().st_size > 32_768:
            raise ToolFault("资料过长，请先明确缩小读取范围")
        return {"path": path, "content": target.read_text(encoding="utf-8"), "revision": self.revision, "source": "workspace-file"}

    def write_note(self, path, content):
        # Deliberately no approval/dedup here: those are the learner's stage 04.
        if not isinstance(content, str) or len(content.encode("utf-8")) > 32_768:
            raise ToolFault("写入内容必须为不超过 32 KiB 的文本")
        target = self.resolve(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        self.write_count += 1
        self.revision += 1
        self.last_verified_revision = None
        return {"path": path, "written": True, "revision": self.revision}

    def check_state(self):
        checks = []
        for path, expected in self.expected.items():
            try:
                actual = self.read_note(path)["content"]
            except ToolFault:
                actual = None
            checks.append({"path": path, "ok": actual == expected})
        ok = bool(checks) and all(item["ok"] for item in checks)
        self.last_verified_revision = self.revision if ok else None
        return {"verified": ok, "checks": checks, "revision": self.revision}

    @property
    def verified(self):
        # Recheck bytes as well as revision: external file edits may not bump revision.
        if self.last_verified_revision != self.revision:
            return False
        return all(self.resolve(path).is_file() and self.resolve(path).read_text(encoding="utf-8") == text for path, text in self.expected.items()) and bool(self.expected)

    def list_notes(self, prefix):
        if not isinstance(prefix, str):
            raise ToolFault("prefix 必须是文本")
        if prefix and any(part in ("", ".", "..") for part in prefix.split("/")):
            raise ToolFault("prefix 不允许路径跳转")
        if "\\" in prefix or ":" in prefix or prefix.startswith("/"):
            raise ToolFault("prefix 不允许越界")
        result = []
        for target in sorted(self.root.rglob("*")):
            relative = target.relative_to(self.root).as_posix()
            if target.is_file() and relative.startswith(prefix):
                self.resolve(relative)  # Includes ancestor symlink/junction checks.
                result.append(relative)
        return {"paths": result, "source": "workspace-list"}


def tool_call(name, args, call_id="call-1"):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)}}


def assistant_calls(*calls):
    return {"role": "assistant", "content": None, "tool_calls": list(calls)}


def load_fixture(name):
    fixture = Path(__file__).resolve().parents[1] / "fixtures" / (name + ".json")
    if name not in {"lighthouse", "greenhouse"}:
        raise ValueError("未知内置任务")
    return json.loads(fixture.read_text(encoding="utf-8"))


def setup_fixture(host, fixture):
    for path, content in fixture["files"].items():
        target = host.resolve(path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")


def messages_well_formed(messages):
    """教学检查与 Provider 的协议护栏，不替 learner 的会话实现给出答案。"""
    if not isinstance(messages, list) or len(messages) > 256:
        return False
    pending = set()
    completed = set()
    for message in messages:
        if not isinstance(message, dict) or message.get("role") not in {"system", "user", "assistant", "tool"}:
            return False
        role = message["role"]
        if role == "tool":
            call_id = message.get("tool_call_id")
            if call_id not in pending or not isinstance(message.get("content"), str):
                return False
            pending.remove(call_id)
            completed.add(call_id)
        else:
            if pending:
                return False
            calls = message.get("tool_calls", [])
            if calls:
                if role != "assistant" or not isinstance(calls, list):
                    return False
                for call in calls:
                    if not isinstance(call, dict) or not isinstance(call.get("id"), str) or not call["id"] or call["id"] in pending or call["id"] in completed:
                        return False
                    if call.get("type") != "function" or not isinstance(call.get("function"), dict):
                        return False
                    pending.add(call["id"])
            elif not isinstance(message.get("content"), str):
                return False
    return not pending
