"""Offline integration tests for the public one-shot advisor boundary."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from decimal import Decimal
from ipaddress import ip_network
from typing import cast

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from starlette.types import Message, Scope

from app.api.advisor import AdvisorRuntime, _client_ip, _decimal_text
from app.config import ApiSettings
from app.domain.advisor import (
    AbilityPurpose,
    CandidateEvidenceCheck,
    CandidateVerification,
    EvidenceVerdict,
    HardRequirement,
    OfficialCitation,
    OfficialSourceKind,
    ParsedAdvisorNeed,
    PromotedObjective,
    RankedAdvisorCandidate,
    VerificationCheckKind,
)
from app.main import AdvisorRuntimeFactory, create_app
from app.repositories.aa_snapshot import AaSnapshotRepository
from app.repositories.official_sources import OfficialSourcesRepository
from app.services.advisor_gateway import AdvisorGateway, AdvisorGatewayError, FakeAdvisorGateway
from app.services.advisor_rate_limit import (
    ConcurrencyLease,
    NonBlockingConcurrencyGate,
    SlidingWindowRateLimiter,
)
from app.services.advisor_selector import select_verification_pool

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
        official_sources=OfficialSourcesRepository.load(),
        gateway=gateway,
        rate_limiter=limiter or SlidingWindowRateLimiter(limit=5, window_seconds=600),
        web_gate=gate or NonBlockingConcurrencyGate(capacity=2),
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


def _citation(
    slot: int,
    creator_id: str | None,
    *,
    citation_id: str | None = None,
    suffix: str = "model",
    explicit_port: bool = False,
) -> OfficialCitation:
    official_sources = OfficialSourcesRepository.load()
    creator_sources = () if creator_id is None else official_sources.sources_for(creator_id)
    if not creator_sources:
        aa_rule = official_sources.registry.artificial_analysis[0]
        host = aa_rule.host
        path_prefix = aa_rule.path_prefix
        source_kind = OfficialSourceKind.ARTIFICIAL_ANALYSIS
        bound_creator_id = None
    else:
        creator_rule = creator_sources[0]
        host = creator_rule.host
        path_prefix = creator_rule.path_prefix
        source_kind = creator_rule.kind
        bound_creator_id = creator_id
    authority = f"{host}:443" if explicit_port else host
    prefix = path_prefix.rstrip("/")
    return OfficialCitation(
        citation_id=citation_id or f"citation-{slot}",
        title="Official model documentation",
        url=f"https://{authority}{prefix}/advisor-test/{slot}/{suffix}",
        source_kind=source_kind,
        creator_id=bound_creator_id,
    )


class BlockingAdvisorGateway:
    def __init__(self) -> None:
        self.started = asyncio.Event()
        self.cancelled = asyncio.Event()

    async def parse_need(self, _requirement: str) -> ParsedAdvisorNeed:
        return _need()

    async def verify_candidates(
        self,
        *args: object,
        **kwargs: object,
    ) -> tuple[CandidateVerification, ...]:
        del args, kwargs
        self.started.set()
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            self.cancelled.set()
            raise
        raise AssertionError("unreachable")


class InvalidCitationGateway:
    def __init__(self, url: str) -> None:
        self._url = url

    async def parse_need(self, _requirement: str) -> ParsedAdvisorNeed:
        return _need()

    async def verify_candidates(
        self,
        *args: object,
        **kwargs: object,
    ) -> tuple[CandidateVerification, ...]:
        del args, kwargs
        OfficialCitation(
            citation_id="oversized",
            title="Rejected oversized URL",
            url=self._url,
            source_kind=OfficialSourceKind.OFFICIAL_SITE,
        )
        return ()


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
    assert "aa_source" in payload and "aaSource" not in payload
    parsed_need = cast(dict[str, object], payload["parsed_need"])
    assert parsed_need == {
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
    assert response.json()["recommendation"]["estimated_monthly_cost_usd"] == (
        exact_cost
    )
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


def test_full_capacity_keeps_parsed_need_and_skips_web_search() -> None:
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
        }
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
    assert gateway.verification_calls == []


def test_parse_and_search_failures_return_deterministic_aa_only_results() -> None:
    parse_failure = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: AdvisorGatewayError("sensitive parse failure")}
    )
    search_failure = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: _need()},
        verification=AdvisorGatewayError("sensitive search failure"),
    )

    for gateway in (parse_failure, search_failure):
        with TestClient(_application(_runtime(gateway))) as client:
            response = client.post("/api/v1/advisor/recommend", json=_REQUEST)
        assert response.status_code == 200
        assert response.json()["verification_status"] == "aa_only"
        assert response.json()["citations"] == []
        assert "sensitive" not in response.text


@pytest.mark.parametrize(
    "url",
    [
        "https://openai.com/" + "x" * 2_048,
        "http://openai.com/not-https",
    ],
)
def test_invalid_gateway_citation_is_closed_into_aa_only_fallback(url: str) -> None:
    with TestClient(_application(_runtime(InvalidCitationGateway(url)))) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    assert response.status_code == 200
    assert response.json()["verification_status"] == "aa_only"
    assert response.json()["citations"] == []


def _registered_candidate_in_visible_pool(
    need: ParsedAdvisorNeed,
) -> tuple[RankedAdvisorCandidate, str]:
    snapshot = AaSnapshotRepository.load()
    official_sources = OfficialSourcesRepository.load()
    candidate = next(
        item
        for item in select_verification_pool(snapshot.models, need)[:3]
        if item.model.creator_id is not None
        and official_sources.sources_for(item.model.creator_id)
    )
    assert candidate.model.creator_id is not None
    return candidate, candidate.model.creator_id


def test_cross_creator_gateway_citation_falls_back_to_aa_only() -> None:
    need = _need()
    candidate, creator_id = _registered_candidate_in_visible_pool(need)
    official_sources = OfficialSourcesRepository.load()
    wrong_creator_id = next(
        registered_id
        for registered_id in official_sources.creator_ids
        if registered_id != creator_id
    )
    citation = _citation(candidate.candidate_slot, wrong_creator_id)
    verification = CandidateVerification(
        candidate_slot=candidate.candidate_slot,
        checks=(
            CandidateEvidenceCheck(
                check=VerificationCheckKind.MODEL_IDENTITY,
                verdict=EvidenceVerdict.SATISFIED,
                summary="A different creator's page was incorrectly attached to this model.",
                citation_ids=(citation.citation_id,),
            ),
        ),
        citations=(citation,),
    )
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: need},
        verification=(verification,),
    )

    with TestClient(_application(_runtime(gateway))) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    assert response.status_code == 200
    assert response.json()["citations"] == []
    assert all(
        item["verification_status"] == "aa_only"
        for item in [response.json()["recommendation"], *response.json()["alternatives"]]
    )


@pytest.mark.parametrize("invalid_binding", ["wrong_source_kind", "unreviewed_url"])
def test_wrong_gateway_source_binding_falls_back_to_aa_only(invalid_binding: str) -> None:
    need = _need()
    candidate, creator_id = _registered_candidate_in_visible_pool(need)
    valid = _citation(candidate.candidate_slot, creator_id)
    if invalid_binding == "wrong_source_kind":
        wrong_kind = (
            OfficialSourceKind.OFFICIAL_GITHUB
            if valid.source_kind != OfficialSourceKind.OFFICIAL_GITHUB
            else OfficialSourceKind.OFFICIAL_SITE
        )
        citation = OfficialCitation(
            citation_id=valid.citation_id,
            title=valid.title,
            url=valid.url,
            source_kind=wrong_kind,
            creator_id=valid.creator_id,
        )
    else:
        citation = OfficialCitation(
            citation_id=valid.citation_id,
            title=valid.title,
            url="https://unreviewed.example/model",
            source_kind=valid.source_kind,
            creator_id=valid.creator_id,
        )
    verification = CandidateVerification(
        candidate_slot=candidate.candidate_slot,
        checks=(
            CandidateEvidenceCheck(
                check=VerificationCheckKind.MODEL_IDENTITY,
                verdict=EvidenceVerdict.SATISFIED,
                summary="The source metadata does not match the reviewed registry binding.",
                citation_ids=(citation.citation_id,),
            ),
        ),
        citations=(citation,),
    )
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: need},
        verification=(verification,),
    )

    with TestClient(_application(_runtime(gateway))) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    assert response.status_code == 200
    assert response.json()["citations"] == []


def test_candidate_binding_preserves_separate_identity_and_constraint_documents() -> None:
    need = _need(hard_requirements=(HardRequirement.API_ACCESS,))
    candidate, creator_id = _registered_candidate_in_visible_pool(need)
    identity = _citation(
        candidate.candidate_slot,
        creator_id,
        citation_id="identity-document",
        suffix="identity",
    )
    constraint = _citation(
        candidate.candidate_slot,
        creator_id,
        citation_id="constraint-document",
        suffix="api-access",
    )
    verification = CandidateVerification(
        candidate_slot=candidate.candidate_slot,
        checks=(
            CandidateEvidenceCheck(
                check=VerificationCheckKind.MODEL_IDENTITY,
                verdict=EvidenceVerdict.SATISFIED,
                summary="The official identity document identifies the model.",
                citation_ids=(identity.citation_id,),
            ),
            CandidateEvidenceCheck(
                check=VerificationCheckKind.API_ACCESS,
                verdict=EvidenceVerdict.SATISFIED,
                summary="A separate official document confirms API access.",
                citation_ids=(constraint.citation_id,),
            ),
        ),
        citations=(identity, constraint),
    )
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: need},
        verification=(verification,),
    )

    with TestClient(_application(_runtime(gateway))) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    assert response.status_code == 200
    candidates = [response.json()["recommendation"], *response.json()["alternatives"]]
    selected = next(item for item in candidates if item["source_id"] == candidate.model.source_id)
    assert selected["verification_status"] == "verified"
    assert {item["citation_id"] for item in response.json()["citations"]} == {
        identity.citation_id,
        constraint.citation_id,
    }


def test_cross_candidate_citation_id_collision_falls_back_to_aa_only() -> None:
    snapshot = AaSnapshotRepository.load()
    pool = select_verification_pool(snapshot.models, _need())
    verifications = tuple(
        CandidateVerification(
            candidate_slot=candidate.candidate_slot,
            checks=(
                CandidateEvidenceCheck(
                    check=VerificationCheckKind.MODEL_IDENTITY,
                    verdict=EvidenceVerdict.SATISFIED,
                    summary="The official page identifies this model.",
                    citation_ids=("colliding-id",),
                ),
            ),
            citations=(
                _citation(
                    candidate.candidate_slot,
                    candidate.model.creator_id,
                    citation_id="colliding-id",
                ),
            ),
        )
        for candidate in pool[:2]
    )
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: _need()},
        verification=verifications,
    )

    with TestClient(_application(_runtime(gateway))) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    assert response.status_code == 200
    assert response.json()["verification_status"] == "aa_only"
    assert response.json()["citations"] == []


def test_contradicted_explicit_requirement_removes_only_that_candidate() -> None:
    need = _need(hard_requirements=(HardRequirement.OPEN_WEIGHTS,))
    snapshot = AaSnapshotRepository.load()
    first_creator = snapshot.models[0].creator_id
    citation = _citation(0, first_creator)
    verification = CandidateVerification(
        candidate_slot=0,
        checks=(
            CandidateEvidenceCheck(
                check=VerificationCheckKind.MODEL_IDENTITY,
                verdict=EvidenceVerdict.SATISFIED,
                summary="Official documentation identifies this model.",
                citation_ids=(citation.citation_id,),
            ),
            CandidateEvidenceCheck(
                check=VerificationCheckKind.OPEN_WEIGHTS,
                verdict=EvidenceVerdict.CONTRADICTED,
                summary="Official documentation contradicts this requirement.",
                citation_ids=(citation.citation_id,),
            ),
        ),
        citations=(citation,),
    )
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: need},
        verification=(verification,),
    )
    runtime = _runtime(gateway)

    with TestClient(_application(runtime)) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    assert response.status_code == 200
    selected_ids = [
        response.json()["recommendation"]["source_id"],
        *(item["source_id"] for item in response.json()["alternatives"]),
    ]
    rejected_id = gateway.verification_calls[0].candidates[0].model.source_id
    assert rejected_id not in selected_ids
    assert response.json()["citations"] == []


def test_contradiction_cannot_remove_candidate_until_identity_is_confirmed() -> None:
    need = _need(hard_requirements=(HardRequirement.OPEN_WEIGHTS,))
    citation = _citation(0, None)
    verification = CandidateVerification(
        candidate_slot=0,
        checks=(
            CandidateEvidenceCheck(
                check=VerificationCheckKind.MODEL_IDENTITY,
                verdict=EvidenceVerdict.UNVERIFIED,
            ),
            CandidateEvidenceCheck(
                check=VerificationCheckKind.OPEN_WEIGHTS,
                verdict=EvidenceVerdict.CONTRADICTED,
                summary="A same-creator page contradicts this requirement.",
                citation_ids=(citation.citation_id,),
            ),
        ),
        citations=(citation,),
    )
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: need},
        verification=(verification,),
    )

    with TestClient(_application(_runtime(gateway))) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    assert response.status_code == 200
    assert response.json()["recommendation"]["source_id"] == (
        gateway.verification_calls[0].candidates[0].model.source_id
    )
    assert all(
        "contradicts" not in check["summary"]
        for candidate in [response.json()["recommendation"], *response.json()["alternatives"]]
        for check in candidate["checks"]
    )


def test_all_five_live_exclusions_return_auditable_partial_no_candidate() -> None:
    need = _need(hard_requirements=(HardRequirement.OPEN_WEIGHTS,))
    snapshot = AaSnapshotRepository.load()
    pool = select_verification_pool(snapshot.models, need)
    assert len(pool) == 5
    verifications: list[CandidateVerification] = []
    for candidate in pool:
        slot = candidate.candidate_slot
        identity = _citation(
            slot,
            candidate.model.creator_id,
            citation_id=f"identity-{slot}",
            suffix="identity",
        )
        contradiction = _citation(
            slot,
            candidate.model.creator_id,
            citation_id=f"contradiction-{slot}",
            suffix="open-weights",
        )
        verifications.append(
            CandidateVerification(
                candidate_slot=slot,
                checks=(
                    CandidateEvidenceCheck(
                        check=VerificationCheckKind.MODEL_IDENTITY,
                        verdict=EvidenceVerdict.SATISFIED,
                        summary="The official page identifies this model.",
                        citation_ids=(identity.citation_id,),
                    ),
                    CandidateEvidenceCheck(
                        check=VerificationCheckKind.OPEN_WEIGHTS,
                        verdict=EvidenceVerdict.CONTRADICTED,
                        summary="Official evidence contradicts the open-weights requirement.",
                        citation_ids=(contradiction.citation_id,),
                    ),
                ),
                citations=(identity, contradiction),
            )
        )
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: need},
        verification=tuple(verifications),
    )

    with TestClient(_application(_runtime(gateway))) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    payload = response.json()
    assert response.status_code == 200
    assert payload["outcome"] == "no_eligible_candidate"
    assert payload["verification_status"] == "partial"
    assert payload["recommendation"] is None
    assert payload["alternatives"] == []
    assert [item["source_id"] for item in payload["rejections"]] == [
        candidate.model.source_id for candidate in pool
    ]
    referenced: set[str] = set()
    for rejection in payload["rejections"]:
        assert rejection["identity_check"]["requirement"] == "model_identity"
        assert rejection["identity_check"]["status"] == "satisfied"
        assert rejection["contradictions"][0]["requirement"] == "open_weights"
        assert rejection["contradictions"][0]["status"] == "contradicted"
        referenced.update(rejection["identity_check"]["citation_ids"])
        referenced.update(rejection["contradictions"][0]["citation_ids"])
    assert referenced == {citation["citation_id"] for citation in payload["citations"]}


def test_alternative_evidence_is_preserved_when_primary_is_aa_only() -> None:
    snapshot = AaSnapshotRepository.load()
    creator_id = next(model.creator_id for model in snapshot.models if model.creator_id is not None)
    citation = _citation(
        1,
        creator_id,
        explicit_port=True,
    )
    verification = CandidateVerification(
        candidate_slot=1,
        checks=(
            CandidateEvidenceCheck(
                check=VerificationCheckKind.MODEL_IDENTITY,
                verdict=EvidenceVerdict.SATISFIED,
                summary="The official page identifies this model.",
                citation_ids=(citation.citation_id,),
            ),
        ),
        citations=(citation,),
    )
    gateway = FakeAdvisorGateway(
        parsed_needs={_REQUIREMENT: _need()},
        verification=(verification,),
    )

    with TestClient(_application(_runtime(gateway))) as client:
        response = client.post("/api/v1/advisor/recommend", json=_REQUEST)

    payload = response.json()
    assert response.status_code == 200
    assert payload["verification_status"] == "aa_only"
    assert payload["recommendation"]["checks"] == []
    assert payload["alternatives"][0]["verification_status"] != "aa_only"
    assert payload["alternatives"][0]["checks"][0]["citation_ids"] == [citation.citation_id]
    assert [item["citation_id"] for item in payload["citations"]] == [citation.citation_id]


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


def test_client_disconnect_cancels_web_verification_and_releases_capacity() -> None:
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
