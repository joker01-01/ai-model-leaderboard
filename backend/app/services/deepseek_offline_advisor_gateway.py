"""DeepSeek Responses adapter for intent parsing and offline knowledge notes."""

from __future__ import annotations

import asyncio
import json
from math import isfinite
from typing import Annotated, TypeAlias, cast
from urllib.parse import urlsplit

import httpx
from pydantic import Field, ValidationError, field_validator

from app.domain.advisor import (
    CandidateKnowledgeExplanation,
    ParsedAdvisorNeed,
    RankedAdvisorCandidate,
)
from app.domain.models import StrictModel
from app.services.advisor_gateway import AdvisorGatewayError, AdvisorGatewayFailureKind

JsonValue: TypeAlias = (  # noqa: UP040 - mypy stable lacks PEP 695 type alias support
    None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
)
JsonObject: TypeAlias = dict[str, JsonValue]  # noqa: UP040 - mypy stable lacks PEP 695 type alias support

_JSON_MEDIA_TYPES = frozenset({"application/json", "application/problem+json"})
_INTENT_INSTRUCTIONS = """Extract only the user's model-advisor need into the supplied schema.
Return one to three unique ability purposes in user-emphasized order. Use intelligence when none is
stated. Return at most one explicit strongest, fastest, or cheapest objective. Return only explicit
hard requirements from the supplied enum. Do not return region, budget, URLs, model/provider IDs,
recommendations, rankings, evidence, or additional fields. Do not browse or call tools.
"""
_KNOWLEDGE_INSTRUCTIONS = """Write one concise Chinese knowledge note for each supplied candidate.
Use only the supplied committed Artificial Analysis fields and your pretrained general knowledge.
Do not browse, call tools, add or remove candidates, change their order, rank them, or claim that a
hard requirement, deployment region, current availability, license, API, or feature has been
verified. Treat every non-AA statement as potentially stale. If you do not reliably recognize a
candidate, interpret only its supplied AA metrics. Return only the supplied schema, preserve every
candidateSlot, and do not include URLs, citations, Markdown, or additional fields.
"""


class _KnowledgeOutput(StrictModel):
    candidates: Annotated[
        tuple[CandidateKnowledgeExplanation, ...],
        Field(min_length=1, max_length=3),
    ]

    @field_validator("candidates")
    @classmethod
    def validate_unique_slots(
        cls,
        value: tuple[CandidateKnowledgeExplanation, ...],
    ) -> tuple[CandidateKnowledgeExplanation, ...]:
        slots = tuple(item.candidate_slot for item in value)
        if len(slots) != len(set(slots)):
            raise ValueError("candidate knowledge slots must be unique")
        return value


def _require_all_object_fields(value: JsonValue) -> JsonValue:
    if isinstance(value, list):
        return [_require_all_object_fields(item) for item in value]
    if not isinstance(value, dict):
        return value
    adapted = {
        key: _require_all_object_fields(child)
        for key, child in value.items()
        if key != "default"
    }
    properties = adapted.get("properties")
    if isinstance(properties, dict):
        adapted["required"] = list(properties)
        adapted["additionalProperties"] = False
    return adapted


def _strict_schema(model_type: type[StrictModel]) -> JsonObject:
    raw = cast(JsonObject, model_type.model_json_schema(by_alias=True))
    adapted = _require_all_object_fields(raw)
    if not isinstance(adapted, dict):  # pragma: no cover - Pydantic model roots are objects
        raise RuntimeError("advisor schema root must be an object")
    return adapted


_NEED_SCHEMA = _strict_schema(ParsedAdvisorNeed)
_KNOWLEDGE_SCHEMA = _strict_schema(_KnowledgeOutput)


