"""Offline integration tests for the public one-shot advisor boundary."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from decimal import Decimal
from ipaddress import ip_network
from typing import cast

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from pydantic import SecretStr
from starlette.types import Message, Scope

from app.api.advisor import AdvisorRuntime, _client_ip, _decimal_text
from app.config import ApiSettings
from app.domain.advisor import (
    AbilityPurpose,
    CandidateKnowledgeExplanation,
    HardRequirement,
    ParsedAdvisorNeed,
    PromotedObjective,
    RankedAdvisorCandidate,
)
from app.main import AdvisorRuntimeFactory, create_app, default_advisor_runtime_factory
from app.repositories.aa_snapshot import AaSnapshotRepository
from app.services.advisor_gateway import (
    AdvisorGateway,
    AdvisorGatewayError,
    AdvisorGatewayFailureKind,
    FakeAdvisorGateway,
)
from app.services.advisor_rate_limit import (
    ConcurrencyLease,
    NonBlockingConcurrencyGate,
    SlidingWindowRateLimiter,
)
from app.services.advisor_selector import select_verification_pool
from app.services.deepseek_offline_advisor_gateway import DeepSeekOfflineAdvisorGateway

_REQUIREMENT = "需要综合能力最强的模型"
_REQUEST = {
    "requirement": _REQUIREMENT,
    "deployment_region": None,
    "budget": None,
}


def _need(
    *,
    purpose: AbilityPurpose = AbilityPurpose.INTELLIGENCE,
    objective: PromotedObjective | None = PromotedObjective.STRONGEST,
    hard_requirements: tuple[HardRequirement, ...] = (),
) -> ParsedAdvisorNeed:
    return ParsedAdvisorNeed(
        ability_purposes=(purpose,),
        promoted_objective=objective,
        hard_requirements=hard_requirements,
    )


def _runtime(
    gateway: AdvisorGateway,
    *,
    limiter: SlidingWindowRateLimiter | None = None,
    gate: NonBlockingConcurrencyGate | None = None,
    snapshot_repository: AaSnapshotRepository | None = None,
) -> AdvisorRuntime:
    return AdvisorRuntime(
        snapshot_repository=snapshot_repository or AaSnapshotRepository.load(),
        gateway=gateway,
        rate_limiter=limiter or SlidingWindowRateLimiter(limit=5, window_seconds=600),
        provider_gate=gate or NonBlockingConcurrencyGate(capacity=2),
    )


def _factory(runtime: AdvisorRuntime) -> AdvisorRuntimeFactory:
    @asynccontextmanager
    async def factory(_settings: ApiSettings) -> AsyncIterator[AdvisorRuntime]:
        yield runtime

    return factory


def _application(runtime: AdvisorRuntime) -> FastAPI:
    return create_app(
        settings=ApiSettings(cors_origins=("https://leaderboard.example",)),
        advisor_runtime_factory=_factory(runtime),
    )


def _knowledge_notes(count: int = 3) -> tuple[CandidateKnowledgeExplanation, ...]:
    return tuple(
        CandidateKnowledgeExplanation(
            candidate_slot=slot,
            knowledge_note=f"候选 {slot + 1} 的通用能力说明可能随产品更新而变化。",
        )
        for slot in range(count)
    )


class BlockingAdvisorGateway:
    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()

    async def parse_need(self, _requirement: str) -> ParsedAdvisorNeed:
        return _need()

    async def explain_candidates(
        self,
        candidates: tuple[RankedAdvisorCandidate, ...],
        *,
        need: ParsedAdvisorNeed,
    ) -> tuple[CandidateKnowledgeExplanation, ...]:
        del candidates, need
        self.started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancelled.set()
            raise
        raise AssertionError("unreachable")


def test_recommend_returns_strict_snake_case_aa_fallback() -> None:
    gateway = FakeAdvisorGateway(parsed_needs={_REQUIREMENT: _need()})
    application = _application(_runtime(gateway))

    with TestClient(application) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)
        openapi = client.get("/openapi.json").json()

    assert response.status_code == 200
    payload = cast(dict[str, object], response.json())
    assert payload["outcome"] == "recommendation"
    assert payload["verification_status"] == "aa_only"
    assert payload["citations"] == []
    assert payload["rejections"] == []
    assert "aa_source" in payload and "aaSource" not in payload
    assert payload["parsed_need"] == {
        "ability_purposes": ["intelligence"],
        "promoted_objective": "strongest",
        "hard_requirements": [],
    }
    candidates = [payload["recommendation"], *cast(list[object], payload["alternatives"])]
    assert len(candidates) == 3
    assert all(cast(dict[str, object], candidate)["checks"] == [] for candidate in candidates)
    assert cast(dict[str, object], payload["recommendation"])["reason"] == (
        "依据 AA 的综合智能指标并按最强优先级确定性排序。"
    )
    response_schema = openapi["components"]["schemas"]["AdvisorRecommendationResponse"]
    assert "verification_status" in response_schema["properties"]
    assert "verificationStatus" not in response_schema["properties"]


def test_default_runtime_without_key_is_ready_and_returns_aa_only() -> None:
    application = create_app(
        settings=ApiSettings(cors_origins=("https://leaderboard.example",)),
    )

    with TestClient(application) as client:
        health = client.get("/healthz")
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    assert health.status_code == 200
    assert health.json() == {"status": "ok"}
    assert response.status_code == 200
    assert response.json()["verification_status"] == "aa_only"
    assert response.json()["citations"] == []


def test_default_runtime_with_key_uses_the_structurally_offline_gateway() -> None:
    async def scenario() -> None:
        settings = ApiSettings(model_api_key=SecretStr("test-provider-key"))
        async with default_advisor_runtime_factory(settings) as runtime:
            assert isinstance(runtime.gateway, DeepSeekOfflineAdvisorGateway)
            assert not hasattr(runtime.gateway, "verify_candidates")
            assert not hasattr(runtime.gateway, "search")

    asyncio.run(scenario())


def test_request_is_strict_and_accepts_bounded_leading_zero_decimal() -> None:
    gateway = FakeAdvisorGateway(parsed_needs={_REQUIREMENT: _need()})
    application = _application(_runtime(gateway))
    budget = {
        "currency": "USD",
        "monthly_budget": "00.50",
        "average_input_tokens": 0,
        "average_output_tokens": 0,
        "monthly_request_count": 1,
    }

    with TestClient(application) as client:
        accepted = client.post(
            "/api/v1/advisor/recommend",
            json={**_REQUEST, "budget": budget},
        )
        unknown = client.post(
            "/api/v1/advisor/recommend",
            json={**_REQUEST, "unexpected": "not allowed"},
        )
        unsafe_integer = client.post(
            "/api/v1/advisor/recommend",
            json={
                **_REQUEST,
                "budget": {**budget, "average_input_tokens": 9_007_199_254_740_992},
            },
        )
        wrong_media_type = client.post(
            "/api/v1/advisor/recommend",
            content=json.dumps(_REQUEST),
            headers={"Content-Type": "text/plain"},
        )
        missing_media_type = client.post(
            "/api/v1/advisor/recommend",
            content=json.dumps(_REQUEST),
        )

    assert accepted.status_code == 200
    for response in (unknown, unsafe_integer, wrong_media_type, missing_media_type):
        assert response.status_code == 422
        assert response.json() == {
            "error": {
                "code": "invalid_request",
                "message": "Request validation failed.",
                "retryable": False,
            }
        }


def test_extremely_small_exact_cost_returns_a_bounded_decimal_instead_of_500() -> None:
    repository = AaSnapshotRepository.load()
    tiny_models = tuple(
        model.model_copy(
            update={
                "input_price_per_million": 5e-324,
                "output_price_per_million": 0.0,
            }
        )
        for model in repository.models
    )
    tiny_repository = AaSnapshotRepository(
        repository.snapshot.model_copy(update={"models": tiny_models})
    )
    gateway = FakeAdvisorGateway(parsed_needs={_REQUIREMENT: _need()})
    runtime = _runtime(gateway, snapshot_repository=tiny_repository)
    minimum_positive_wire_decimal = "0." + "0" * 125 + "1"
    exact_cost = format(Decimal("5e-330"), "f")

    with TestClient(_application(runtime)) as client:
        response = client.post(
            "/api/v1/advisor/recommend",
            json={
                **_REQUEST,
                "budget": {
                    "currency": "USD",
                    "monthly_budget": minimum_positive_wire_decimal,
                    "average_input_tokens": 1,
                    "average_output_tokens": 0,
                    "monthly_request_count": 1,
                },
            },
        )

    assert response.status_code == 200
    assert response.json()["recommendation"]["estimated_monthly_cost_usd"] == exact_cost
    assert len(response.json()["recommendation"]["estimated_monthly_cost_usd"]) == 332


def test_estimated_cost_serialization_is_exact_and_contract_safe() -> None:
    largest_fixed_value = Decimal("1e-510")

    assert _decimal_text(Decimal("-0e-999")) == "0"
    assert _decimal_text(largest_fixed_value) == format(largest_fixed_value, "f")
    assert len(_decimal_text(largest_fixed_value) or "") == 512
    assert _decimal_text(Decimal("1e-511")) is None


def test_sixth_request_is_rate_limited_with_exposed_retry_after() -> None:
    gateway = FakeAdvisorGateway(parsed_needs={_REQUIREMENT: _need()})
    application = _application(_runtime(gateway))

    with TestClient(application) as client:
        responses = [
            client.post(
                "/api/v1/advisor/recommend",
                json=_REQUEST,
                headers={"Origin": "https://leaderboard.example"},
            )
            for _index in range(6)
        ]

    assert all(response.status_code == 200 for response in responses[:5])
    limited = responses[-1]
    assert limited.status_code == 429
    assert limited.headers["retry-after"] == "600"
    assert limited.headers["access-control-expose-headers"] == "Retry-After"
    assert limited.json() == {
        "error": {
            "code": "rate_limited",
            "message": "Too many advisor requests. Try again later.",
            "retryable": True,
        }
    }


def test_full_capacity_keeps_parsed_need_and_skips_knowledge_explanation() -> None:
    async def fill_gate(gate: NonBlockingConcurrencyGate) -> tuple[ConcurrencyLease, ConcurrencyLease]:
        first = await gate.try_acquire()
        second = await gate.try_acquire()
        assert first is not None and second is not None
        return first, second

    gateway = FakeAdvisorGateway(
        parsed_needs={
            _REQUIREMENT: _need(
                purpose=AbilityPurpose.CODING,
                objective=PromotedObjective.FASTEST,
            )
        },
        explanations=_knowledge_notes(),
    )
    gate = NonBlockingConcurrencyGate(capacity=2)
    leases = asyncio.run(fill_gate(gate))
    application = _application(_runtime(gateway, gate=gate))
    try:
        with TestClient(application) as client:
            response = client.post("/api/v1/advisor/recommend", json=_REQUEST)
    finally:
        asyncio.run(leases[0].release())
        asyncio.run(leases[1].release())

    assert response.status_code == 200
    assert response.json()["verification_status"] == "aa_only"
    assert response.json()["parsed_need"] == {
        "ability_purposes": ["coding"],
        "promoted_objective": "fastest",
        "hard_requirements": [],
    }
    assert gateway.parse_calls == [_REQUIREMENT]
    assert gateway.explanation_calls == []


def test_parse_and_explanation_failures_return_deterministic_aa_only_results() -> None:
    parse_failure = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: AdvisorGatewayError("sensitive parse failure")},
        explanations=_knowledge_notes(),
    )
    explanation_failure = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: _need()},
        explanations=AdvisorGatewayError("sensitive explanation failure"),
    )

    for gateway in (parse_failure, explanation_failure):
        with TestClient(_application(_runtime(gateway))) as client:
            response = client.post("/api/v1/advisor/recommend", json=_REQUEST)
        assert response.status_code == 200
        assert response.json()["verification_status"] == "aa_only"
        assert response.json()["citations"] == []
        assert "sensitive" not in response.text
    assert parse_failure.explanation_calls == []
    assert len(explanation_failure.explanation_calls) == 1


@pytest.mark.parametrize(
    "failure_kind",
    [
        AdvisorGatewayFailureKind.TIMEOUT,
        AdvisorGatewayFailureKind.PROVIDER_HTTP,
        AdvisorGatewayFailureKind.PROVIDER_WIRE,
    ],
)
def test_explanation_failure_logs_safe_stage_and_failure_kind(
    failure_kind: AdvisorGatewayFailureKind,
    caplog: pytest.LogCaptureFixture,
) -> None:
    private_marker = "sensitive explanation failure"
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: _need()},
        explanations=AdvisorGatewayError(private_marker, failure_kind=failure_kind),
    )
    caplog.set_level(logging.INFO, logger="app.api.advisor")

    with TestClient(_application(_runtime(gateway))) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    assert response.status_code == 200
    assert response.json()["verification_status"] == "aa_only"
    assert response.json()["citations"] == []
    assert "advisor_explanation_started" in caplog.text
    assert "advisor_explanation_fallback" in caplog.text
    assert "stage=explanation" in caplog.text
    assert f"failure_kind={failure_kind.value}" in caplog.text
    assert "duration_ms=" in caplog.text
    assert private_marker not in caplog.text


def test_knowledge_notes_only_annotate_the_frozen_top_three() -> None:
    need = _need(
        purpose=AbilityPurpose.AGENTIC,
        objective=PromotedObjective.CHEAPEST,
        hard_requirements=(HardRequirement.API_ACCESS,),
    )
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: need},
        explanations=_knowledge_notes(),
    )
    repository = AaSnapshotRepository.load()
    expected = select_verification_pool(repository.models, need)[:3]

    with TestClient(_application(_runtime(gateway))) as client:
        response = client.post(
            "/api/v1/advisor/recommend",
            json={**_REQUEST, "deployment_region": "Singapore"},
        )

    payload = response.json()
    candidates = [payload["recommendation"], *payload["alternatives"]]
    assert [item["source_id"] for item in candidates] == [
        item.model.source_id for item in expected
    ]
    assert payload["verification_status"] == "aa_only"
    assert payload["citations"] == []
    assert payload["rejections"] == []
    assert all(item["checks"] == [] for item in candidates)
    assert all(
        "模型知识参考（未联网核验）" in item["reason"]
        for item in candidates
    )
    assert len(gateway.explanation_calls) == 1
    assert gateway.explanation_calls[0].candidates == expected
    assert gateway.explanation_calls[0].need == need


def test_mismatched_knowledge_slots_fall_back_to_fixed_aa_reasons() -> None:
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: _need()},
        explanations=_knowledge_notes(2),
    )

    with TestClient(_application(_runtime(gateway))) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    candidates = [response.json()["recommendation"], *response.json()["alternatives"]]
    assert all("模型知识参考" not in item["reason"] for item in candidates)
    assert response.json()["verification_status"] == "aa_only"
    assert response.json()["citations"] == []
    assert response.json()["rejections"] == []


def test_no_eligible_pool_skips_knowledge_explanation() -> None:
    repository = AaSnapshotRepository.load()
    empty_models = tuple(
        model.model_copy(update={"intelligence": None})
        for model in repository.models
    )
    empty_repository = AaSnapshotRepository(
        repository.snapshot.model_copy(update={"models": empty_models})
    )
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: _need()},
        explanations=_knowledge_notes(),
    )

    with TestClient(
        _application(_runtime(gateway, snapshot_repository=empty_repository))
    ) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    assert response.status_code == 200
    assert response.json()["outcome"] == "no_eligible_candidate"
    assert response.json()["verification_status"] == "aa_only"
    assert response.json()["rejections"] == []
    assert gateway.explanation_calls == []


def test_forwarded_ip_is_used_only_for_a_reviewed_proxy_network() -> None:
    untrusted = Request(
        {
            "type": "http",
            "client": ("127.0.0.1", 50000),
            "headers": [(b"x-forwarded-for", b"203.0.113.7")],
        }
    )
    trusted = Request(
        {
            "type": "http",
            "client": ("10.1.2.3", 50000),
            "headers": [(b"x-forwarded-for", b"203.0.113.7, 10.2.3.4")],
        }
    )
    networks = (ip_network("10.0.0.0/8"),)

    assert _client_ip(untrusted, networks) == "127.0.0.1"
    assert _client_ip(trusted, networks) == "203.0.113.7"


def test_client_disconnect_cancels_knowledge_explanation_and_releases_capacity() -> None:
    async def scenario() -> None:
        gateway = BlockingAdvisorGateway()
        gate = NonBlockingConcurrencyGate(capacity=2)
        application = _application(_runtime(gateway, gate=gate))
        body = json.dumps(_REQUEST, ensure_ascii=False).encode()
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
                "path": "/api/v1/advisor/recommend",
                "raw_path": b"/api/v1/advisor/recommend",
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
            with suppress(asyncio.CancelledError):
                await asyncio.wait_for(application(scope, receive, send), timeout=1)
        await asyncio.wait_for(gateway.cancelled.wait(), timeout=1)
        assert gate.active_count == 0

    asyncio.run(scenario())


def test_outer_asgi_cancellation_cancels_operation_and_releases_capacity() -> None:
    async def scenario() -> None:
        gateway = BlockingAdvisorGateway()
        gate = NonBlockingConcurrencyGate(capacity=2)
        application = _application(_runtime(gateway, gate=gate))
        body = json.dumps(_REQUEST, ensure_ascii=False).encode()
        request_delivered = False

        async def receive() -> Message:
            nonlocal request_delivered
            if not request_delivered:
                request_delivered = True
                return {"type": "http.request", "body": body, "more_body": False}
            await asyncio.Event().wait()
            raise AssertionError("unreachable")

        async def send(_message: Message) -> None:
            return None

        scope = cast(
            Scope,
            {
                "type": "http",
                "asgi": {"version": "3.0", "spec_version": "2.4"},
                "http_version": "1.1",
                "method": "POST",
                "scheme": "http",
                "path": "/api/v1/advisor/recommend",
                "raw_path": b"/api/v1/advisor/recommend",
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
            request_task = asyncio.create_task(application(scope, receive, send))
            await asyncio.wait_for(gateway.started.wait(), timeout=1)
            assert gate.active_count == 1
            request_task.cancel()
            await asyncio.gather(request_task, return_exceptions=True)
            await asyncio.wait_for(gateway.cancelled.wait(), timeout=1)
            assert gate.active_count == 0

    asyncio.run(scenario())
