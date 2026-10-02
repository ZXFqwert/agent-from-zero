import json
import httpx

from .config import Settings
from .world import TOOLS


class ProviderError(Exception):
    """Deliberately contains no upstream URL, response body, or credentials."""


def normalize_message(payload: dict) -> dict:
    try:
        message = payload["choices"][0]["message"]
        content = message.get("content")
        calls = message.get("tool_calls")
        content = "" if content is None else content
        calls = [] if calls is None else calls
        if not isinstance(content, str) or len(content) > 12000 or not isinstance(calls, list) or len(calls) > 4:
            raise ValueError()
        clean = {"role": "assistant", "content": content}
        if calls:
            normalized = []
            ids = set()
            for call in calls:
                ident, function = call["id"], call["function"]
                name, arguments = function["name"], function["arguments"]
                if call.get("type") != "function" or not isinstance(ident, str) or not 1 <= len(ident) <= 128 or ident in ids:
                    raise ValueError()
                if not isinstance(name, str) or not 1 <= len(name) <= 64 or not isinstance(arguments, str) or len(arguments) > 2048:
                    raise ValueError()
                ids.add(ident)
                normalized.append({"id": ident, "type": "function", "function": {"name": name, "arguments": arguments}})
            clean["tool_calls"] = normalized
        return clean
    except (KeyError, IndexError, TypeError, ValueError, AttributeError):
        raise ProviderError() from None


class ChatCompletionsProvider:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def complete(self, messages: list[dict], timeout: float) -> dict:
        body = {"model": self.settings.model, "messages": messages, "tools": TOOLS, "tool_choice": "auto", "max_tokens": self.settings.max_output_tokens, "stream": False}
        try:
            # No implicit proxy/credential environment, redirects, retry or alternative endpoint.
            async with httpx.AsyncClient(timeout=timeout, follow_redirects=False, trust_env=False) as client:
                async with client.stream("POST", self.settings.base_url.rstrip("/") + "/chat/completions", headers={"Authorization": "Bearer " + self.settings.api_key}, json=body) as response:
                    response.raise_for_status()
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > 65536:
                            raise ProviderError()
                    payload = json.loads(data)
            return normalize_message(payload)
        except (httpx.HTTPError, ValueError, UnicodeError):
            raise ProviderError() from None