def _responses_endpoint(base_url: str) -> str:
    if not base_url or base_url.strip() != base_url:
        raise ValueError("base_url must be a non-empty value without surrounding whitespace")
    try:
        parsed = urlsplit(base_url)
        port = parsed.port
    except ValueError:
        raise ValueError("base_url must be a valid absolute HTTPS URL") from None
    if (
        parsed.scheme != "https"
        or parsed.hostname is None
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("base_url must be an absolute HTTPS URL without credentials, query, or fragment")
    host = parsed.hostname
    if ":" in host:
        host = f"[{host}]"
    authority = host if port is None else f"{host}:{port}"
    return f"https://{authority}{parsed.path.rstrip('/')}/responses"


def _completed_assistant_text(payload: object) -> str:
    if not isinstance(payload, dict) or payload.get("status") != "completed":
        raise AdvisorGatewayError(
            "advisor provider returned an invalid response",
            failure_kind=AdvisorGatewayFailureKind.PROVIDER_WIRE,
        )
    output = payload.get("output")
    if not isinstance(output, list) or len(output) != 1:
        raise AdvisorGatewayError(
            "advisor provider returned an invalid output",
            failure_kind=AdvisorGatewayFailureKind.PROVIDER_WIRE,
        )
    message = output[0]
    if (
        not isinstance(message, dict)
        or message.get("type") != "message"
        or message.get("status") != "completed"
        or message.get("role") != "assistant"
    ):
        raise AdvisorGatewayError(
            "advisor provider returned a non-message output",
            failure_kind=AdvisorGatewayFailureKind.PROVIDER_WIRE,
        )
    content = message.get("content")
    if not isinstance(content, list) or len(content) != 1:
        raise AdvisorGatewayError(
            "advisor provider returned invalid message content",
            failure_kind=AdvisorGatewayFailureKind.PROVIDER_WIRE,
        )
    part = content[0]
    if (
        not isinstance(part, dict)
        or part.get("type") != "output_text"
        or not isinstance(part.get("text"), str)
        or not cast(str, part["text"])
        or part.get("annotations", []) != []
    ):
        raise AdvisorGatewayError(
            "advisor provider returned invalid output text",
            failure_kind=AdvisorGatewayFailureKind.PROVIDER_WIRE,
        )
    return cast(str, part["text"])


def _candidate_name(candidate: RankedAdvisorCandidate) -> str:
    model = candidate.model
    value = model.raw_name or model.source_slug or f"unnamed model {model.source_id}"
    return " ".join(value.split())[:300]


def _clean_optional_text(value: str | None) -> str | None:
    return None if value is None else " ".join(value.split())[:300]


def _decimal_text(candidate: RankedAdvisorCandidate) -> str | None:
    value = candidate.estimated_monthly_cost_usd
    if value is None or not value.is_finite() or value < 0:
        return None
    return format(value, "f")


class DeepSeekOfflineAdvisorGateway:
    """No-tool Responses client; it cannot verify, browse, or fetch URLs."""

    def __init__(
        self,
        *,
        client: httpx.AsyncClient,
        api_key: str,
        model: str,
        base_url: str,
        timeout_seconds: float = 60.0,
        max_response_bytes: int = 1_000_000,
    ) -> None:
        if not api_key or api_key.strip() != api_key:
            raise ValueError("api_key must be a non-empty value without surrounding whitespace")
        if not model or model.strip() != model:
            raise ValueError("model must be a non-empty value without surrounding whitespace")
        if not isfinite(timeout_seconds) or timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be a positive finite number")
        if max_response_bytes <= 0:
            raise ValueError("max_response_bytes must be positive")
        self._client = client
        self._api_key = api_key
        self._model = model
        self._endpoint = _responses_endpoint(base_url)
        self._timeout_seconds = timeout_seconds
        self._timeout = httpx.Timeout(timeout_seconds)
        self._max_response_bytes = max_response_bytes

    async def _post(self, body: dict[str, object]) -> object:
        try:
            async with asyncio.timeout(self._timeout_seconds):
                async with self._client.stream(
                    "POST",
                    self._endpoint,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "Accept-Encoding": "identity",
                    },
                    json=body,
                    timeout=self._timeout,
                    follow_redirects=False,
                ) as response:
                    response.raise_for_status()
                    media_type = response.headers.get("content-type", "").partition(";")[0].strip().lower()
                    if media_type not in _JSON_MEDIA_TYPES:
                        raise AdvisorGatewayError("advisor provider returned a non-JSON response")
                    encoding = response.headers.get("content-encoding", "identity").strip().lower()
                    if encoding not in {"", "identity"}:
                        raise AdvisorGatewayError("advisor provider response encoding is unsupported")
                    declared = response.headers.get("content-length")
                    if declared is not None:
                        try:
                            declared_length = int(declared)
                        except ValueError as exc:
                            raise AdvisorGatewayError(
                                "advisor provider returned an invalid response length"
                            ) from exc
                        if declared_length < 0 or declared_length > self._max_response_bytes:
                            raise AdvisorGatewayError("advisor provider response exceeded the size limit")
                    content = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(chunk) > self._max_response_bytes - len(content):
                            raise AdvisorGatewayError("advisor provider response exceeded the size limit")
                        content.extend(chunk)
        except AdvisorGatewayError as exc:
            if exc.failure_kind != AdvisorGatewayFailureKind.UNKNOWN:
                raise
            raise AdvisorGatewayError(
                str(exc),
                failure_kind=AdvisorGatewayFailureKind.PROVIDER_WIRE,
            ) from None
        except (TimeoutError, httpx.TimeoutException):
            raise AdvisorGatewayError(
                "advisor provider timed out",
                failure_kind=AdvisorGatewayFailureKind.TIMEOUT,
            ) from None
        except httpx.HTTPStatusError as exc:
            raise AdvisorGatewayError(
                f"advisor provider returned HTTP status {exc.response.status_code}",
                failure_kind=AdvisorGatewayFailureKind.PROVIDER_HTTP,
            ) from None
        except httpx.RequestError:
            raise AdvisorGatewayError(
                "advisor provider is unavailable",
                failure_kind=AdvisorGatewayFailureKind.PROVIDER_UNAVAILABLE,
            ) from None
        try:
            return json.loads(content)
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise AdvisorGatewayError(
                "advisor provider returned invalid JSON",
                failure_kind=AdvisorGatewayFailureKind.PROVIDER_WIRE,
            ) from None

    async def parse_need(self, requirement: str) -> ParsedAdvisorNeed:
        body: dict[str, object] = {
            "model": self._model,
            "instructions": _INTENT_INSTRUCTIONS,
            "input": requirement,
            "store": False,
            "max_output_tokens": 512,
            "reasoning": {"effort": "none"},
            "tool_choice": "none",
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "parsed_advisor_need",
                    "schema": _NEED_SCHEMA,
                }
            },
        }
        text = _completed_assistant_text(await self._post(body))
        try:
            return ParsedAdvisorNeed.model_validate_json(
                text,
                strict=True,
                by_alias=True,
                by_name=False,
            )
        except ValidationError:
            raise AdvisorGatewayError(
                "advisor provider returned invalid intent output",
                failure_kind=AdvisorGatewayFailureKind.PROVIDER_WIRE,
            ) from None

    async def explain_candidates(
        self,
        candidates: tuple[RankedAdvisorCandidate, ...],
        *,
        need: ParsedAdvisorNeed,
    ) -> tuple[CandidateKnowledgeExplanation, ...]:
        if not 1 <= len(candidates) <= 3:
            raise AdvisorGatewayError("advisor explanation requires one to three visible candidates")
        requested_slots = tuple(candidate.candidate_slot for candidate in candidates)
        if len(requested_slots) != len(set(requested_slots)):
            raise AdvisorGatewayError("advisor explanation candidate slots must be unique")

        explanation_input = {
            "focus": {
                "abilityPurposes": [purpose.value for purpose in need.ability_purposes],
                "promotedObjective": (
                    None if need.promoted_objective is None else need.promoted_objective.value
                ),
            },
            "candidates": [
                {
                    "candidateSlot": candidate.candidate_slot,
                    "modelName": _candidate_name(candidate),
                    "creatorName": _clean_optional_text(candidate.model.creator_name),
                    "observedAt": candidate.model.observed_at.isoformat(),
                    "metrics": {
                        "intelligence": candidate.model.intelligence,
                        "coding": candidate.model.coding,
                        "agentic": candidate.model.agentic,
                        "inputPricePerMillion": candidate.model.input_price_per_million,
                        "outputPricePerMillion": candidate.model.output_price_per_million,
                        "timeToFirstAnswerSeconds": candidate.model.time_to_first_answer_seconds,
                        "outputTokensPerSecond": candidate.model.output_tokens_per_second,
                        "estimatedMonthlyCostUsd": _decimal_text(candidate),
                    },
                }
                for candidate in candidates
            ],
        }
        body: dict[str, object] = {
            "model": self._model,
            "instructions": _KNOWLEDGE_INSTRUCTIONS,
            "input": json.dumps(explanation_input, ensure_ascii=False, separators=(",", ":")),
            "store": False,
            "max_output_tokens": 2_048,
            "reasoning": {"effort": "none"},
            "tool_choice": "none",
            "temperature": 0,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "advisor_candidate_knowledge",
                    "schema": _KNOWLEDGE_SCHEMA,
                }
            },
        }
        text = _completed_assistant_text(await self._post(body))
        try:
            parsed = _KnowledgeOutput.model_validate_json(
                text,
                strict=True,
                by_alias=True,
                by_name=False,
            )
        except ValidationError:
            raise AdvisorGatewayError(
                "advisor provider returned invalid knowledge output",
                failure_kind=AdvisorGatewayFailureKind.PROVIDER_WIRE,
            ) from None
        returned_slots = tuple(item.candidate_slot for item in parsed.candidates)
        if set(returned_slots) != set(requested_slots):
            raise AdvisorGatewayError(
                "advisor provider returned a mismatched knowledge slot set",
                failure_kind=AdvisorGatewayFailureKind.PROVIDER_WIRE,
            )
        return parsed.candidates
