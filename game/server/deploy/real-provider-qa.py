"""Explicit production QA; not bundled or executed by the service.

Uses a separate single-use QA invite, fixed virtual task and at most four runs.
Run as agent-game-lab with the production package on PYTHONPATH. Private evidence
and Bearer are written only to a fresh owner-only directory, never stdout.
No environment file, model key or direct provider endpoint is read by this script.
"""
import argparse
import asyncio
import json
import os
from pathlib import Path
import time
import uuid

import httpx

from agent_lab.config import Settings
from agent_lab.store import Store

MAX_RUNS = 4


def save(path, value):
    raw = json.dumps(value, ensure_ascii=False, indent=2).encode("utf-8")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as output:
        output.write(raw)


def summary(run):
    events = run["events"]
    result = {"status": run["status"], "steps_used": run["steps_used"],
              "verified": run["world"]["verified"], "assistant_events": sum(e["kind"] == "assistant" for e in events),
              "tool_events": sum(e["kind"] == "tool" for e in events),
              "successful_tools": sum(e["kind"] == "tool" and e["result"].get("ok") is True for e in events),
              "handoffs": sum(e["kind"] == "handoff" for e in events),
              "stop_codes": [e["code"] for e in events if e["kind"] == "stop"]}
    if run.get("experiment"):
        result["arms"] = [{"blueprint": a["blueprint_id"], "status": a["status"], "steps_used": a["steps_used"],
                           "verified": a["world"]["verified"], "tool_calls": a["tool_calls"],
                           "denied_calls": a["denied_calls"], "handoffs": a["handoffs"]} for a in run["experiment"]["arms"]]
    return result


