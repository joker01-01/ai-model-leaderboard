"""Offline boundary tests for the DeepSeek advisor Responses adapter."""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Callable
from datetime import date
from typing import cast

import httpx
import pytest

from app.domain.advisor import (
    AaPublicModel,
    AbilityPurpose,
    CandidateVerification,
    EvidenceVerdict,
    HardRequirement,
    ParsedAdvisorNeed,
    RankedAdvisorCandidate,
)
from app.repositories.official_sources import OfficialSourcesRepository
from app.services.advisor_gateway import AdvisorGatewayError, AdvisorGatewayFailureKind
from app.services.deepseek_advisor_gateway import DeepSeekAdvisorGateway

Handler = Callable[[httpx.Request], httpx.Response]

_OPENAI_CREATOR_ID = "e67e56e3-15cd-43db-b679-da4660a69f41"
_ANTHROPIC_CREATOR_ID = "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128"
_PRIVATE_REQUIREMENT = "Recommend a model. PRIVATE_REQUIREMENT_MARKER"
_INTENT_OUTPUT = {
    "abilityPurposes": ["coding"],
    "promotedObjective": None,
    "hardRequirements": ["api_access"],
}


def _candidate() -> RankedAdvisorCandidate:
    return RankedAdvisorCandidate(
        candidate_slot=0,
        model=AaPublicModel(
            source_id="openai-test-model",
            source_slug="openai-test-model",
            raw_name="OpenAI Test Model",
            creator_id=_OPENAI_CREATOR_ID,
            creator_name="OpenAI",
            release_date=date(2026, 1, 1),
            observed_at=date(2026, 9, 4),
            intelligence=80.0,
            coding=82.0,
            agentic=78.0,
            input_price_per_million=1.0,
            output_price_per_million=4.0,
            time_to_first_answer_seconds=0.5,
            output_tokens_per_second=100.0,
        ),
    )


def _anthropic_candidate() -> RankedAdvisorCandidate:
    candidate = _candidate()
    return RankedAdvisorCandidate(
        candidate_slot=1,
        model=candidate.model.model_copy(
            update={
                "source_id": "anthropic-test-model",
                "source_slug": "anthropic-test-model",
                "raw_name": "Anthropic Test Model",
                "creator_id": _ANTHROPIC_CREATOR_ID,
                "creator_name": "Anthropic",
                "intelligence": 79.0,
                "coding": 81.0,
                "agentic": 77.0,
                "input_price_per_million": 2.0,
                "output_price_per_million": 8.0,
                "time_to_first_answer_seconds": 0.6,
                "output_tokens_per_second": 90.0,
            }
        ),
    )


def _unregistered_candidate() -> RankedAdvisorCandidate:
    candidate = _candidate()
    return RankedAdvisorCandidate(
        candidate_slot=2,
        model=candidate.model.model_copy(
            update={
                "source_id": "unregistered-test-model",
                "source_slug": "unregistered-test-model",
                "raw_name": "Unregistered Test Model",
                "creator_id": "00000000-0000-0000-0000-000000000001",
                "creator_name": "Unregistered",
            }
        ),
    )


def _need() -> ParsedAdvisorNeed:
    return ParsedAdvisorNeed(
        ability_purposes=(AbilityPurpose.CODING,),
        hard_requirements=(HardRequirement.API_ACCESS,),
    )


def _output_response(
    output: object,
    *,
    query: str | None = None,
    action_type: str = "search",
    annotations: list[dict[str, object]] | None = None,
    actions: list[dict[str, object]] | None = None,
) -> httpx.Response:
    items: list[dict[str, object]] = []
    action_items = actions
    if action_items is None and query is not None:
        action_items = [{"type": action_type, "query": query}]
    for action in action_items or []:
        items.append(
            {
                "id": f"ws-test-{len(items)}",
                "type": "web_search_call",
                "status": "completed",
                "action": action,
            }
        )
    items.append(
        {
            "type": "message",
            "status": "completed",
            "role": "assistant",
            "content": [
                {
                    "type": "output_text",
                    "text": json.dumps(output),
                    "annotations": annotations or [],
                }
            ],
        }
    )
    return httpx.Response(200, json={"status": "completed", "output": items})


def _action_only_response(
    actions: list[dict[str, object]],
    *,
    failed_indexes: frozenset[int] = frozenset(),
) -> httpx.Response:
    response = _output_response({}, actions=actions)
    payload = response.json()
    payload["output"].pop()
    for index in failed_indexes:
        payload["output"][index]["status"] = "failed"
    return httpx.Response(200, json=payload)


def _verification_output(
    *,
    candidate_slot: int = 0,
    verdict: str = "satisfied",
    summary: str = "The official source identifies the model.",
) -> dict[str, object]:
    return {
        "candidates": [
            {
                "candidateSlot": candidate_slot,
                "checks": [
                    {
                        "check": "model_identity",
                        "verdict": verdict,
                        "summary": summary,
                    }
                ],
            }
        ]
    }


def _annotation_for_summary(
    output: dict[str, object],
    *,
    url: str,
    title: str,
) -> dict[str, object]:
    text = json.dumps(output)
    candidates = cast(list[dict[str, object]], output["candidates"])
    checks = cast(list[dict[str, object]], candidates[0]["checks"])
    summary = cast(str, checks[0]["summary"])
    encoded_summary = json.dumps(summary)
    encoded_start = text.index(encoded_summary)
    start_index = encoded_start + 1
    return {
        "type": "url_citation",
        "url": url,
        "title": title,
        "start_index": start_index,
        "end_index": start_index + len(summary),
    }


