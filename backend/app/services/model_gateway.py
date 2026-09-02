"""Model-intent extraction boundary and deterministic test implementation."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Protocol

from pydantic import Field, field_validator, model_validator

from app.domain.models import (
    AgentIntent,
    AgentRequest,
    NonEmptyString,
    PrepareDataUpdateInput,
    SelectionConstraints,
    StrictModel,
)


class ParsedAgentRequest(StrictModel):
    """The only structured output the graph accepts from a model gateway."""

    intent: AgentIntent
    constraints: SelectionConstraints = Field(default_factory=SelectionConstraints)
    model_reference: NonEmptyString | None = None
    update_input: PrepareDataUpdateInput | None = None
    missing_constraints: tuple[NonEmptyString, ...] = ()

    @field_validator("missing_constraints")
    @classmethod
    def validate_unique_missing_constraints(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if len(value) != len(set(value)):
            raise ValueError("missingConstraints must not contain duplicates")
        return value

    @model_validator(mode="after")
    def validate_intent_payload(self) -> ParsedAgentRequest:
        if self.intent != AgentIntent.PREPARE_UPDATE and self.update_input is not None:
            raise ValueError("updateInput is only valid for prepare_update")
        if (
            self.intent == AgentIntent.EXPLAIN_UNRANKED
            and self.model_reference is None
            and "model_reference" not in self.missing_constraints
        ):
            raise ValueError("explain_unranked requires modelReference or a model_reference clarification")
        if (
            self.intent == AgentIntent.PREPARE_UPDATE
            and self.update_input is None
            and "update_input" not in self.missing_constraints
        ):
            raise ValueError("prepare_update requires updateInput or an update_input clarification")
        return self


class ModelGatewayError(RuntimeError):
    """A safe failure raised when no structured model output can be produced."""


class ModelGateway(Protocol):
    """Asynchronous interface implemented by real and deterministic gateways."""

    async def parse_request(self, request: AgentRequest) -> ParsedAgentRequest:
        """Extract bounded intent and constraints from one user request."""


class FakeModelGateway:
    """Exact-message gateway used by unit tests and offline evaluations."""

    def __init__(
        self,
        responses: Mapping[str, ParsedAgentRequest | ModelGatewayError],
    ) -> None:
        self._responses = dict(responses)
        self.calls: list[AgentRequest] = []

    async def parse_request(self, request: AgentRequest) -> ParsedAgentRequest:
        self.calls.append(request)
        response = self._responses.get(request.message)
        if response is None:
            raise ModelGatewayError("no deterministic gateway response is registered for this request")
        if isinstance(response, ModelGatewayError):
            raise response
        return response
