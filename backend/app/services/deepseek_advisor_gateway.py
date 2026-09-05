"""DeepSeek Responses adapter for bounded advisor intent and official web checks."""

from __future__ import annotations

import asyncio
import hashlib
import json
from math import isfinite
from typing import Annotated, TypeAlias, cast
from urllib.parse import urljoin, urlsplit

import httpx
from pydantic import Field, ValidationError, field_validator, model_validator

from app.domain.advisor import (
    BoundedEvidenceText,
    CandidateEvidenceCheck,
    CandidateVerification,
    EvidenceVerdict,
    OfficialCitation,
    ParsedAdvisorNeed,
    RankedAdvisorCandidate,
    VerificationCheckKind,
)
from app.domain.models import StrictModel
from app.repositories.official_sources import OfficialSourceMatch, OfficialSourcesRepository
from app.services.advisor_gateway import AdvisorGatewayError

JsonValue: TypeAlias = (  # noqa: UP040 - mypy stable lacks PEP 695 type alias support
    None | bool | int | float | str | list["JsonValue"] | dict[str, "JsonValue"]
)
JsonObject: TypeAlias = dict[str, JsonValue]  # noqa: UP040 - mypy stable lacks PEP 695 type alias support

_JSON_MEDIA_TYPES = frozenset({"application/json", "application/problem+json"})
_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})
_MAX_CITATION_REDIRECTS = 3
_MAX_CITATION_ANNOTATIONS = 30
_INTENT_INSTRUCTIONS = """Extract only the user's model-advisor need into the supplied schema.
Return one to three unique ability purposes in user-emphasized order. Use intelligence when none is
stated. Return at most one explicit strongest, fastest, or cheapest objective. Return only explicit
hard requirements from the supplied enum. Do not return region, budget, URLs, model/provider IDs,
recommendations, rankings, evidence, or additional fields.
"""
_SEARCH_INSTRUCTIONS = """Use web_search only with the exact allowedQueries supplied as data.
Inspect only the numbered candidate slots. Do not use the original user request, invent a URL, add a
candidate, or change candidate order. Return only the supplied schema. A satisfied or contradicted
verdict must be supported by a URL citation annotation on the output_text; otherwise use unverified.
Use candidateSlot, never a model/provider ID, in the structured result.
"""


class _SearchCheck(StrictModel):
    check: VerificationCheckKind
    verdict: EvidenceVerdict
    summary: BoundedEvidenceText | None


class _SearchCandidate(StrictModel):
    candidate_slot: Annotated[int, Field(ge=0, lt=5)]
    checks: Annotated[tuple[_SearchCheck, ...], Field(max_length=6)]

    @field_validator("checks")
    @classmethod
    def validate_unique_checks(cls, value: tuple[_SearchCheck, ...]) -> tuple[_SearchCheck, ...]:
        kinds = tuple(check.check for check in value)
        if len(kinds) != len(set(kinds)):
            raise ValueError("candidate checks must be unique")
        return value


class _SearchOutput(StrictModel):
    candidates: Annotated[tuple[_SearchCandidate, ...], Field(max_length=5)]

    @field_validator("candidates")
    @classmethod
    def validate_unique_slots(cls, value: tuple[_SearchCandidate, ...]) -> tuple[_SearchCandidate, ...]:
        slots = tuple(candidate.candidate_slot for candidate in value)
        if len(slots) != len(set(slots)):
            raise ValueError("candidate slots must be unique")
        return value


def _require_all_object_fields(value: JsonValue) -> JsonValue:
    if isinstance(value, list):
        return [_require_all_object_fields(item) for item in value]
    if not isinstance(value, dict):
        return value
    adapted = {key: _require_all_object_fields(child) for key, child in value.items() if key != "default"}
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
_SEARCH_SCHEMA = _strict_schema(_SearchOutput)


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


def _safe_query_term(value: str) -> str:
    return " ".join(value.replace("\\", "'").replace('"', "'").split())[:200]


def _candidate_name(candidate: RankedAdvisorCandidate) -> str:
    model = candidate.model
    return model.raw_name or model.source_slug or f"unnamed model {model.source_id}"


def _requested_checks(need: ParsedAdvisorNeed, deployment_region: str | None) -> tuple[VerificationCheckKind, ...]:
    checks = [VerificationCheckKind.MODEL_IDENTITY]
    checks.extend(VerificationCheckKind(requirement.value) for requirement in need.hard_requirements)
    if deployment_region is not None:
        checks.append(VerificationCheckKind.DEPLOYMENT_REGION)
    return tuple(checks)


