import { useEffect, useRef, useState, type FormEvent } from "react";

import CreatorIcon from "../../components/CreatorIcon";
import {
  AdvisorApiError,
  isAdvisorAbortError,
  requestAdvisorRecommendation,
} from "./api";
import type {
  AdvisorCandidate,
  AdvisorCheckRequirement,
  AdvisorRecommendationRequest,
  AdvisorRecommendationResponse,
  AdvisorRejection,
  AdvisorVerificationStatus,
} from "./types";

interface AdvisorFormProps {
  readonly apiOrigin: string | null;
  readonly displayNames: ReadonlyMap<string, string>;
  readonly fetchImpl?: typeof fetch;
}

type AdvisorPhase = "idle" | "running" | "success" | "cancelled" | "error";
type FieldName = "requirement" | "deploymentRegion";

type FieldErrors = Partial<Record<FieldName, string>>;

const VERIFICATION_LABELS: Record<AdvisorVerificationStatus, string> = {
  verified: "旧版响应：已核验",
  partial: "旧版响应：部分核验",
  aa_only: "未联网核验",
};

const REQUIREMENT_LABELS: Record<AdvisorCheckRequirement, string> = {
  model_identity: "模型身份",
  open_weights: "开放权重",
  api_access: "API 接入",
  tool_use: "工具调用",
  commercial_use: "商业使用",
  deployment_region: "部署地区",
};

const PURPOSE_LABELS = {
  intelligence: "综合智能",
  coding: "编程智能",
  agentic: "智能体能力",
} as const;

const OBJECTIVE_LABELS = {
  strongest: "最强能力优先",
  fastest: "最快速度优先",
  cheapest: "最低价格优先",
} as const;

const DEPLOYMENT_REGION_OPTIONS = [
  { label: "中国大陆", value: "Mainland China" },
  { label: "中国香港", value: "Hong Kong" },
  { label: "新加坡", value: "Singapore" },
  { label: "日本", value: "Japan" },
  { label: "韩国", value: "South Korea" },
  { label: "美国", value: "United States" },
  { label: "加拿大", value: "Canada" },
  { label: "欧盟", value: "European Union" },
  { label: "英国", value: "United Kingdom" },
  { label: "澳大利亚", value: "Australia" },
] as const;

function buildRequest(fields: {
  requirement: string;
  deploymentRegion: string;
}): { request: AdvisorRecommendationRequest | null; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const requirement = fields.requirement.trim();
  const deploymentRegion = fields.deploymentRegion.trim();
  if (requirement.length === 0) errors.requirement = "请输入你的需求。";
  else if (requirement.length > 2_000) errors.requirement = "需求不能超过 2,000 个字符。";
  if (deploymentRegion.length > 64) errors.deploymentRegion = "部署地区不能超过 64 个字符。";

  if (Object.keys(errors).length > 0) return { request: null, errors };
  return {
    request: {
      requirement,
      deployment_region: deploymentRegion || null,
      budget: null,
    },
    errors,
  };
}

function errorMessage(error: unknown): string {
  if (!(error instanceof AdvisorApiError)) return "推荐服务暂时无法完成请求，请稍后重试。";
  if (error.status === 429) {
    return error.retryAfterSeconds === undefined
      ? "请求过于频繁，请稍后重试。"
      : `请求过于频繁，请在 ${error.retryAfterSeconds} 秒后重试。`;
  }
  if (error.kind === "network") return "无法连接推荐服务，请检查网络后重试。";
  if (error.kind === "protocol") return "推荐服务返回了无法验证的数据，本次结果未展示。";
  if (error.code === "invalid_request" || error.status === 422) return "提交内容未通过服务校验，请检查后重试。";
  if (error.code === "service_unavailable" || error.status === 503) return "推荐服务暂时不可用，请稍后重试。";
  return "推荐服务暂时无法完成请求，请稍后重试。";
}

