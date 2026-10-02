import asyncio
from contextlib import asynccontextmanager, suppress
import sqlite3
import time
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from .config import Settings
from .provider import ChatCompletionsProvider, normalize_message
from .store import Problem, Store


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Redeem(StrictBody):
    invite_code: str = Field(min_length=16, max_length=128)


class Operation(StrictBody):
    request_id: str = Field(min_length=8, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")


class NewRun(Operation):
    scenario_id: Literal["signal-rescue"] = "signal-rescue"


def redact(value, secret: str):
    if isinstance(value, str):
        return value.replace(secret, "[redacted]") if secret else value
    if isinstance(value, list):
        return [redact(item, secret) for item in value]
    if isinstance(value, dict):
        return {key: redact(item, secret) for key, item in value.items()}
    return value


def create_app(settings: Settings | None = None, provider=None, clock=time.time) -> FastAPI:
    settings = settings or Settings.from_env()
    store = Store(settings, clock)
    provider = provider or ChatCompletionsProvider(settings)
    pending: dict[str, asyncio.Task] = {}

    async def sweep():
        while True:
            await asyncio.sleep(5)
            with suppress(sqlite3.Error):
                store.sweep()

    @asynccontextmanager
    async def lifespan(app):
        store.initialize()
        cleaner = asyncio.create_task(sweep())
        try:
            yield
        finally:
            cleaner.cancel()
            with suppress(asyncio.CancelledError):
                await cleaner
            for task in list(pending.values()):
                task.cancel()
            await asyncio.gather(*pending.values(), return_exceptions=True)

    app = FastAPI(title="Agent Game Optional Lab", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store

    @app.exception_handler(Problem)
    async def problem_handler(request, error):
        return JSONResponse({"error": {"code": error.code}}, status_code=error.status)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request, error):
        return JSONResponse({"error": {"code": "invalid_request"}}, status_code=422)

    @app.exception_handler(sqlite3.Error)
    async def database_handler(request, error):
        return JSONResponse({"error": {"code": "storage_unavailable"}}, status_code=503)

    @app.middleware("http")
    async def request_boundaries(request: Request, call_next):
        if request.method == "POST":
            raw_length = request.headers.get("content-length")
            if raw_length and (not raw_length.isdigit() or int(raw_length) > 8192):
                return JSONResponse({"error": {"code": "request_too_large"}}, status_code=413)
            # Nginx also bounds request bodies; this covers direct localhost calls.
            size, chunks = 0, []
            async for chunk in request.stream():
                size += len(chunk)
                if size > 8192:
                    return JSONResponse({"error": {"code": "request_too_large"}}, status_code=413)
                chunks.append(chunk)
            request._body = b"".join(chunks)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def identity(authorization: Annotated[str | None, Header()] = None):
        if not authorization or not authorization.startswith("Bearer "):
            raise Problem(401, "authentication_required")
        token = authorization[7:]
        if not 16 <= len(token) <= 256:
            raise Problem(401, "invalid_token")
        return store.authenticate(token)

    @app.get("/api/lab/status")
    async def status(authorization: Annotated[str | None, Header()] = None):
        invite = identity(authorization) if authorization else None
        return store.status(invite)

    @app.post("/api/lab/redeem")
    async def redeem(body: Redeem):
        return store.redeem(body.invite_code.strip())

    @app.post("/api/lab/runs")
    async def new_run(body: NewRun, invite: str = Depends(identity)):
        return store.create_run(invite, body.request_id, body.scenario_id)

    @app.get("/api/lab/runs/{run_id}")
    async def get_run(run_id: str, invite: str = Depends(identity)):
        return store.get_run(invite, run_id)

    @app.post("/api/lab/runs/{run_id}/step")
    async def step(run_id: str, body: Operation, invite: str = Depends(identity)):
        claim, execute = store.begin_step(invite, run_id, body.request_id)
        if not execute:
            return claim
        try:
            remaining = max(0.001, claim["expires"] - clock())
            task = asyncio.create_task(provider.complete(claim["messages"], remaining))
            pending[run_id] = task
            message = await asyncio.wait_for(task, timeout=remaining)
            # Fake providers and actual providers share the same normalization boundary.
            message = normalize_message({"choices": [{"message": message}]})
            message = redact(message, settings.api_key)
            return store.finish_step(invite, run_id, body.request_id, message=message)
        except asyncio.TimeoutError:
            return store.finish_step(invite, run_id, body.request_id, failure="run_timeout")
        except asyncio.CancelledError:
            return store.finish_step(invite, run_id, body.request_id, failure="request_interrupted")
        except Exception:
            # Never return/log provider exception text or upstream response content.
            return store.finish_step(invite, run_id, body.request_id, failure="provider_error")
        finally:
            pending.pop(run_id, None)

    @app.post("/api/lab/runs/{run_id}/cancel")
    async def cancel(run_id: str, body: Operation, invite: str = Depends(identity)):
        result = store.cancel(invite, run_id, body.request_id)
        if task := pending.get(run_id):
            task.cancel()
        return result

    return app


app = create_app()