class _CitationAnnotation(StrictModel):
    url: Annotated[str, Field(min_length=1, max_length=2_048)]
    title: Annotated[str, Field(max_length=1_000)]
    start_index: Annotated[int, Field(ge=0)]
    end_index: Annotated[int, Field(gt=0)]

    @model_validator(mode="after")
    def validate_span(self) -> _CitationAnnotation:
        if self.end_index <= self.start_index:
            raise ValueError("citation annotation span must be non-empty")
        return self


def _output_parts(payload: object) -> tuple[tuple[str, tuple[_CitationAnnotation, ...]], ...]:
    if not isinstance(payload, dict) or payload.get("status") != "completed":
        raise AdvisorGatewayError("advisor provider returned an invalid response")
    output = payload.get("output")
    if not isinstance(output, list):
        raise AdvisorGatewayError("advisor provider returned no output text")

    parts: list[tuple[str, tuple[_CitationAnnotation, ...]]] = []
    refused = False
    for item in output:
        if (
            not isinstance(item, dict)
            or item.get("type") != "message"
            or item.get("status") != "completed"
            or item.get("role") != "assistant"
        ):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "refusal":
                refused = True
                continue
            if part.get("type") != "output_text" or not isinstance(part.get("text"), str):
                continue
            annotations: list[_CitationAnnotation] = []
            raw_annotations = part.get("annotations", [])
            if isinstance(raw_annotations, list):
                for annotation in raw_annotations:
                    if not isinstance(annotation, dict) or annotation.get("type") != "url_citation":
                        continue
                    url = annotation.get("url")
                    title = annotation.get("title")
                    start_index = annotation.get("start_index")
                    end_index = annotation.get("end_index")
                    if (
                        not isinstance(url, str)
                        or not isinstance(title, str)
                        or not isinstance(start_index, int)
                        or isinstance(start_index, bool)
                        or not isinstance(end_index, int)
                        or isinstance(end_index, bool)
                    ):
                        continue
                    try:
                        parsed_annotation = _CitationAnnotation(
                            url=url,
                            title=title,
                            start_index=start_index,
                            end_index=end_index,
                        )
                        if parsed_annotation.end_index <= len(cast(str, part["text"])):
                            annotations.append(parsed_annotation)
                    except ValidationError:
                        continue
            parts.append((cast(str, part["text"]), tuple(annotations)))
    if refused:
        raise AdvisorGatewayError("advisor provider refused the request")
    if not parts or not any(text for text, _annotations in parts):
        raise AdvisorGatewayError("advisor provider returned no output text")
    if sum(len(annotations) for _text, annotations in parts) > _MAX_CITATION_ANNOTATIONS:
        raise AdvisorGatewayError("advisor provider returned too many citation annotations")
    return tuple(parts)


def _web_action_url_is_allowed(
    url: str,
    candidates: tuple[RankedAdvisorCandidate, ...],
    official_sources: OfficialSourcesRepository,
) -> bool:
    if len(url) > 2_048:
        return False
    if official_sources.validate_aa_citation_url(url) is not None:
        return True
    creator_ids = {
        candidate.model.creator_id
        for candidate in candidates
        if candidate.model.creator_id is not None
    }
    return any(
        official_sources.validate_citation_url(creator_id, url) is not None
        for creator_id in creator_ids
    )