def _gateway(client: httpx.AsyncClient, *, max_response_bytes: int = 1_000_000) -> DeepSeekAdvisorGateway:
    return DeepSeekAdvisorGateway(
        client=client,
        api_key="test-secret-key",
        model="deepseek-test",
        base_url="https://api.deepseek.com",
        official_sources=OfficialSourcesRepository.load(),
        timeout_seconds=2.0,
        max_response_bytes=max_response_bytes,
    )


def _run_parse(handler: Handler, requirement: str = _PRIVATE_REQUIREMENT) -> ParsedAdvisorNeed:
    async def run() -> ParsedAdvisorNeed:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await _gateway(client).parse_need(requirement)

    return asyncio.run(run())


def _run_verify(
    handler: Handler,
    *,
    deployment_region: str | None = None,
    candidates: tuple[RankedAdvisorCandidate, ...] | None = None,
) -> tuple[CandidateVerification, ...]:
    async def run() -> tuple[CandidateVerification, ...]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await _gateway(client).verify_candidates(
                (_candidate(),) if candidates is None else candidates,
                need=_need(),
                deployment_region=deployment_region,
            )

    return asyncio.run(run())


def _search_query(request: httpx.Request) -> str:
    body = json.loads(request.content)
    search_input = json.loads(body["input"])
    return cast(str, search_input["candidates"][0]["allowedQueries"][0])


def _has_schema_default(value: object) -> bool:
    if isinstance(value, dict):
        return "default" in value or any(_has_schema_default(child) for child in value.values())
    if isinstance(value, list):
        return any(_has_schema_default(child) for child in value)
    return False


def test_parse_need_posts_a_strict_schema_and_rejects_extra_output_fields() -> None:
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["request"] = request
        return _output_response(_INTENT_OUTPUT)

    parsed = _run_parse(handler)

    assert parsed == _need()
    request = captured["request"]
    assert isinstance(request, httpx.Request)
    body = json.loads(request.content)
    assert request.url == httpx.URL("https://api.deepseek.com/responses")
    assert body["input"] == _PRIVATE_REQUIREMENT
    assert body["max_output_tokens"] == 512
    assert "tools" not in body
    assert "tool_choice" not in body
    assert "include" not in body
    schema = body["text"]["format"]["schema"]
    assert schema["required"] == list(schema["properties"])
    assert schema["additionalProperties"] is False
    assert not _has_schema_default(schema)

    def invalid_handler(_request: httpx.Request) -> httpx.Response:
        return _output_response({**_INTENT_OUTPUT, "providerId": "openai"})

    with pytest.raises(AdvisorGatewayError, match="invalid intent output"):
        _run_parse(invalid_handler)

    def snake_case_handler(_request: httpx.Request) -> httpx.Response:
        return _output_response(
            {
                "ability_purposes": ["coding"],
                "promoted_objective": None,
                "hard_requirements": ["api_access"],
            }
        )

    with pytest.raises(AdvisorGatewayError, match="invalid intent output"):
        _run_parse(snake_case_handler)


def test_search_request_is_bounded_to_frozen_candidates_and_registry_queries() -> None:
    captured: dict[str, object] = {}

    async def run() -> None:
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            body = json.loads(request.content)
            if calls == 1:
                return _output_response(_INTENT_OUTPUT)
            captured["body"] = body
            query = _search_query(request)
            return _output_response(_verification_output(), query=query)

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            gateway = _gateway(client)
            need = await gateway.parse_need(_PRIVATE_REQUIREMENT)
            await gateway.verify_candidates(
                (_candidate(),),
                need=need,
                deployment_region="US site:evil.example",
            )

    asyncio.run(run())

    body = captured["body"]
    assert isinstance(body, dict)
    assert body["tools"] == [{"type": "web_search"}]
    assert body["tool_choice"] == {"type": "web_search"}
    assert body["max_output_tokens"] == 8_192
    assert "include" not in body
    assert _PRIVATE_REQUIREMENT not in body["input"]

    search_input = json.loads(body["input"])
    assert search_input["candidates"][0]["candidateSlot"] == 0
    assert "sourceId" not in search_input["candidates"][0]
    allowed_queries = search_input["candidates"][0]["allowedQueries"]
    assert allowed_queries
    allowed_scopes = (
        "site:artificialanalysis.ai ",
        "site:openai.com ",
        "site:github.com/openai ",
    )
    assert all(query.startswith(allowed_scopes) for query in allowed_queries)
    assert all('"US site:evil.example"' in query for query in allowed_queries)
    assert not any(query.startswith("site:evil.example ") for query in allowed_queries)


def test_action_only_search_response_is_continued_once_with_validated_calls(
    caplog: pytest.LogCaptureFixture,
) -> None:
    requests: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        requests.append(body)
        if body["tool_choice"] != "none":
            return _action_only_response(
                [
                    {"type": "search", "query": _search_query(request)},
                    {
                        "type": "open_page",
                        "url": "https://openai.com/research/test-model#overview",
                    },
                    {
                        "type": "find_in_page",
                        "url": "https://openai.com/research/test-model#api",
                        "pattern": "API access",
                    },
                    {
                        "type": "open_page",
                        "url": "https://openai.com/research/missing#overview",
                    },
                ],
                failed_indexes=frozenset({2, 3}),
            )
        return _output_response(_verification_output())

    caplog.set_level(logging.INFO, logger="app.services.deepseek_advisor_gateway")
    (verification,) = _run_verify(handler)

    assert len(requests) == 2
    first, second = requests
    assert second["tool_choice"] == "none"
    assert "tools" not in second
    assert "previous_response_id" not in second
    assert second["instructions"] != first["instructions"]
    continuation_input = cast(list[dict[str, object]], second["input"])
    assert continuation_input[0] == {"role": "user", "content": first["input"]}
    assert [item["id"] for item in continuation_input[1:]] == ["ws-test-0", "ws-test-1"]
    assert continuation_input[1]["action"] == {
        "type": "search",
        "query": json.loads(cast(str, first["input"]))["candidates"][0]["allowedQueries"][0],
    }
    assert continuation_input[2]["action"] == {
        "type": "open_page",
        "url": "https://openai.com/research/test-model#overview",
    }
    assert len(continuation_input) == 3
    assert verification.checks[0].verdict == EvidenceVerdict.UNVERIFIED
    assert "advisor_web_continuation replayed_actions=2" in caplog.text
    assert "test-model" not in caplog.text


