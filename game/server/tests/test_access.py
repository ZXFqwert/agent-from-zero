"""Shared access uses only temporary SQLite and fake providers, never a model."""
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
import sqlite3
import threading
import uuid

from fastapi.testclient import TestClient
import pytest

from agent_lab.app import create_app
from agent_lab.config import Settings
from agent_lab.store import Problem, SHARED_ACCESS_QUOTA, Store, digest
from test_lab import Clock, FakeProvider, assistant, call, cancel, login, operation, start, step


@pytest.fixture
def settings(tmp_path):
    return Settings(database=tmp_path / "shared-access.sqlite3", base_url="https://invalid.example/v1", model="fake-only", api_key="test-secret-never-send", access_passphrase="zhouxingfu")


def access(client, phrase="zhouxingfu"):
    response = client.post("/api/lab/access", json={"passphrase": phrase})
    assert response.status_code == 200, response.text
    payload = response.json()
    assert set(payload) == {"access_token", "token_type", "expires_at"}
    assert payload["token_type"] == "bearer"
    assert response.headers["cache-control"] == "no-store"
    return {"Authorization": "Bearer " + payload["access_token"]}


def rows(settings):
    with sqlite3.connect(settings.database) as conn:
        return {table: list(conn.execute("SELECT * FROM " + table)) for table in ("invites", "tokens", "runs", "operations")}


def test_shared_login_needs_no_invite_and_keeps_browser_records_private(settings):
    fake = FakeProvider([assistant(call("observe", target="source"))])
    with TestClient(create_app(settings, fake)) as first_browser:
        first = access(first_browser)
        with TestClient(create_app(settings, FakeProvider())) as second_browser:
            second = access(second_browser)
            assert first != second
            run = start(first_browser, first)
            body = operation()
            receipt = step(first_browser, first, run, body).json()
            assert receipt["steps_used"] == 1
            assert step(first_browser, first, run, body).json() == receipt
            assert fake.calls == 1
            for method, suffix in (("get", ""), ("post", "/step"), ("post", "/cancel")):
                kwargs = {"json": operation()} if method == "post" else {}
                response = getattr(second_browser, method)(f"/api/lab/runs/{run['id']}{suffix}", headers=second, **kwargs)
                assert response.status_code == 404
            for client, headers in ((first_browser, first), (second_browser, second)):
                status = client.get("/api/lab/status", headers=headers).json()
                assert status["remaining_runs"] == 9
                assert status["quota_scope"] == "shared"
            assert second_browser.get("/api/lab/status", headers=second).json()["active_run"] is None
            conflict = second_browser.post("/api/lab/runs", headers=second, json=operation())
            assert conflict.status_code == 409
            assert conflict.json()["error"]["code"] == "lab_busy"
        stored = rows(settings)
        assert len(stored["invites"]) == 2
        assert all(owner[-1] == SHARED_ACCESS_QUOTA for owner in stored["invites"])
        assert first["Authorization"][7:] not in repr(stored)
        assert second["Authorization"][7:] not in repr(stored)
        assert settings.access_passphrase not in repr(stored)


def test_repeated_login_cannot_reset_shared_daily_quota_even_after_restart(settings):
    clock = Clock()
    with TestClient(create_app(settings, FakeProvider(), clock)) as client:
        for _ in range(10):
            headers = access(client)
            cancel(client, headers, start(client, headers))
        assert client.get("/api/lab/status", headers=access(client)).json()["remaining_runs"] == 0
    # Stable quota survives both new tokens and a changed configured phrase.
    changed = replace(settings, access_passphrase="replacement")
    with TestClient(create_app(changed, FakeProvider(), clock)) as client:
        headers = access(client, "replacement")
        before = rows(settings)
        denied = client.post("/api/lab/runs", headers=headers, json=operation())
        assert denied.status_code == 429
        assert denied.json() == {"error": {"code": "daily_quota_exhausted"}}
        assert rows(settings) == before
        clock.now += 86400
        assert client.get("/api/lab/status", headers=headers).json()["remaining_runs"] == 10
        assert start(client, headers)["status"] == "active"