def _validate_web_actions(
    payload: object,
    *,
    candidates: tuple[RankedAdvisorCandidate, ...],
    allowed_queries: tuple[str, ...],
    official_sources: OfficialSourcesRepository,
) -> None:
    if (
        not isinstance(payload, dict)
        or payload.get("status") != "completed"
        or not isinstance(payload.get("output"), list)
    ):
        raise AdvisorGatewayError("advisor web search returned an invalid response")
    allowed = set(allowed_queries)
    completed_search = False
    for item in cast(list[object], payload["output"]):
        if not isinstance(item, dict) or item.get("type") != "web_search_call":
            continue
        if item.get("status") != "completed":
            raise AdvisorGatewayError("advisor web search returned an incomplete action")
        action = item.get("action")
        if not isinstance(action, dict) or not isinstance(action.get("type"), str):
            raise AdvisorGatewayError("advisor web search returned an invalid action")
        action_type = cast(str, action["type"])
        if action_type == "search":
            if set(action).difference({"type", "query", "queries", "sources"}):
                raise AdvisorGatewayError("advisor web search returned an invalid search action")
            queries: list[str] = []
            query = action.get("query")
            if query is not None:
                if not isinstance(query, str):
                    raise AdvisorGatewayError("advisor web search returned an invalid search query")
                queries.append(query)
            raw_queries = action.get("queries")
            if raw_queries is not None:
                if (
                    not isinstance(raw_queries, list)
                    or not raw_queries
                    or not all(isinstance(item, str) for item in raw_queries)
                ):
                    raise AdvisorGatewayError("advisor web search returned invalid search queries")
                queries.extend(cast(list[str], raw_queries))
            if not queries or len(queries) > len(allowed_queries) or any(query not in allowed for query in queries):
                raise AdvisorGatewayError("advisor web search used an unapproved query")
            raw_sources = action.get("sources")
            if raw_sources is not None:
                if not isinstance(raw_sources, list) or len(raw_sources) > 20:
                    raise AdvisorGatewayError("advisor web search returned invalid search sources")
                for source in raw_sources:
                    if (
                        not isinstance(source, dict)
                        or set(source) != {"type", "url"}
                        or source.get("type") != "url"
                        or not isinstance(source.get("url"), str)
                        or not _web_action_url_is_allowed(
                            cast(str, source["url"]),
                            candidates,
                            official_sources,
                        )
                    ):
                        raise AdvisorGatewayError("advisor web search used an unapproved source URL")
            completed_search = True
            continue
        if action_type == "open_page":
            if set(action) != {"type", "url"} or not isinstance(action.get("url"), str):
                raise AdvisorGatewayError("advisor web search returned an invalid open_page action")
            if not _web_action_url_is_allowed(cast(str, action["url"]), candidates, official_sources):
                raise AdvisorGatewayError("advisor web search opened an unapproved URL")
            continue
        if action_type == "find_in_page":
            if (
                set(action) != {"type", "url", "pattern"}
                or not isinstance(action.get("url"), str)
                or not isinstance(action.get("pattern"), str)
            ):
                raise AdvisorGatewayError("advisor web search returned an invalid find_in_page action")
            pattern = cast(str, action["pattern"])
            if not pattern or pattern.strip() != pattern or len(pattern) > 200:
                raise AdvisorGatewayError("advisor web search returned an invalid find pattern")
            if not _web_action_url_is_allowed(cast(str, action["url"]), candidates, official_sources):
                raise AdvisorGatewayError("advisor web search inspected an unapproved URL")
            continue
        raise AdvisorGatewayError("advisor web search returned an invalid action")
    if not completed_search:
        raise AdvisorGatewayError("advisor web search returned no approved search action")


def _citation_id(url: str) -> str:
    return f"advisor-{hashlib.sha256(url.encode()).hexdigest()}"


def _annotations_for_summary(
    parts: tuple[tuple[str, tuple[_CitationAnnotation, ...]], ...],
    summary: str | None,
) -> tuple[_CitationAnnotation, ...]:
    if summary is None:
        return ()
    matches: list[tuple[tuple[_CitationAnnotation, ...], int, int]] = []
    encodings = {json.dumps(summary, ensure_ascii=False), json.dumps(summary, ensure_ascii=True)}
    for text, part_annotations in parts:
        for encoded in encodings:
            offset = text.find(encoded)
            while offset >= 0:
                matches.append((part_annotations, offset, offset + len(encoded)))
                offset = text.find(encoded, offset + 1)
    unique_matches = {(id(annotations), start, end) for annotations, start, end in matches}
    if len(unique_matches) != 1:
        return ()
    annotations, start, end = matches[0]
    return tuple(
        annotation
        for annotation in annotations
        if annotation.start_index >= start and annotation.end_index <= end
    )