def test_search_response_with_a_message_is_not_continued() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return _output_response(
            _verification_output(),
            query=_search_query(request),
        )

    assert len(_run_verify(handler)) == 1
    assert call_count == 1


def test_continuation_rejects_any_new_web_action() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        body = json.loads(request.content)
        if body["tool_choice"] != "none":
            return _action_only_response(
                [{"type": "search", "query": _search_query(request)}]
            )
        return _output_response(
            _verification_output(),
            actions=[
                {
                    "type": "open_page",
                    "url": "https://openai.com/research/test-model",
                }
            ],
        )

    with pytest.raises(AdvisorGatewayError, match="invalid continuation response"):
        _run_verify(handler)
    assert call_count == 2


@pytest.mark.parametrize(
    ("invalid_status", "invalid_role"),
    [("in_progress", "assistant"), ("completed", "user")],
)
def test_continuation_rejects_any_incomplete_or_non_assistant_message(
    invalid_status: str,
    invalid_role: str,
) -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        body = json.loads(request.content)
        if body["tool_choice"] != "none":
            return _action_only_response(
                [{"type": "search", "query": _search_query(request)}]
            )
        response = _output_response(_verification_output())
        payload = response.json()
        payload["output"].append(
            {
                "type": "message",
                "status": invalid_status,
                "role": invalid_role,
                "content": [],
            }
        )
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError, match="invalid continuation response"):
        _run_verify(handler)
    assert call_count == 2


def test_unknown_first_response_item_cannot_trigger_continuation() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        response = _action_only_response(
            [{"type": "search", "query": _search_query(request)}]
        )
        payload = response.json()
        payload["output"].append(
            {"type": "reasoning", "status": "completed", "content": "ignored"}
        )
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError, match="invalid output item"):
        _run_verify(handler)
    assert call_count == 1


@pytest.mark.parametrize(
    "invalid_id",
    [None, "", " ws-test", "ws test", "ws-test\nvalue", "x" * 513],
)
def test_search_action_ids_are_strictly_bounded_before_continuation(
    invalid_id: object,
) -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        response = _action_only_response(
            [{"type": "search", "query": _search_query(request)}]
        )
        payload = response.json()
        if invalid_id is None:
            del payload["output"][0]["id"]
        else:
            payload["output"][0]["id"] = invalid_id
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError, match="output item|action ID"):
        _run_verify(handler)
    assert call_count == 1


def test_duplicate_search_action_ids_are_rejected_before_continuation() -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        response = _action_only_response(
            [
                {"type": "search", "query": _search_query(request)},
                {
                    "type": "open_page",
                    "url": "https://openai.com/research/test-model",
                },
            ]
        )
        payload = response.json()
        payload["output"][1]["id"] = payload["output"][0]["id"]
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError, match="action ID"):
        _run_verify(handler)
    assert call_count == 1


def test_search_rejects_unapproved_queries() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            query="site:evil.example OpenAI Test Model",
        )

    with pytest.raises(AdvisorGatewayError, match="unapproved query"):
        _run_verify(handler)


def test_search_accepts_safe_provider_reformulations_and_continuation_marker(
    caplog: pytest.LogCaptureFixture,
) -> None:
    openai = _candidate()
    anthropic = _anthropic_candidate()
    candidates = (
        RankedAdvisorCandidate(
            candidate_slot=openai.candidate_slot,
            model=openai.model.model_copy(update={"raw_name": "GPT-5.6 Sol (xhigh)"}),
        ),
        RankedAdvisorCandidate(
            candidate_slot=anthropic.candidate_slot,
            model=anthropic.model.model_copy(
                update={
                    "raw_name": (
                        "Claude Fable 5.1 "
                        "(Adaptive Reasoning, Max Effort, Default Fallback)"
                    )
                }
            ),
        ),
    )

    def handler(request: httpx.Request) -> httpx.Response:
        exact_query = _search_query(request)
        return _output_response(
            _verification_output(),
            actions=[
                {"type": "search", "query": exact_query},
                {
                    "type": "search",
                    "queries": [
                        'site:artificialanalysis.ai "Claude Fable 5.1"',
                        'site:artificialanalysis.ai "Claude Fable 5.1" model',
                        'site:anthropic.com "Claude Fable 5.1"',
                        'site:anthropic.com "Claude Fable 5.1" model',
                        'site:platform.claude.com "Claude Fable 5.1"',
                        'site:openai.com "GPT-5.6 Sol (xhigh)"',
                        '"GPT-5.6 Sol (xhigh)" site:openai.com model API access',
                        "site:github.com/openai GPT-5.6 Sol",
                        "ws_call_id=call_00_5CYfabc",
                    ],
                },
            ],
        )

    caplog.set_level(logging.INFO, logger="app.services.deepseek_advisor_gateway")
    verifications = _run_verify(handler, candidates=candidates)

    assert len(verifications) == 2
    assert "advisor_web_action_diagnostics" in caplog.text
    assert "queries=10" in caplog.text
    assert "exact_queries=1" in caplog.text
    assert "reformulated_queries=8" in caplog.text
    assert "auxiliary_queries=0" in caplog.text
    assert "continuation_markers=1" in caplog.text
    assert "Claude Fable 5.1" not in caplog.text
    assert "call_00_5CYfabc" not in caplog.text


