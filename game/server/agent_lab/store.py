from contextlib import closing, contextmanager
from datetime import datetime, timezone
import hashlib
import json
import secrets
import sqlite3
import time
import uuid

from .config import Settings
from .world import execute_tool, initial_messages, initial_world


class Problem(Exception):
    def __init__(self, status: int, code: str):
        self.status = status
        self.code = code


def digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def encode(value) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def iso(timestamp: float) -> str:
    return datetime.fromtimestamp(timestamp, timezone.utc).isoformat().replace("+00:00", "Z")


class Store:
    def __init__(self, settings: Settings, clock=time.time):
        self.settings = settings
        self.clock = clock

    def initialize(self):
        self.settings.database.parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.settings.database)) as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS invites (
                    id TEXT PRIMARY KEY, code_hash TEXT UNIQUE NOT NULL,
                    expires REAL NOT NULL, redeemed REAL
                );
                CREATE TABLE IF NOT EXISTS tokens (
                    token_hash TEXT PRIMARY KEY, invite_id TEXT NOT NULL REFERENCES invites(id),
                    expires REAL NOT NULL
                );
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY, invite_id TEXT NOT NULL REFERENCES invites(id),
                    create_key TEXT NOT NULL, scenario TEXT NOT NULL,
                    created REAL NOT NULL, day TEXT NOT NULL, expires REAL NOT NULL,
                    status TEXT NOT NULL, steps INTEGER NOT NULL DEFAULT 0,
                    max_steps INTEGER NOT NULL, inflight INTEGER NOT NULL DEFAULT 0,
                    world TEXT NOT NULL, messages TEXT NOT NULL, events TEXT NOT NULL,
                    final_text TEXT NOT NULL DEFAULT '',
                    UNIQUE(invite_id, create_key)
                );
                CREATE INDEX IF NOT EXISTS runs_quota ON runs(invite_id, day);
                CREATE TABLE IF NOT EXISTS operations (
                    run_id TEXT NOT NULL REFERENCES runs(id), request_key TEXT NOT NULL,
                    kind TEXT NOT NULL, response TEXT,
                    PRIMARY KEY(run_id, request_key)
                );
            """)

    @contextmanager
    def transaction(self):
        conn = sqlite3.connect(self.settings.database, timeout=5, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()

    def create_invite(self, valid_days: int = 30) -> str:
        code = "AG-" + secrets.token_urlsafe(32)
        with self.transaction() as conn:
            conn.execute("INSERT INTO invites(id,code_hash,expires) VALUES(?,?,?)", (str(uuid.uuid4()), digest(code), self.clock() + valid_days * 86400))
        return code

    def redeem(self, code: str) -> dict:
        now = self.clock()
        with self.transaction() as conn:
            invite = conn.execute("SELECT * FROM invites WHERE code_hash=?", (digest(code),)).fetchone()
            if not invite or invite["expires"] <= now or invite["redeemed"] is not None:
                raise Problem(401, "invalid_invite")
            token = secrets.token_urlsafe(48)
            expires = now + self.settings.token_days * 86400
            conn.execute("UPDATE invites SET redeemed=? WHERE id=?", (now, invite["id"]))
            conn.execute("INSERT INTO tokens(token_hash,invite_id,expires) VALUES(?,?,?)", (digest(token), invite["id"], expires))
            return {"access_token": token, "token_type": "bearer", "expires_at": iso(expires)}

    def authenticate(self, token: str) -> str:
        with self.transaction() as conn:
            row = conn.execute("SELECT invite_id FROM tokens WHERE token_hash=? AND expires>?", (digest(token), self.clock())).fetchone()
            if not row:
                raise Problem(401, "invalid_token")
            return row["invite_id"]

    def cleanup(self, conn):
        expired = conn.execute("SELECT * FROM runs WHERE expires<=? AND (status='active' OR inflight=1)", (self.clock(),)).fetchall()
        for row in expired:
            events = json.loads(row["events"])
            if row["status"] == "active":
                events.append({"kind": "stop", "code": "run_timeout"})
            status = "timed_out" if row["status"] == "active" else row["status"]
            conn.execute("UPDATE runs SET status=?,inflight=0,events=? WHERE id=?", (status, encode(events), row["id"]))
            result = self.view(self._row(conn, row["id"], row["invite_id"]))
            conn.execute("UPDATE operations SET response=? WHERE run_id=? AND response IS NULL", (encode(result), row["id"]))

    def sweep(self):
        with self.transaction() as conn:
            self.cleanup(conn)

    @staticmethod
    def view(row) -> dict:
        return {"id": row["id"], "scenario_id": row["scenario"], "status": row["status"], "steps_used": row["steps"], "max_steps": row["max_steps"], "expires_at": iso(row["expires"]), "world": json.loads(row["world"]), "events": json.loads(row["events"]), "final_text": row["final_text"], "step_in_progress": bool(row["inflight"])}

    @staticmethod
    def _row(conn, run_id: str, invite_id: str):
        row = conn.execute("SELECT * FROM runs WHERE id=? AND invite_id=?", (run_id, invite_id)).fetchone()
        if not row:
            raise Problem(404, "run_not_found")
        return row

    def status(self, invite_id: str | None = None):
        with self.transaction() as conn:
            self.cleanup(conn)
            result = {"enabled": self.settings.enabled, "scenario_ids": ["signal-rescue"], "limits": {"daily_runs": self.settings.daily_runs, "max_steps": self.settings.max_steps, "run_seconds": self.settings.run_seconds, "max_output_tokens": self.settings.max_output_tokens, "global_concurrency": 1, "quota_timezone": "UTC"}, "busy": bool(conn.execute("SELECT 1 FROM runs WHERE status='active' OR inflight=1 LIMIT 1").fetchone())}
            if invite_id:
                count = conn.execute("SELECT COUNT(*) FROM runs WHERE invite_id=? AND day=?", (invite_id, iso(self.clock())[:10])).fetchone()[0]
                active = conn.execute("SELECT * FROM runs WHERE invite_id=? AND status='active' ORDER BY created DESC LIMIT 1", (invite_id,)).fetchone()
                result.update({"remaining_runs": max(0, self.settings.daily_runs - count), "active_run": self.view(active) if active else None})
            return result

    def get_run(self, invite_id: str, run_id: str):
        with self.transaction() as conn:
            self.cleanup(conn)
            return self.view(self._row(conn, run_id, invite_id))

    def create_run(self, invite_id: str, key: str, scenario: str):
        now = self.clock()
        with self.transaction() as conn:
            self.cleanup(conn)
            old = conn.execute("SELECT * FROM runs WHERE invite_id=? AND create_key=?", (invite_id, key)).fetchone()
            if old:
                if old["scenario"] != scenario:
                    raise Problem(409, "idempotency_conflict")
                return self.view(old)
            if not self.settings.enabled:
                raise Problem(503, "lab_unavailable")
            day = iso(now)[:10]
            used = conn.execute("SELECT COUNT(*) FROM runs WHERE invite_id=? AND day=?", (invite_id, day)).fetchone()[0]
            if used >= self.settings.daily_runs:
                raise Problem(429, "daily_quota_exhausted")
            if conn.execute("SELECT 1 FROM runs WHERE status='active' OR inflight=1 LIMIT 1").fetchone():
                raise Problem(409, "lab_busy")
            ident = str(uuid.uuid4())
            conn.execute("INSERT INTO runs(id,invite_id,create_key,scenario,created,day,expires,status,max_steps,world,messages,events) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", (ident, invite_id, key, scenario, now, day, now + self.settings.run_seconds, "active", self.settings.max_steps, encode(initial_world()), encode(initial_messages()), "[]"))
            return self.view(self._row(conn, ident, invite_id))

    def begin_step(self, invite_id: str, run_id: str, key: str) -> tuple[dict, bool]:
        with self.transaction() as conn:
            self.cleanup(conn)
            row = self._row(conn, run_id, invite_id)
            previous = conn.execute("SELECT * FROM operations WHERE run_id=? AND request_key=?", (run_id, key)).fetchone()
            if previous:
                if previous["kind"] != "step":
                    raise Problem(409, "idempotency_conflict")
                if previous["response"] is None:
                    raise Problem(409, "step_in_progress")
                return json.loads(previous["response"]), False
            if row["status"] != "active":
                raise Problem(409, "run_not_active")
            if row["inflight"]:
                raise Problem(409, "step_in_progress")
            if row["steps"] >= row["max_steps"]:
                raise Problem(409, "step_budget_exhausted")
            conn.execute("INSERT INTO operations(run_id,request_key,kind) VALUES(?,?,'step')", (run_id, key))
            conn.execute("UPDATE runs SET steps=steps+1,inflight=1 WHERE id=?", (run_id,))
            return {"messages": json.loads(row["messages"]), "expires": row["expires"]}, True

    def finish_step(self, invite_id: str, run_id: str, key: str, message: dict | None = None, failure: str | None = None):
        with self.transaction() as conn:
            self.cleanup(conn)
            row = self._row(conn, run_id, invite_id)
            # Cancellation/expiry wins over a late provider response. Never run its tools.
            if row["status"] == "active":
                events, messages, world = (json.loads(row[field]) for field in ["events", "messages", "world"])
                status, final_text = "active", row["final_text"]
                if failure:
                    status = "timed_out" if failure == "run_timeout" else "failed"
                    events.append({"kind": "stop", "code": failure})
                else:
                    messages.append(message)
                    if message.get("content"):
                        events.append({"kind": "assistant", "text": message["content"]})
                    calls = message.get("tool_calls", [])
                    for call in calls:
                        function = call["function"]
                        world, result = execute_tool(world, function["name"], function["arguments"])
                        events.append({"kind": "tool", "call_id": call["id"], "tool": function["name"], "arguments": function["arguments"], "result": result})
                        messages.append({"role": "tool", "tool_call_id": call["id"], "content": encode(result)})
                    if world["verified"]:
                        status, final_text = "completed", "虚拟信号塔已通过独立验收。"
                    elif not calls:
                        status, final_text = "incomplete", message.get("content", "")
                        events.append({"kind": "stop", "code": "verification_missing"})
                    elif row["steps"] >= row["max_steps"]:
                        status = "budget_exhausted"
                        events.append({"kind": "stop", "code": "step_budget_exhausted"})
                conn.execute("UPDATE runs SET world=?,messages=?,events=?,status=?,final_text=?,inflight=0 WHERE id=?", (encode(world), encode(messages), encode(events), status, final_text, run_id))
            else:
                conn.execute("UPDATE runs SET inflight=0 WHERE id=?", (run_id,))
            result = self.view(self._row(conn, run_id, invite_id))
            conn.execute("UPDATE operations SET response=? WHERE run_id=? AND request_key=?", (encode(result), run_id, key))
            return result

    def cancel(self, invite_id: str, run_id: str, key: str):
        with self.transaction() as conn:
            self.cleanup(conn)
            row = self._row(conn, run_id, invite_id)
            previous = conn.execute("SELECT * FROM operations WHERE run_id=? AND request_key=?", (run_id, key)).fetchone()
            if previous:
                if previous["kind"] != "cancel":
                    raise Problem(409, "idempotency_conflict")
                return json.loads(previous["response"])
            if row["status"] == "active":
                events = json.loads(row["events"]) + [{"kind": "stop", "code": "user_cancelled"}]
                # Keep inflight lease until pending HTTP finishes/cancels or deadline expires.
                conn.execute("UPDATE runs SET status='cancelled',events=? WHERE id=?", (encode(events), run_id))
            result = self.view(self._row(conn, run_id, invite_id))
            conn.execute("INSERT INTO operations(run_id,request_key,kind,response) VALUES(?,?,'cancel',?)", (run_id, key, encode(result)))
            return result
