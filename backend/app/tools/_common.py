"""Shared constructors for the stable tool result envelope."""

from __future__ import annotations

from datetime import date, datetime
from typing import TypeVar

from app.domain.errors import ErrorDetailValue, ToolError, ToolErrorCode, ToolName, ToolResult
from app.domain.models import Citation

ResultT = TypeVar("ResultT")


def success_result(  # noqa: UP047 -- mypy 1.11 does not support PEP 695 generic functions
    data: ResultT,
    *,
    citations: tuple[Citation, ...] = (),
    observed_at: date | datetime | None = None,
) -> ToolResult[ResultT]:
    return ToolResult[ResultT](
        ok=True,
        data=data,
        citations=citations,
        observed_at=observed_at,
    )


def failure_result(  # noqa: UP047 -- mypy 1.11 does not support PEP 695 generic functions
    tool: ToolName,
    code: ToolErrorCode,
    message: str,
    *,
    details: dict[str, ErrorDetailValue] | None = None,
    data: ResultT | None = None,
    citations: tuple[Citation, ...] = (),
    observed_at: date | datetime | None = None,
    retryable: bool = False,
) -> ToolResult[ResultT]:
    return ToolResult[ResultT](
        ok=False,
        data=data,
        error=ToolError(
            code=code,
            message=message,
            tool=tool,
            retryable=retryable,
            details=details or {},
        ),
        citations=citations,
        observed_at=observed_at,
    )
