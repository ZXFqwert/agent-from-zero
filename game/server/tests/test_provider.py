import asyncio
import json

import httpx
import pytest

from agent_lab.config import Settings
from agent_lab.provider import ChatCompletionsProvider, ProviderError


def test_chat_completions_contract_uses_only_mock_transport(monkeypatch, tmp_path):
    settings = Settings(database=tmp_path / "unused.sqlite3", base_url="https://model.invalid/v1", model="test-model", api_key="server-key")
    received = []

    def handler(request):
        received.append(request)
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", "content": "观察完成"}}]})

    original = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(handler), **kwargs))
    result = asyncio.run(ChatCompletionsProvider(settings).complete([{"role": "user", "content": "实验"}], 1))
    assert result["content"] == "观察完成"
    assert str(received[0].url) == "https://model.invalid/v1/chat/completions"
    payload = json.loads(received[0].content)
    assert payload["max_tokens"] == 512
    assert payload["stream"] is False
    assert {tool["function"]["name"] for tool in payload["tools"]} == {"observe", "connect", "activate", "verify"}
    assert received[0].headers["authorization"] == "Bearer server-key"


def test_provider_does_not_follow_redirects_or_return_upstream_errors(monkeypatch):
    settings = Settings(base_url="https://model.invalid/v1", model="test", api_key="never-expose")
    original = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(302, headers={"Location": "https://attacker.invalid"}, text="never-expose"))
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: original(transport=transport, **kwargs))
    with pytest.raises(ProviderError) as captured:
        asyncio.run(ChatCompletionsProvider(settings).complete([], 1))
    assert "never-expose" not in str(captured.value)
