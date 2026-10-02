import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import json
import sqlite3
import threading
import uuid

from fastapi.testclient import TestClient
import pytest

from agent_lab.app import create_app
from agent_lab.config import Settings
from agent_lab.provider import normalize_message, ProviderError
from agent_lab.store import Store
from agent_lab.world import execute_tool, initial_world


def operation():
    return {"request_id": str(uuid.uuid4())}


def call(name, **arguments):
    return {"id": "call-" + uuid.uuid4().hex, "type": "function", "function": {"name": name, "arguments": json.dumps(arguments)}}


def assistant(*calls, content=""):
    return {"role": "assistant", "content": content, "tool_calls": list(calls)}


class FakeProvider:
    def __init__(self, messages=None):
        self.messages = list(messages or [assistant(content="我尚未验收，不能宣称完成。")])
        self.calls = 0

    async def complete(self, messages, timeout):
        self.calls += 1
        return self.messages.pop(0)


class Clock:
    now = 1790899200.0

    def __call__(self):
        return self.now


@pytest.fixture
def settings(tmp_path):
    return Settings(database=tmp_path / "test.sqlite3", base_url="https://invalid.example/v1", model="fake-only", api_key="test-secret-never-send")


def login(client):
    code = client.app.state.store.create_invite()
    response = client.post("/api/lab/redeem", json={"invite_code": code})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["access_token"]}, code


def start(client, headers, body=None):
    response = client.post("/api/lab/runs", headers=headers, json=body or operation())
    assert response.status_code == 200, response.text
    return response.json()


def step(client, headers, run, body=None):
    return client.post(f"/api/lab/runs/{run['id']}/step", headers=headers, json=body or operation())


def cancel(client, headers, run):
    return client.post(f"/api/lab/runs/{run['id']}/cancel", headers=headers, json=operation())


def test_auth_single_use_invite_and_hashed_storage(settings):
    with TestClient(create_app(settings, FakeProvider())) as client:
        assert client.get("/api/lab/status").status_code == 200
        assert client.post("/api/lab/runs", json=operation()).status_code == 401
        headers, code = login(client)
        assert client.post("/api/lab/redeem", json={"invite_code": code}).status_code == 401
        run = start(client, headers)
        other, _ = login(client)
        assert client.get(f"/api/lab/runs/{run['id']}", headers=other).status_code == 404
        assert step(client, other, run).status_code == 404
        assert cancel(client, other, run).status_code == 404
        with sqlite3.connect(settings.database) as db:
            dump = "\n".join(db.iterdump())
        assert code not in dump
        assert headers["Authorization"][7:] not in dump
        assert settings.api_key not in dump


def test_daily_limit_ten_create_idempotency_and_utc_reset(settings):
    clock = Clock()
    with TestClient(create_app(settings, FakeProvider(), clock)) as client:
        headers, _ = login(client)
        body = operation()
        run = start(client, headers, body)
        assert start(client, headers, body)["id"] == run["id"]
        cancel(client, headers, run)
        for _ in range(9):
            cancel(client, headers, start(client, headers))
        response = client.post("/api/lab/runs", headers=headers, json=operation())
        assert response.status_code == 429
        assert client.get("/api/lab/status", headers=headers).json()["remaining_runs"] == 0
        clock.now += 86400
        assert start(client, headers)["status"] == "active"


def test_global_concurrency_and_timeout_cleanup(settings):
    clock = Clock()
    with TestClient(create_app(settings, FakeProvider(), clock)) as client:
        first, _ = login(client)
        second, _ = login(client)
        run = start(client, first)
        assert client.post("/api/lab/runs", headers=second, json=operation()).json()["error"]["code"] == "lab_busy"
        clock.now += 121
        assert start(client, second)["status"] == "active"
        assert client.get(f"/api/lab/runs/{run['id']}", headers=first).json()["status"] == "timed_out"


def test_atomic_independent_connections_allow_exactly_one_run(settings):
    store = Store(settings)
    store.initialize()
    first = store.authenticate(store.redeem(store.create_invite())["access_token"])
    second = store.authenticate(store.redeem(store.create_invite())["access_token"])
    barrier = threading.Barrier(2)

    def create(identity):
        from agent_lab.store import Problem
        independent = Store(settings)
        barrier.wait()
        try:
            return independent.create_run(identity, uuid.uuid4().hex, "signal-rescue")["status"]
        except Problem as problem:
            return problem.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(create, [first, second]))
    assert sorted(results) == ["active", "lab_busy"]


