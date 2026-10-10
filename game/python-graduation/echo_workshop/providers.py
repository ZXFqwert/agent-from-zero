"""脚本策略只验证工具协议，并不模拟语言模型内部计算。"""
from copy import deepcopy
import json
import os

from .runtime import assistant_calls, messages_well_formed, tool_call


class ScriptedProvider:
    def __init__(self, replies, repeat_last=False):
        self.replies = deepcopy(replies)
        self.repeat_last = repeat_last
        self.requests = 0
        self.histories = []

    def complete(self, messages, tools):
        if not messages_well_formed(messages):
            raise ValueError("模型请求之前的消息里有未配对工具调用或不合法角色")
        self.histories.append(deepcopy(messages))
        position = self.requests
        self.requests += 1
        if position >= len(self.replies):
            if not self.repeat_last:
                raise ValueError("脚本策略被额外请求；检查停止条件")
            reply = deepcopy(self.replies[-1])
            for call in reply.get("tool_calls", []):
                call["id"] = call["id"] + "-" + str(position)
            return reply
        return deepcopy(self.replies[position])


def fixture_provider(fixture, with_extension=False, call_prefix=""):
    replies = []
    if with_extension:
        replies.append(assistant_calls(tool_call("list_notes", {"prefix": ""}, "discover")))
    replies.append(assistant_calls(tool_call("read_note", {"path": fixture["instructionPath"]}, "read-1")))
    replies.append(assistant_calls(*(tool_call("write_patch", {"path": path, "content": text, "request_id": "fix-" + str(index)}, "write-" + str(index)) for index, (path, text) in enumerate(fixture["expected"].items()))))
    replies.append(assistant_calls(tool_call("check_state", {}, "verify-1")))
    replies.append({"role": "assistant", "content": "我已执行修改并读取验收回执。请以宿主 verified 状态为准。"})
    if call_prefix:
        for reply in replies:
            for call in reply.get("tool_calls", []):
                call["id"] = call_prefix + call["id"]
    return ScriptedProvider(replies)


class ChatCompletionsProvider:
    def __init__(self):
        # This class is created only by explicit --live. No config is copied from the website.
        try:
            from openai import OpenAI
        except ImportError as error:
            raise RuntimeError("先运行 python -m pip install -r requirements-live.txt") from error
        base = os.environ.get("MODEL_BASE_URL", "")
        model = os.environ.get("MODEL_NAME", "")
        key = os.environ.get("MODEL_API_KEY", "")
        if not all((base, model, key)):
            raise RuntimeError("请在当前终端设置 MODEL_BASE_URL、MODEL_NAME、MODEL_API_KEY；不写入代码或报告")
        if not base.startswith("https://"):
            raise RuntimeError("真实接口 Base URL 必须使用 https")
        self.model = model
        self.client = OpenAI(api_key=key, base_url=base, timeout=30, max_retries=0)
        self.requests = 0

    def complete(self, messages, tools):
        if self.requests >= 8:
            raise ValueError("真实 Provider 的 8 次请求硬上限已达到")
        if not messages_well_formed(messages):
            raise ValueError("请求前的消息协议不完整")
        self.requests += 1
        reply = self.client.chat.completions.create(model=self.model, messages=messages, tools=tools, max_tokens=512)
        message = reply.choices[0].message
        result = {"role": "assistant", "content": message.content}
        if message.tool_calls:
            result["tool_calls"] = [{"id": call.id, "type": "function", "function": {"name": call.function.name, "arguments": call.function.arguments}} for call in message.tool_calls]
        if not result.get("tool_calls") and result["content"] is None:
            result["content"] = ""
        return result