def test_search_accepts_observed_candidate_bound_reformulations() -> None:
    anthropic = _anthropic_candidate()
    candidate = RankedAdvisorCandidate(
        candidate_slot=anthropic.candidate_slot,
        model=anthropic.model.model_copy(
            update={
                "raw_name": (
                    "Claude Fable 5.1 "
                    "(Adaptive Reasoning, Max Effort, Default Fallback)"
                ),
                "source_slug": "claude-fable-5-1",
            }
        ),
    )
    observed_queries = [
        'site:anthropic.com "Claude Fable 5.1" "Adaptive Reasoning" '
        '"Max Effort" "Default Fallback" model api',
        'site:artificialanalysis.ai "Claude Fable 5.1" "Max Effort" '
        '"Default Fallback" model api',
        'site:artificialanalysis.ai "Claude Fable 5.1" max '
        '"Default Fallback" model api',
        'site:platform.claude.com "claude-fable-5-1" max model api',
        'site:artificialanalysis.ai "claude-fable-5-1" "max" model',
        'site:artificialanalysis.ai/models "claude-fable-5-1" "max" fallback',
        '"Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)"',
        '"Claude Fable 5.1" "Max Effort" "Default Fallback" '
        "site:artificialanalysis.ai",
    ]

    def handler(_request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(candidate_slot=1),
            actions=[{"type": "search", "queries": observed_queries}],
        )

    assert len(_run_verify(handler, candidates=(candidate,))) == 1


@pytest.mark.parametrize(
    "query",
    [
        "site:evil.example OpenAI Test Model",
        'site:openai.com.evil "OpenAI Test Model"',
        'site:openai.com/evil "OpenAI Test Model"',
        'ＳＩＴＥ：ｏｐｅｎａｉ．ｃｏｍ "OpenAI Test Model"',
        'site:openai.com\u2028"OpenAI Test Model"',
        'site:openai.com\u3000"OpenAI Test Model"',
        "site:openai.com Anthropic Test Model",
        'site:openai.com "Anthropic Test Model"',
        'site:openai.com "Anthropic Test Model" model',
        'site:openai.com.evil "OpenAI Test Model" model',
        "site:github.com/openai Anthropic Test Model",
        "site:openai.com model identity",
        "site:artificialanalysis.ai Unknown Test Model",
        "site:openai.com OpenAI Test",
        "site:openai.com OpenAI Test Model Extra",
        'site:openai.com "OpenAI Test Model" Model',
        'site:openai.com "OpenAI Test Model" models',
        'site:openai.com "OpenAI Test Model" model identity',
        'site:openai.com "OpenAI Test Model"  model',
        'site:openai.com "OpenAI Test Model" ｍｏｄｅｌ',
        'site:openai.com "OpenAI Test Model" model site:evil.example',
        "site:openai.com OpenAI Test Model model",
        'site:openai.com "OpenAI Test Model model"',
        "site:openai.com openai test model",
        "site:openai.com  OpenAI Test Model",
        "site:openai.com OpenAI Test\nModel",
        f"site:openai.com OpenAI Test Model {_PRIVATE_REQUIREMENT}",
        f'site:openai.com "OpenAI Test Model" {_PRIVATE_REQUIREMENT}',
        f'site:openai.com "OpenAI Test Model" model {_PRIVATE_REQUIREMENT}',
        f'site:openai.com "OpenAI Test Model {_PRIVATE_REQUIREMENT}"',
        "ws_call_id=call_",
        "ws_call_id=call_abc-123",
        "ws_call_id=call_abc__def",
        "ws_call_id=call_abc_",
        "ws_call_id=call_é",
        f"ws_call_id=call_{'a' * 129}",
        "ws_call_id=call_abc123 ",
        "",
        " ",
        "x" * 1_025,
    ],
)
def test_search_rejects_unsafe_provider_reformulations(query: str) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return _output_response(_verification_output(), query=query)

    with pytest.raises(AdvisorGatewayError, match="search query|unapproved query"):
        _run_verify(handler, candidates=(_candidate(), _anthropic_candidate()))


def test_continuation_marker_cannot_replace_an_approved_search_query() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            query="ws_call_id=call_00_A1b2C3",
        )

    with pytest.raises(AdvisorGatewayError, match="no approved search action"):
        _run_verify(handler)


def test_unregistered_creator_reformulation_is_limited_to_aa_scope() -> None:
    candidates = (_unregistered_candidate(),)

    def aa_handler(_request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(candidate_slot=2),
            query="site:artificialanalysis.ai Unregistered Test Model",
        )

    assert len(_run_verify(aa_handler, candidates=candidates)) == 1

    def creator_handler(_request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(candidate_slot=2),
            query="site:openai.com Unregistered Test Model",
        )

    with pytest.raises(AdvisorGatewayError, match="unapproved query"):
        _run_verify(creator_handler, candidates=candidates)