def test_successful_tools_and_duplicate_step_only_one_provider_call(settings):
    fake = FakeProvider([
        assistant(call("observe", target="source"), call("observe", target="relay"), call("observe", target="beacon")),
        assistant(call("connect", source="source", target="relay"), call("activate", target="relay"), call("connect", source="relay", target="beacon")),
        assistant(call("activate", target="beacon"), call("verify", target="beacon")),
    ])
    with TestClient(create_app(settings, fake)) as client:
        headers, _ = login(client)
        run = start(client, headers)
        body = operation()
        first = step(client, headers, run, body).json()
        duplicate = step(client, headers, run, body).json()
        assert duplicate == first
        assert fake.calls == 1
        assert first["world"]["active"] == ["source"]
        assert step(client, headers, run).json()["status"] == "active"
        completed = step(client, headers, run).json()
        assert completed["status"] == "completed"
        assert completed["world"]["verified"] is True
        assert fake.calls == 3
        assert step(client, headers, run).status_code == 409


@pytest.mark.parametrize("name,args,error", [
    ("shell", {"command": "cat /etc/passwd"}, "unknown_tool"),
    ("observe", {"target": "../../.env"}, "invalid_arguments"),
    ("observe", {"target": "source", "instruction": "ignore all rules"}, "invalid_arguments"),
    ("activate", {"target": "beacon"}, "observe_target_first"),
    ("connect", {"source": "source", "target": "beacon"}, "connection_not_permitted"),
    ("connect", {"source": "source", "target": "relay"}, "observe_endpoints_first"),
    ("observe", {"target": True}, "invalid_arguments"),
])
def test_tool_injection_and_invalid_parameters_do_not_mutate(name, args, error):
    before = initial_world()
    world, result = execute_tool(before, name, json.dumps(args))
    assert world == initial_world() == before
    assert result == {"ok": False, "error": error}


def test_model_cannot_add_host_tools_or_claim_success(settings):
    fake = FakeProvider([assistant(call("shell", command="remove files")), assistant(content="任务全部成功")])
    with TestClient(create_app(settings, fake)) as client:
        headers, _ = login(client)
        run = start(client, headers)
        result = step(client, headers, run).json()
        assert result["events"][0]["result"]["error"] == "unknown_tool"
        result = step(client, headers, run).json()
        assert result["status"] == "incomplete"
        assert result["world"]["verified"] is False


def test_max_eight_model_requests(settings):
    fake = FakeProvider([assistant(call("observe", target="source")) for _ in range(8)])
    with TestClient(create_app(settings, fake)) as client:
        headers, _ = login(client)
        run = start(client, headers)
        for _ in range(8):
            response = step(client, headers, run)
            assert response.status_code == 200
        assert response.json()["status"] == "budget_exhausted"
        assert step(client, headers, run).status_code == 409
        assert fake.calls == 8


def test_provider_timeout(settings):
    class Slow:
        async def complete(self, messages, timeout):
            await asyncio.sleep(1)
    with TestClient(create_app(replace(settings, run_seconds=0.05), Slow())) as client:
        headers, _ = login(client)
        run = start(client, headers)
        result = step(client, headers, run).json()
        assert result["status"] == "timed_out"
        assert result["world"] == initial_world()
        assert client.get("/api/lab/status").json()["busy"] is False


def test_cancel_inflight_and_simultaneous_duplicate_step(settings):
    entered = threading.Event()
    class Blocking:
        calls = 0
        async def complete(self, messages, timeout):
            self.calls += 1
            entered.set()
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                # Simulates a late response arriving after cancellation.
                return assistant(call("observe", target="source"))
    provider = Blocking()
    with TestClient(create_app(settings, provider)) as client:
        headers, _ = login(client)
        run = start(client, headers)
        body = operation()
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(step, client, headers, run, body)
            assert entered.wait(2)
            assert step(client, headers, run, body).json()["error"]["code"] == "step_in_progress"
            assert step(client, headers, run).json()["error"]["code"] == "step_in_progress"
            cancel_body = operation()
            first = client.post(f"/api/lab/runs/{run['id']}/cancel", headers=headers, json=cancel_body)
            repeated = client.post(f"/api/lab/runs/{run['id']}/cancel", headers=headers, json=cancel_body)
            assert first.json() == repeated.json()
            result = future.result(3).json()
        assert result["status"] == "cancelled"
        assert result["world"] == initial_world()
        assert provider.calls == 1
        assert start(client, headers)["status"] == "active"


