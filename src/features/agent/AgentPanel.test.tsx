// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AgentPanel from "./AgentPanel";
import type { AgentAnswer, AgentSseEvent, UpdateProposal } from "./types";

afterEach(cleanup);

const runId = "run-component-test";
const traceId = "trace-component-test";
const timestamp = "2026-09-04T00:00:00Z";

function event<Event extends AgentSseEvent["event"]>(
  sequence: number,
  name: Event,
  data: Extract<AgentSseEvent, { event: Event }>["data"],
): Extract<AgentSseEvent, { event: Event }> {
  return { run_id: runId, trace_id: traceId, sequence, event: name, timestamp, data } as Extract<AgentSseEvent, { event: Event }>;
}

function answer(overrides: Partial<AgentAnswer> = {}): AgentAnswer {
  return {
    status: "completed",
    intent: "explain_unranked",
    message: "该精确版本缺少公开主榜证据。",
    missing_constraints: [],
    issues: [],
    tool_errors: [],
    ...overrides,
  };
}

function streamFetch(events: AgentSseEvent[]) {
  const encoder = new TextEncoder();
  return vi.fn(async () => new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const payload = events.map((item) => `id: ${item.sequence}\nevent: ${item.event}\ndata: ${JSON.stringify(item)}\n\n`).join("");
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } },
  )) as unknown as typeof fetch;
}

