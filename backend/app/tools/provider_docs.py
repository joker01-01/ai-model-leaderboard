"""Bounded provider-document lookup over repository-owned source URLs."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Protocol

from app.domain.errors import RepositoryLookupError, ToolErrorCode, ToolName, ToolResult
from app.domain.models import (
    Citation,
    DocumentMatch,
    ProviderSourceAttempt,
    SearchProviderDocsData,
    SearchProviderDocsInput,
    SourceAttemptStatus,
)
from app.repositories.leaderboard import LeaderboardRepository
from app.tools._common import failure_result, success_result

_MAX_REDIRECTS = 3
_MAX_EXCERPT_LENGTH = 320


@dataclass(frozen=True, slots=True)
class ProviderDocumentResponse:
    status_code: int
    text: str = ""
    redirect_url: str | None = None


class ProviderDocumentClient(Protocol):
    async def get(self, url: str) -> ProviderDocumentResponse: ...


def _plain_text(document: str) -> str:
    without_tags = re.sub(r"<[^>]+>", " ", document)
    return " ".join(without_tags.split())


def _match_position(text: str, query: str) -> int | None:
    folded_text = text.casefold()
    folded_query = " ".join(query.casefold().split())
    phrase_position = folded_text.find(folded_query)
    if phrase_position >= 0 and folded_query in _excerpt(text, phrase_position).casefold():
        return phrase_position
    terms = tuple(dict.fromkeys(term for term in re.findall(r"\w+", folded_query, flags=re.UNICODE) if term))
    if not terms or any(term not in folded_text for term in terms):
        return None
    candidate_positions = sorted(
        {
            match.start()
            for term in terms
            for match in re.finditer(re.escape(term), folded_text)
        }
    )
    for position in candidate_positions:
        candidate_excerpt = _excerpt(text, position).casefold()
        if all(term in candidate_excerpt for term in terms):
            return position
    return None


def _excerpt(text: str, match_position: int) -> str:
    half_window = _MAX_EXCERPT_LENGTH // 2
    start = max(0, match_position - half_window)
    end = min(len(text), start + _MAX_EXCERPT_LENGTH)
    start = max(0, end - _MAX_EXCERPT_LENGTH)
    excerpt = text[start:end].strip()
    if start:
        excerpt = f"…{excerpt}"
    if end < len(text):
        excerpt = f"{excerpt}…"
    return excerpt


async def _fetch_allowlisted(
    initial_url: str,
    *,
    allowlisted_urls: frozenset[str],
    client: ProviderDocumentClient,
) -> tuple[ProviderDocumentResponse | None, SourceAttemptStatus | None, str | None]:
    url = initial_url
    visited: set[str] = set()
    for _ in range(_MAX_REDIRECTS + 1):
        if url not in allowlisted_urls:
            return None, SourceAttemptStatus.SOURCE_NOT_ALLOWLISTED, "redirect_target_not_allowlisted"
        if url in visited:
            return None, SourceAttemptStatus.UNAVAILABLE, "redirect_loop"
        visited.add(url)
        try:
            response = await client.get(url)
        except TimeoutError:
            return None, SourceAttemptStatus.TIMEOUT, "upstream_timeout"
        except OSError:
            return None, SourceAttemptStatus.UNAVAILABLE, "upstream_unavailable"
        if response.redirect_url is None:
            return response, None, None
        url = response.redirect_url
    return None, SourceAttemptStatus.UNAVAILABLE, "too_many_redirects"


def _citation(match: DocumentMatch) -> Citation:
    source_digest = hashlib.sha256(match.url.encode("utf-8")).hexdigest()[:12]
    return Citation(
        citation_id=(
            f"provider-doc:{match.model_id}:{match.provider_id.value}:{match.kind.value}:{source_digest}"
        ),
        title=match.title,
        url=match.url,
        observed_at=match.observed_at,
        excerpt=match.excerpt,
        provider_id=match.provider_id,
        provider_model_id=match.provider_model_id,
        kind=match.kind,
    )


async def search_provider_docs(
    request: SearchProviderDocsInput,
    *,
    repository: LeaderboardRepository,
    client: ProviderDocumentClient,
) -> ToolResult[SearchProviderDocsData]:
    """Search only approved repository sources; callers cannot supply a URL."""

    try:
        sources = repository.get_provider_sources(request.model_id, request.doc_kinds)
    except RepositoryLookupError as exc:
        return failure_result(
            ToolName.SEARCH_PROVIDER_DOCS,
            ToolErrorCode.UNKNOWN_MODEL,
            str(exc),
            details={"modelId": request.model_id},
        )

    ordered_sources = tuple(sorted(sources, key=lambda item: (item.url, item.kind.value, item.provider_id.value)))
    allowlisted_urls = frozenset(source.url for source in ordered_sources)
    matches: list[DocumentMatch] = []
    attempts: list[ProviderSourceAttempt] = []
    for source in ordered_sources:
        response, failure_status, reason = await _fetch_allowlisted(
            source.url,
            allowlisted_urls=allowlisted_urls,
            client=client,
        )
        if failure_status is not None:
            attempts.append(ProviderSourceAttempt(url=source.url, status=failure_status, reason=reason))
            continue
        if response is None or response.status_code != 200:
            status_code = None if response is None else response.status_code
            attempts.append(
                ProviderSourceAttempt(
                    url=source.url,
                    status=SourceAttemptStatus.UNAVAILABLE,
                    reason="upstream_unavailable" if status_code is None else f"http_status_{status_code}",
                )
            )
            continue
        text = _plain_text(response.text)
        if not text:
            attempts.append(
                ProviderSourceAttempt(
                    url=source.url,
                    status=SourceAttemptStatus.PARSE_FAILED,
                    reason="document_parse_failed",
                )
            )
            continue
        position = _match_position(text, request.query)
        if position is None:
            attempts.append(ProviderSourceAttempt(url=source.url, status=SourceAttemptStatus.NO_MATCH))
            continue
        match = DocumentMatch(
            model_id=source.model_id,
            provider_id=source.provider_id,
            provider_model_id=source.provider_model_id,
            kind=source.kind,
            title=source.title,
            url=source.url,
            observed_at=source.observed_at,
            excerpt=_excerpt(text, position),
        )
        matches.append(match)
        attempts.append(ProviderSourceAttempt(url=source.url, status=SourceAttemptStatus.MATCHED))

    data = SearchProviderDocsData(
        model_id=request.model_id,
        matches=tuple(matches),
        source_attempts=tuple(attempts),
    )
    citations = tuple(_citation(match) for match in matches)
    observed_at = max((source.observed_at for source in ordered_sources), default=None)
    if matches:
        return success_result(data, citations=citations, observed_at=observed_at)

    statuses = {attempt.status for attempt in attempts}
    if SourceAttemptStatus.SOURCE_NOT_ALLOWLISTED in statuses:
        return failure_result(
            ToolName.SEARCH_PROVIDER_DOCS,
            ToolErrorCode.SOURCE_NOT_ALLOWLISTED,
            "A provider document redirected outside the approved source allowlist.",
            details={"reason": "redirect_target_not_allowlisted"},
            data=data,
            observed_at=observed_at,
        )
    if SourceAttemptStatus.TIMEOUT in statuses:
        return failure_result(
            ToolName.SEARCH_PROVIDER_DOCS,
            ToolErrorCode.UPSTREAM_TIMEOUT,
            "All usable provider-document evidence was unavailable after an upstream timeout.",
            details={"reason": "upstream_timeout"},
            data=data,
            observed_at=observed_at,
            retryable=True,
        )
    if SourceAttemptStatus.UNAVAILABLE in statuses or SourceAttemptStatus.PARSE_FAILED in statuses:
        return failure_result(
            ToolName.SEARCH_PROVIDER_DOCS,
            ToolErrorCode.UPSTREAM_UNAVAILABLE,
            "All usable provider-document evidence was unavailable or could not be parsed.",
            details={"reason": "document_unavailable"},
            data=data,
            observed_at=observed_at,
            retryable=True,
        )
    return failure_result(
        ToolName.SEARCH_PROVIDER_DOCS,
        ToolErrorCode.MISSING_EVIDENCE,
        "No approved provider document matched the query.",
        details={"reason": "no_doc_match"},
        data=data,
        observed_at=observed_at,
    )
