"""Offline integration tests for health, invoke, SSE, CORS, and cancellation."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import cast

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError
from starlette.types import Message, Scope

from app.api import sse as sse_api
from app.api.advisor import AdvisorRuntime
from app.api.agent import AgentRuntime
from app.config import ApiSettings
from app.domain.models import (
    AgentIntent,
    AgentRequest,
    BenchmarkId,
    Citation,
    CurrencyCode,
    ModelTask,
    PrepareDataUpdateInput,
    ProposedBenchmarkObservation,
    RegionId,
    SelectionConstraints,
)
from app.graph.builder import build_graph
from app.graph.state import GraphContext
from app.graph.tool_executor import ModelOpsToolExecutor
from app.main import AdvisorRuntimeFactory, RuntimeFactory, create_app
from app.repositories.leaderboard import LeaderboardRepository
from app.services.evidence_verifier import EvidenceVerifier
from app.services.model_gateway import FakeModelGateway, ModelGateway, ModelGatewayError, ParsedAgentRequest
from app.tools import ProviderDocumentResponse

_MESSAGE = "recommend one exact model"
_PUBLIC_FRONTEND_URL = "https://joker01-01.github.io/ai-model-leaderboard/"


class OfflineDocumentClient:
    async def get(self, _url: str) -> ProviderDocumentResponse:
        return ProviderDocumentResponse(status_code=404)


class BlockingGateway:
    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()

    async def parse_request(self, _request: AgentRequest) -> ParsedAgentRequest:
        self.started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancelled.set()
            raise
        raise AssertionError("unreachable")


class ExplodingGateway:
    async def parse_request(self, _request: AgentRequest) -> ParsedAgentRequest:
        raise RuntimeError("sk-sensitive-value")


def _parsed_request() -> ParsedAgentRequest:
    return ParsedAgentRequest(
        intent=AgentIntent.RECOMMEND,
        constraints=SelectionConstraints(
            task=ModelTask.PYTHON_CODING,
            provider_region_id=RegionId.CN_BEIJING,
            currency=CurrencyCode.USD,
        ),
    )


def _clarification_request() -> ParsedAgentRequest:
    return ParsedAgentRequest(
        intent=AgentIntent.RECOMMEND,
        missing_constraints=("task",),
    )


def _update_request() -> ParsedAgentRequest:
    citation = Citation(
        citation_id="api-qwen-gpqa",
        title="API integration citation",
        url="https://artificialanalysis.ai/",
        observed_at=date(2026, 9, 2),
    )
    return ParsedAgentRequest(
        intent=AgentIntent.PREPARE_UPDATE,
        update_input=PrepareDataUpdateInput(
            model_id="qwen-3-5",
            proposed_observations=(
                ProposedBenchmarkObservation(
                    benchmark_id=BenchmarkId.GPQA_DIAMOND,
                    value=90.0,
                    unit="%",
                    model_version="qwen/qwen3.5-397b-a17b",
                    source_version_id="qwen/qwen3.5-397b-a17b",
                    observed_at=date(2026, 9, 2),
                    citation_ids=(citation.citation_id,),
                ),
            ),
            citations=(citation,),
            reason="Exercise the API proposal path without applying changes.",
        ),
    )


def _runtime(gateway: ModelGateway) -> AgentRuntime:
    repository = LeaderboardRepository.load()
    return AgentRuntime(
        graph=build_graph(),
        context=GraphContext(
            repository=repository,
            gateway=gateway,
            tools=ModelOpsToolExecutor(repository, OfflineDocumentClient()),
            verifier=EvidenceVerifier(),
        ),
        heartbeat_seconds=0.05,
    )


def _runtime_factory(runtime: AgentRuntime, lifecycle: list[str] | None = None) -> RuntimeFactory:
    @asynccontextmanager
    async def factory(_settings: ApiSettings) -> AsyncIterator[AgentRuntime]:
        if lifecycle is not None:
            lifecycle.append("started")
        try:
            yield runtime
        finally:
            if lifecycle is not None:
                lifecycle.append("stopped")

    return factory


def _settings() -> ApiSettings:
    return ApiSettings(
        cors_origins=("https://leaderboard.example",),
        sse_heartbeat_seconds=0.05,
    )


def _event_payloads(body: str) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    for block in body.split("\n\n"):
        lines = block.splitlines()
        data_line = next((line for line in lines if line.startswith("data: ")), None)
        if data_line is None:
            continue
        parsed = json.loads(data_line.removeprefix("data: "))
        if not isinstance(parsed, dict):
            raise AssertionError("SSE data must be a JSON object")
        events.append(cast(dict[str, object], parsed))
    return events


def test_settings_parse_cors_and_numeric_environment_values() -> None:
    settings = ApiSettings.from_env(
        {
            "MODELOPS_CORS_ORIGINS": "https://one.example/,http://localhost:4173",
            "MODELOPS_MODEL_API_KEY": "test-only-key",
            "MODELOPS_MODEL_NAME": "configured-model",
            "MODELOPS_MODEL_BASE_URL": "https://gateway.example/api",
            "MODELOPS_MODEL_TIMEOUT_SECONDS": "12.5",
            "MODELOPS_MODEL_MAX_RESPONSE_BYTES": "4096",
            "MODELOPS_PROVIDER_DOCUMENT_TIMEOUT_SECONDS": "4",
            "MODELOPS_PROVIDER_DOCUMENT_MAX_BYTES": "2048",
            "MODELOPS_SSE_HEARTBEAT_SECONDS": "3.5",
            "MODELOPS_GRAPH_RECURSION_LIMIT": "48",
            "MODELOPS_TRUSTED_PROXY_CIDRS": "10.0.0.1/8,2001:db8::1/64",
        }
    )

    assert settings.cors_origins == ("https://one.example", "http://localhost:4173")
    assert settings.model_api_key is not None
    assert settings.model_api_key.get_secret_value() == "test-only-key"
    assert settings.model_name == "configured-model"
    assert settings.model_base_url == "https://gateway.example/api"
    assert settings.model_timeout_seconds == 12.5
    assert settings.model_max_response_bytes == 4096
    assert settings.provider_document_timeout_seconds == 4
    assert settings.provider_document_max_bytes == 2048
    assert settings.sse_heartbeat_seconds == 3.5
    assert settings.graph_recursion_limit == 48
    assert settings.trusted_proxy_cidrs == ("10.0.0.0/8", "2001:db8::/64")

    with pytest.raises((ValueError, ValidationError)):
        ApiSettings.from_env({"MODELOPS_GRAPH_RECURSION_LIMIT": "not-an-integer"})
    with pytest.raises(ValidationError):
        ApiSettings.from_env({"MODELOPS_CORS_ORIGINS": "https://one.example/not-an-origin"})
    with pytest.raises(ValidationError):
        ApiSettings.from_env({"MODELOPS_TRUSTED_PROXY_CIDRS": "not-a-network"})


def test_settings_default_to_deepseek_v4_flash() -> None:
    settings = ApiSettings.from_env({})

    assert settings.model_api_key is None
    assert settings.model_name == "deepseek-v4-flash"
    assert settings.model_base_url == "https://api.deepseek.com"


def test_docker_disables_uvicorn_proxy_header_rewriting() -> None:
    repository_root = Path(__file__).resolve().parents[3]
    dockerfile = repository_root / "Dockerfile"

    command = next(line for line in dockerfile.read_text(encoding="utf-8").splitlines() if line.startswith("CMD "))
    context_rules = set((repository_root / ".dockerignore").read_text(encoding="utf-8").splitlines())

    assert "--workers 1" in command
    assert "--no-proxy-headers" in command
    assert {
        "!data/aa/",
        "!data/aa/generated/",
        "!data/aa/generated/snapshot.json",
        "!data/aa/official-sources.json",
    }.issubset(context_rules)


def test_default_runtime_factory_composes_without_network_access() -> None:
    application = create_app(
        settings=ApiSettings(
            cors_origins=("https://leaderboard.example",),
            model_api_key=SecretStr("test-only-key"),
        )
    )

    with TestClient(application) as client:
        assert client.get("/healthz").json() == {"status": "ok"}


def test_root_status_page_reports_available_runtime_and_links() -> None:
    gateway = FakeModelGateway({_MESSAGE: _parsed_request()})
    application = create_app(
        settings=_settings(),
        runtime_factory=_runtime_factory(_runtime(gateway)),
    )

    with TestClient(application) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert response.headers["cache-control"] == "no-store"
    assert 'data-status="ok"' in response.text
    assert f'href="{_PUBLIC_FRONTEND_URL}"' in response.text
    assert 'href="/docs"' in response.text
    assert 'href="/healthz"' in response.text


def test_lifespan_health_and_invoke_use_injected_runtime() -> None:
    lifecycle: list[str] = []
    gateway = FakeModelGateway({_MESSAGE: _parsed_request()})
    application = create_app(
        settings=_settings(),
        runtime_factory=_runtime_factory(_runtime(gateway), lifecycle),
    )

    with TestClient(application) as client:
        assert lifecycle == ["started"]
        health = client.get("/healthz")
        assert health.status_code == 200
        assert health.json() == {"status": "ok"}

        response = client.post(
            "/api/v1/agent/query:invoke",
            json={"message": _MESSAGE, "session_id": "browser-session"},
        )
        assert response.status_code == 200
        payload = cast(dict[str, object], response.json())
        assert "run_id" in payload and "runId" not in payload
        assert "trace_id" in payload and "traceId" not in payload
        answer = cast(dict[str, object], payload["answer"])
        assert answer["status"] == "completed"
        recommendation = cast(dict[str, object], answer["recommendation"])
        assert "selected_model_id" in recommendation and "selectedModelId" not in recommendation
        assert "missing_constraints" in answer and "missingConstraints" not in answer

        openapi = cast(dict[str, object], client.get("/openapi.json").json())
        components = cast(dict[str, object], openapi["components"])
        schemas = cast(dict[str, object], components["schemas"])
        query_schema = cast(dict[str, object], schemas["AgentQueryRequest"])
        properties = cast(dict[str, object], query_schema["properties"])
        assert "session_id" in properties and "sessionId" not in properties

    assert lifecycle == ["started", "stopped"]
    assert gateway.calls[0].session_id == "browser-session"


def test_invalid_request_uses_safe_typed_error_without_echoing_input() -> None:
    gateway = FakeModelGateway({_MESSAGE: _parsed_request()})
    application = create_app(
        settings=_settings(),
        runtime_factory=_runtime_factory(_runtime(gateway)),
    )

    with TestClient(application) as client:
        response = client.post(
            "/api/v1/agent/query:invoke",
            json={"message": " secret input ", "unexpected": "do-not-echo"},
        )

    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "invalid_request",
            "message": "Request validation failed.",
            "retryable": False,
        }
    }
    assert "secret input" not in response.text
    assert "do-not-echo" not in response.text


def test_legacy_runtime_start_failure_leaves_advisor_readiness_available() -> None:
    @asynccontextmanager
    async def unavailable_factory(_settings: ApiSettings) -> AsyncIterator[AgentRuntime]:
        raise RuntimeError("configuration details must not escape")
        yield _runtime(FakeModelGateway({_MESSAGE: _parsed_request()}))

    application = create_app(settings=_settings(), runtime_factory=unavailable_factory)
    with TestClient(application) as client:
        root = client.get("/")
        health = client.get("/healthz")
        invoke = client.post("/api/v1/agent/query:invoke", json={"message": _MESSAGE})

    assert root.status_code == 200
    assert root.headers["content-type"].startswith("text/html")
    assert root.headers["cache-control"] == "no-store"
    assert 'data-status="ok"' in root.text
    assert f'href="{_PUBLIC_FRONTEND_URL}"' in root.text
    assert 'href="/docs"' in root.text
    assert 'href="/healthz"' in root.text
    assert "configuration details" not in root.text
    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    assert invoke.status_code == 503
    assert invoke.json() == {
        "error": {
            "code": "service_unavailable",
            "message": "The Agent runtime is not available.",
            "retryable": True,
        }
    }
    assert "configuration details" not in invoke.text


def test_advisor_start_failure_does_not_prevent_injected_legacy_runtime() -> None:
    lifecycle: list[str] = []

    @asynccontextmanager
    async def unavailable_advisor_factory(_settings: ApiSettings) -> AsyncIterator[AdvisorRuntime]:
        raise RuntimeError("advisor configuration details must not escape")
        yield cast(AdvisorRuntime, None)

    advisor_factory: AdvisorRuntimeFactory = unavailable_advisor_factory
    gateway = FakeModelGateway({_MESSAGE: _parsed_request()})
    application = create_app(
        settings=_settings(),
        runtime_factory=_runtime_factory(_runtime(gateway), lifecycle),
        advisor_runtime_factory=advisor_factory,
    )

    with TestClient(application) as client:
        assert lifecycle == ["started"]
        health = client.get("/healthz")
        advisor = client.post(
            "/api/v1/advisor/recommend",
            json={"requirement": "需要通用能力", "deployment_region": None, "budget": None},
        )
        invoke = client.post("/api/v1/agent/query:invoke", json={"message": _MESSAGE})

    assert lifecycle == ["started", "stopped"]
    assert health.status_code == 503
    assert health.json() == {"status": "unavailable"}
    assert advisor.status_code == 503
    assert advisor.json()["error"]["code"] == "service_unavailable"
    assert invoke.status_code == 200
    assert "advisor configuration details" not in advisor.text


def test_lifespan_startup_cancellation_closes_an_entered_advisor_runtime() -> None:
    async def scenario() -> None:
        lifecycle: list[str] = []
        legacy_starting = asyncio.Event()

        @asynccontextmanager
        async def advisor_factory(_settings: ApiSettings) -> AsyncIterator[AdvisorRuntime]:
            lifecycle.append("advisor-started")
            try:
                yield cast(AdvisorRuntime, object())
            finally:
                lifecycle.append("advisor-stopped")

        @asynccontextmanager
        async def blocking_legacy_factory(_settings: ApiSettings) -> AsyncIterator[AgentRuntime]:
            legacy_starting.set()
            await asyncio.Event().wait()
            yield _runtime(FakeModelGateway({_MESSAGE: _parsed_request()}))

        application = create_app(
            settings=_settings(),
            runtime_factory=blocking_legacy_factory,
            advisor_runtime_factory=advisor_factory,
        )
        context = application.router.lifespan_context(application)
        startup = asyncio.create_task(context.__aenter__())
        await asyncio.wait_for(legacy_starting.wait(), timeout=1)

        startup.cancel()
        with pytest.raises(asyncio.CancelledError):
            await startup

        assert lifecycle == ["advisor-started", "advisor-stopped"]
        assert application.state.agent_runtime is None
        assert application.state.advisor_runtime is None

    asyncio.run(scenario())


def test_runtime_shutdown_failure_is_contained_without_a_second_lifespan_yield(
    caplog: pytest.LogCaptureFixture,
) -> None:
    lifecycle: list[str] = []
    runtime = _runtime(FakeModelGateway({_MESSAGE: _parsed_request()}))

    @asynccontextmanager
    async def shutdown_failure(_settings: ApiSettings) -> AsyncIterator[AgentRuntime]:
        lifecycle.append("started")
        try:
            yield runtime
        finally:
            lifecycle.append("stopping")
            raise RuntimeError("shutdown-sensitive-value")

    caplog.set_level(logging.ERROR)
    application = create_app(settings=_settings(), runtime_factory=shutdown_failure)
    with TestClient(application) as client:
        assert client.get("/healthz").status_code == 200

    assert lifecycle == ["started", "stopping"]
    assert "shutdown-sensitive-value" not in caplog.text


def test_cors_allows_only_configured_frontend_origin() -> None:
    gateway = FakeModelGateway({_MESSAGE: _parsed_request()})
    application = create_app(
        settings=_settings(),
        runtime_factory=_runtime_factory(_runtime(gateway)),
    )
    headers = {
        "Origin": "https://leaderboard.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }

    with TestClient(application) as client:
        allowed = client.options("/api/v1/agent/query", headers=headers)
        denied = client.options(
            "/api/v1/agent/query",
            headers={**headers, "Origin": "https://untrusted.example"},
        )
        exposed = client.get("/healthz", headers={"Origin": "https://leaderboard.example"})

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://leaderboard.example"
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers
    assert exposed.headers["access-control-expose-headers"] == "Retry-After"


def test_sse_events_have_ordered_sequence_safe_shape_and_one_terminal_event() -> None:
    gateway = FakeModelGateway({_MESSAGE: _parsed_request()})
    application = create_app(
        settings=_settings(),
        runtime_factory=_runtime_factory(_runtime(gateway)),
    )

    with TestClient(application) as client:
        response = client.post(
            "/api/v1/agent/query",
            headers={"Accept": "text/event-stream"},
            json={"message": _MESSAGE, "session_id": "browser-session"},
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = _event_payloads(response.text)
    names = [event["event"] for event in events]
    assert names[0] == "run.started"
    assert names[-1] == "run.completed"
    assert "node.started" in names
    assert "tool.completed" in names
    assert "evidence.found" in names
    assert "answer.delta" in names
    assert names.count("run.completed") + names.count("run.failed") == 1
    assert set(names) <= {
        "run.started",
        "node.started",
        "tool.completed",
        "evidence.found",
        "clarification.required",
        "answer.delta",
        "proposal.ready",
        "run.completed",
        "run.failed",
    }

    sequences = [cast(int, event["sequence"]) for event in events]
    assert sequences == list(range(1, len(events) + 1))
    assert len(set(sequences)) == len(sequences)
    run_ids = {cast(str, event["run_id"]) for event in events}
    trace_ids = {cast(str, event["trace_id"]) for event in events}
    assert len(run_ids) == len(trace_ids) == 1
    assert all("runId" not in event and "traceId" not in event for event in events)
    for event in events:
        assert set(event) == {"run_id", "trace_id", "sequence", "event", "timestamp", "data"}

    terminal = events[-1]
    terminal_data = cast(dict[str, object], terminal["data"])
    terminal_answer = cast(dict[str, object], terminal_data["answer"])
    assert terminal_answer["status"] == "completed"


def test_sse_emits_clarification_required_with_missing_fields() -> None:
    gateway = FakeModelGateway({_MESSAGE: _clarification_request()})
    application = create_app(
        settings=_settings(),
        runtime_factory=_runtime_factory(_runtime(gateway)),
    )

    with TestClient(application) as client:
        response = client.post("/api/v1/agent/query", json={"message": _MESSAGE})

    events = _event_payloads(response.text)
    clarification = next(event for event in events if event["event"] == "clarification.required")
    data = cast(dict[str, object], clarification["data"])
    assert data["fields"] == ["task"]
    assert events[-1]["event"] == "run.completed"


def test_sse_emits_review_only_proposal_ready() -> None:
    gateway = FakeModelGateway({_MESSAGE: _update_request()})
    application = create_app(
        settings=_settings(),
        runtime_factory=_runtime_factory(_runtime(gateway)),
    )

    with TestClient(application) as client:
        response = client.post("/api/v1/agent/query", json={"message": _MESSAGE})

    events = _event_payloads(response.text)
    proposal_event = next(event for event in events if event["event"] == "proposal.ready")
    data = cast(dict[str, object], proposal_event["data"])
    proposal = cast(dict[str, object], data["proposal"])
    assert proposal["status"] == "awaiting_human_review"
    assert events[-1]["event"] == "run.completed"


def test_failed_answer_maps_to_one_run_failed_terminal_event() -> None:
    gateway = FakeModelGateway({_MESSAGE: ModelGatewayError("synthetic safe failure")})
    application = create_app(
        settings=_settings(),
        runtime_factory=_runtime_factory(_runtime(gateway)),
    )

    with TestClient(application) as client:
        response = client.post("/api/v1/agent/query", json={"message": _MESSAGE})

    events = _event_payloads(response.text)
    terminal_names = [
        event["event"]
        for event in events
        if event["event"] in {"run.completed", "run.failed"}
    ]
    assert terminal_names == ["run.failed"]


def test_gateway_exception_details_are_not_logged_or_returned(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO)
    application = create_app(
        settings=_settings(),
        runtime_factory=_runtime_factory(_runtime(ExplodingGateway())),
    )

    with TestClient(application) as client:
        response = client.post("/api/v1/agent/query:invoke", json={"message": _MESSAGE})

    assert response.status_code == 200
    assert cast(dict[str, object], response.json())["answer"]
    assert "sk-sensitive-value" not in response.text
    assert "sk-sensitive-value" not in caplog.text


def test_heartbeat_helper_emits_comment_without_waiting_for_wall_clock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    async def fake_next_queue_item(
        queue: asyncio.Queue[bytes | None],
        *,
        interval_seconds: float,
    ) -> bytes | None:
        nonlocal calls
        calls += 1
        if calls == 1:
            assert interval_seconds == 60
            raise TimeoutError
        return await queue.get()

    async def source() -> AsyncIterator[bytes]:
        yield b"event-data"

    async def collect() -> list[bytes]:
        return [
            item
            async for item in sse_api.with_heartbeat(
                source(),
                interval_seconds=60,
            )
        ]

    monkeypatch.setattr(sse_api, "_next_queue_item", fake_next_queue_item)
    chunks = asyncio.run(collect())

    assert chunks == [b": heartbeat\n\n", b"event-data"]


def test_client_disconnect_cancels_an_unfinished_graph_run() -> None:
    async def scenario() -> None:
        gateway = BlockingGateway()
        application = create_app(
            settings=_settings(),
            runtime_factory=_runtime_factory(_runtime(gateway)),
        )
        body = json.dumps({"message": _MESSAGE}).encode()
        request_delivered = False
        sent: list[Message] = []

        async def receive() -> Message:
            nonlocal request_delivered
            if not request_delivered:
                request_delivered = True
                return {"type": "http.request", "body": body, "more_body": False}
            await gateway.started.wait()
            return {"type": "http.disconnect"}

        async def send(message: Message) -> None:
            sent.append(message)

        scope = cast(
            Scope,
            {
                "type": "http",
                "asgi": {"version": "3.0", "spec_version": "2.4"},
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/api/v1/agent/query",
                "raw_path": b"/api/v1/agent/query",
                "query_string": b"",
                "root_path": "",
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                ],
                "client": ("127.0.0.1", 50000),
                "server": ("testserver", 80),
                "state": {},
            },
        )

        async with application.router.lifespan_context(application):
            await asyncio.wait_for(application(scope, receive, send), timeout=1)
        await asyncio.wait_for(gateway.cancelled.wait(), timeout=1)
        assert any(message["type"] == "http.response.start" for message in sent)

    asyncio.run(scenario())
