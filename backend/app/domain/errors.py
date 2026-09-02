"""Structured, user-safe tool result and error contracts."""

from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Generic, TypeVar

from pydantic import Field, StringConstraints, model_validator

from app.domain.models import Citation, NonEmptyString, StrictModel


class ToolName(StrEnum):
    LIST_MODELS = "list_models"
    GET_MODEL_BENCHMARKS = "get_model_benchmarks"
    GET_MODEL_PRICING = "get_model_pricing"
    SEARCH_PROVIDER_DOCS = "search_provider_docs"
    PREPARE_DATA_UPDATE = "prepare_data_update"


class ToolErrorCode(StrEnum):
    INVALID_ARGUMENTS = "invalid_arguments"
    UNKNOWN_MODEL = "unknown_model"
    MISSING_EVIDENCE = "missing_evidence"
    STALE_EVIDENCE = "stale_evidence"
    AMBIGUOUS_VERSION = "ambiguous_version"
    CONFLICTING_EVIDENCE = "conflicting_evidence"
    SOURCE_NOT_ALLOWLISTED = "source_not_allowlisted"
    UPSTREAM_TIMEOUT = "upstream_timeout"
    UPSTREAM_UNAVAILABLE = "upstream_unavailable"
    APPROVAL_REQUIRED = "approval_required"
    INTERNAL_ERROR = "internal_error"


ErrorDetailKey = Annotated[str, StringConstraints(min_length=1, max_length=64)]
ErrorDetailText = Annotated[str, StringConstraints(max_length=500)]
ErrorDetailList = Annotated[tuple[ErrorDetailText, ...], Field(max_length=20)]
ErrorDetailNumber = Annotated[float, Field(allow_inf_nan=False)]
ErrorDetailValue = ErrorDetailText | int | ErrorDetailNumber | bool | None | ErrorDetailList


class ToolError(StrictModel):
    code: ToolErrorCode
    message: Annotated[NonEmptyString, StringConstraints(max_length=500)]
    tool: ToolName
    retryable: bool = False
    details: dict[ErrorDetailKey, ErrorDetailValue] = Field(default_factory=dict, max_length=12)

    @model_validator(mode="after")
    def validate_retryability(self) -> ToolError:
        retryable_codes = {ToolErrorCode.UPSTREAM_TIMEOUT, ToolErrorCode.UPSTREAM_UNAVAILABLE}
        if self.retryable and self.code not in retryable_codes:
            raise ValueError("only upstream timeout/unavailable errors may be retryable")
        return self


ResultT = TypeVar("ResultT", covariant=True)


class ToolResult(StrictModel, Generic[ResultT]):  # noqa: UP046 - mypy stable lacks PEP 695 generic support
    ok: bool
    data: ResultT | None = None
    error: ToolError | None = None
    citations: tuple[Citation, ...] = ()
    observed_at: date | datetime | None = None

    @model_validator(mode="after")
    def validate_result_shape(self) -> ToolResult[ResultT]:
        if self.ok:
            if self.data is None:
                raise ValueError("successful tool results require data")
            if self.error is not None:
                raise ValueError("successful tool results cannot include an error")
        elif self.error is None:
            raise ValueError("failed tool results require an error")
        return self


class RepositoryDataError(ValueError):
    """Raised at startup when committed generated data violates its contract."""


class RepositoryLookupError(LookupError):
    """Raised when a caller requests an unknown exact internal model ID."""