@pytest.mark.parametrize(
    ("unsafe_name", "unquoted_query"),
    [
        (
            "OpenAI Test Model OR site:evil.example",
            "site:openai.com OpenAI Test Model OR site:evil.example",
        ),
        (
            "OpenAI Test Model ＯＲ site：evil.example",
            "site:openai.com OpenAI Test Model OR site:evil.example",
        ),
    ],
)
def test_unquoted_reformulation_is_not_derived_from_search_control_tokens_in_name(
    unsafe_name: str,
    unquoted_query: str,
) -> None:
    candidate = _candidate()
    unsafe_candidate = RankedAdvisorCandidate(
        candidate_slot=candidate.candidate_slot,
        model=candidate.model.model_copy(update={"raw_name": unsafe_name}),
    )

    def handler(_request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            query=unquoted_query,
        )

    with pytest.raises(AdvisorGatewayError, match="unapproved query"):
        _run_verify(handler, candidates=(unsafe_candidate,))


def test_quoted_reformulation_keeps_search_syntax_in_a_frozen_candidate_name_literal() -> None:
    candidate = _candidate()
    unsafe_name = "OpenAI Test Model ＯＲ site：evil.example"
    unsafe_candidate = RankedAdvisorCandidate(
        candidate_slot=candidate.candidate_slot,
        model=candidate.model.model_copy(update={"raw_name": unsafe_name}),
    )

    def handler(_request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            query=f'site:openai.com "{unsafe_name}"',
        )

    assert len(_run_verify(handler, candidates=(unsafe_candidate,))) == 1


@pytest.mark.parametrize(
    ("raw_name", "unsafe_base"),
    [
        ("OpenAI Model (Vision)", "OpenAI Model"),
        ("OpenAI Model (High (Vision))", "OpenAI Model"),
        ("OpenAI Model (High", "OpenAI Model"),
    ],
)
def test_reformulation_does_not_strip_model_semantics_or_malformed_qualifiers(
    raw_name: str,
    unsafe_base: str,
) -> None:
    candidate = _candidate()
    named_candidate = RankedAdvisorCandidate(
        candidate_slot=candidate.candidate_slot,
        model=candidate.model.model_copy(update={"raw_name": raw_name}),
    )

    def handler(_request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            query=f'site:openai.com "{unsafe_base}"',
        )

    with pytest.raises(AdvisorGatewayError, match="unapproved query"):
        _run_verify(handler, candidates=(named_candidate,))


def test_model_suffix_does_not_enable_a_stripped_semantic_qualifier() -> None:
    candidate = _candidate()
    named_candidate = RankedAdvisorCandidate(
        candidate_slot=candidate.candidate_slot,
        model=candidate.model.model_copy(update={"raw_name": "OpenAI Model (Vision)"}),
    )

    def handler(_request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            query='site:openai.com "OpenAI Model" model',
        )

    with pytest.raises(AdvisorGatewayError, match="unapproved query"):
        _run_verify(handler, candidates=(named_candidate,))


def test_search_rejects_unknown_action_fields_and_excessive_total_queries() -> None:
    def unknown_field_handler(request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            actions=[
                {
                    "type": "search",
                    "query": _search_query(request),
                    "providerExtension": True,
                }
            ],
        )

    with pytest.raises(AdvisorGatewayError, match="invalid search action"):
        _run_verify(unknown_field_handler)

    def excessive_handler(request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            actions=[
                {
                    "type": "search",
                    "queries": [
                        _search_query(request),
                        *(f"ws_call_id=call_{index}" for index in range(30)),
                    ],
                },
                {
                    "type": "search",
                    "queries": [f"ws_call_id=call_{index}" for index in range(30, 60)],
                },
            ],
        )

    with pytest.raises(AdvisorGatewayError, match="too many search queries"):
        _run_verify(excessive_handler)

    def excessive_actions_handler(request: httpx.Request) -> httpx.Response:
        actions: list[dict[str, object]] = [
            {"type": "search", "query": _search_query(request)}
        ]
        for _index in range(60):
            actions.append(
                {"type": "open_page", "url": "https://openai.com/research/test-model"}
            )
        return _output_response(
            _verification_output(),
            actions=actions,
        )

    with pytest.raises(AdvisorGatewayError, match="too many actions"):
        _run_verify(excessive_actions_handler)


def test_search_output_accepts_only_the_advertised_wire_aliases() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        output = _verification_output()
        candidates = cast(list[dict[str, object]], output["candidates"])
        candidates[0]["candidate_slot"] = candidates[0].pop("candidateSlot")
        return _output_response(output, query=_search_query(request))

    with pytest.raises(AdvisorGatewayError, match="invalid verification output"):
        _run_verify(handler)


def test_completed_open_and_find_actions_are_limited_to_reviewed_urls() -> None:
    def approved_handler(request: httpx.Request) -> httpx.Response:
        query = _search_query(request)
        return _output_response(
            _verification_output(),
            actions=[
                {
                    "type": "search",
                    "queries": [query],
                    "sources": [{"type": "url", "url": "https://openai.com/research/test-model"}],
                },
                {"type": "open_page", "url": "https://openai.com/research/test-model"},
                {
                    "type": "find_in_page",
                    "url": "https://artificialanalysis.ai/models/test-model",
                    "pattern": "API access",
                },
            ],
        )

    (verification,) = _run_verify(approved_handler)
    assert verification.citations == ()

    def unapproved_handler(request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            actions=[
                {"type": "search", "query": _search_query(request)},
                {"type": "open_page", "url": "https://evil.example/model"},
            ],
        )

    with pytest.raises(AdvisorGatewayError, match="unapproved URL"):
        _run_verify(unapproved_handler)

    def unapproved_source_handler(request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            actions=[
                {
                    "type": "search",
                    "query": _search_query(request),
                    "sources": [{"type": "url", "url": "https://evil.example/model"}],
                }
            ],
        )

    with pytest.raises(AdvisorGatewayError, match="unapproved source URL"):
        _run_verify(unapproved_source_handler)


