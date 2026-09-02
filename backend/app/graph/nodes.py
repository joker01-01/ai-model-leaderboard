"""Thin orchestration nodes for the bounded ModelOps workflow."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterable
from functools import partial
from typing import TypeVar

from langgraph.runtime import Runtime
from pydantic import ValidationError

from app.domain.errors import ToolError, ToolErrorCode, ToolName, ToolResult
from app.domain.models import (
    AgentIntent,
    BenchmarkId,
    DocumentMatch,
    EvidenceGap,
    ExactResolutionStatus,
    GetModelBenchmarksInput,
    GetModelPricingInput,
    LicensePolicy,
    ListModelsInput,
    ModelBenchmarksData,
    ModelEvidence,
    ModelPricingData,
    ModelTask,
    PricingQuote,
    ProviderSourceKind,
    RecommendationExclusion,
    RunStatus,
    SearchProviderDocsInput,
    SelectionConstraints,
)
from app.graph.state import AgentAnswer, AgentState, GraphContext, GraphIssue, ToolCallRecord
from app.services.model_gateway import ModelGatewayError, ParsedAgentRequest

_UNRECOVERABLE_TOOL_CODES = {
    ToolErrorCode.INTERNAL_ERROR,
}

ResultT = TypeVar("ResultT")


async def _safe_tool_call(  # noqa: UP047 - mypy needs the legacy syntax for now.
    tool: ToolName,
    operation: Callable[[], Awaitable[ToolResult[ResultT]]],
) -> ToolResult[ResultT]:
    try:
        return await operation()
    except Exception:
        return ToolResult[ResultT](
            ok=False,
            error=ToolError(
                code=ToolErrorCode.INTERNAL_ERROR,
                message=f"{tool.value} failed before producing a structured result.",
                tool=tool,
                details={"reason": "unexpected_tool_exception"},
            ),
        )


def _required_missing_constraints(parsed: ParsedAgentRequest) -> tuple[str, ...]:
    missing = set(parsed.missing_constraints)
    constraints = parsed.constraints
    if parsed.intent == AgentIntent.RECOMMEND:
        if constraints.task is None:
            missing.add("task")
        pricing_fields = {
            "currency": constraints.currency,
            "provider_region_id": constraints.provider_region_id,
            "input_tokens": constraints.input_tokens,
            "cached_input_tokens": constraints.cached_input_tokens,
            "output_tokens": constraints.output_tokens,
            "monthly_request_count": constraints.monthly_request_count,
            "as_of": constraints.as_of,
        }
        if constraints.monthly_budget is not None:
            missing.update(name for name, value in pricing_fields.items() if value is None)
    elif parsed.intent == AgentIntent.EXPLAIN_UNRANKED and parsed.model_reference is None:
        missing.add("model_reference")
    elif parsed.intent == AgentIntent.PREPARE_UPDATE and parsed.update_input is None:
        missing.add("update_input")
    return tuple(sorted(missing))


async def parse_request(state: AgentState, runtime: Runtime[GraphContext]) -> dict[str, object]:
    try:
        parsed = await runtime.context.gateway.parse_request(state["request"])
    except ModelGatewayError as exc:
        return {
            "status": RunStatus.FAILED,
            "answer_message": "无法生成受控的结构化请求。",
            "issues": (GraphIssue(code="model_gateway_error", message=str(exc), retryable=False),),
        }
    except Exception:
        return {
            "status": RunStatus.FAILED,
            "answer_message": "无法生成受控的结构化请求。",
            "issues": (
                GraphIssue(
                    code="model_gateway_internal_error",
                    message="Model gateway failed before producing structured output.",
                    retryable=False,
                ),
            ),
        }

    update: dict[str, object] = {
        "parsed": parsed,
        "intent": parsed.intent,
        "constraints": parsed.constraints,
        "missing_constraints": _required_missing_constraints(parsed),
    }
    if parsed.update_input is not None:
        update["update_input"] = parsed.update_input
    return update


def clarify(state: AgentState) -> dict[str, object]:
    fields = state.get("missing_constraints", ())
    return {
        "status": RunStatus.NEEDS_CLARIFICATION,
        "answer_message": f"需要补充这些会改变结论的请求约束：{', '.join(fields)}。",
    }


def route_intent(state: AgentState) -> AgentState:
    return {"intent": state["intent"]}


def _tool_failure_update(
    result: ToolResult[object],
    *,
    model_id: str | None = None,
) -> dict[str, object]:
    error = result.error
    if error is None:
        issue = GraphIssue(code="invalid_tool_result", message="工具失败但没有结构化错误。")
        return {
            "status": RunStatus.FAILED,
            "issues": (issue,),
        }
    failed = error.code in _UNRECOVERABLE_TOOL_CODES
    return {
        "status": RunStatus.FAILED if failed else RunStatus.COMPLETED,
        "answer_message": error.message,
        "tool_errors": (error,),
        "tool_records": (
            ToolCallRecord(
                tool=error.tool,
                ok=False,
                model_id=model_id,
                error_code=error.code.value,
            ),
        ),
    }


async def load_candidates(state: AgentState, runtime: Runtime[GraphContext]) -> dict[str, object]:
    constraints = state["constraints"]
    request = ListModelsInput(
        task=constraints.task or ModelTask.PYTHON_CODING,
        provider_region_id=constraints.provider_region_id,
        currency=constraints.currency,
        open_weights_required=constraints.open_weights_required,
        license_policy=constraints.license_policy,
    )
    result = await _safe_tool_call(
        ToolName.LIST_MODELS,
        lambda: runtime.context.tools.list_models(request),
    )
    if not result.ok or result.data is None:
        return _tool_failure_update(result)

    candidate_ids = tuple(candidate.model_id for candidate in result.data.candidates)
    if not candidate_ids:
        return {
            "candidate_model_ids": (),
            "filter_decisions": result.data.filter_decisions,
            "tool_records": (ToolCallRecord(tool=ToolName.LIST_MODELS, ok=True),),
        }
    return {
        "candidate_model_ids": candidate_ids,
        "filter_decisions": result.data.filter_decisions,
        "tool_records": (ToolCallRecord(tool=ToolName.LIST_MODELS, ok=True),),
    }


def _gap_from_error(error: ToolError) -> EvidenceGap:
    return EvidenceGap(code=error.code.value, message=error.message, field=error.tool.value)


def _append_result_error(
    result: ToolResult[object],
    *,
    model_id: str,
    errors: list[ToolError],
    records: list[ToolCallRecord],
    gaps: list[EvidenceGap],
) -> None:
    if result.ok:
        records.append(ToolCallRecord(tool=_tool_name_for_result(result), ok=True, model_id=model_id))
        return
    if result.error is not None:
        errors.append(result.error)
        records.append(
            ToolCallRecord(
                tool=result.error.tool,
                ok=False,
                model_id=model_id,
                error_code=result.error.code.value,
            )
        )
        gaps.append(_gap_from_error(result.error))


def _tool_name_for_result(result: ToolResult[object]) -> ToolName:
    data = result.data
    if isinstance(data, ModelBenchmarksData):
        return ToolName.GET_MODEL_BENCHMARKS
    if isinstance(data, ModelPricingData):
        return ToolName.GET_MODEL_PRICING
    return ToolName.SEARCH_PROVIDER_DOCS


def _internal_collection_failure(
    result: ToolResult[object],
    *,
    model_id: str,
    evidence: dict[str, ModelEvidence],
    errors: list[ToolError],
    records: list[ToolCallRecord],
) -> dict[str, object]:
    error = result.error
    assert error is not None and error.code == ToolErrorCode.INTERNAL_ERROR
    return {
        "status": RunStatus.FAILED,
        "answer_message": error.message,
        "evidence": evidence,
        "tool_errors": (*errors, error),
        "tool_records": (
            *records,
            ToolCallRecord(
                tool=error.tool,
                ok=False,
                model_id=model_id,
                error_code=error.code.value,
            ),
        ),
    }


async def collect_evidence(state: AgentState, runtime: Runtime[GraphContext]) -> dict[str, object]:
    constraints = state["constraints"]
    evidence: dict[str, ModelEvidence] = {}
    errors: list[ToolError] = []
    records: list[ToolCallRecord] = []

    for model_id in state.get("candidate_model_ids", ()):
        gaps: list[EvidenceGap] = []
        benchmark_request = GetModelBenchmarksInput(
            model_id=model_id,
            benchmark_ids=(BenchmarkId.AA_CODING, BenchmarkId.AA_INTELLIGENCE),
        )
        benchmark_result = await _safe_tool_call(
            ToolName.GET_MODEL_BENCHMARKS,
            partial(runtime.context.tools.get_model_benchmarks, benchmark_request),
        )
        if _is_internal_failure(benchmark_result):
            return _internal_collection_failure(
                benchmark_result,
                model_id=model_id,
                evidence=evidence,
                errors=errors,
                records=records,
            )
        _append_result_error(
            benchmark_result,
            model_id=model_id,
            errors=errors,
            records=records,
            gaps=gaps,
        )
        benchmarks = benchmark_result.data.observations if benchmark_result.ok and benchmark_result.data else ()
        evidence[model_id] = ModelEvidence(
            model_id=model_id,
            benchmarks=benchmarks,
            gaps=tuple(gaps),
        )

        pricing: tuple[PricingQuote, ...] = ()
        if constraints.monthly_budget is not None:
            pricing_result = await _safe_tool_call(
                ToolName.GET_MODEL_PRICING,
                partial(_request_pricing, runtime.context, model_id, constraints),
            )
            if _is_internal_failure(pricing_result):
                return _internal_collection_failure(
                    pricing_result,
                    model_id=model_id,
                    evidence=evidence,
                    errors=errors,
                    records=records,
                )
            _append_result_error(
                pricing_result,
                model_id=model_id,
                errors=errors,
                records=records,
                gaps=gaps,
            )
            if pricing_result.data is not None:
                pricing = pricing_result.data.quotes
        evidence[model_id] = ModelEvidence(
            model_id=model_id,
            benchmarks=benchmarks,
            pricing=pricing,
            gaps=tuple(gaps),
        )

        documents: tuple[DocumentMatch, ...] = ()
        if constraints.license_policy == LicensePolicy.OFFICIAL_LICENSE_EVIDENCE:
            docs_request = SearchProviderDocsInput(
                model_id=model_id,
                query="license",
                doc_kinds=(ProviderSourceKind.LICENSE,),
            )
            docs_result = await _safe_tool_call(
                ToolName.SEARCH_PROVIDER_DOCS,
                partial(runtime.context.tools.search_provider_docs, docs_request),
            )
            if _is_internal_failure(docs_result):
                return _internal_collection_failure(
                    docs_result,
                    model_id=model_id,
                    evidence=evidence,
                    errors=errors,
                    records=records,
                )
            _append_result_error(
                docs_result,
                model_id=model_id,
                errors=errors,
                records=records,
                gaps=gaps,
            )
            if docs_result.data is not None:
                documents = docs_result.data.matches

        evidence[model_id] = ModelEvidence(
            model_id=model_id,
            benchmarks=benchmarks,
            pricing=pricing,
            documents=documents,
            gaps=tuple(gaps),
        )

    return {
        "evidence": evidence,
        "tool_errors": tuple(errors),
        "tool_records": tuple(records),
    }


def _is_internal_failure(result: ToolResult[object]) -> bool:
    return not result.ok and result.error is not None and result.error.code == ToolErrorCode.INTERNAL_ERROR


def _pricing_input(model_id: str, constraints: SelectionConstraints) -> GetModelPricingInput:
    assert constraints.provider_region_id is not None
    assert constraints.currency is not None
    assert constraints.input_tokens is not None
    assert constraints.cached_input_tokens is not None
    assert constraints.output_tokens is not None
    assert constraints.monthly_request_count is not None
    assert constraints.as_of is not None
    return GetModelPricingInput(
        model_id=model_id,
        region_id=constraints.provider_region_id,
        currency=constraints.currency,
        input_tokens=constraints.input_tokens,
        cached_input_tokens=constraints.cached_input_tokens,
        output_tokens=constraints.output_tokens,
        monthly_request_count=constraints.monthly_request_count,
        as_of=constraints.as_of,
    )


async def _request_pricing(
    context: GraphContext,
    model_id: str,
    constraints: SelectionConstraints,
) -> ToolResult[ModelPricingData]:
    try:
        request = _pricing_input(model_id, constraints)
    except ValidationError:
        return ToolResult[ModelPricingData](
            ok=False,
            error=ToolError(
                code=ToolErrorCode.INVALID_ARGUMENTS,
                message="get_model_pricing request did not satisfy its input schema.",
                tool=ToolName.GET_MODEL_PRICING,
                details={"reason": "request_validation_failed"},
            ),
        )
    return await context.tools.get_model_pricing(request)


def verify_evidence(state: AgentState, runtime: Runtime[GraphContext]) -> dict[str, object]:
    recommendation = runtime.context.verifier.recommend(state["constraints"], state.get("evidence", {}))
    exclusions_by_model: dict[str, list[str]] = {}
    for decision in state.get("filter_decisions", ()):
        if not decision.included:
            exclusions_by_model.setdefault(decision.model_id, []).extend(decision.reasons)
    for exclusion in recommendation.exclusions:
        exclusions_by_model.setdefault(exclusion.model_id, []).extend(exclusion.reasons)
    merged_exclusions = tuple(
        RecommendationExclusion(
            model_id=model_id,
            reasons=tuple(dict.fromkeys(reasons)),
        )
        for model_id, reasons in sorted(exclusions_by_model.items())
    )
    rationale = recommendation.rationale
    constraints = state["constraints"]
    selected_model_id = recommendation.selected_model_id
    if constraints.provider_region_id is not None and selected_model_id is not None:
        passed_region_filter = any(
            decision.model_id == selected_model_id and decision.included
            for decision in state.get("filter_decisions", ())
        )
        if passed_region_filter:
            rationale = (
                *rationale,
                (
                    f"{selected_model_id} 通过受控 provider deployment offer 的地区预筛："
                    f"{constraints.provider_region_id.value}；这只证明仓库存在匹配的 provider 部署报价，"
                    "不等同于最终用户国家可用性。"
                ),
            )
    recommendation = recommendation.model_copy(
        update={"exclusions": merged_exclusions, "rationale": rationale}
    )
    return {"recommendation": recommendation}


def recommend(state: AgentState) -> dict[str, object]:
    recommendation = state["recommendation"]
    if recommendation.selected_model_id is None:
        message = recommendation.rationale[0]
    else:
        message = " ".join(recommendation.rationale)
    return {
        "status": RunStatus.COMPLETED,
        "answer_message": message,
    }


async def inspect_rank_status(state: AgentState, runtime: Runtime[GraphContext]) -> dict[str, object]:
    parsed = state["parsed"]
    assert parsed.model_reference is not None
    try:
        resolution = runtime.context.repository.resolve_exact_reference(parsed.model_reference)
    except (ValueError, LookupError) as exc:
        return {
            "status": RunStatus.COMPLETED,
            "answer_message": f"模型引用无效：{exc}",
            "issues": (GraphIssue(code="invalid_model_reference", message=str(exc)),),
        }
    if resolution.status != ExactResolutionStatus.EXACT:
        return {"resolution": resolution}

    model_id = resolution.model_ids[0]
    benchmark_request = GetModelBenchmarksInput(
        model_id=model_id,
        benchmark_ids=(BenchmarkId.AA_INTELLIGENCE,),
    )
    result = await _safe_tool_call(
        ToolName.GET_MODEL_BENCHMARKS,
        lambda: runtime.context.tools.get_model_benchmarks(benchmark_request),
    )
    if not result.ok or result.data is None:
        update = _tool_failure_update(result, model_id=model_id)
        update["resolution"] = resolution
        return update
    evidence = ModelEvidence(model_id=model_id, benchmarks=result.data.observations)
    return {
        "resolution": resolution,
        "evidence": {model_id: evidence},
        "tool_records": (
            ToolCallRecord(tool=ToolName.GET_MODEL_BENCHMARKS, ok=True, model_id=model_id),
        ),
    }


def explain_unranked(state: AgentState) -> dict[str, object]:
    resolution = state.get("resolution")
    if resolution is None:
        return {}
    operational_error = next(
        (
            error
            for error in state.get("tool_errors", ())
            if error.tool == ToolName.GET_MODEL_BENCHMARKS and error.code in _UNRECOVERABLE_TOOL_CODES
        ),
        None,
    )
    if operational_error is not None:
        return {"status": RunStatus.FAILED, "answer_message": operational_error.message}
    if resolution.status == ExactResolutionStatus.UNKNOWN:
        message = f"unknown_model：{resolution.query!r} 没有精确匹配的受控模型版本。"
    elif resolution.status == ExactResolutionStatus.AMBIGUOUS:
        message = (
            f"ambiguous_version：{resolution.query!r} 对应多个模型："
            f"{', '.join(resolution.model_ids)}；不能静默选择。"
        )
    else:
        model_id = resolution.model_ids[0]
        observations = state.get("evidence", {}).get(model_id)
        if observations is None or not observations.benchmarks:
            message = f"missing_evidence：{model_id} 缺少同版本 AA Intelligence 观测，因此不能进入公开榜。"
        else:
            message = f"{model_id} 已有同版本 AA Intelligence 观测；当前证据不支持“因缺失证据未上榜”的结论。"
    return {"status": RunStatus.COMPLETED, "answer_message": message}


def inspect_update_input(state: AgentState) -> dict[str, object]:
    if "update_input" in state:
        return {}
    return {
        "status": RunStatus.NEEDS_CLARIFICATION,
        "missing_constraints": ("update_input",),
        "answer_message": "需要补充结构化更新输入。",
    }


async def prepare_proposal(state: AgentState, runtime: Runtime[GraphContext]) -> dict[str, object]:
    request = state.get("update_input")
    if request is None:
        return {}
    result = await _safe_tool_call(
        ToolName.PREPARE_DATA_UPDATE,
        lambda: runtime.context.tools.prepare_data_update(request),
    )
    if not result.ok or result.data is None:
        return _tool_failure_update(result, model_id=request.model_id)
    return {
        "update_proposal": result.data,
        "status": RunStatus.AWAITING_HUMAN_REVIEW,
        "answer_message": "更新提案已生成，等待人工审核；未写入文件、Git 或发布系统。",
        "tool_records": (
            ToolCallRecord(tool=ToolName.PREPARE_DATA_UPDATE, ok=True, model_id=request.model_id),
        ),
    }


def finalize(state: AgentState) -> dict[str, object]:
    status = state.get("status", RunStatus.RUNNING)
    message = state.get("answer_message")
    issues = state.get("issues", ())
    recoverable = bool(
        message
        or state.get("recommendation") is not None
        or state.get("resolution") is not None
        or state.get("update_proposal") is not None
        or state.get("candidate_model_ids")
    )
    if status == RunStatus.RUNNING:
        status = RunStatus.COMPLETED if recoverable else RunStatus.FAILED
    if message is None:
        message = "运行未产生可恢复的结构化输出。" if status == RunStatus.FAILED else "运行已结束。"
    if status == RunStatus.FAILED and not issues:
        issues = (*issues, GraphIssue(code="no_recoverable_output", message=message))

    answer = AgentAnswer(
        status=status,
        intent=state.get("intent"),
        message=message,
        missing_constraints=state.get("missing_constraints", ()),
        recommendation=state.get("recommendation"),
        update_proposal=state.get("update_proposal"),
        resolution=state.get("resolution"),
        issues=issues,
        tool_errors=state.get("tool_errors", ()),
    )
    update: dict[str, object] = {"status": status, "answer": answer}
    if issues != state.get("issues", ()):
        update["issues"] = tuple(issue for issue in issues if issue not in state.get("issues", ()))
    return update


def tool_error_codes(errors: Iterable[ToolError]) -> tuple[str, ...]:
    return tuple(sorted({error.code.value for error in errors}))
