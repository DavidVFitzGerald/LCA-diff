import asyncio
import json

import pytest
from lca_api.app import cancellable
from lca_api.config import ApiSettings
from lca_api.errors import ApiError
from lca_api.tokens import Tokens
from lca_shared.contracts import FlowValue
from pydantic import ValidationError
from starlette.requests import Request

pytestmark = pytest.mark.unit


def test_configuration_tokens_and_measurement_schema(monkeypatch):
    base = {
        "environment": "production",
        "database_url": "postgresql+psycopg://lca_api:unused@postgres/lca",
        "firebase_project_id": "project",
        "token_secret": "x" * 32,
    }
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099")
    with pytest.raises(ValidationError):
        ApiSettings(**base)
    monkeypatch.delenv("FIREBASE_AUTH_EMULATOR_HOST")
    with pytest.raises(ValidationError):
        ApiSettings(
            **(base | {"database_url": "postgresql+psycopg://lca_migrator:unused@postgres/lca"})
        )
    tokens = Tokens("x" * 32)
    token = tokens.sign("cursor", {"query": "abc", "last": [1]})
    assert tokens.read(token, "cursor")["last"] == [1]
    for value, kind in ((token + "x", "cursor"), (token, "comparison"), ("invalid", "cursor")):
        with pytest.raises(ApiError):
            tokens.read(value, kind)
    assert "number" not in json.dumps(FlowValue.model_json_schema())


def test_disconnect_cancels_inflight_work():
    async def scenario():
        cancelled = asyncio.Event()

        async def receive():
            return {"type": "http.disconnect"}

        request = Request({"type": "http", "method": "POST", "path": "/", "headers": []}, receive)

        async def slow():
            try:
                await asyncio.sleep(30)
            finally:
                cancelled.set()

        with pytest.raises(ApiError):
            await cancellable(request, slow())
        assert cancelled.is_set()

    asyncio.run(scenario())

    async def outer_cancellation():
        entered, cancelled = asyncio.Event(), asyncio.Event()

        async def receive():
            await asyncio.sleep(30)
            return {"type": "http.disconnect"}

        request = Request({"type": "http", "method": "POST", "path": "/", "headers": []}, receive)

        async def work():
            entered.set()
            try:
                await asyncio.sleep(30)
            finally:
                cancelled.set()

        wrapper = asyncio.create_task(cancellable(request, work()))
        await entered.wait()
        wrapper.cancel()
        with pytest.raises(asyncio.CancelledError):
            await wrapper
        assert cancelled.is_set()

    asyncio.run(outer_cancellation())