def test_action_metadata_may_use_fragments_but_search_sources_may_not() -> None:
    def approved_handler(request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            actions=[
                {"type": "search", "query": _search_query(request)},
                {
                    "type": "open_page",
                    "url": "https://openai.com/research/test-model#overview",
                },
                {
                    "type": "find_in_page",
                    "url": "https://openai.com/research/test-model#api",
                    "pattern": "API access",
                },
            ],
        )

    assert len(_run_verify(approved_handler)) == 1

    def source_handler(request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            actions=[
                {
                    "type": "search",
                    "query": _search_query(request),
                    "sources": [
                        {
                            "type": "url",
                            "url": "https://openai.com/research/test-model#overview",
                        }
                    ],
                }
            ],
        )

    with pytest.raises(AdvisorGatewayError, match="unapproved source URL"):
        _run_verify(source_handler)


def test_action_metadata_rejects_a_malformed_fragment_url() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            actions=[
                {"type": "search", "query": _search_query(request)},
                {"type": "open_page", "url": "https://[bad#fragment"},
            ],
        )

    with pytest.raises(AdvisorGatewayError, match="unapproved URL"):
        _run_verify(handler)


@pytest.mark.parametrize("surrogate_location", ["id", "pattern", "url"])
def test_action_metadata_rejects_lone_surrogates_before_continuation(
    surrogate_location: str,
) -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        actions: list[dict[str, object]] = [
            {"type": "search", "query": _search_query(request)}
        ]
        if surrogate_location == "pattern":
            actions.append(
                {
                    "type": "find_in_page",
                    "url": "https://openai.com/research/test-model",
                    "pattern": "API access",
                }
            )
        elif surrogate_location == "url":
            actions.append(
                {
                    "type": "open_page",
                    "url": "https://openai.com/research/test-model",
                }
            )
        response = _action_only_response(actions)
        payload = response.json()
        if surrogate_location == "id":
            payload["output"][0]["id"] = "ws-\ud800test"
        elif surrogate_location == "pattern":
            payload["output"][1]["action"]["pattern"] = "API\ud800access"
        else:
            payload["output"][1]["action"]["url"] = (
                "https://openai.com/research/\ud800test-model"
            )
        return httpx.Response(
            200,
            content=json.dumps(payload, ensure_ascii=True).encode("utf-8"),
            headers={"content-type": "application/json"},
        )

    with pytest.raises(AdvisorGatewayError, match="action ID|find pattern|unapproved URL"):
        _run_verify(handler)
    assert call_count == 1


@pytest.mark.parametrize("failed_open_first", [False, True])
def test_failed_reviewed_open_page_does_not_discard_completed_search(
    caplog: pytest.LogCaptureFixture,
    failed_open_first: bool,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        search: dict[str, object] = {"type": "search", "query": _search_query(request)}
        failed_open: dict[str, object] = {
            "type": "open_page",
            "url": "https://openai.com/research/test-model",
        }
        actions = [failed_open, search] if failed_open_first else [search, failed_open]
        response = _output_response(
            _verification_output(),
            actions=actions,
        )
        payload = response.json()
        payload["output"][0 if failed_open_first else 1]["status"] = "failed"
        return httpx.Response(200, json=payload)

    caplog.set_level(logging.INFO, logger="app.services.deepseek_advisor_gateway")

    (verification,) = _run_verify(handler)
    assert verification.citations == ()
    assert verification.checks[0].verdict == EvidenceVerdict.UNVERIFIED
    assert "failed_open_pages=1" in caplog.text
    assert "openai.com" not in caplog.text


def test_failed_open_page_still_requires_a_reviewed_url() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        response = _output_response(
            _verification_output(),
            actions=[
                {"type": "search", "query": _search_query(request)},
                {"type": "open_page", "url": "https://evil.example/model"},
            ],
        )
        payload = response.json()
        payload["output"][1]["status"] = "failed"
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError, match="unapproved URL"):
        _run_verify(handler)


def test_failed_search_action_remains_rejected() -> None:
    action: dict[str, object] = {"type": "search"}

    def handler(request: httpx.Request) -> httpx.Response:
        failed_action = dict(action)
        failed_action["query"] = _search_query(request)
        response = _output_response(
            _verification_output(),
            actions=[
                {"type": "search", "query": _search_query(request)},
                failed_action,
            ],
        )
        payload = response.json()
        payload["output"][1]["status"] = "failed"
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError, match="incomplete action"):
        _run_verify(handler)


def test_failed_reviewed_find_action_is_validated_but_not_evidence(
    caplog: pytest.LogCaptureFixture,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        response = _output_response(
            _verification_output(),
            actions=[
                {"type": "search", "query": _search_query(request)},
                {
                    "type": "find_in_page",
                    "url": "https://openai.com/research/test-model#api",
                    "pattern": "API access",
                },
            ],
        )
        payload = response.json()
        payload["output"][1]["status"] = "failed"
        return httpx.Response(200, json=payload)

    caplog.set_level(logging.INFO, logger="app.services.deepseek_advisor_gateway")
    (verification,) = _run_verify(handler)

    assert verification.checks[0].verdict == EvidenceVerdict.UNVERIFIED
    assert verification.citations == ()
    assert "failed_find_in_pages=1" in caplog.text
    assert "test-model" not in caplog.text


def test_failed_open_page_cannot_replace_a_completed_search() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        response = _output_response(
            _verification_output(),
            actions=[
                {"type": "open_page", "url": "https://openai.com/research/test-model"},
            ],
        )
        payload = response.json()
        payload["output"][0]["status"] = "failed"
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError, match="no approved search action"):
        _run_verify(handler)


