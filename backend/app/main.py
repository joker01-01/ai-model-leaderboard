"""FastAPI application factory and lifecycle-owned Agent dependencies."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

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
PUBLIC_FRONTEND_URL = "https://joker01-01.github.io/ai-model-leaderboard/"


def _runtime_is_available(application: FastAPI) -> bool:
    return isinstance(getattr(application.state, "agent_runtime", None), AgentRuntime)


def _service_landing_page(*, available: bool) -> str:
    status = "ok" if available else "unavailable"
    status_label = "运行正常" if available else "运行时不可用"
    status_detail = (
        "Agent 运行时已就绪，可以接收请求。"
        if available
        else "服务在线，但 Agent 运行时尚未就绪。"
    )
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <title>ModelOps Agent API</title>
  <style>
    :root {{
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #080b10;
      color: #edf4ff;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      --signal: #ffb86b;
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 32px 20px;
      background-color: #080b10;
      background-image: radial-gradient(circle at 1px 1px, #253040 1px, transparent 0);
      background-size: 28px 28px;
    }}
    body[data-status="ok"] {{ --signal: #70e0a1; }}
    main {{
      width: min(760px, 100%);
      border: 1px solid #2a3545;
      background: #0d1219;
      box-shadow: 0 24px 80px rgb(0 0 0 / 45%);
    }}
    header {{ padding: 32px; border-bottom: 1px solid #2a3545; }}
    .eyebrow {{
      margin: 0 0 18px;
      color: #8da2bd;
      font: 600 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
      letter-spacing: .14em;
      text-transform: uppercase;
    }}
    h1 {{ margin: 0; font-size: clamp(34px, 7vw, 62px); line-height: .95; letter-spacing: -.055em; }}
    .status {{
      display: flex;
      align-items: flex-start;
      gap: 14px;
      margin-top: 28px;
      padding: 16px 18px;
      border-left: 3px solid var(--signal);
      background: #111923;
    }}
    .status-dot {{
      width: 10px;
      height: 10px;
      margin-top: 5px;
      border-radius: 50%;
      background: var(--signal);
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--signal) 14%, transparent);
      flex: 0 0 auto;
    }}
    .status strong {{ display: block; color: var(--signal); font-size: 15px; }}
    .status p {{ margin: 4px 0 0; color: #aebed1; font-size: 14px; line-height: 1.5; }}
    nav {{ display: grid; grid-template-columns: repeat(3, 1fr); }}
    a {{
      min-height: 150px;
      padding: 24px;
      color: inherit;
      text-decoration: none;
      border-right: 1px solid #2a3545;
      background: #0d1219;
    }}
    a:last-child {{ border-right: 0; }}
    a:hover {{ background: #131b26; }}
    a:focus-visible {{ outline: 3px solid #7da7ff; outline-offset: -3px; }}
    code {{
      display: block;
      margin-bottom: 32px;
      color: #7da7ff;
      font: 600 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
    }}
    a strong {{ display: block; font-size: 17px; letter-spacing: -.01em; }}
    a span {{ display: block; margin-top: 7px; color: #8da2bd; font-size: 13px; line-height: 1.45; }}
    footer {{
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 24px;
      border-top: 1px solid #2a3545;
      color: #71849c;
      font: 500 12px/1.4 ui-monospace, SFMono-Regular, Consolas, monospace;
      text-transform: uppercase;
      letter-spacing: .08em;
    }}
    @media (max-width: 620px) {{
      header {{ padding: 26px 22px; }}
      nav {{ grid-template-columns: 1fr; }}
      a {{ min-height: auto; border-right: 0; border-bottom: 1px solid #2a3545; }}
      a:last-child {{ border-bottom: 0; }}
      code {{ margin-bottom: 14px; }}
      footer {{ flex-direction: column; }}
    }}
  </style>
</head>
<body data-status="{status}">
  <main>
    <header>
      <p class="eyebrow" lang="en">Public service boundary / ModelOps</p>
      <h1 lang="en">Agent API</h1>
      <div class="status" role="status">
        <span class="status-dot" aria-hidden="true"></span>
        <div><strong>{status_label}</strong><p>{status_detail}</p></div>
      </div>
    </header>
    <nav aria-label="服务入口">
      <a href="{PUBLIC_FRONTEND_URL}">
        <code>01 / PRODUCT</code><strong>打开模型排行榜</strong><span>进入公开排行榜与 Agent 面板</span>
      </a>
      <a href="/docs">
        <code>02 / API</code><strong>查看 API 文档</strong><span>浏览请求格式与响应契约</span>
      </a>
      <a href="/healthz">
        <code>03 / HEALTH</code><strong>读取健康状态</strong><span>检查运行时是否可用</span>
      </a>
    </nav>
    <footer><span>无状态运行时</span><span>人工审核后发布</span></footer>
  </main>
</body>
</html>"""


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

    @application.get("/", response_class=HTMLResponse, include_in_schema=False)
    async def service_landing(request: Request) -> HTMLResponse:
        available = _runtime_is_available(request.app)
        return HTMLResponse(
            content=_service_landing_page(available=available),
            status_code=200 if available else 503,
            headers={"Cache-Control": "no-store"},
        )

    @application.get(
        "/healthz",
        response_model=HealthResponse,
        responses={503: {"model": HealthResponse}},
        tags=["health"],
    )
    async def healthz(request: Request, response: Response) -> HealthResponse:
        if not _runtime_is_available(request.app):
            response.status_code = 503
            return HealthResponse(status="unavailable")
        return HealthResponse(status="ok")

    return application


app = create_app()