def test_quota_last_slot_is_atomic_across_shared_browser_connections(settings):
    store = Store(replace(settings, daily_runs=1))
    store.initialize()
    identities = [store.authenticate(store.access("zhouxingfu")["access_token"]) for _ in range(2)]
    barrier = threading.Barrier(2)

    def create(owner):
        separate_connection = Store(store.settings)
        barrier.wait()
        try:
            return separate_connection.create_run(owner, uuid.uuid4().hex, "signal-rescue")["status"]
        except Problem as error:
            return error.code

    with ThreadPoolExecutor(max_workers=2) as workers:
        outcomes = list(workers.map(create, identities))
    assert sorted(outcomes) == ["active", "daily_quota_exhausted"]
    assert all(store.status(owner)["remaining_runs"] == 0 for owner in identities)


@pytest.mark.parametrize("phrase", ["wrong", "Zhouxingfu", " zhouxingfu", "zhouxingfu ", "周兴福", "x" * 128])
def test_wrong_phrase_has_generic_error_and_no_side_effects(settings, phrase):
    with TestClient(create_app(settings, FakeProvider())) as client:
        before = rows(settings)
        response = client.post("/api/lab/access", json={"passphrase": phrase})
        assert response.status_code == 403
        assert response.json() == {"error": {"code": "invalid_access"}}
        assert "zhouxingfu" not in response.text
        assert rows(settings) == before


@pytest.mark.parametrize("body", [{}, {"passphrase": ""}, {"passphrase": "x" * 129}, {"passphrase": 123}, {"passphrase": True}, {"passphrase": None}, {"passphrase": "zhouxingfu", "invite_code": "override"}])
def test_shared_login_strict_body_rejects_without_session(settings, body):
    with TestClient(create_app(settings, FakeProvider())) as client:
        before = rows(settings)
        response = client.post("/api/lab/access", json=body)
        assert response.status_code == 422
        assert response.json() == {"error": {"code": "invalid_request"}}
        assert rows(settings) == before


@pytest.mark.parametrize("changes", [{"access_passphrase": ""}, {"base_url": ""}, {"model": ""}, {"api_key": ""}])
def test_shared_login_unconfigured_or_lab_disabled_never_issues_session(settings, changes):
    with TestClient(create_app(replace(settings, **changes), FakeProvider())) as client:
        before = rows(settings)
        assert client.get("/api/lab/status").json()["access_enabled"] is False
        response = client.post("/api/lab/access", json={"passphrase": "zhouxingfu"})
        assert response.status_code == 503
        assert response.json() == {"error": {"code": "access_unavailable"}}
        assert rows(settings) == before


def test_shared_token_expiry_and_legacy_invite_compatibility(settings):
    clock = Clock()
    with TestClient(create_app(settings, FakeProvider(), clock)) as client:
        shared = access(client)
        legacy, code = login(client)
        run = start(client, shared)
        cancel(client, shared, run)
        assert client.get("/api/lab/status", headers=legacy).json()["remaining_runs"] == 10
        assert client.get("/api/lab/status", headers=legacy).json()["quota_scope"] == "session"
        legacy_run = start(client, legacy)
        assert client.get(f"/api/lab/runs/{legacy_run['id']}", headers=shared).status_code == 404
        assert client.get(f"/api/lab/runs/{run['id']}", headers=legacy).status_code == 404
        assert client.post("/api/lab/redeem", json={"invite_code": code}).status_code == 401
        clock.now += settings.token_days * 86400
        assert client.get("/api/lab/status", headers=shared).status_code == 401
        assert client.get("/api/lab/status", headers=legacy).status_code == 401
        assert client.get("/api/lab/status", headers=access(client)).json()["remaining_runs"] == 10


def test_phrase_change_or_disable_keeps_existing_sessions_valid(settings):
    clock = Clock()
    with TestClient(create_app(settings, FakeProvider(), clock)) as client:
        headers = access(client)
        run = start(client, headers)
        cancel(client, headers, run)
    for phrase in ("new-shared-phrase", ""):
        with TestClient(create_app(replace(settings, access_passphrase=phrase), FakeProvider(), clock)) as client:
            assert client.get(f"/api/lab/runs/{run['id']}", headers=headers).json()["status"] == "cancelled"
            assert client.get("/api/lab/status", headers=headers).json()["remaining_runs"] == 9
            rejected = client.post("/api/lab/access", json={"passphrase": "zhouxingfu"})
            assert rejected.status_code == (403 if phrase else 503)