export default function AdvisorForm({ apiOrigin, displayNames, fetchImpl }: AdvisorFormProps) {
  const [requirement, setRequirement] = useState("");
  const [deploymentRegion, setDeploymentRegion] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [phase, setPhase] = useState<AdvisorPhase>("idle");
  const [result, setResult] = useState<AdvisorRecommendationResponse | null>(null);
  const [failure, setFailure] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const runSerialRef = useRef(0);

  useEffect(() => () => {
    runSerialRef.current += 1;
    controllerRef.current?.abort();
  }, []);

  const clearErrors = () => {
    if (Object.keys(errors).length > 0) setErrors({});
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (phase === "running" || apiOrigin === null) return;
    const validated = buildRequest({
      requirement,
      deploymentRegion,
    });
    if (validated.request === null) {
      setErrors(validated.errors);
      setPhase("idle");
      const firstError = Object.keys(validated.errors)[0] as FieldName | undefined;
      if (firstError) document.getElementById(`advisor-${firstError}`)?.focus();
      return;
    }

    const serial = ++runSerialRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setErrors({});
    setPhase("running");
    setResult(null);
    setFailure("");
    try {
      const response = await requestAdvisorRecommendation({
        apiOrigin,
        request: validated.request,
        signal: controller.signal,
        fetchImpl,
      });
      if (runSerialRef.current !== serial) return;
      setResult(response);
      setPhase("success");
    } catch (error) {
      if (runSerialRef.current !== serial) return;
      setResult(null);
      if (isAdvisorAbortError(error)) {
        setFailure("已停止本次推荐。");
        setPhase("cancelled");
      } else {
        setFailure(errorMessage(error));
        setPhase("error");
      }
    } finally {
      if (runSerialRef.current === serial) controllerRef.current = null;
    }
  };

  const isRunning = phase === "running";
  const isConnected = apiOrigin !== null;

  return (
    <div className="advisor-workspace">
      <form className="advisor-form" aria-label="模型推荐条件" noValidate onSubmit={handleSubmit}>
        <div className="advisor-field advisor-field--requirement">
          <label htmlFor="advisor-requirement">你的需求</label>
          <textarea
            id="advisor-requirement"
            maxLength={2_000}
            rows={6}
            value={requirement}
            aria-invalid={errors.requirement ? "true" : undefined}
            aria-describedby={errors.requirement ? "advisor-requirement-error" : undefined}
            disabled={isRunning}
            placeholder="例如：为 Python 数据分析服务选择一个支持工具调用、成本可控的模型"
            onChange={(event) => { setRequirement(event.target.value); clearErrors(); }}
          />
          {errors.requirement && <p id="advisor-requirement-error" className="advisor-field-error">{errors.requirement}</p>}
        </div>

        <div className="advisor-form-row">
          <div className="advisor-field">
            <label htmlFor="advisor-deploymentRegion">部署地区（可选）</label>
            <select
              id="advisor-deploymentRegion"
              value={deploymentRegion}
              aria-invalid={errors.deploymentRegion ? "true" : undefined}
              aria-describedby={errors.deploymentRegion ? "advisor-deployment-region-error" : undefined}
              disabled={isRunning}
              onChange={(event) => { setDeploymentRegion(event.target.value); clearErrors(); }}
            >
              <option value="">不指定</option>
              {DEPLOYMENT_REGION_OPTIONS.map((region) => (
                <option key={region.value} value={region.value}>{region.label}</option>
              ))}
            </select>
            {errors.deploymentRegion && <p id="advisor-deployment-region-error" className="advisor-field-error">{errors.deploymentRegion}</p>}
          </div>

          <div className="advisor-form-actions">
            <div>
              {isRunning && <button type="button" className="advisor-stop" onClick={() => controllerRef.current?.abort()}>停止推荐</button>}
              <button type="submit" className="advisor-submit" disabled={!isConnected || isRunning}>
                {isRunning ? "正在筛选…" : "获取推荐"}
              </button>
            </div>
          </div>
        </div>
      </form>

      {phase !== "idle" && (
        <section className="advisor-result" aria-live="polite" aria-busy={isRunning} aria-label="模型推荐结果">
          {isRunning && (
            <div className="advisor-result-pending" role="status">
              <i aria-hidden="true" />
              <div><strong>正在按 AA 快照筛选</strong><p>DeepSeek 仅补充说明，不参与候选排序。</p></div>
            </div>
          )}
          {(phase === "cancelled" || phase === "error") && (
            <div className={`advisor-result-notice is-${phase}`} role="status">
              <strong>{phase === "cancelled" ? "推荐已停止" : "本次推荐未完成"}</strong>
              <p>{failure}</p>
            </div>
          )}
          {result && <AdvisorResult result={result} displayNames={displayNames} />}
        </section>
      )}
    </div>
  );
}