describe("AgentPanel", () => {
  it("keeps the panel disconnected without an API URL", () => {
    render(<AgentPanel apiOrigin={null} />);

    expect(screen.getByText("API 未配置")).toBeTruthy();
    expect(screen.getByText("Agent 当前未连接，排行榜不受影响")).toBeTruthy();
    expect(screen.getByRole("button", { name: "开始核验" }).hasAttribute("disabled")).toBe(true);
  });

  it("submits a preset through the real stream parser and renders exact resolution", async () => {
    const terminalAnswer = answer({
      resolution: { query: "doubao-2-1-pro", status: "exact", model_ids: ["doubao-2-1-pro"] },
    });
    const fetchImpl = streamFetch([
      event(1, "run.started", { status: "running" }),
      event(2, "answer.delta", { text: terminalAnswer.message }),
      event(3, "run.completed", { answer: terminalAnswer, retryable: false }),
    ]);
    const user = userEvent.setup();
    render(<AgentPanel apiOrigin="https://agent.example" fetchImpl={fetchImpl} />);

    await user.click(screen.getByRole("button", { name: /未上榜原因/ }));
    await user.click(screen.getByRole("button", { name: "开始核验" }));

    expect(await screen.findByText(terminalAnswer.message)).toBeTruthy();
    expect(screen.getByText("doubao-2-1-pro", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText("#03")).toBeTruthy();
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://agent.example/api/v1/agent/query");
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({ message: expect.stringContaining("doubao-2-1-pro") }));
  });

  it("preserves the original question when preparing a clarification retry", async () => {
    const clarification = { fields: ["currency", "provider_region_id"], message: "需要补充币种和部署区域。" };
    const terminalAnswer = answer({
      status: "needs_clarification",
      intent: "recommend",
      message: clarification.message,
      missing_constraints: clarification.fields,
    });
    const fetchImpl = streamFetch([
      event(1, "run.started", { status: "running" }),
      event(2, "clarification.required", clarification),
      event(3, "run.completed", { answer: terminalAnswer, retryable: false }),
    ]);
    const user = userEvent.setup();
    render(<AgentPanel apiOrigin="https://agent.example" fetchImpl={fetchImpl} />);

    const input = screen.getByLabelText("你的约束或问题") as HTMLTextAreaElement;
    const original = input.value;
    await user.click(screen.getByRole("button", { name: "开始核验" }));
    await user.click(await screen.findByRole("button", { name: "载入补充模板" }));

    expect(input.value).toContain(original);
    expect(input.value).toContain("补充信息：");
    expect(screen.getByText("currency")).toBeTruthy();
  });

  it("renders a review-only proposal with its diff and citation", async () => {
    const proposal: UpdateProposal = {
      proposal_id: "proposal-test",
      status: "awaiting_human_review",
      model_id: "qwen-3-5",
      reason: "补充同版本公开观测。",
      changes: [{
        action: "add",
        benchmark_id: "gpqa-diamond",
        after: {
          benchmark_id: "gpqa-diamond",
          value: 90,
          unit: "%",
          model_version: "qwen/qwen3.5-397b-a17b",
          source_version_id: "qwen/qwen3.5-397b-a17b",
          observed_at: "2026-09-02",
          citation_ids: ["citation-test"],
        },
      }],
      citations: [{
        citation_id: "citation-test",
        title: "Artificial Analysis",
        url: "https://artificialanalysis.ai/",
        observed_at: "2026-09-02",
      }],
      risks: [{ code: "human_review_required", message: "发布前需要人工核验。" }],
    };
    const terminalAnswer = answer({
      status: "awaiting_human_review",
      intent: "prepare_update",
      message: "提案已生成，等待人工审核，未写入数据。",
      update_proposal: proposal,
    });
    const fetchImpl = streamFetch([
      event(1, "run.started", { status: "running" }),
      event(2, "proposal.ready", { proposal }),
      event(3, "run.completed", { answer: terminalAnswer, retryable: false }),
    ]);
    const user = userEvent.setup();
    render(<AgentPanel apiOrigin="https://agent.example" fetchImpl={fetchImpl} />);

    await user.click(screen.getByRole("button", { name: /审核提案/ }));
    await user.click(screen.getByRole("button", { name: "开始核验" }));

    expect(await screen.findByText("数据更新预览")).toBeTruthy();
    expect(screen.getByText("90%")).toBeTruthy();
    expect(screen.getByText("未写入文件，也不会自动合并发布")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Artificial Analysis ↗" }).getAttribute("href")).toBe("https://artificialanalysis.ai/");
  });

  it("renders the recommendation evidence, price, source, gap, and exclusion", async () => {
    const terminalAnswer = answer({
      intent: "recommend",
      message: "在当前证据和预算约束下，推荐 deepseek-v4-flash。",
      recommendation: {
        selected_model_id: "deepseek-v4-flash",
        rationale: ["AA Coding 分数最高且月成本在预算内。"],
        evidence: [{
          model_id: "deepseek-v4-flash",
          benchmarks: [{
            model_id: "deepseek-v4-flash",
            benchmark_id: "aa-coding",
            value: 72.5,
            model_version: "deepseek-v4-flash",
            observed_at: "2026-09-02",
            definition: {
              id: "aa-coding",
              dim: "coding",
              label: "Artificial Analysis Coding Index",
              short_label: "AA Coding",
              unit: "index",
              source_label: "Artificial Analysis",
              source_url: "https://artificialanalysis.ai/",
              source_tier: "聚合榜",
              calibration: { min: 0, max: 100 },
            },
          }],
          pricing: [{
            offer_id: "deepseek-flash-sg",
            provider_id: "deepseek",
            provider_model_id: "deepseek-chat",
            region_id: "sg",
            currency: "USD",
            request_input_tokens: 2000,
            per_request_cost: "0.001",
            monthly_cost: "1.000",
            evidence_cutoff: "2026-10-02",
            status: "available",
          }],
          documents: [{
            model_id: "deepseek-v4-flash",
            provider_id: "deepseek",
            provider_model_id: "deepseek-chat",
            kind: "license",
            title: "DeepSeek model license",
            url: "https://api-docs.deepseek.com/",
            observed_at: "2026-09-02",
            excerpt: "Official model and usage terms.",
          }],
          gaps: [{ code: "latency_unverified", message: "尚无指定地区延迟证据。", field: "max_latency_ms" }],
        }],
        exclusions: [{ model_id: "qwen-3-5", reasons: ["目标区域缺少价格证据。"] }],
      },
    });
    const fetchImpl = streamFetch([
      event(1, "run.started", { status: "running" }),
      event(2, "run.completed", { answer: terminalAnswer, retryable: false }),
    ]);
    const user = userEvent.setup();
    render(<AgentPanel apiOrigin="https://agent.example" fetchImpl={fetchImpl} />);

    await user.click(screen.getByRole("button", { name: "开始核验" }));

    expect(await screen.findByText("deepseek-v4-flash", { selector: ".agent-pick strong" })).toBeTruthy();
    expect(screen.getByText("AA Coding")).toBeTruthy();
    expect(screen.getByText("USD 1.000")).toBeTruthy();
    expect(screen.getByRole("link", { name: "DeepSeek model license ↗" }).getAttribute("href")).toBe("https://api-docs.deepseek.com/");
    expect(screen.getByText("尚无指定地区延迟证据。")).toBeTruthy();
    expect(screen.getByText("目标区域缺少价格证据。")).toBeTruthy();
  });

  it("aborts an in-flight request from the stop control", async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as unknown as typeof fetch;
    const user = userEvent.setup();
    render(<AgentPanel apiOrigin="https://agent.example" fetchImpl={fetchImpl} />);

    await user.click(screen.getByRole("button", { name: "开始核验" }));
    await user.click(await screen.findByRole("button", { name: "停止" }));

    await waitFor(() => expect(screen.getByText("本次运行已停止")).toBeTruthy());
    expect(screen.getByText(/后端会取消仍在执行的图运行/)).toBeTruthy();
  });

  it("clears a partial answer and shows the terminal failure", async () => {
    const fetchImpl = streamFetch([
      event(1, "run.started", { status: "running" }),
      event(2, "answer.delta", { text: "尚未完成的答案" }),
      event(3, "run.failed", { message: "上游服务暂时不可用。", retryable: true }),
    ]);
    const user = userEvent.setup();
    render(<AgentPanel apiOrigin="https://agent.example" fetchImpl={fetchImpl} />);

    await user.click(screen.getByRole("button", { name: "开始核验" }));

    expect(await screen.findByText("本次运行未完成")).toBeTruthy();
    expect(screen.getByText("上游服务暂时不可用。")).toBeTruthy();
    expect(screen.queryByText("尚未完成的答案")).toBeNull();
    expect(screen.queryByText("生成中")).toBeNull();
  });

  it("clears a partial answer when the stream ends without a terminal event", async () => {
    const fetchImpl = streamFetch([
      event(1, "run.started", { status: "running" }),
      event(2, "answer.delta", { text: "不完整的流式答案" }),
    ]);
    const user = userEvent.setup();
    render(<AgentPanel apiOrigin="https://agent.example" fetchImpl={fetchImpl} />);

    await user.click(screen.getByRole("button", { name: "开始核验" }));

    expect(await screen.findByText("本次运行未完成")).toBeTruthy();
    expect(screen.getByText(/不符合约定的事件流/)).toBeTruthy();
    expect(screen.queryByText("不完整的流式答案")).toBeNull();
    expect(screen.queryByText("生成中")).toBeNull();
  });
});