def test_old_sqlite_migration_keeps_existing_tokens_history_and_is_idempotent(settings):
    clock = Clock()
    owner, token = str(uuid.uuid4()), "old-token-for-migration-not-a-provider-key"
    with sqlite3.connect(settings.database) as conn:
        conn.executescript("CREATE TABLE invites(id TEXT PRIMARY KEY,code_hash TEXT UNIQUE NOT NULL,expires REAL NOT NULL,redeemed REAL); CREATE TABLE tokens(token_hash TEXT PRIMARY KEY,invite_id TEXT NOT NULL REFERENCES invites(id),expires REAL NOT NULL); PRAGMA user_version=2;")
        conn.execute("INSERT INTO invites VALUES(?,?,?,?)", (owner, digest("used-old-invite"), clock.now + 86400, clock.now))
        conn.execute("INSERT INTO tokens VALUES(?,?,?)", (digest(token), owner, clock.now + 86400))
    legacy = {"Authorization": "Bearer " + token}
    with TestClient(create_app(settings, FakeProvider(), clock)) as client:
        old_run = start(client, legacy)
        cancel(client, legacy, old_run)
        shared = access(client)
        assert client.get("/api/lab/status", headers=shared).json()["remaining_runs"] == 10
    with TestClient(create_app(settings, FakeProvider(), clock)) as client:
        assert client.get(f"/api/lab/runs/{old_run['id']}", headers=legacy).json()["status"] == "cancelled"
        assert client.get("/api/lab/status", headers=legacy).json()["remaining_runs"] == 9
        assert client.get("/api/lab/status", headers=shared).json()["remaining_runs"] == 10
        with sqlite3.connect(settings.database) as conn:
            assert conn.execute("PRAGMA user_version").fetchone()[0] == 3
            assert [item[1] for item in conn.execute("PRAGMA table_info(invites)")].count("quota_id") == 1
            assert conn.execute("SELECT quota_id FROM invites WHERE id=?", (owner,)).fetchone()[0] is None


def test_phrase_compare_is_fixed_size_and_supports_non_ascii(settings, monkeypatch):
    from agent_lab import store as module
    original, seen = module.hmac.compare_digest, []

    def compared(left, right):
        seen.append((len(left), len(right)))
        return original(left, right)

    monkeypatch.setattr(module.hmac, "compare_digest", compared)
    with TestClient(create_app(replace(settings, access_passphrase="共同工坊"), FakeProvider())) as client:
        assert client.post("/api/lab/access", json={"passphrase": "错"}).status_code == 403
        access(client, "共同工坊")
    assert seen == [(64, 64), (64, 64)]


def test_shared_phrase_is_only_process_configuration_and_hidden_from_repr(monkeypatch):
    for name in ("MODEL_BASE_URL", "MODEL_NAME", "MODEL_API_KEY", "LAB_ACCESS_PASSPHRASE"):
        monkeypatch.delenv(name, raising=False)
    assert Settings.from_env().access_enabled is False
    monkeypatch.setenv("LAB_ACCESS_PASSPHRASE", " private-phrase ")
    configured = Settings.from_env()
    assert configured.access_passphrase == "private-phrase"
    assert "private-phrase" not in repr(configured)
    monkeypatch.setenv("LAB_ACCESS_PASSPHRASE", "x" * 129)
    with pytest.raises(ValueError, match="^Invalid LAB_ACCESS_PASSPHRASE$"):
        Settings.from_env()


def test_shared_login_preserves_eight_request_stop_and_disabled_second_model(settings):
    fake = FakeProvider([assistant(call("observe", target="source")) for _ in range(8)])
    with TestClient(create_app(settings, fake)) as client:
        headers = access(client)
        before = client.get("/api/lab/status", headers=headers).json()
        unavailable = client.post("/api/lab/runs", headers=headers, json={**operation(), "experiment_type": "same-blueprint-models"})
        assert unavailable.status_code == 503
        assert client.get("/api/lab/status", headers=headers).json()["remaining_runs"] == before["remaining_runs"]
        assert before["limits"] == {"daily_runs": 10, "max_steps": 8, "run_seconds": 120, "max_output_tokens": 512, "global_concurrency": 1, "quota_timezone": "UTC"}
        run = start(client, headers)
        for _ in range(8):
            response = step(client, headers, run)
            assert response.status_code == 200
        assert response.json()["status"] == "budget_exhausted"
        assert step(client, headers, run).status_code == 409
        assert fake.calls == 8
        assert client.get("/api/lab/status", headers=access(client)).json()["remaining_runs"] == 9
