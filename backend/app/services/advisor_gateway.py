"""Injected intent and official-web verification boundary for the public advisor."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Protocol

from app.domain.advisor import CandidateVerification, ParsedAdvisorNeed, RankedAdvisorCandidate


class AdvisorGatewayFailureKind(StrEnum):
    """Stable non-sensitive categories suitable for operational logs."""

    UNKNOWN = "unknown"
    TIMEOUT = "timeout"
    PROVIDER_HTTP = "provider_http"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    PROVIDER_WIRE = "provider_wire"


class AdvisorGatewayError(RuntimeError):
    """Safe provider failure that callers convert to deterministic AA-only output."""

    def __init__(
        self,
        message: str,
        *,
        failure_kind: AdvisorGatewayFailureKind = AdvisorGatewayFailureKind.UNKNOWN,
    ) -> None:
        super().__init__(message)
        self.failure_kind = failure_kind


class AdvisorGateway(Protocol):
    async def parse_need(self, requirement: str) -> ParsedAdvisorNeed:
        """Extract only the locally validated bounded need contract."""

    async def verify_candidates(
        self,
        candidates: tuple[RankedAdvisorCandidate, ...],
        *,
        need: ParsedAdvisorNeed,
        deployment_region: str | None,
    ) -> tuple[CandidateVerification, ...]:
        """Verify only the frozen deterministic candidate pool."""


@dataclass(frozen=True, slots=True)
class AdvisorVerificationCall:
    candidates: tuple[RankedAdvisorCandidate, ...]
    need: ParsedAdvisorNeed
    deployment_region: str | None


class FakeAdvisorGateway:
    """Deterministic gateway used by offline unit, API, and evaluation tests."""

    def __init__(
        self,
        *,
        parsed_needs: Mapping[str, ParsedAdvisorNeed | AdvisorGatewayError],
        verification: tuple[CandidateVerification, ...] | AdvisorGatewayError = (),
    ) -> None:
        self._parsed_needs = dict(parsed_needs)
        self._verification = verification
        self.parse_calls: list[str] = []
        self.verification_calls: list[AdvisorVerificationCall] = []

    async def parse_need(self, requirement: str) -> ParsedAdvisorNeed:
        self.parse_calls.append(requirement)
        result = self._parsed_needs.get(requirement)
        if result is None:
            raise AdvisorGatewayError("no deterministic advisor need is registered")
        if isinstance(result, AdvisorGatewayError):
            raise result
        return result

    async def verify_candidates(
        self,
        candidates: tuple[RankedAdvisorCandidate, ...],
        *,
        need: ParsedAdvisorNeed,
        deployment_region: str | None,
    ) -> tuple[CandidateVerification, ...]:
        self.verification_calls.append(
            AdvisorVerificationCall(
                candidates=candidates,
                need=need,
                deployment_region=deployment_region,
            )
        )
        if isinstance(self._verification, AdvisorGatewayError):
            raise self._verification
        return self._verification


class UnavailableAdvisorGateway:
    """Offline provider boundary used when no server-side key is configured."""

    async def parse_need(self, _requirement: str) -> ParsedAdvisorNeed:
        raise AdvisorGatewayError(
            "advisor provider is unavailable",
            failure_kind=AdvisorGatewayFailureKind.PROVIDER_UNAVAILABLE,
        )

    async def verify_candidates(
        self,
        _candidates: tuple[RankedAdvisorCandidate, ...],
        *,
        need: ParsedAdvisorNeed,
        deployment_region: str | None,
    ) -> tuple[CandidateVerification, ...]:
        del need, deployment_region
        raise AdvisorGatewayError(
            "advisor provider is unavailable",
            failure_kind=AdvisorGatewayFailureKind.PROVIDER_UNAVAILABLE,
        )
