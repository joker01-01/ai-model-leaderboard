"""Offline boundary tests for the no-tool DeepSeek advisor adapter."""

from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from datetime import date
from decimal import Decimal

import httpx
import pytest

from app.domain.advisor import (
    AaPublicModel,
    AbilityPurpose,
    CandidateKnowledgeExplanation,
    HardRequirement,
    ParsedAdvisorNeed,
    PromotedObjective,
    RankedAdvisorCandidate,
)
from app.services.advisor_gateway import AdvisorGatewayError, AdvisorGatewayFailureKind
from app.services.deepseek_offline_advisor_gateway import DeepSeekOfflineAdvisorGateway

Handler = Callable[[httpx.Request], httpx.Response]


def _candidate(slot: int = 0) -> RankedAdvisorCandidate:
    return RankedAdvisorCandidate(
        candidate_slot=slot,
        model=AaPublicModel(
            source_id=f"model-{slot}",
            source_slug=f"model-{slot}",
            raw_name=f"Model {slot}",
            creator_id=f"creator-{slot}",
            creator_name=f"Creator {slot}",
            release_date=date(2026, 1, 1),
            observed_at=date(2026, 9, 4),
            intelligence=80.0 - slot,
            coding=82.0 - slot,
            agentic=78.0 - slot,
            input_price_per_million=1.0 + slot,
            output_price_per_million=4.0 + slot,
            time_to_first_answer_seconds=0.5 + slot,
            output_tokens_per_second=100.0 - slot,
        ),
        estimated_monthly_cost_usd=Decimal("12.50") + slot,
    )


def _need() -> ParsedAdvisorNeed:
    return ParsedAdvisorNeed(
        ability_purposes=(AbilityPurpose.CODING,),
        promoted_objective=PromotedObjective.STRONGEST,
        hard_requirements=(HardRequirement.API_ACCESS,),
    )


def _response(output: object) -> httpx.Response:
    return httpx.Response(
        200,
        json={
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "status": "completed",
                    "role": "assistant",
                    "content": [
                        {
                            "type": "output_text",
                            "text": json.dumps(output, ensure_ascii=False),
                            "annotations": [],
                        }
                    ],
                }
            ],
        },
    )


def _gateway(client: httpx.AsyncClient) -> DeepSeekOfflineAdvisorGateway:
    return DeepSeekOfflineAdvisorGateway(
        client=client,
        api_key="test-secret-key",
        model="deepseek-test",
        base_url="https://api.deepseek.com",
        timeout_seconds=2.0,
    )


def _run_parse(handler: Handler) -> ParsedAdvisorNeed:
    async def run() -> ParsedAdvisorNeed:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await _gateway(client).parse_need("private raw requirement")

    return asyncio.run(run())


def _run_explain(
    handler: Handler,
    candidates: tuple[RankedAdvisorCandidate, ...] = (_candidate(0), _candidate(1), _candidate(2)),
) -> tuple[CandidateKnowledgeExplanation, ...]:
    async def run() -> tuple[CandidateKnowledgeExplanation, ...]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await _gateway(client).explain_candidates(candidates, need=_need())

    return asyncio.run(run())


def _has_schema_default(value: object) -> bool:
    if isinstance(value, dict):
        return "default" in value or any(_has_schema_default(child) for child in value.values())
    if isinstance(value, list):
        return any(_has_schema_default(child) for child in value)
    return False


def test_parse_need_is_one_post_with_no_tools_or_continuation() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return _response(
            {
                "abilityPurposes": ["coding"],
                "promotedObjective": "strongest",
                "hardRequirements": ["api_access"],
            }
        )

    parsed = _run_parse(handler)

    assert parsed == _need()
    assert len(requests) == 1
    request = requests[0]
    assert request.method == "POST"
    assert request.url == httpx.URL("https://api.deepseek.com/responses")
    body = json.loads(request.content)
    assert body["input"] == "private raw requirement"
    assert body["tool_choice"] == "none"
    assert "tools" not in body
    assert "include" not in body
    assert "previous_response_id" not in body
    schema = body["text"]["format"]["schema"]
    assert schema["required"] == list(schema["properties"])
    assert schema["additionalProperties"] is False
    assert not _has_schema_default(schema)


def test_explanation_uses_only_frozen_top_three_and_sanitized_aa_fields() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return _response(
            {
                "candidates": [
                    {
                        "candidateSlot": slot,
                        "knowledgeNote": f"候选 {slot + 1} 的通用说明可能随产品更新而变化。",
                    }
                    for slot in range(3)
                ]
            }
        )

    explanations = _run_explain(handler)

    assert [item.candidate_slot for item in explanations] == [0, 1, 2]
    assert len(requests) == 1
    request = requests[0]
    assert request.method == "POST"
    body = json.loads(request.content)
    assert body["tool_choice"] == "none"
    assert "tools" not in body
    assert "include" not in body
    assert "previous_response_id" not in body
    explanation_input = json.loads(body["input"])
    assert explanation_input["focus"] == {
        "abilityPurposes": ["coding"],
        "promotedObjective": "strongest",
    }
    assert [item["candidateSlot"] for item in explanation_input["candidates"]] == [0, 1, 2]
    assert explanation_input["candidates"][0]["metrics"] == {
        "intelligence": 80.0,
        "coding": 82.0,
        "agentic": 78.0,
        "inputPricePerMillion": 1.0,
        "outputPricePerMillion": 4.0,
        "timeToFirstAnswerSeconds": 0.5,
        "outputTokensPerSecond": 100.0,
        "estimatedMonthlyCostUsd": "12.50",
    }
    serialized = body["input"]
    assert "private raw requirement" not in serialized
    assert "hardRequirements" not in serialized
    assert "deployment" not in serialized.lower()
    assert not hasattr(DeepSeekOfflineAdvisorGateway, "verify_candidates")