function AdvisorResult({ result, displayNames }: {
  readonly result: AdvisorRecommendationResponse;
  readonly displayNames: ReadonlyMap<string, string>;
}) {
  const isAaOnly = result.verification_status === "aa_only";
  const statusLabel = VERIFICATION_LABELS[result.verification_status];
  const intent: string[] = result.parsed_need.ability_purposes.map((purpose) => PURPOSE_LABELS[purpose]);
  if (result.parsed_need.promoted_objective !== null) {
    intent.push(OBJECTIVE_LABELS[result.parsed_need.promoted_objective]);
  }

  return (
    <div className="advisor-result-content">
      <header className="advisor-result-head">
        <div>
          <p>{isAaOnly ? (result.recommendation === null ? "结果依据" : "推荐依据") : "兼容响应状态"}</p>
          <strong className={`advisor-verification is-${result.verification_status}`}>{statusLabel}</strong>
          {isAaOnly && (
            <span>排序与数值来自 AA 已提交快照</span>
          )}
        </div>
        <p>识别重点：{intent.join(" · ")}</p>
      </header>

      {result.recommendation === null ? (
        <div className="advisor-no-candidate">
          {result.rejections.length > 0 ? (
            <>
              <h2>兼容响应：候选存在已记录的条件冲突</h2>
              <p>以下内容来自旧版响应，可在依据中逐项查看。</p>
            </>
          ) : (
            <>
              <h2>没有模型满足当前条件</h2>
              <p>当前 AA 快照中没有满足所需指标条件的候选。硬性要求和部署地区未核验，也未参与筛选。</p>
            </>
          )}
        </div>
      ) : (
        <CandidateView candidate={result.recommendation} displayNames={displayNames} primary />
      )}

      <EvidenceDetails result={result} displayNames={displayNames} />

      {result.alternatives.length > 0 && (
        <details className="advisor-alternatives">
          <summary>查看另外 {result.alternatives.length} 个备选</summary>
          <div className="advisor-alternative-list">
            {result.alternatives.map((candidate) => (
              <CandidateView key={candidate.source_id} candidate={candidate} displayNames={displayNames} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function sourceDisplayName(source: {
  readonly source_id: string;
  readonly raw_name: string | null;
  readonly source_slug: string | null;
}, displayNames: ReadonlyMap<string, string>): string {
  return displayNames.get(source.source_id)
    ?? source.raw_name
    ?? source.source_slug
    ?? `未命名模型 ${source.source_id}`;
}

function CandidateView({ candidate, displayNames, primary = false }: {
  readonly candidate: AdvisorCandidate;
  readonly displayNames: ReadonlyMap<string, string>;
  readonly primary?: boolean;
}) {
  const name = sourceDisplayName(candidate, displayNames);
  return (
    <article className={primary ? "advisor-candidate advisor-candidate--primary" : "advisor-candidate advisor-candidate--alternative"}>
      <header className="advisor-candidate-head">
        <div className="advisor-candidate-identity">
          <div>
            <p>{primary ? "首选模型" : VERIFICATION_LABELS[candidate.verification_status]}</p>
            {primary ? <h2 title={name}>推荐 {name}</h2> : <h3 title={name}>{name}</h3>}
          </div>
          <CreatorIcon creatorId={candidate.creator_id} creatorName={candidate.creator_name} />
        </div>
        <p>{candidate.reason}</p>
      </header>
      <CandidateMetrics candidate={candidate} />
    </article>
  );
}

function CandidateMetrics({ candidate }: { readonly candidate: AdvisorCandidate }) {
  const metrics = candidate.metrics;
  const values = [
    ["综合智能", metrics.intelligence, ""],
    ["编程智能", metrics.coding, ""],
    ["智能体能力", metrics.agentic, ""],
    ["输入价格", metrics.input_price_per_million, "USD / 1M tokens"],
    ["输出价格", metrics.output_price_per_million, "USD / 1M tokens"],
    ["首字延迟", metrics.time_to_first_answer_seconds, "秒"],
    ["输出速度", metrics.output_tokens_per_second, "tokens/s"],
  ] as const;
  return (
    <dl className="advisor-metrics">
      {values.map(([label, value, unit]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>
            {value === null
              ? <span className="advisor-metric-missing">暂无 AA 数据</span>
              : <><span className="advisor-metric-value">{formatMetric(value)}</span>{unit && <small>{unit}</small>}</>}
          </dd>
        </div>
      ))}
      {candidate.estimated_monthly_cost_usd !== null && (
        <div className="advisor-metric--cost">
          <dt>估算月成本</dt>
          <dd><span className="advisor-metric-value">${candidate.estimated_monthly_cost_usd}</span><small>USD</small></dd>
        </div>
      )}
    </dl>
  );
}

function formatMetric(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 }).format(value);
}

function EvidenceDetails({ result, displayNames }: {
  readonly result: AdvisorRecommendationResponse;
  readonly displayNames: ReadonlyMap<string, string>;
}) {
  const isAaOnly = result.verification_status === "aa_only";
  const citationById = new Map(result.citations.map((citation) => [citation.citation_id, citation]));
  const candidates = [
    ...(result.recommendation === null
      ? []
      : [{ candidate: result.recommendation, position: "首选" as const }]),
    ...result.alternatives
      .filter((candidate) => candidate.checks.length > 0)
      .map((candidate) => ({ candidate, position: "备选" as const })),
  ];

  return (
    <details className="advisor-evidence">
      <summary>查看依据</summary>
      <div className="advisor-evidence-body">
        <div className="advisor-aa-source">
          <span>AA 排名与指标</span>
          <a href={result.aa_source.url} target="_blank" rel="noopener noreferrer">
            Artificial Analysis · {result.aa_source.observed_at} ↗
          </a>
        </div>
        {isAaOnly && (
          <p className="advisor-evidence-empty">DeepSeek 的补充说明基于已有知识，可能过时；本次不进行联网搜索。硬性要求和部署地区未核验且不参与筛选。</p>
        )}
        {result.rejections.length > 0 ? (
          <RejectionEvidence
            rejections={result.rejections}
            citationById={citationById}
            displayNames={displayNames}
          />
        ) : candidates.length > 0 ? (
          <div className="advisor-evidence-groups">
            {candidates.map(({ candidate, position }) => {
              const name = sourceDisplayName(candidate, displayNames);
              const citationIds = new Set(candidate.checks.flatMap((check) => check.citation_ids));
              const citations = [...citationIds]
                .map((citationId) => citationById.get(citationId))
                .filter((citation) => citation !== undefined);
              return (
                <section
                  key={candidate.source_id}
                  className="advisor-evidence-group"
                  aria-label={`${position} ${name} 的${candidate.verification_status === "aa_only" ? "推荐依据" : "兼容核验依据"}`}
                >
                  <header className="advisor-evidence-group-head">
                    <div><span>{position}</span><h3>{name}</h3></div>
                    <span className={`advisor-verification is-${candidate.verification_status}`}>
                      {VERIFICATION_LABELS[candidate.verification_status]}
                    </span>
                  </header>
                  {candidate.checks.length > 0 ? (
                    <ul className="advisor-checks">
                      {candidate.checks.map((check) => (
                        <li key={check.requirement}>
                          <span className={`is-${check.status}`}>{check.status === "satisfied" ? "已核验" : "未核验"}</span>
                          <div><strong>{REQUIREMENT_LABELS[check.requirement]}</strong><p>{check.summary}</p></div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="advisor-evidence-empty">
                      {candidate.verification_status === "aa_only"
                        ? "排序与数值来自 AA 已提交快照。"
                        : "兼容响应未提供逐项核验记录。"}
                    </p>
                  )}
                  {citations.length > 0 ? (
                    <ol className="advisor-citations">
                      {citations.map((citation) => (
                        <li key={citation.citation_id}>
                          <a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title} ↗</a>
                        </li>
                      ))}
                    </ol>
                  ) : candidate.verification_status === "aa_only" ? null : (
                    <p className="advisor-evidence-empty">兼容响应未附引用。</p>
                  )}
                </section>
              );
            })}
          </div>
        ) : isAaOnly ? null : (
          <p className="advisor-evidence-empty">兼容响应未提供候选核验记录。</p>
        )}
      </div>
    </details>
  );
}

function RejectionEvidence({ rejections, citationById, displayNames }: {
  readonly rejections: readonly AdvisorRejection[];
  readonly citationById: ReadonlyMap<string, AdvisorRecommendationResponse["citations"][number]>;
  readonly displayNames: ReadonlyMap<string, string>;
}) {
  return (
    <div className="advisor-rejection-list">
      {rejections.map((rejection) => {
        const name = sourceDisplayName(rejection, displayNames);
        const identityCitations = rejection.identity_check.citation_ids
          .map((citationId) => citationById.get(citationId))
          .filter((citation) => citation !== undefined);
        return (
          <details key={rejection.source_id} className="advisor-rejection">
            <summary>
              <span className="advisor-rejection-identity">
                <strong>{name}</strong>
                <CreatorIcon creatorId={rejection.creator_id} creatorName={rejection.creator_name} />
              </span>
              <span>{rejection.contradictions.length} 项明确冲突</span>
            </summary>
            <div className="advisor-rejection-body">
              <section className="advisor-contradiction advisor-identity-check">
                <header>
                  <strong>{REQUIREMENT_LABELS[rejection.identity_check.requirement]}</strong>
                  <span>已核验</span>
                </header>
                <p>{rejection.identity_check.summary}</p>
                <ol>
                  {identityCitations.map((citation) => (
                    <li key={citation.citation_id}>
                      <a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title} ↗</a>
                    </li>
                  ))}
                </ol>
              </section>
              {rejection.contradictions.map((contradiction, contradictionIndex) => {
                const citations = contradiction.citation_ids
                  .map((citationId) => citationById.get(citationId))
                  .filter((citation) => citation !== undefined);
                return (
                  <section key={`${contradiction.requirement}-${contradictionIndex}`} className="advisor-contradiction">
                    <header>
                      <strong>{REQUIREMENT_LABELS[contradiction.requirement]}</strong>
                      <span>已反证</span>
                    </header>
                    <p>{contradiction.summary}</p>
                    <ol>
                      {citations.map((citation) => (
                        <li key={citation.citation_id}>
                          <a href={citation.url} target="_blank" rel="noopener noreferrer">{citation.title} ↗</a>
                        </li>
                      ))}
                    </ol>
                  </section>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