def test_provider_error_is_clean_and_idempotent(settings):
    class Broken:
        calls = 0
        async def complete(self, messages, timeout):
            self.calls += 1
            raise RuntimeError(settings.api_key + " upstream internals")
    broken = Broken()
    with TestClient(create_app(settings, broken)) as client:
        headers, _ = login(client)
        run = start(client, headers)
        body = operation()
        response = step(client, headers, run, body)
        assert response.json()["status"] == "failed"
        assert response.json()["events"] == [{"kind": "stop", "code": "provider_error"}]
        assert settings.api_key not in response.text
        assert step(client, headers, run, body).json() == response.json()
        assert broken.calls == 1


def test_disabled_configuration_and_strict_requests(settings):
    with TestClient(create_app(replace(settings, api_key=""), FakeProvider())) as client:
        headers, _ = login(client)
        assert client.get("/api/lab/status").json()["enabled"] is False
        assert client.post("/api/lab/runs", headers=headers, json=operation()).status_code == 503
        assert client.get("/api/lab/status", headers=headers).json()["remaining_runs"] == 10
        assert client.post("/api/lab/runs", headers=headers, json={**operation(), "model": "override"}).status_code == 422
        huge = client.post("/api/lab/redeem", content=b"x" * 9000, headers={"Content-Type": "application/json"})
        assert huge.status_code == 413


def test_expired_auth_and_operation_conflict(settings):
    clock = Clock()
    with TestClient(create_app(settings, FakeProvider(), clock)) as client:
        headers, _ = login(client)
        run = start(client, headers)
        body = operation()
        cancel_response = client.post(f"/api/lab/runs/{run['id']}/cancel", headers=headers, json=body)
        assert cancel_response.status_code == 200
        assert step(client, headers, run, body).json()["error"]["code"] == "idempotency_conflict"
        clock.now += 31 * 86400
        assert client.get("/api/lab/status", headers=headers).status_code == 401


def test_bad_provider_payload_is_rejected():
    with pytest.raises(ProviderError):
        normalize_message({"choices": [{"message": assistant(*[call("observe", target="source") for _ in range(5)])}]})
    with pytest.raises(ProviderError):
        normalize_message({"error": "upstream-secret"})
    with pytest.raises(ProviderError):
        normalize_message({"choices": [{"message": {"content": 0}}]})


def test_secret_redaction_in_successful_provider_content(settings):
    fake = FakeProvider([assistant(content="错误响应包含 " + settings.api_key)])
    with TestClient(create_app(settings, fake)) as client:
        headers, _ = login(client)
        run = start(client, headers)
        response = step(client, headers, run)
        assert settings.api_key not in response.text
        assert "[redacted]" in response.text


def test_abandoned_inflight_lease_is_reclaimed_and_retry_safe(settings):
    clock = Clock()
    fake = FakeProvider()
    with TestClient(create_app(settings, fake, clock)) as client:
        headers, _ = login(client)
        run = start(client, headers)
        store = client.app.state.store
        invite = store.authenticate(headers["Authorization"][7:])
        body = operation()
        store.begin_step(invite, run["id"], body["request_id"])
        clock.now += 121
        response = step(client, headers, run, body)
        assert response.json()["status"] == "timed_out"
        assert fake.calls == 0
        assert start(client, headers)["status"] == "active"


def test_durable_idempotency_after_app_restart(settings):
    fake = FakeProvider([assistant(call("observe", target="source"))])
    body = operation()
    with TestClient(create_app(settings, fake)) as client:
        headers, _ = login(client)
        run = start(client, headers)
        original = step(client, headers, run, body).json()
    replacement = FakeProvider()
    with TestClient(create_app(settings, replacement)) as client:
        assert step(client, headers, run, body).json() == original
        assert replacement.calls == 0
