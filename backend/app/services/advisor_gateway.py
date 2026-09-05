"""Injected intent and official-web verification boundary for the public advisor."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

from app.domain.advisor import CandidateVerification, ParsedAdvisorNeed, RankedAdvisorCandidate


class AdvisorGatewayError(RuntimeError):
    """Safe provider failure that callers convert to deterministic AA-only output."""


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
        raise AdvisorGatewayError("advisor provider is unavailable")

    async def verify_candidates(
        self,
        _candidates: tuple[RankedAdvisorCandidate, ...],
        *,
        need: ParsedAdvisorNeed,
        deployment_region: str | None,
    ) -> tuple[CandidateVerification, ...]:
        del need, deployment_region
        raise AdvisorGatewayError("advisor provider is unavailable")
