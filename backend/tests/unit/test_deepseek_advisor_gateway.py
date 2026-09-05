"""Offline boundary tests for the DeepSeek advisor Responses adapter."""

from __future__ import annotations

import asyncio
import json
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
from app.services.advisor_gateway import AdvisorGatewayError
from app.services.deepseek_advisor_gateway import DeepSeekAdvisorGateway

Handler = Callable[[httpx.Request], httpx.Response]

_OPENAI_CREATOR_ID = "e67e56e3-15cd-43db-b679-da4660a69f41"
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


def _verification_output(
    *,
    verdict: str = "satisfied",
    summary: str = "The official source identifies the model.",
) -> dict[str, object]:
    return {
        "candidates": [
            {
                "candidateSlot": 0,
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
) -> tuple[CandidateVerification, ...]:
    async def run() -> tuple[CandidateVerification, ...]:
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await _gateway(client).verify_candidates(
                (_candidate(),),
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


def test_search_rejects_unapproved_queries() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return _output_response(
            _verification_output(),
            query="site:evil.example OpenAI Test Model",
        )

    with pytest.raises(AdvisorGatewayError, match="unapproved query"):
        _run_verify(handler)


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
