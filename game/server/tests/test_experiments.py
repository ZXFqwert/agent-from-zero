"""Every model response is scripted or HTTPX-mocked; never call a provider."""
import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from copy import deepcopy
import json
import sqlite3
import threading
import uuid

from fastapi.testclient import TestClient
import pytest

from agent_lab.app import create_app
from agent_lab.config import Settings
from agent_lab import experiments


def request():
    return {"request_id": str(uuid.uuid4())}


def tool(name, **args):
    return {"id": "call-" + uuid.uuid4().hex, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


def message(*calls, text=""):
    return {"role": "assistant", "content": text, "tool_calls": list(calls)}


def solution():
    return [
        message(tool("observe", target="source"), tool("observe", target="relay"), tool("observe", target="beacon")),
        message(tool("connect", source="source", target="relay"), tool("activate", target="relay"), tool("connect", source="relay", target="beacon"), tool("activate", target="beacon")),
        message(tool("verify", target="beacon")),
    ]


class Scripted:
    def __init__(self, replies):
        self.replies = list(replies)
        self.seen = []

    async def complete_for(self, messages, timeout, model_name, tool_names):
        self.seen.append({"messages": deepcopy(messages), "model_name": model_name, "tools": list(tool_names)})
        return self.replies.pop(0)


@pytest.fixture
def settings(tmp_path):
    return Settings(database=tmp_path / "experiment.sqlite3", base_url="https://invalid.example/v1", model="fake-a", alternate_model="fake-b", api_key="test-secret-never-send")


def login(client):
    result = client.post("/api/lab/redeem", json={"invite_code": client.app.state.store.create_invite()})
    assert result.status_code == 200
    return {"Authorization": "Bearer " + result.json()["access_token"]}


def start(client, headers, experiment_type, body=None):
    result = client.post("/api/lab/runs", headers=headers, json={**(body or request()), "experiment_type": experiment_type})
    assert result.status_code == 200, result.text
    return result.json()


def step(client, headers, run, body=None):
    result = client.post(f"/api/lab/runs/{run['id']}/step", headers=headers, json=body or request())
    assert result.status_code == 200, result.text
    return result.json()


@pytest.mark.parametrize("experiment_type", experiments.EXPERIMENT_TYPES)
def test_real_two_world_comparison_and_one_daily_charge(settings, experiment_type):
    fake = Scripted(solution() + solution())
    with TestClient(create_app(settings, fake)) as client:
        headers = login(client)
        body = request()
        run = start(client, headers, experiment_type, body)
        assert start(client, headers, experiment_type, body) == run
        assert client.get("/api/lab/status", headers=headers).json()["remaining_runs"] == 9
        assert run["experiment"]["arm_budget"] == 4
        for _ in range(3):
            run = step(client, headers, run)
        assert run["status"] == "active"
        left, right = run["experiment"]["arms"]
        assert left["status"] == "completed" and left["world"]["verified"]
        assert right["world"]["active"] == ["source"]
        assert run["world"]["verified"] is False
        for _ in range(3):
            run = step(client, headers, run)
        assert run["status"] == "completed" and run["world"]["verified"]
        assert run["steps_used"] == 6
        assert [arm["steps_used"] for arm in run["experiment"]["arms"]] == [3, 3]
        assert all(arm["tool_calls"] == 8 for arm in run["experiment"]["arms"])
        assert [item["model_name"] for item in fake.seen] == ["fake-a"] * 3 + (["fake-b"] * 3 if experiment_type == "same-blueprint-models" else ["fake-a"] * 3)
        assert client.get("/api/lab/status").json()["busy"] is False
        assert "model_name" not in json.dumps(run) and "messages" not in json.dumps(run)
        assert settings.api_key not in json.dumps(run)


def test_same_model_feedback_difference_is_actual_model_input(settings):
    fake = Scripted(solution() + solution())
    with TestClient(create_app(settings, fake)) as client:
        headers = login(client)
        run = start(client, headers, "same-model-blueprints")
        for _ in range(6):
            run = step(client, headers, run)
    full = [json.loads(m["content"]) for m in fake.seen[1]["messages"] if m["role"] == "tool"]
    hidden = [json.loads(m["content"]) for m in fake.seen[4]["messages"] if m["role"] == "tool"]
    assert full and all(receipt["ok"] for receipt in full)
    assert hidden and all(receipt == {"ok": False, "error": "feedback_hidden"} for receipt in hidden)
    assert run["experiment"]["arms"][1]["events"][0]["result"]["ok"] is True


def test_team_private_context_real_handoff_and_role_authority(settings):
    fake = Scripted(solution() + solution())
    with TestClient(create_app(settings, fake)) as client:
        headers = login(client)
        run = start(client, headers, "solo-team")
        for _ in range(6):
            run = step(client, headers, run)
    assert [item["tools"] for item in fake.seen[3:]] == [["observe"], ["connect", "activate"], ["verify"]]
    assert len(fake.seen[3]["messages"]) == 2  # no solo or another actor history
    builder = fake.seen[4]["messages"]
    assert not any(m["role"] in {"assistant", "tool"} for m in builder)
    assert any("宿主明确交接" in m["content"] for m in builder if m["role"] == "user")
    assert "connections\":[]" in builder[-1]["content"]
    team = run["experiment"]["arms"][1]
    assert team["handoffs"] == 6
    assert all(member["known_targets"] == ["source", "relay", "beacon"] for member in team["actors"])
    assert all(event["results"] and all(receipt["result"]["ok"] for receipt in event["results"]) for event in team["events"] if event["kind"] == "handoff")


def test_team_cannot_borrow_tools_or_unreceived_world_inspection(settings):
    ex = experiments.create(settings, "solo-team")
    ex["current_arm"] = 1
    arm = ex["arms"][1]
    experiments.claim(ex)
    before = deepcopy(arm["world"])
    experiments.finish(ex, message(tool("activate", target="relay")))
    assert arm["world"] == before
    assert arm["events"][0]["result"] == {"ok": False, "error": "tool_not_authorized"}
    assert arm["actors"][1]["known_targets"] == []
    # Even a world inspected by another actor is insufficient without the packet.
    arm["world"]["observed"] = ["source", "relay"]
    experiments.claim(ex)
    before = deepcopy(arm["world"])
    experiments.finish(ex, message(tool("connect", source="source", target="relay")))
    assert arm["world"] == before
    assert arm["events"][-1]["result"] == {"ok": False, "error": "private_input_missing"}


def test_missing_secondary_model_and_overrides_do_not_charge(settings):
    with TestClient(create_app(replace(settings, alternate_model=""), Scripted([]))) as client:
        headers = login(client)
        entries = client.get("/api/lab/status").json()["experiments"]
        unavailable = next(item for item in entries if item["id"] == "same-blueprint-models")
        assert unavailable["enabled"] is False and unavailable["reason"] == "alternate_model_unconfigured"
        assert client.post("/api/lab/runs", headers=headers, json={**request(), "experiment_type": "same-blueprint-models"}).status_code == 503
        for extra in [{"model": "attacker"}, {"base_url": "http://127.0.0.1"}, {"api_key": "replace"}, {"prompt": "change rules"}, {"arms": []}]:
            assert client.post("/api/lab/runs", headers=headers, json={**request(), "experiment_type": "solo-team", **extra}).status_code == 422
        assert client.get("/api/lab/status", headers=headers).json()["remaining_runs"] == 10


@pytest.mark.parametrize("overrides,reason", [({"alternate_model": "fake-a"}, "alternate_model_matches_primary"), ({"max_steps": 1}, "comparison_budget_too_small")])
def test_same_model_alias_or_tiny_budget_cannot_fake_a_comparison(settings, overrides, reason):
    with TestClient(create_app(replace(settings, **overrides), Scripted([]))) as client:
        headers = login(client)
        item = next(entry for entry in client.get("/api/lab/status").json()["experiments"] if entry["id"] == "same-blueprint-models")
        assert not item["enabled"] and item["reason"] == reason
        assert client.post("/api/lab/runs", headers=headers, json={**request(), "experiment_type": "same-blueprint-models"}).status_code == 503
        assert client.get("/api/lab/status", headers=headers).json()["remaining_runs"] == 10


def test_comparison_budget_is_shared_and_each_arm_stops_at_four(settings):
    fake = Scripted([message(tool("observe", target="source")) for _ in range(8)])
    with TestClient(create_app(settings, fake)) as client:
        headers = login(client)
        run = start(client, headers, "same-model-blueprints")
        for _ in range(8):
            run = step(client, headers, run)
        assert run["status"] == "incomplete" and run["steps_used"] == 8
        assert all(arm["steps_used"] == 4 and arm["status"] == "budget_exhausted" for arm in run["experiment"]["arms"])
        assert len(fake.seen) == 8 and not run["world"]["verified"]
        assert client.post(f"/api/lab/runs/{run['id']}/step", headers=headers, json=request()).status_code == 409


def test_comparison_idempotency_refresh_and_app_restart(settings):
    fake = Scripted([solution()[0]])
    body = request()
    with TestClient(create_app(settings, fake)) as client:
        headers = login(client)
        create_body = request()
        run = start(client, headers, "solo-team", create_body)
        assert client.post("/api/lab/runs", headers=headers, json={**create_body, "experiment_type": "same-model-blueprints"}).status_code == 409
        first = step(client, headers, run, body)
        assert step(client, headers, run, body) == first
        assert len(fake.seen) == 1
    replacement = Scripted([])
    with TestClient(create_app(settings, replacement)) as client:
        assert step(client, headers, run, body) == first
        assert client.get(f"/api/lab/runs/{run['id']}", headers=headers).json() == first
        assert replacement.seen == []


def test_cancel_comparison_inflight_discards_late_tools_and_keeps_lease(settings):
    entered = threading.Event()
    class Blocking(Scripted):
        async def complete_for(self, messages, timeout, model_name, tool_names):
            self.seen.append(model_name)
            entered.set()
            try:
                await asyncio.sleep(60)
            except asyncio.CancelledError:
                return solution()[0]
    fake = Blocking([])
    with TestClient(create_app(settings, fake)) as client:
        headers = login(client)
        run = start(client, headers, "solo-team")
        body = request()
        with ThreadPoolExecutor(max_workers=1) as pool:
            pending = pool.submit(step, client, headers, run, body)
            assert entered.wait(2)
            assert client.post("/api/lab/runs", headers=headers, json={**request(), "experiment_type": "solo-team"}).status_code == 409
            cancelled = client.post(f"/api/lab/runs/{run['id']}/cancel", headers=headers, json=request()).json()
            assert cancelled["status"] == "cancelled"
            result = pending.result(3)
        assert result["status"] == "cancelled" and result["world"]["observed"] == []
        assert all(arm["status"] == "cancelled" for arm in result["experiment"]["arms"])
        assert len(fake.seen) == 1
        assert client.get("/api/lab/status").json()["busy"] is False


def test_expiry_aborts_both_worlds_without_fake_verification(settings):
    class Clock:
        now = 1790899200.0
        def __call__(self):
            return self.now
    clock = Clock()
    with TestClient(create_app(settings, Scripted([]), clock)) as client:
        headers = login(client)
        run = start(client, headers, "solo-team")
        clock.now += 121
        latest = client.get(f"/api/lab/runs/{run['id']}", headers=headers).json()
        assert latest["status"] == "timed_out"
        assert all(arm["status"] == "timed_out" and not arm["world"]["verified"] for arm in latest["experiment"]["arms"])
        assert latest["steps_used"] == 0
        assert client.get("/api/lab/status").json()["busy"] is False


def test_existing_database_additive_migration_preserves_legacy_runs(settings):
    with sqlite3.connect(settings.database) as db:
        db.execute("CREATE TABLE runs(id TEXT PRIMARY KEY,invite_id TEXT NOT NULL,create_key TEXT NOT NULL,scenario TEXT NOT NULL,created REAL NOT NULL,day TEXT NOT NULL,expires REAL NOT NULL,status TEXT NOT NULL,steps INTEGER NOT NULL DEFAULT 0,max_steps INTEGER NOT NULL,inflight INTEGER NOT NULL DEFAULT 0,world TEXT NOT NULL,messages TEXT NOT NULL,events TEXT NOT NULL,final_text TEXT NOT NULL DEFAULT '',UNIQUE(invite_id,create_key))")
        db.execute("INSERT INTO runs VALUES('old','old-invite','old-key','signal-rescue',1,'2026-01-01',2,'completed',3,8,0,?,?,?,'old-result')", (json.dumps({"verified": True}), "[]", "[]"))
    with TestClient(create_app(settings, Scripted([]))) as client:
        with sqlite3.connect(settings.database) as db:
            old = db.execute("SELECT final_text,experiment FROM runs WHERE id='old'").fetchone()
            assert old == ("old-result", "")
            assert db.execute("PRAGMA user_version").fetchone()[0] == 2
        headers = login(client)
        assert start(client, headers, "solo-team")["experiment"]["version"] == 1