class DeepSeekAdvisorGateway:
    """Two-step Responses client: strict intent first, bounded official search second."""

    def __init__(
        self,
        *,
        client: httpx.AsyncClient,
        api_key: str,
        model: str,
        base_url: str,
        official_sources: OfficialSourcesRepository,
        timeout_seconds: float = 30.0,
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
        self._official_sources = official_sources
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
                            raise AdvisorGatewayError("advisor provider returned an invalid response length") from exc
                        if declared_length < 0 or declared_length > self._max_response_bytes:
                            raise AdvisorGatewayError("advisor provider response exceeded the size limit")
                    content = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(chunk) > self._max_response_bytes - len(content):
                            raise AdvisorGatewayError("advisor provider response exceeded the size limit")
                        content.extend(chunk)
        except AdvisorGatewayError:
            raise
        except (TimeoutError, httpx.TimeoutException):
            raise AdvisorGatewayError("advisor provider timed out") from None
        except httpx.HTTPStatusError as exc:
            raise AdvisorGatewayError(f"advisor provider returned HTTP status {exc.response.status_code}") from None
        except httpx.RequestError:
            raise AdvisorGatewayError("advisor provider is unavailable") from None
        try:
            return json.loads(content)
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise AdvisorGatewayError("advisor provider returned invalid JSON") from None

    async def parse_need(self, requirement: str) -> ParsedAdvisorNeed:
        body: dict[str, object] = {
            "model": self._model,
            "instructions": _INTENT_INSTRUCTIONS,
            "input": requirement,
            "store": False,
            "max_output_tokens": 512,
            "reasoning": {"effort": "none"},
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "parsed_advisor_need",
                    "schema": _NEED_SCHEMA,
                }
            },
        }
        payload = await self._post(body)
        text = "".join(part for part, _annotations in _output_parts(payload))
        try:
            return ParsedAdvisorNeed.model_validate_json(
                text,
                strict=True,
                by_alias=True,
                by_name=False,
            )
        except ValidationError:
            raise AdvisorGatewayError("advisor provider returned invalid intent output") from None

    def _match_annotation_url(
        self,
        candidate: RankedAdvisorCandidate,
        url: str,
    ) -> OfficialSourceMatch | None:
        if candidate.model.creator_id is not None:
            creator_match = self._official_sources.validate_citation_url(candidate.model.creator_id, url)
            if creator_match is not None:
                return creator_match
        return self._official_sources.validate_aa_citation_url(url)

    async def _resolve_annotation(
        self,
        candidate: RankedAdvisorCandidate,
        annotation: _CitationAnnotation,
    ) -> OfficialSourceMatch | None:
        initial = self._match_annotation_url(candidate, annotation.url)
        if initial is None:
            return None
        current_url = annotation.url
        current_match = initial
        for redirect_count in range(_MAX_CITATION_REDIRECTS + 1):
            try:
                async with self._client.stream(
                    "GET",
                    current_url,
                    headers={"Accept": "*/*", "Accept-Encoding": "identity"},
                    timeout=self._timeout,
                    follow_redirects=False,
                ) as response:
                    status_code = response.status_code
                    location = response.headers.get("location")
            except (httpx.TimeoutException, httpx.RequestError):
                return None
            if 200 <= status_code < 300:
                return current_match
            if (
                status_code not in _REDIRECT_STATUSES
                or redirect_count >= _MAX_CITATION_REDIRECTS
                or location is None
            ):
                return None
            next_url = urljoin(current_url, location)
            next_match = (
                self._official_sources.validate_aa_citation_url(next_url)
                if initial.creator_id is None
                else self._official_sources.validate_citation_url(initial.creator_id, next_url)
            )
            if next_match is None:
                return None
            current_url = next_url
            current_match = next_match
        return None

    def _queries_for_candidate(
        self,
        candidate: RankedAdvisorCandidate,
        checks: tuple[VerificationCheckKind, ...],
        deployment_region: str | None,
    ) -> tuple[str, ...]:
        model = candidate.model
        name = _safe_query_term(_candidate_name(candidate))
        terms = [check.value.replace("_", " ") for check in checks]
        if deployment_region is not None:
            terms.append(f'"{_safe_query_term(deployment_region)}"')
        suffix = " ".join(terms)
        rules = [
            (rule.host, rule.path_prefix)
            for rule in self._official_sources.registry.artificial_analysis
        ]
        if model.creator_id is not None:
            rules.extend(
                (rule.host, rule.path_prefix)
                for rule in self._official_sources.sources_for(model.creator_id)
            )
        queries: list[str] = []
        for host, path_prefix in rules:
            scope = host if path_prefix == "/" else f"{host}{path_prefix.rstrip('/')}"
            queries.append(f'site:{scope} "{name}" {suffix}'.strip())
        return tuple(dict.fromkeys(queries))

    async def verify_candidates(
        self,
        candidates: tuple[RankedAdvisorCandidate, ...],
        *,
        need: ParsedAdvisorNeed,
        deployment_region: str | None,
    ) -> tuple[CandidateVerification, ...]:
        try:
            async with asyncio.timeout(self._timeout_seconds):
                return await self._verify_candidates(
                    candidates,
                    need=need,
                    deployment_region=deployment_region,
                )
        except TimeoutError:
            raise AdvisorGatewayError("advisor verification timed out") from None

    async def _verify_candidates(
        self,
        candidates: tuple[RankedAdvisorCandidate, ...],
        *,
        need: ParsedAdvisorNeed,
        deployment_region: str | None,
    ) -> tuple[CandidateVerification, ...]:
        if not candidates or len(candidates) > 5:
            raise AdvisorGatewayError("advisor verification requires one to five frozen candidates")
        candidate_slots = tuple(candidate.candidate_slot for candidate in candidates)
        if len(candidate_slots) != len(set(candidate_slots)):
            raise AdvisorGatewayError("advisor verification candidate slots must be unique")

        checks = _requested_checks(need, deployment_region)
        queries_by_slot = {
            candidate.candidate_slot: self._queries_for_candidate(candidate, checks, deployment_region)
            for candidate in candidates
        }
        allowed_queries = tuple(query for queries in queries_by_slot.values() for query in queries)
        if not allowed_queries or len(allowed_queries) > 60:
            raise AdvisorGatewayError("advisor verification query set is unavailable or too large")
        search_input = {
            "candidates": [
                {
                    "candidateSlot": candidate.candidate_slot,
                    "modelName": _safe_query_term(_candidate_name(candidate)),
                    "creatorName": (
                        None
                        if candidate.model.creator_name is None
                        else _safe_query_term(candidate.model.creator_name)
                    ),
                    "requiredChecks": [check.value for check in checks],
                    "allowedQueries": list(queries_by_slot[candidate.candidate_slot]),
                }
                for candidate in candidates
            ]
        }
        body: dict[str, object] = {
            "model": self._model,
            "instructions": _SEARCH_INSTRUCTIONS,
            "input": json.dumps(search_input, ensure_ascii=False, separators=(",", ":")),
            "store": False,
            "max_output_tokens": 8_192,
            "reasoning": {"effort": "none"},
            "tools": [{"type": "web_search"}],
            "tool_choice": {"type": "web_search"},
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "advisor_candidate_verification",
                    "schema": _SEARCH_SCHEMA,
                }
            },
        }
        payload = await self._post(body)
        _validate_web_actions(
            payload,
            candidates=candidates,
            allowed_queries=allowed_queries,
            official_sources=self._official_sources,
        )
        parts = _output_parts(payload)
        text = "".join(part for part, _annotations in parts)
        try:
            parsed = _SearchOutput.model_validate_json(
                text,
                strict=True,
                by_alias=True,
                by_name=False,
            )
        except ValidationError:
            raise AdvisorGatewayError("advisor provider returned invalid verification output") from None

        requested_slots = set(candidate_slots)
        if any(result.candidate_slot not in requested_slots for result in parsed.candidates):
            raise AdvisorGatewayError("advisor provider returned an unknown candidate slot")
        results_by_slot = {result.candidate_slot: result for result in parsed.candidates}
        verifications: list[CandidateVerification] = []
        resolved_annotations: dict[tuple[int, str], OfficialSourceMatch | None] = {}
        for candidate in candidates:
            accepted: dict[str, OfficialCitation] = {}
            result = results_by_slot.get(candidate.candidate_slot)
            result_checks = {} if result is None else {check.check: check for check in result.checks}
            if any(kind not in checks for kind in result_checks):
                raise AdvisorGatewayError("advisor provider returned an unrequested evidence check")
            evidence_checks: list[CandidateEvidenceCheck] = []
            used_citations: set[str] = set()
            for kind in checks:
                raw_check = result_checks.get(kind)
                if raw_check is None:
                    evidence_checks.append(CandidateEvidenceCheck(check=kind, verdict=EvidenceVerdict.UNVERIFIED))
                    continue
                check_citations: list[str] = []
                for annotation in _annotations_for_summary(parts, raw_check.summary):
                    cache_key = (candidate.candidate_slot, annotation.url)
                    if cache_key not in resolved_annotations:
                        resolved_annotations[cache_key] = await self._resolve_annotation(candidate, annotation)
                    match = resolved_annotations[cache_key]
                    if match is None:
                        continue
                    citation_id = _citation_id(match.url)
                    title = " ".join(annotation.title.split())[:500] or match.host
                    accepted[citation_id] = OfficialCitation(
                        citation_id=citation_id,
                        title=title,
                        url=match.url,
                        source_kind=match.source_kind,
                        creator_id=match.creator_id,
                    )
                    check_citations.append(citation_id)
                citation_ids = tuple(dict.fromkeys(check_citations))
                verdict = raw_check.verdict
                if verdict != EvidenceVerdict.UNVERIFIED and not citation_ids:
                    verdict = EvidenceVerdict.UNVERIFIED
                if citation_ids:
                    used_citations.update(citation_ids)
                evidence_checks.append(
                    CandidateEvidenceCheck(
                        check=kind,
                        verdict=verdict,
                        summary=raw_check.summary,
                        citation_ids=citation_ids,
                    )
                )
            verifications.append(
                CandidateVerification(
                    candidate_slot=candidate.candidate_slot,
                    checks=tuple(evidence_checks),
                    citations=tuple(accepted[citation_id] for citation_id in accepted if citation_id in used_citations),
                )
            )
        return tuple(verifications)