@pytest.mark.parametrize(
    "status",
    ["in_progress", "incomplete", "searching", "unknown", None, 1, ["failed"]],
)
def test_open_page_statuses_other_than_completed_or_failed_are_rejected(
    status: object,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        response = _output_response(
            _verification_output(),
            actions=[
                {"type": "search", "query": _search_query(request)},
                {"type": "open_page", "url": "https://openai.com/research/test-model"},
            ],
        )
        payload = response.json()
        payload["output"][1]["status"] = status
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError, match="incomplete action"):
        _run_verify(handler)


def test_incomplete_web_action_and_message_items_are_rejected() -> None:
    def action_handler(request: httpx.Request) -> httpx.Response:
        response = _output_response(_verification_output(), query=_search_query(request))
        payload = response.json()
        payload["output"][0]["status"] = "in_progress"
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError, match="incomplete action"):
        _run_verify(action_handler)

    def message_handler(_request: httpx.Request) -> httpx.Response:
        response = _output_response(_INTENT_OUTPUT)
        payload = response.json()
        payload["output"][0]["status"] = "in_progress"
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError, match="no output text"):
        _run_parse(message_handler)


def test_only_output_text_url_citations_are_accepted_as_evidence() -> None:
    official_url = "https://openai.com/research/test-model"
    output = _verification_output()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            assert request.url == httpx.URL(official_url)
            assert "authorization" not in request.headers
            return httpx.Response(200)
        return _output_response(
            output,
            query=_search_query(request),
            annotations=[
                _annotation_for_summary(
                    output,
                    url=official_url,
                    title="OpenAI model page",
                )
            ],
        )

    (verification,) = _run_verify(handler)

    assert verification.checks[0].verdict == EvidenceVerdict.SATISFIED
    assert verification.checks[0].citation_ids == (verification.citations[0].citation_id,)
    assert verification.citations[0].url == official_url


def test_citation_cannot_verify_a_candidate_without_its_scoped_search() -> None:
    openai = _candidate()
    anthropic = _anthropic_candidate()
    output = _verification_output(candidate_slot=anthropic.candidate_slot)
    official_url = "https://anthropic.com/claude/test-model"
    get_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            get_urls.append(str(request.url))
            return httpx.Response(200)
        return _output_response(
            output,
            query=_search_query(request),
            annotations=[
                _annotation_for_summary(
                    output,
                    url=official_url,
                    title="Anthropic model page",
                )
            ],
        )

    verifications = _run_verify(handler, candidates=(openai, anthropic))
    anthropic_verification = next(
        verification
        for verification in verifications
        if verification.candidate_slot == anthropic.candidate_slot
    )

    assert get_urls == []
    assert anthropic_verification.checks[0].verdict == EvidenceVerdict.UNVERIFIED
    assert anthropic_verification.checks[0].summary is None
    assert anthropic_verification.citations == ()


def test_a_url_only_inside_structured_json_is_not_a_citation() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(summary="See https://openai.com/research/test-model"),
            query=_search_query(request),
        )

    (verification,) = _run_verify(handler)

    assert verification.checks[0].verdict == EvidenceVerdict.UNVERIFIED
    assert verification.checks[0].citation_ids == ()
    assert verification.citations == ()


def test_outside_domain_citation_is_rejected_without_fetching_it() -> None:
    output = _verification_output()
    get_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            get_urls.append(str(request.url))
            return httpx.Response(200)
        return _output_response(
            output,
            query=_search_query(request),
            annotations=[
                _annotation_for_summary(
                    output,
                    url="https://evil.example/model",
                    title="Outside source",
                )
            ],
        )

    (verification,) = _run_verify(handler)

    assert get_urls == []
    assert verification.checks[0].verdict == EvidenceVerdict.UNVERIFIED
    assert verification.checks[0].citation_ids == ()
    assert verification.citations == ()


def test_rejected_citation_emits_only_safe_aggregate_diagnostics(
    caplog: pytest.LogCaptureFixture,
) -> None:
    output = _verification_output()
    private_marker = "PRIVATE_CITATION_MARKER"

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "POST"
        return _output_response(
            output,
            query=_search_query(request),
            annotations=[
                _annotation_for_summary(
                    output,
                    url=f"https://evil.example/{private_marker}",
                    title=private_marker,
                )
            ],
        )

    caplog.set_level(logging.INFO, logger="app.services.deepseek_advisor_gateway")
    (verification,) = _run_verify(handler)

    assert verification.checks[0].verdict == EvidenceVerdict.UNVERIFIED
    assert verification.citations == ()
    assert "advisor_citation_diagnostics" in caplog.text
    assert "provider_annotations=1" in caplog.text
    assert "summary_annotation_matches=1" in caplog.text
    assert "rejected_citations=1" in caplog.text
    assert "accepted_citations=0" in caplog.text
    assert "checks_downgraded=1" in caplog.text
    assert private_marker not in caplog.text
    assert "evil.example" not in caplog.text


def test_no_citation_annotations_emit_zero_aggregate_diagnostics(
    caplog: pytest.LogCaptureFixture,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            query=_search_query(request),
        )

    caplog.set_level(logging.INFO, logger="app.services.deepseek_advisor_gateway")
    (verification,) = _run_verify(handler)

    assert verification.checks[0].verdict == EvidenceVerdict.UNVERIFIED
    assert verification.citations == ()
    assert "advisor_citation_diagnostics" in caplog.text
    assert "provider_annotations=0" in caplog.text
    assert "rejected_citations=0" in caplog.text
    assert "accepted_citations=0" in caplog.text


