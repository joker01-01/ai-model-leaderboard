"""Strict request, response, and safe-error contracts for the Agent API."""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints

from app.domain.models import AgentRequest, NonEmptyString, StrictModel
from app.graph.state import AgentAnswer


def _validate_clean_text(value: str) -> str:
    if value.strip() != value:
        raise ValueError("surrounding whitespace is not allowed")
    return value


class ApiRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)


class AgentQueryRequest(ApiRequestModel):
    message: Annotated[
        str,
        StringConstraints(min_length=1, max_length=10_000),
        AfterValidator(_validate_clean_text),
    ]
    session_id: Annotated[
        str,
        StringConstraints(min_length=1, max_length=128),
        AfterValidator(_validate_clean_text),
    ] | None = None

    def to_domain(self) -> AgentRequest:
        return AgentRequest(message=self.message, session_id=self.session_id)


class HealthResponse(StrictModel):
    status: Literal["ok", "unavailable"]


class AgentInvokeResponse(StrictModel):
    run_id: NonEmptyString
    trace_id: NonEmptyString
    answer: AgentAnswer


class ApiErrorCode(StrEnum):
    INVALID_REQUEST = "invalid_request"
    SERVICE_UNAVAILABLE = "service_unavailable"
    INTERNAL_ERROR = "internal_error"


class ApiError(StrictModel):
    code: ApiErrorCode
    message: NonEmptyString
    retryable: bool = False


class ApiErrorResponse(StrictModel):
    error: ApiError


class ApiBoundaryError(RuntimeError):
    def __init__(
        self,
        *,
        status_code: int,
        code: ApiErrorCode,
        message: str,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error = ApiError(code=code, message=message, retryable=retryable)
