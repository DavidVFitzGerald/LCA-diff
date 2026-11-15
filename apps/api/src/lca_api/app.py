"""Authenticated read API with bounded requests and disposable query transactions."""

import asyncio
import contextlib
import time
from collections import OrderedDict
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Annotated, Any, TypeVar
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from lca_shared.logging import configure_logging
from loguru import logger
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine
from starlette.middleware.cors import CORSMiddleware

from lca_api import dtos as d
from lca_api.auth import FirebaseVerifier
from lca_api.config import ApiSettings
from lca_api.errors import ApiError, ErrorDetail, ErrorResponse
from lca_api.queries import Queries
from lca_api.tokens import Tokens

T = TypeVar("T")


async def cancellable[T](request: Request, operation: Awaitable[T]) -> T:
    task = asyncio.ensure_future(operation)

    async def disconnected() -> None:
        while not await request.is_disconnected():
            await asyncio.sleep(0.05)

    watch = asyncio.create_task(disconnected())
    try:
        done, _ = await asyncio.wait((task, watch), return_when=asyncio.FIRST_COMPLETED)
        if task in done:
            return await task
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        raise ApiError("TEMPORARILY_UNAVAILABLE", 503, retryable=True)
    finally:
        if not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        watch.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await watch


def create_app(settings: ApiSettings | None = None) -> FastAPI:
    config = settings or ApiSettings()  # type: ignore[call-arg]
    configure_logging(level=config.log_level)
    engine = create_async_engine(
        config.database_url.get_secret_value(),
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=5,
        pool_timeout=5,
        isolation_level="REPEATABLE READ",
        execution_options={"schema_translate_map": {None: "api"}},
    )
    tokens = Tokens(config.token_secret.get_secret_value())
    verifier: FirebaseVerifier | None = None
    buckets: OrderedDict[str, tuple[float, int]] = OrderedDict()
    metrics = {"requests": 0, "errors": 0, "slow_requests": 0}

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        yield
        if verifier is not None:
            verifier.close()
        await engine.dispose()

    app = FastAPI(
        title="LCA diff API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if config.environment == "production" else "/docs",
        redoc_url=None,
        responses={
            status: {"model": ErrorResponse} for status in (401, 403, 404, 409, 422, 429, 503)
        },
    )
    app.state.engine = engine
    app.state.metrics = metrics

    def error_response(request: Request, error: ApiError) -> JSONResponse:
        detail = ErrorDetail(
            code=error.code,
            message=error.code.replace("_", " ").capitalize(),
            request_id=request.state.request_id,
            retryable=error.retryable,
        )
        headers = {"WWW-Authenticate": "Bearer"} if error.status == 401 else {}
        if error.status == 429:
            headers["Retry-After"] = "60"
        return JSONResponse(
            ErrorResponse(error=detail).model_dump(mode="json"),
            status_code=error.status,
            headers=headers,
        )

    @app.exception_handler(ApiError)
    async def api_error(request: Request, error: ApiError) -> JSONResponse:
        return error_response(request, error)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, error: RequestValidationError) -> JSONResponse:
        # Validation errors deliberately omit original input and exception context.
        return error_response(request, ApiError("INVALID_FILTER", 422))

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request: Request, error: SQLAlchemyError) -> JSONResponse:
        return error_response(request, ApiError("TEMPORARILY_UNAVAILABLE", 503, retryable=True))

    @app.middleware("http")
    async def budgets(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        started = time.monotonic()
        request.state.request_id = str(uuid4())
        metrics["requests"] += 1
        try:
            key = request.client.host if request.client else "unknown"
            since, count = buckets.pop(key, (started, 0))
            if started - since >= 60:
                since, count = started, 0
            buckets[key] = since, count + 1
            while len(buckets) > 4096:
                buckets.popitem(last=False)
            if count >= config.requests_per_minute:
                raise ApiError("TEMPORARILY_UNAVAILABLE", 429, retryable=True)
            declared = request.headers.get("content-length")
            if declared and (not declared.isdecimal() or int(declared) > config.request_bytes):
                raise ApiError("REQUEST_WINDOW_TOO_LARGE", 422)
            if request.method in ("POST", "PUT", "PATCH"):
                data = bytearray()
                async for chunk in request.stream():
                    data.extend(chunk)
                    if len(data) > config.request_bytes:
                        raise ApiError("REQUEST_WINDOW_TOO_LARGE", 422)
                request._body = bytes(data)
            response = await call_next(request)
            # Buffer at most the configured response budget before sending any bytes.
            body = bytearray()
            async for chunk in response.body_iterator:  # type: ignore[attr-defined]
                body.extend(chunk)
                if len(body) > config.response_bytes:
                    raise ApiError("REQUEST_WINDOW_TOO_LARGE", 422)
            response = Response(
                bytes(body),
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type,
            )
        except ApiError as error:
            response = error_response(request, error)
        except Exception:
            response = error_response(
                request, ApiError("TEMPORARILY_UNAVAILABLE", 503, retryable=True)
            )
        elapsed = time.monotonic() - started
        if response.status_code >= 400:
            metrics["errors"] += 1
        if elapsed > 1:
            metrics["slow_requests"] += 1
        logger.bind(
            request_id=request.state.request_id,
            status=response.status_code,
            duration_ms=round(elapsed * 1000),
        ).info("API_REQUEST")
        response.headers["X-Request-ID"] = request.state.request_id
        response.headers["Cache-Control"] = "no-store"
        return response

    async def identity(
        request: Request,
        credential: Annotated[
            HTTPAuthorizationCredentials | None, Depends(HTTPBearer(auto_error=False))
        ],
    ) -> d.Identity:
        nonlocal verifier
        if credential is None or len(credential.credentials) > 16384:
            raise ApiError("AUTH_REQUIRED", 401)
        if verifier is None:
            verifier = FirebaseVerifier(config)
        return await verifier.verify(credential.credentials)

    IdentityDep = Annotated[d.Identity, Depends(identity)]

    async def queries(request: Request, user: IdentityDep) -> AsyncIterator[Queries]:
        async with engine.connect() as connection, connection.begin():
            await connection.execute(text("SET TRANSACTION READ ONLY"))
            role = await connection.scalar(text("SELECT current_user"))
            if role != "lca_api":
                raise ApiError("TEMPORARILY_UNAVAILABLE", 503, retryable=True)
            await connection.execute(
                text("SELECT set_config('statement_timeout', :timeout, true)"),
                {"timeout": str(config.statement_timeout_ms)},
            )
            yield Queries(connection, tokens, request.state.request_id, user)

    QueryDep = Annotated[Queries, Depends(queries)]

    @app.get("/api/v1/health", response_model=d.Health)
    async def health() -> d.Health:
        return d.Health()

    @app.get("/api/v1/ready", response_model=d.Health)
    async def ready() -> d.Health:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1 FROM api.release_publication LIMIT 1"))
        return d.Health()

    @app.get("/api/v1/me", response_model=d.Identity)
    async def me(user: IdentityDep) -> d.Identity:
        return user

    @app.get("/api/v1/metrics", response_model=dict[str, int])
    async def operational_metrics(user: IdentityDep) -> dict[str, int]:
        return metrics.copy()

    @app.get("/api/v1/releases", response_model=d.Page[d.Release])
    async def releases(request: Request, q: QueryDep) -> d.Page[d.Release]:
        return await cancellable(request, q.release_list())

    @app.post("/api/v1/processes/search", response_model=d.Page[d.SearchNode])
    async def search(body: d.SearchRequest, request: Request, q: QueryDep) -> Any:
        return await cancellable(request, q.search(body))

    @app.post("/api/v1/processes/resolve-selection", response_model=d.Page[str])
    async def resolve(body: d.ResolveRequest, request: Request, q: QueryDep) -> Any:
        return await cancellable(request, q.search(body, resolve=True))

    @app.post("/api/v1/processes/headers", response_model=d.Page[d.Header])
    async def headers(body: d.HeadersRequest, request: Request, q: QueryDep) -> d.Page[d.Header]:
        return await cancellable(request, q.headers(body))

    @app.get("/api/v1/indicators/tree", response_model=d.IndicatorTree)
    async def indicators(
        request: Request, q: QueryDep, revision_snapshot: str = "[]"
    ) -> d.IndicatorTree:
        # GET metadata uses JSON-encoded snapshot pairs; no GET request body.
        from pydantic import ValidationError

        try:
            body = d.Snapshot.model_validate_json('{"revision_snapshot":' + revision_snapshot + "}")
        except ValidationError:
            raise ApiError("INVALID_FILTER", 422) from None
        return await cancellable(request, q.indicator_tree(body))

    @app.post("/api/v1/comparison/flows/rows", response_model=d.ComparisonPage[d.FlowRow])
    async def flow_rows(
        body: d.RowsRequest, request: Request, q: QueryDep
    ) -> d.ComparisonPage[d.FlowRow]:
        return await cancellable(request, q.flow_rows(body))

    @app.post("/api/v1/comparison/flows/cells", response_model=d.Cells[d.FlowCell])
    async def flow_cells(
        body: d.FlowCellsRequest, request: Request, q: QueryDep
    ) -> d.Cells[d.FlowCell]:
        return await cancellable(request, q.flow_cells(body))

    @app.post("/api/v1/comparison/scores/rows", response_model=d.ComparisonPage[d.Indicator])
    async def score_rows(
        body: d.ScoreRowsRequest, request: Request, q: QueryDep
    ) -> d.ComparisonPage[d.Indicator]:
        return await cancellable(request, q.score_rows(body))

    @app.post("/api/v1/comparison/scores/cells", response_model=d.Cells[d.ScoreCell])
    async def score_cells(
        body: d.ScoreCellsRequest, request: Request, q: QueryDep
    ) -> d.Cells[d.ScoreCell]:
        return await cancellable(request, q.score_cells(body))

    # Registered last so CORS wraps early budget/rate errors as well as routes.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID"],
    )
    return app