def test_accepted_citation_emits_only_safe_aggregate_diagnostics(
    caplog: pytest.LogCaptureFixture,
) -> None:
    official_url = "https://openai.com/research/private-test-model"
    private_title = "PRIVATE_CITATION_TITLE"
    output = _verification_output()

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            assert request.url == httpx.URL(official_url)
            return httpx.Response(200)
        return _output_response(
            output,
            query=_search_query(request),
            annotations=[
                _annotation_for_summary(
                    output,
                    url=official_url,
                    title=private_title,
                )
            ],
        )

    caplog.set_level(logging.INFO, logger="app.services.deepseek_advisor_gateway")
    (verification,) = _run_verify(handler)

    assert verification.checks[0].verdict == EvidenceVerdict.SATISFIED
    assert len(verification.citations) == 1
    assert "advisor_citation_diagnostics" in caplog.text
    assert "provider_annotations=1" in caplog.text
    assert "rejected_citations=0" in caplog.text
    assert "accepted_citations=1" in caplog.text
    assert official_url not in caplog.text
    assert private_title not in caplog.text


def test_same_domain_redirect_to_outside_domain_cannot_support_a_verdict() -> None:
    official_url = "https://openai.com/research/test-model"
    output = _verification_output()
    get_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            get_urls.append(str(request.url))
            return httpx.Response(302, headers={"Location": "https://evil.example/landing"})
        return _output_response(
            output,
            query=_search_query(request),
            annotations=[
                _annotation_for_summary(
                    output,
                    url=official_url,
                    title="Unsafe redirect",
                )
            ],
        )

    (verification,) = _run_verify(handler)

    assert get_urls == [official_url]
    assert verification.checks[0].verdict == EvidenceVerdict.UNVERIFIED
    assert verification.checks[0].citation_ids == ()
    assert verification.citations == ()


def test_every_server_observed_redirect_hop_stays_in_the_same_creator_binding() -> None:
    first_url = "https://openai.com/research/start"
    second_url = "https://platform.openai.com/docs/models/test"
    final_url = "https://openai.com/research/final"
    output = _verification_output()
    get_urls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            get_urls.append(str(request.url))
            if request.url == httpx.URL(first_url):
                return httpx.Response(302, headers={"Location": second_url})
            if request.url == httpx.URL(second_url):
                return httpx.Response(307, headers={"Location": final_url})
            assert request.url == httpx.URL(final_url)
            return httpx.Response(200)
        return _output_response(
            output,
            query=_search_query(request),
            annotations=[
                _annotation_for_summary(
                    output,
                    url=first_url,
                    title="Redirected official page",
                )
            ],
        )

    (verification,) = _run_verify(handler)

    assert get_urls == [first_url, second_url, final_url]
    assert verification.citations[0].url == final_url
    assert verification.checks[0].citation_ids == (verification.citations[0].citation_id,)


def test_response_size_limit_accepts_exact_boundary_and_rejects_one_byte_less() -> None:
    payload = {
        "status": "completed",
        "output": [
            {
                "type": "message",
                "status": "completed",
                "role": "assistant",
                "content": [{"type": "output_text", "text": json.dumps(_INTENT_OUTPUT)}],
            }
        ],
    }
    content = json.dumps(payload, separators=(",", ":")).encode()

    async def run(limit: int) -> ParsedAdvisorNeed:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, content=content, headers={"Content-Type": "application/json"})

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await _gateway(client, max_response_bytes=limit).parse_need(_PRIVATE_REQUIREMENT)

    assert asyncio.run(run(len(content))) == _need()
    with pytest.raises(AdvisorGatewayError, match="size limit"):
        asyncio.run(run(len(content) - 1))


@pytest.mark.parametrize("content_type", [None, "text/html"])
def test_provider_response_requires_reviewed_json_content_type(content_type: str | None) -> None:
    payload = {
        "status": "completed",
        "output": [
            {
                "type": "message",
                "status": "completed",
                "role": "assistant",
                "content": [{"type": "output_text", "text": json.dumps(_INTENT_OUTPUT)}],
            }
        ],
    }

    def handler(_request: httpx.Request) -> httpx.Response:
        headers = {} if content_type is None else {"Content-Type": content_type}
        return httpx.Response(200, content=json.dumps(payload).encode(), headers=headers)

    with pytest.raises(AdvisorGatewayError, match="non-JSON"):
        _run_parse(handler)


def test_provider_response_requires_completed_top_level_status() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        response = _output_response(_INTENT_OUTPUT)
        payload = response.json()
        del payload["status"]
        return httpx.Response(200, json=payload)

    with pytest.raises(AdvisorGatewayError, match="invalid response"):
        _run_parse(handler)


@pytest.mark.parametrize(
    ("response_factory", "expected_kind"),
    [
        (
            lambda request: httpx.ReadTimeout("PRIVATE_TIMEOUT_DETAIL", request=request),
            AdvisorGatewayFailureKind.TIMEOUT,
        ),
        (
            lambda _request: httpx.Response(
                429,
                json={"error": "PRIVATE_HTTP_BODY"},
            ),
            AdvisorGatewayFailureKind.PROVIDER_HTTP,
        ),
        (
            lambda _request: httpx.Response(
                200,
                content=b"{",
                headers={"Content-Type": "application/json"},
            ),
            AdvisorGatewayFailureKind.PROVIDER_WIRE,
        ),
    ],
)
def test_provider_failures_have_stable_safe_failure_kinds(
    response_factory: Callable[[httpx.Request], httpx.Response | Exception],
    expected_kind: AdvisorGatewayFailureKind,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        result = response_factory(request)
        if isinstance(result, Exception):
            raise result
        return result

    with pytest.raises(AdvisorGatewayError) as caught:
        _run_verify(handler)

    assert caught.value.failure_kind == expected_kind
    assert "PRIVATE" not in str(caught.value)
