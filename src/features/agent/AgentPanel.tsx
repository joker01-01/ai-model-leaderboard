import { useEffect, useRef, useState, type FormEvent } from "react";
import { AgentApiError, isAbortError, streamAgentQuery } from "./api";
import type {
  AgentAnswer,
  AgentSseEvent,
  Citation,
  ModelEvidence,
  PricingQuote,
  ProposalChange,
  UpdateProposal,
} from "./types";

type PanelPhase = "idle" | "running" | "done" | "cancelled" | "error";

interface AgentPanelProps {
  apiOrigin: string | null;
  fetchImpl?: typeof fetch;
}

function currentDateIso(): string {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

const QUICK_PROMPTS = [
  {
    id: "recommend",
    label: "预算推荐",
    description: "地区、用量与证据一起核验",
    prompt: () => `请为 Python 编程推荐一个具体模型版本。部署区域是 sg，币种 USD，月预算 20 USD；每次输入 2000 tokens、缓存输入 0、输出 800 tokens，每月 1000 次，评估日期为 ${currentDateIso()}，并要求官方许可证证据。`,
  },
  {
    id: "unranked",
    label: "未上榜原因",
    description: "不把相似名称当成同一版本",
    prompt: () => "doubao-2-1-pro 为什么没有公开榜名次？请只按精确版本和仓库里已有的证据解释。",
  },
  {
    id: "proposal",
    label: "审核提案",
    description: "生成差异预览，不写入数据",
    prompt: () => "请为 qwen-3-5 准备一份只供人工审核的数据更新提案，不要写入文件。把 gpqa-diamond 更新为 90%，modelVersion 和 sourceVersionId 都是 qwen/qwen3.5-397b-a17b，观测日期 2026-09-02；引用标题为 Artificial Analysis，URL 为 https://artificialanalysis.ai/，更新理由为补充同版本 GPQA Diamond 公开观测。",
  },
] as const;

const STATUS_LABELS: Record<AgentAnswer["status"], string> = {
  running: "运行中",
  needs_clarification: "需要补充",
  completed: "已完成",
  awaiting_human_review: "等待人工审核",
  failed: "运行失败",
};

const EVENT_LABELS: Record<AgentSseEvent["event"], string> = {
  "run.started": "开始运行",
  "node.started": "进入节点",
  "tool.completed": "工具完成",
  "evidence.found": "找到证据",
  "clarification.required": "需要补充",
  "answer.delta": "形成结论",
  "proposal.ready": "提案就绪",
  "run.completed": "运行完成",
  "run.failed": "运行失败",
};

function eventDetail(event: AgentSseEvent): string {
  switch (event.event) {
    case "run.started": return "结构化请求已受理";
    case "node.started": return event.data.node;
    case "tool.completed": return [event.data.tool, event.data.model_id, event.data.error_code].filter(Boolean).join(" · ");
    case "evidence.found": return event.data.model_ids.join(" · ") || "没有可用模型证据";
    case "clarification.required": return event.data.fields.join(" · ");
    case "answer.delta": return "答案快照已更新";
    case "proposal.ready": return event.data.proposal.proposal_id;
    case "run.completed": return event.data.answer ? STATUS_LABELS[event.data.answer.status] : "已结束";
    case "run.failed": return event.data.code ?? "failed";
  }
}

function safeHttpsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function compactId(value: string | undefined): string | null {
  if (!value) return null;
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function presentApiError(error: AgentApiError): string {
  if (error.kind === "network") return "无法连接 Agent API，请检查网络后重试。";
  if (error.kind === "protocol") return "Agent 返回了不符合约定的事件流，本次结果已停止展示。";
  return error.message;
}

export default function AgentPanel({ apiOrigin, fetchImpl }: AgentPanelProps) {
  const [message, setMessage] = useState<string>(() => QUICK_PROMPTS[0].prompt());
  const [phase, setPhase] = useState<PanelPhase>("idle");
  const [events, setEvents] = useState<AgentSseEvent[]>([]);
  const [answerText, setAnswerText] = useState("");
  const [answer, setAnswer] = useState<AgentAnswer | null>(null);
  const [proposal, setProposal] = useState<UpdateProposal | null>(null);
  const [clarification, setClarification] = useState<{ fields: string[]; message: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastSubmitted, setLastSubmitted] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const runSerialRef = useRef(0);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const isConnected = apiOrigin !== null;
  const isRunning = phase === "running";
  const currentRun = events[0];

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!apiOrigin || !cleanMessage || isRunning) return;

    const serial = ++runSerialRef.current;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase("running");
    setEvents([]);
    setAnswerText("");
    setAnswer(null);
    setProposal(null);
    setClarification(null);
    setErrorMessage("");
    setLastSubmitted(cleanMessage);

    try {
      const terminal = await streamAgentQuery({
        apiOrigin,
        request: { message: cleanMessage },
        signal: controller.signal,
        fetchImpl,
        onEvent: (nextEvent) => {
          if (runSerialRef.current !== serial) return;
          setEvents((current) => [...current, nextEvent]);
          if (nextEvent.event === "answer.delta") setAnswerText(nextEvent.data.text);
          if (nextEvent.event === "clarification.required") setClarification(nextEvent.data);
          if (nextEvent.event === "proposal.ready") setProposal(nextEvent.data.proposal);
        },
      });
      if (runSerialRef.current !== serial) return;
      const terminalAnswer = terminal.data.answer ?? null;
      setAnswer(terminalAnswer);
      if (terminalAnswer) {
        setAnswerText(terminalAnswer.message);
        setProposal((current) => terminalAnswer.update_proposal ?? current);
      }
      if (terminal.event === "run.failed" || terminalAnswer?.status === "failed") {
        if (!terminalAnswer) {
          setAnswerText("");
          setProposal(null);
          setClarification(null);
        }
        setErrorMessage(terminal.data.message ?? terminalAnswer?.message ?? "Agent 无法完成本次请求。");
        setPhase("error");
      } else {
        setPhase("done");
      }
    } catch (error) {
      if (runSerialRef.current !== serial) return;
      if (isAbortError(error)) {
        setAnswerText("");
        setAnswer(null);
        setProposal(null);
        setClarification(null);
        setPhase("cancelled");
        setErrorMessage("已停止本次查询。后端会取消仍在执行的图运行。");
      } else {
        setAnswerText("");
        setAnswer(null);
        setProposal(null);
        setClarification(null);
        setPhase("error");
        setErrorMessage(error instanceof AgentApiError ? presentApiError(error) : "暂时无法连接 Agent API，请稍后重试。");
      }
    } finally {
      if (runSerialRef.current === serial) controllerRef.current = null;
    }
  };

  const stopRun = () => controllerRef.current?.abort();

  const prepareClarification = () => {
    const base = lastSubmitted || message.trim();
    setMessage(`${base}\n\n补充信息：`);
    document.querySelector<HTMLTextAreaElement>("#agent-message")?.focus();
  };

  return (
    <section className="agent-panel" aria-labelledby="agent-panel-title">
      <header className="agent-panel-head">
        <div>
          <p className="agent-kicker">MODELOPS AGENT / EVIDENCE CONSOLE</p>
          <h2 id="agent-panel-title">把模型选择变成可核验结论</h2>
          <p>Agent 读取仓库审核快照与 allowlist 限定的官方来源，逐步展示证据、缺口与淘汰理由；更新请求只生成待人工审核的预览。</p>
        </div>
        <div className={`agent-connection ${isConnected ? "is-online" : "is-offline"}`}>
          <i aria-hidden="true" />
          <span>{isConnected ? "API 已配置" : "API 未配置"}</span>
          <small>{isConnected ? "请求时验证连接 · 不保存会话" : "排行榜仍可独立使用"}</small>
        </div>
      </header>

      <div className="agent-presets" aria-label="示例任务">
        {QUICK_PROMPTS.map((preset) => (
          <button
            type="button"
            key={preset.id}
            disabled={isRunning}
            onClick={() => setMessage(preset.prompt())}
          >
            <strong>{preset.label}</strong>
            <span>{preset.description}</span>
          </button>
        ))}
      </div>

      <form className="agent-form" onSubmit={handleSubmit}>
        <label htmlFor="agent-message">你的约束或问题</label>
        <textarea
          id="agent-message"
          maxLength={10_000}
          rows={4}
          value={message}
          disabled={!isConnected || isRunning}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="说明任务、预算、地区、token 用量，或询问某个精确版本为何未上榜。"
        />
        <div className="agent-form-foot">
          <p>{isConnected ? "结果受仓库证据边界约束；缺失证据不会被猜测补齐。" : "生产构建未提供 VITE_AGENT_API_URL，因此未发起任何网络请求。"}</p>
          <div className="agent-actions">
            {isRunning && <button type="button" className="agent-stop" onClick={stopRun}>停止</button>}
            <button type="submit" className="agent-submit" disabled={!isConnected || isRunning || !message.trim()}>
              {isRunning ? "正在核验…" : "开始核验"}
            </button>
          </div>
        </div>
      </form>

      <div className="agent-workbench">
        <EventRail events={events} running={isRunning} />
        <div className="agent-result" aria-live="polite" aria-busy={isRunning}>
          {phase === "idle" && <AgentEmpty connected={isConnected} />}
          {isRunning && !answerText && <AgentPending />}
          {answerText && (
            <article className="agent-answer">
              <div className="agent-answer-meta">
                <span>{answer ? STATUS_LABELS[answer.status] : "生成中"}</span>
                {currentRun && <code title={currentRun.trace_id}>trace {compactId(currentRun.trace_id)}</code>}
              </div>
              <p>{answerText}</p>
            </article>
          )}
          {clarification && (
            <ClarificationCard
              fields={clarification.fields}
              message={clarification.message}
              onPrepare={prepareClarification}
            />
          )}
          {answer?.resolution && (
            <section className="agent-section agent-resolution">
              <SectionTitle eyebrow="EXACT MATCH" title="版本解析" />
              <div className="agent-resolution-row">
                <span className={`agent-state-tag is-${answer.resolution.status}`}>{answer.resolution.status}</span>
                <strong>{answer.resolution.query}</strong>
                <code>{answer.resolution.model_ids.join(" · ") || "no exact model id"}</code>
              </div>
            </section>
          )}
          {answer?.recommendation && <RecommendationView recommendation={answer.recommendation} />}
          {(proposal ?? answer?.update_proposal) && <ProposalView proposal={(proposal ?? answer?.update_proposal)!} />}
          {answer && (answer.issues.length > 0 || answer.tool_errors.length > 0) && <IssueView answer={answer} />}
          {(phase === "cancelled" || phase === "error") && (
            <div className={`agent-notice ${phase === "error" ? "is-error" : "is-cancelled"}`} role="status">
              <strong>{phase === "error" ? "本次运行未完成" : "本次运行已停止"}</strong>
              <p>{errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function AgentEmpty({ connected }: { connected: boolean }) {
  return (
    <div className="agent-empty">
      <p className="agent-empty-index">01—03</p>
      <h3>{connected ? "选择一个示例，或写下你的真实约束" : "Agent 当前未连接，排行榜不受影响"}</h3>
      <div className="agent-boundaries">
        <span><b>01</b> 只认精确版本</span>
        <span><b>02</b> 缺失证据可见</span>
        <span><b>03</b> 提案必须人工审核</span>
      </div>
    </div>
  );
}

function AgentPending() {
  return (
    <div className="agent-pending" role="status">
      <i aria-hidden="true" />
      <div><strong>正在核验快照与受限官方来源</strong><span>每个事件都会带有单调递增的序号。</span></div>
    </div>
  );
}

function EventRail({ events, running }: { events: AgentSseEvent[]; running: boolean }) {
  return (
    <aside className="agent-rail" aria-label="运行事件">
      <div className="agent-rail-head">
        <span>证据轨迹</span>
        <code>{String(events.length).padStart(2, "0")}</code>
      </div>
      {events.length === 0
        ? <p className="agent-rail-empty">提交后，这里会按服务端 sequence 展示真实执行轨迹。</p>
        : (
          <ol>
            {events.map((event, index) => (
              <li key={`${event.run_id}-${event.sequence}`} className={index === events.length - 1 && running ? "is-current" : ""}>
                <span className="agent-sequence">#{String(event.sequence).padStart(2, "0")}</span>
                <i aria-hidden="true" />
                <div><strong>{EVENT_LABELS[event.event]}</strong><small>{eventDetail(event)}</small></div>
              </li>
            ))}
          </ol>
        )}
    </aside>
  );
}

function SectionTitle({ eyebrow, title, note }: { eyebrow: string; title: string; note?: string }) {
  return (
    <div className="agent-section-title">
      <div><span>{eyebrow}</span><h3>{title}</h3></div>
      {note && <p>{note}</p>}
    </div>
  );
}

function ClarificationCard({ fields, message, onPrepare }: { fields: string[]; message: string; onPrepare: () => void }) {
  return (
    <section className="agent-section agent-clarification">
      <SectionTitle eyebrow="INPUT REQUIRED" title="补全后重新提交完整问题" />
      <p>{message}</p>
      <div className="agent-tag-list">{fields.map((field) => <code key={field}>{field}</code>)}</div>
      <p className="agent-smallprint">当前后端不保存多轮会话，补充内容需要和原问题一起重新提交。</p>
      <button type="button" onClick={onPrepare}>载入补充模板</button>
    </section>
  );
}

function RecommendationView({ recommendation }: { recommendation: NonNullable<AgentAnswer["recommendation"]> }) {
  return (
    <section className="agent-section agent-recommendation">
      <SectionTitle eyebrow="VERIFIED RECOMMENDATION" title="推荐结果" note="Agent 排序不会改变公开排行榜" />
      <div className="agent-pick">
        <span>选中具体版本</span>
        <strong>{recommendation.selected_model_id ?? "没有模型通过全部约束"}</strong>
      </div>
      {recommendation.rationale.length > 0 && (
        <ol className="agent-rationale">{recommendation.rationale.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol>
      )}
      {recommendation.evidence.map((evidence) => <EvidenceCard key={evidence.model_id} evidence={evidence} />)}
      {recommendation.exclusions.length > 0 && (
        <details className="agent-exclusions">
          <summary>查看 {recommendation.exclusions.length} 个淘汰候选及理由</summary>
          <div>{recommendation.exclusions.map((item) => (
            <article key={item.model_id}><strong>{item.model_id}</strong><ul>{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></article>
          ))}</div>
        </details>
      )}
    </section>
  );
}

function EvidenceCard({ evidence }: { evidence: ModelEvidence }) {
  return (
    <article className="agent-evidence-card">
      <header><span>MODEL EVIDENCE</span><strong>{evidence.model_id}</strong></header>
      {evidence.benchmarks.length > 0 && (
        <div className="agent-metric-grid">
          {evidence.benchmarks.map((benchmark) => (
            <div key={benchmark.benchmark_id}>
              <span>{benchmark.definition.short_label}</span>
              <strong>{benchmark.value}{benchmark.definition.unit === "%" ? "%" : ""}</strong>
              <small>{benchmark.model_version} · {benchmark.observed_at}</small>
            </div>
          ))}
        </div>
      )}
      {evidence.pricing.length > 0 && <PricingTable quotes={evidence.pricing} />}
      {evidence.documents.length > 0 && (
        <div className="agent-documents">
          <h4>官方文档证据</h4>
          {evidence.documents.map((document) => {
            const href = safeHttpsUrl(document.url);
            return (
              <article key={`${document.provider_id}-${document.kind}-${document.url}`}>
                <span>{document.provider_id} / {document.kind}</span>
                {href ? <a href={href} target="_blank" rel="noopener noreferrer">{document.title} ↗</a> : <strong>{document.title}</strong>}
                <p>{document.excerpt}</p>
              </article>
            );
          })}
        </div>
      )}
      {evidence.gaps.length > 0 && (
        <div className="agent-gaps"><h4>证据缺口</h4>{evidence.gaps.map((gap) => <p key={`${gap.code}-${gap.field ?? ""}`}><code>{gap.code}</code>{gap.message}</p>)}</div>
      )}
    </article>
  );
}

function PricingTable({ quotes }: { quotes: PricingQuote[] }) {
  return (
    <div className="agent-pricing">
      <h4>每请求与月度价格核验</h4>
      <div className="agent-pricing-scroll">
        <table>
          <thead><tr><th>Provider / region</th><th>每请求</th><th>月成本</th><th>证据状态</th></tr></thead>
          <tbody>{quotes.map((quote) => (
            <tr key={quote.offer_id}>
              <td><strong>{quote.provider_id}</strong><small>{quote.region_id} · {quote.offer_id}</small></td>
              <td>{quote.per_request_cost == null ? "—" : `${quote.currency} ${quote.per_request_cost}`}</td>
              <td>{quote.monthly_cost == null ? "—" : `${quote.currency} ${quote.monthly_cost}`}</td>
              <td><span className={`agent-state-tag is-${quote.status}`}>{quote.status}</span>{quote.reason && <small>{quote.reason}</small>}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function ProposalView({ proposal }: { proposal: UpdateProposal }) {
  return (
    <section className="agent-section agent-proposal">
      <SectionTitle eyebrow="REVIEW-ONLY PROPOSAL" title="数据更新预览" note="未写入文件，也不会自动合并发布" />
      <div className="agent-proposal-head">
        <span className="agent-review-badge">等待人工审核</span>
        <div><strong>{proposal.model_id}</strong><code>{proposal.proposal_id}</code></div>
      </div>
      <p className="agent-proposal-reason">{proposal.reason}</p>
      <div className="agent-change-list">{proposal.changes.map((change, index) => <ProposalChangeView key={`${change.benchmark_id}-${index}`} change={change} />)}</div>
      <CitationList citations={proposal.citations} />
      {proposal.risks.length > 0 && (
        <div className="agent-risks"><h4>审核风险</h4>{proposal.risks.map((risk) => <p key={`${risk.code}-${risk.path ?? ""}`}><code>{risk.code}</code>{risk.message}{risk.path && <small>{risk.path}</small>}</p>)}</div>
      )}
    </section>
  );
}

function ProposalChangeView({ change }: { change: ProposalChange }) {
  return (
    <article>
      <header><span>{change.action}</span><strong>{change.benchmark_id}</strong></header>
      <div className="agent-change-values">
        <div><span>BEFORE</span><strong>{change.before ? `${change.before.value}${change.before.definition.unit === "%" ? "%" : ""}` : "—"}</strong><small>{change.before?.model_version ?? "没有现有观测"}</small></div>
        <i aria-hidden="true">→</i>
        <div><span>AFTER</span><strong>{change.after.value}{change.after.unit === "%" ? "%" : ""}</strong><small>{change.after.model_version}</small></div>
      </div>
    </article>
  );
}

function CitationList({ citations }: { citations: Citation[] }) {
  if (citations.length === 0) return null;
  return (
    <div className="agent-citations">
      <h4>引用</h4>
      <ol>{citations.map((citation) => {
        const href = safeHttpsUrl(citation.url);
        return (
          <li key={citation.citation_id}>
            <span>{citation.observed_at}</span>
            {href ? <a href={href} target="_blank" rel="noopener noreferrer">{citation.title} ↗</a> : <strong>{citation.title}</strong>}
            {citation.excerpt && <p>{citation.excerpt}</p>}
          </li>
        );
      })}</ol>
    </div>
  );
}

function IssueView({ answer }: { answer: AgentAnswer }) {
  return (
    <section className="agent-section agent-issues">
      <SectionTitle eyebrow="STRUCTURED ISSUES" title="运行问题与工具错误" />
      {answer.issues.map((issue) => <p key={`${issue.code}-${issue.message}`}><code>{issue.code}</code>{issue.message}</p>)}
      {answer.tool_errors.map((error) => <p key={`${error.tool}-${error.code}-${error.message}`}><code>{error.tool} / {error.code}</code>{error.message}</p>)}
    </section>
  );
}