async def main(args):
    private = Path(args.private_dir).resolve()
    if private.parent != Path("/var/lib/agent-game-lab/qa") or not private.name.startswith("real-"):
        raise ValueError("private_directory_out_of_scope")
    if private.is_symlink():
        raise ValueError("private_directory_symlink")
    private.mkdir(parents=True, mode=0o700, exist_ok=True)
    os.chmod(private, 0o700)
    os.chmod(private.parent, 0o700)
    credentials = private / "credentials.json"
    book_path = private / "book.json"
    async with httpx.AsyncClient(base_url=args.base_url.rstrip("/"), timeout=130, trust_env=False, follow_redirects=False) as client:
        if not credentials.exists():
            store = Store(Settings(database=Path("/var/lib/agent-game-lab/lab.sqlite3")))
            code = store.create_invite(1)
            response = await client.post("/api/lab/redeem", json={"invite_code": code})
            assert response.status_code == 200, "qa_redeem_failed"
            auth = response.json()
            save(credentials, {"invite_code": code, "access_token": auth["access_token"]})
        auth = json.loads(credentials.read_text(encoding="utf-8"))
        client.headers["Authorization"] = "Bearer " + auth["access_token"]
        book = json.loads(book_path.read_text(encoding="utf-8")) if book_path.exists() else {"runs": {}, "checks": {}}
        async def request(method, path, body=None, expected=200):
            response = await client.request(method, path, json=body)
            assert response.status_code == expected, "http_status_mismatch_" + str(response.status_code)
            assert "no-store" in response.headers.get("cache-control", ""), "cache_boundary_missing"
            return response.json()
        async def status():
            return await request("GET", "/api/lab/status")
        async def new(name, experiment=None):
            if name in book["runs"]:
                return await request("GET", "/api/lab/runs/" + book["runs"][name]["id"])
            assert len(book["runs"]) < MAX_RUNS, "qa_run_budget_exhausted"
            before = await status()
            body = {"request_id": str(uuid.uuid4()), "scenario_id": "signal-rescue"}
            if experiment:
                body["experiment_type"] = experiment
            run = await request("POST", "/api/lab/runs", body)
            book["runs"][name] = {"id": run["id"], "create_body": body}
            save(book_path, book)
            repeat = await request("POST", "/api/lab/runs", body)
            assert repeat["id"] == run["id"], "create_idempotency_failed"
            after = await status()
            assert after["remaining_runs"] == before["remaining_runs"] - 1, "quota_create_repeat_mismatch"
            book["checks"][name + "_create_idempotent"] = True
            save(book_path, book)
            return run
        async def finish(name, experiment=None):
            run = await new(name, experiment)
            start = time.monotonic()
            while run["status"] == "active":
                body = {"request_id": str(uuid.uuid4())}
                run = await request("POST", "/api/lab/runs/" + run["id"] + "/step", body)
                repeat = await request("POST", "/api/lab/runs/" + run["id"] + "/step", body)
                assert repeat == run, "step_idempotency_failed"
                refreshed = await request("GET", "/api/lab/runs/" + run["id"])
                assert refreshed == run, "refresh_changed_confirmed_state"
                assert run["steps_used"] <= 8, "request_budget_exceeded"
                save(private / (name + ".json"), run)
                print(json.dumps({"progress": name, **summary(run)}, ensure_ascii=False), flush=True)
            book["runs"][name]["summary"] = {**summary(run), "elapsed_seconds": round(time.monotonic() - start, 2)}
            book["checks"][name + "_step_refresh_idempotent"] = True
            save(book_path, book)
            assert any(e["kind"] == "tool" for e in run["events"]), "no_actual_model_tool_output"
            return run
        initial = await status()
        assert initial["enabled"], "lab_not_enabled"
        assert initial["limits"]["max_steps"] <= 8 and initial["limits"]["run_seconds"] <= 120, "production_boundaries_changed"
        if args.phase == "single":
            run = await new("single")
            await request("POST", "/api/lab/runs", {"request_id": str(uuid.uuid4())}, 409)
            before = await status()
            await request("POST", "/api/lab/runs", {"request_id": str(uuid.uuid4()), "experiment_type": "same-blueprint-models"}, 503)
            assert (await status())["remaining_runs"] == before["remaining_runs"], "disabled_comparison_charged_quota"
            book["checks"]["busy_denial_and_disabled_model_no_charge"] = True
            await finish("single")
        elif args.phase == "comparisons":
            await finish("blueprints", "same-model-blueprints")
            await finish("team", "solo-team")
        elif args.phase == "cancel":
            run = await new("cancel")
            step_body = {"request_id": str(uuid.uuid4())}
            task = asyncio.create_task(request("POST", "/api/lab/runs/" + run["id"] + "/step", step_body))
            for _ in range(50):
                await asyncio.sleep(0.02)
                observed = await request("GET", "/api/lab/runs/" + run["id"])
                if observed["step_in_progress"]:
                    break
                assert not task.done(), "provider_finished_before_inflight_cancel"
            assert observed["step_in_progress"], "cancel_did_not_observe_actual_request"
            cancel_body = {"request_id": str(uuid.uuid4())}
            cancelled = await request("POST", "/api/lab/runs/" + run["id"] + "/cancel", cancel_body)
            late = await task
            refreshed = await request("GET", "/api/lab/runs/" + run["id"])
            repeat = await request("POST", "/api/lab/runs/" + run["id"] + "/cancel", cancel_body)
            assert repeat == cancelled, "cancel_idempotency_failed"
            assert late["status"] == refreshed["status"] == "cancelled", "cancel_lost_to_late_reply"
            assert refreshed["world"] == cancelled["world"], "late_reply_changed_cancelled_world"
            assert not refreshed["step_in_progress"], "cancel_lease_not_released"
            assert refreshed["steps_used"] == 1, "cancelled_request_not_counted"
            assert (await status())["busy"] is False, "cancel_kept_global_slot"
            save(private / "cancel.json", {"cancelled": cancelled, "late": late, "refreshed": refreshed})
            book["runs"]["cancel"]["summary"] = summary(refreshed)
            book["checks"]["actual_inflight_cancel_idempotent_late_safe"] = True
        final = await status()
        assert final["remaining_runs"] == final["limits"]["daily_runs"] - len(book["runs"]), "quota_accounting_mismatch"
        assert sum(r.get("summary", {}).get("steps_used", 0) for r in book["runs"].values()) <= MAX_RUNS * 8, "qa_request_ceiling_exceeded"
        book["remaining_runs"] = final["remaining_runs"]
        save(book_path, book)
        print(json.dumps({"phase": args.phase, "created_runs": len(book["runs"]), "remaining_runs": final["remaining_runs"],
                          "checks": book["checks"], "runs": {name: r.get("summary") for name, r in book["runs"].items()}}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--private-dir", required=True)
    parser.add_argument("--base-url", default="https://agent.li33.art")
    parser.add_argument("--phase", choices=["single", "comparisons", "cancel"], required=True)
    try:
        asyncio.run(main(parser.parse_args()))
    except Exception as error:
        # No exception text, headers, response bodies, credentials or model text.
        print(json.dumps({"qa_failed": type(error).__name__}), flush=True)
        raise SystemExit(1)
