"""FastAPI application factory and lifecycle-owned Agent dependencies."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.agent import AgentRuntime
from app.api.agent import router as agent_router
from app.api.contracts import (
    ApiBoundaryError,
    ApiError,
    ApiErrorCode,
    ApiErrorResponse,
    HealthResponse,
)
from app.config import ApiSettings
from app.graph.builder import build_graph
from app.graph.state import GraphContext
from app.graph.tool_executor import ModelOpsToolExecutor
from app.repositories.leaderboard import LeaderboardRepository
from app.services.evidence_verifier import EvidenceVerifier
from app.services.openai_gateway import OpenAIResponsesGateway
from app.services.provider_document_client import HttpProviderDocumentClient

logger = logging.getLogger(__name__)

RuntimeFactory = Callable[[ApiSettings], AbstractAsyncContextManager[AgentRuntime]]


@asynccontextmanager
async def default_runtime_factory(settings: ApiSettings) -> AsyncIterator[AgentRuntime]:
    if settings.model_api_key is None:
        raise RuntimeError("MODELOPS_MODEL_API_KEY is required")

    repository = LeaderboardRepository.load()
    async with httpx.AsyncClient() as client:
        gateway = OpenAIResponsesGateway(
            client=client,
            api_key=settings.model_api_key.get_secret_value(),
            model=settings.model_name,
            base_url=settings.model_base_url,
            timeout_seconds=settings.model_timeout_seconds,
        )
        document_client = HttpProviderDocumentClient(
            client=client,
            allowed_urls=(source.url for source in repository.evidence.provider_sources),
            timeout_seconds=settings.provider_document_timeout_seconds,
            max_response_bytes=settings.provider_document_max_bytes,
        )
        tools = ModelOpsToolExecutor(repository, document_client)
        yield AgentRuntime(
            graph=build_graph(),
            context=GraphContext(
                repository=repository,
                gateway=gateway,
                tools=tools,
                verifier=EvidenceVerifier(),
            ),
            recursion_limit=settings.graph_recursion_limit,
            heartbeat_seconds=settings.sse_heartbeat_seconds,
        )


def _json_error(error: ApiError, *, status_code: int) -> JSONResponse:
    envelope = ApiErrorResponse(error=error)
    return JSONResponse(
        status_code=status_code,
        content=envelope.model_dump(mode="json", by_alias=False),
    )


def create_app(
    *,
    settings: ApiSettings | None = None,
    runtime_factory: RuntimeFactory | None = None,
) -> FastAPI:
    resolved_settings = settings or ApiSettings.from_env()
    resolved_factory = runtime_factory or default_runtime_factory

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        application.state.agent_runtime = None
        try:
            runtime_context = resolved_factory(resolved_settings)
            runtime = await runtime_context.__aenter__()
        except Exception as exc:
            logger.error("agent_runtime_unavailable error_type=%s", type(exc).__name__)
            yield
            return

        application.state.agent_runtime = runtime
        try:
            yield
        finally:
            application.state.agent_runtime = None
            try:
                await runtime_context.__aexit__(None, None, None)
            except Exception as exc:
                logger.error("agent_runtime_shutdown_failed error_type=%s", type(exc).__name__)

    application = FastAPI(
        title="AI Model Leaderboard ModelOps Agent",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(resolved_settings.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Accept", "Content-Type"],
    )
    application.include_router(agent_router)

    @application.exception_handler(ApiBoundaryError)
    async def handle_api_error(_request: Request, exc: ApiBoundaryError) -> JSONResponse:
        return _json_error(exc.error, status_code=exc.status_code)

    @application.exception_handler(RequestValidationError)
    async def handle_validation_error(_request: Request, _exc: RequestValidationError) -> JSONResponse:
        return _json_error(
            ApiError(
                code=ApiErrorCode.INVALID_REQUEST,
                message="Request validation failed.",
            ),
            status_code=422,
        )

    @application.exception_handler(Exception)
    async def handle_unexpected_error(_request: Request, exc: Exception) -> JSONResponse:
        logger.error("api_request_failed error_type=%s", type(exc).__name__)
        return _json_error(
            ApiError(
                code=ApiErrorCode.INTERNAL_ERROR,
                message="The request failed unexpectedly.",
            ),
            status_code=500,
        )

    @application.get(
        "/healthz",
        response_model=HealthResponse,
        responses={503: {"model": HealthResponse}},
        tags=["health"],
    )
    async def healthz(request: Request, response: Response) -> HealthResponse:
        if not isinstance(getattr(request.app.state, "agent_runtime", None), AgentRuntime):
            response.status_code = 503
            return HealthResponse(status="unavailable")
        return HealthResponse(status="ok")

    return application


app = create_app()