def test_allows_literal_tilde_in_plaintext_knowledge_note() -> None:
    knowledge_note = "该模型的输出速度约为 ~100 tokens/s，可能随产品更新而变化。"

    def handler(_request: httpx.Request) -> httpx.Response:
        return _response(
            {
                "candidates": [
                    {"candidateSlot": 0, "knowledgeNote": knowledge_note},
                ]
            }
        )

    explanations = _run_explain(handler, (_candidate(0),))

    assert explanations[0].knowledge_note == knowledge_note


def test_full_offline_flow_is_exactly_two_posts_and_zero_gets() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return _response(
                {
                    "abilityPurposes": ["coding"],
                    "promotedObjective": "strongest",
                    "hardRequirements": ["api_access"],
                }
            )
        return _response(
            {
                "candidates": [
                    {"candidateSlot": slot, "knowledgeNote": "离线通用说明。"}
                    for slot in range(3)
                ]
            }
        )

    async def run() -> None:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            gateway = _gateway(client)
            await gateway.parse_need("private raw requirement")
            await gateway.explain_candidates(
                (_candidate(0), _candidate(1), _candidate(2)),
                need=_need(),
            )

    asyncio.run(run())

    assert len(requests) == 2
    assert [request.method for request in requests] == ["POST", "POST"]
    for request in requests:
        body = json.loads(request.content)
        assert body["tool_choice"] == "none"
        assert "tools" not in body
        assert "include" not in body
        assert "previous_response_id" not in body


@pytest.mark.parametrize(
    "payload",
    [
        {
            "status": "completed",
            "output": [
                {"type": "web_search_call", "status": "completed"},
                {
                    "type": "message",
                    "status": "completed",
                    "role": "assistant",
                    "content": [
                        {"type": "output_text", "text": "{}", "annotations": []}
                    ],
                },
            ],
        },
        {
            "status": "completed",
            "output": [{"type": "function_call", "status": "completed"}],
        },
        {
            "status": "completed",
            "output": [
                {
                    "type": "message",
                    "status": "completed",
                    "role": "assistant",
                    "content": [
                        {
                            "type": "output_text",
                            "text": "{}",
                            "annotations": [{"type": "url_citation"}],
                        }
                    ],
                }
            ],
        },
        {"status": "incomplete", "output": []},
    ],
)
def test_rejects_tool_actions_annotations_and_noncompleted_outputs(payload: object) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError) as caught:
        _run_parse(handler)

    assert caught.value.failure_kind == AdvisorGatewayFailureKind.PROVIDER_WIRE


@pytest.mark.parametrize(
    "knowledge_note",
    [
        "参考 https://example.com/model",
        "参考 example.com/model",
        "参考 [说明](guide/model)",
        "联系 mailto:owner@example.invalid",
        "参考 127.0.0.1/docs",
        "**加粗说明**",
        "~~删除线说明~~",
        "- 列表说明",
        "x" * 501,
    ],
)
def test_rejects_url_like_or_oversized_knowledge_notes(knowledge_note: str) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return _response(
            {
                "candidates": [
                    {"candidateSlot": 0, "knowledgeNote": knowledge_note},
                ]
            }
        )

    with pytest.raises(AdvisorGatewayError) as caught:
        _run_explain(handler, (_candidate(0),))

    assert caught.value.failure_kind == AdvisorGatewayFailureKind.PROVIDER_WIRE


@pytest.mark.parametrize(
    "output",
    [
        {
            "candidates": [
                {
                    "candidateSlot": 0,
                    "knowledgeNote": "离线通用说明。",
                    "citation": "not allowed",
                }
            ]
        },
        {
            "candidates": [
                {"candidateSlot": 0, "knowledgeNote": "离线通用说明。"}
            ],
            "ranking": [0],
        },
    ],
)
def test_rejects_unknown_explanation_fields(output: dict[str, object]) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return _response(output)

    with pytest.raises(AdvisorGatewayError) as caught:
        _run_explain(handler, (_candidate(0),))

    assert caught.value.failure_kind == AdvisorGatewayFailureKind.PROVIDER_WIRE


@pytest.mark.parametrize(
    "candidate_slots",
    [
        [0, 1],
        [0, 1, 1],
        [0, 1, 4],
    ],
)
def test_rejects_missing_duplicate_or_unknown_explanation_slots(
    candidate_slots: list[int],
) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return _response(
            {
                "candidates": [
                    {"candidateSlot": slot, "knowledgeNote": "离线通用说明。"}
                    for slot in candidate_slots
                ]
            }
        )

    with pytest.raises(AdvisorGatewayError) as caught:
        _run_explain(handler)

    assert caught.value.failure_kind == AdvisorGatewayFailureKind.PROVIDER_WIRE
