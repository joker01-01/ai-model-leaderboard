// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import AdvisorForm from "./AdvisorForm";

afterEach(cleanup);

function candidate(sourceId: string, verificationStatus: "verified" | "partial" | "aa_only") {
  const citationId = `citation-${sourceId}`;
  return {
    source_id: sourceId,
    source_slug: `slug-${sourceId}`,
    raw_name: sourceId === "source-alpha" ? "Alpha Model Full" : "Beta Model Full",
    creator_id: "creator-alpha",
    creator_name: "Creator Alpha",
    release_date: null,
    observed_at: "2026-09-04",
    metrics: {
      intelligence: 70,
      coding: sourceId === "source-alpha" ? 88 : null,
      agentic: 0,
      input_price_per_million: 1,
      output_price_per_million: 3,
      time_to_first_answer_seconds: null,
      output_tokens_per_second: 150,
    },
    estimated_monthly_cost_usd: "0.2500",
    reason: sourceId === "source-alpha"
      ? "模型知识（可能过时）：编程能力强，适合代码任务。"
      : "速度更高，可作为备选。",
    verification_status: verificationStatus,
    checks: verificationStatus === "aa_only" ? [] : [{
      requirement: "api_access",
      status: "satisfied",
      summary: "官方文档确认 API 可用。",
      citation_ids: [citationId],
    }],
  };
}

function recommendationResponse() {
  return {
    outcome: "recommendation",
    aa_source: {
      url: "https://artificialanalysis.ai/leaderboards/models",
      observed_at: "2026-09-04",
      schema_fingerprint: "fingerprint-test",
    },
    parsed_need: {
      ability_purposes: ["coding"],
      promoted_objective: null,
      hard_requirements: ["api_access"],
    },
    verification_status: "aa_only",
    recommendation: candidate("source-alpha", "aa_only"),
    alternatives: [candidate("source-beta", "aa_only")],
    rejections: [],
    citations: [],
  };
}

function jsonFetch(body: object): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })) as unknown as typeof fetch;
}

describe("AdvisorForm", () => {
  it("omits idle and budget UI, keeps the action in the region row, and blocks invalid input", async () => {
    const fetchImpl = jsonFetch(recommendationResponse());
    const user = userEvent.setup();
    const { container } = render(
      <AdvisorForm apiOrigin="https://api.example.com" displayNames={new Map()} fetchImpl={fetchImpl} />,
    );

    expect(screen.getByLabelText("你的需求").hasAttribute("aria-describedby")).toBe(false);
    expect(screen.getByLabelText("部署地区（可选）").hasAttribute("aria-describedby")).toBe(false);
    expect(screen.queryByText("写清任务和最重要的偏好；系统只从完整 AA 榜单中筛选。")).toBeNull();
    expect(screen.queryByText("仅作为官方资料核验要求，不代表该地区一定可用。")).toBeNull();
    expect(screen.queryByRole("region", { name: "模型推荐结果" })).toBeNull();
    expect(container.querySelector(".advisor-result-empty")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "我有明确预算" })).toBeNull();
    expect(screen.queryByLabelText("月预算（USD）")).toBeNull();
    expect(screen.queryByLabelText("平均输入 tokens")).toBeNull();
    expect(screen.queryByLabelText("平均输出 tokens")).toBeNull();
    expect(screen.queryByLabelText("每月请求次数")).toBeNull();
    const formRow = container.querySelector(".advisor-form-row");
    expect(formRow).not.toBeNull();
    expect(within(formRow as HTMLElement).getByRole("button", { name: "获取推荐" })).toBeTruthy();
    expect(screen.queryByText(/受控官方来源|联网失败|实时核验/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "获取推荐" }));
    expect(screen.getByText("请输入你的需求。")).toBeTruthy();
    expect(screen.getByLabelText("你的需求").getAttribute("aria-describedby")).toBe("advisor-requirement-error");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("submits trimmed fields, renders the AA-only recommendation, and keeps evidence collapsed", async () => {
    const fetchImpl = jsonFetch(recommendationResponse());
    const fetchMock = fetchImpl as unknown as ReturnType<typeof vi.fn>;
    const user = userEvent.setup();
    render(
      <AdvisorForm
        apiOrigin="https://api.example.com"
        displayNames={new Map([["source-alpha", "Alpha 简称"]])}
        fetchImpl={fetchImpl}
      />,
    );

    await user.type(screen.getByLabelText("你的需求"), "  推荐一个编程模型  ");
    await user.type(screen.getByLabelText("部署地区（可选）"), "  Singapore  ");
    await user.click(screen.getByRole("button", { name: "获取推荐" }));

    const primaryStatusLabel = await screen.findByText("推荐依据");
    expect(within(primaryStatusLabel.parentElement as HTMLElement).getByText("未联网核验")).toBeTruthy();
    expect(within(primaryStatusLabel.parentElement as HTMLElement).getByText("排序与数值来自 AA 已提交快照")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "推荐 Alpha 简称" })).toBeTruthy();
    expect(screen.getByText("模型知识（可能过时）：编程能力强，适合代码任务。")).toBeTruthy();
    expect(screen.getAllByText("暂无 AA 数据").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0", { selector: ".advisor-metric-value" }).length).toBeGreaterThan(0);
    const evidenceSummary = screen.getByText("查看依据");
    expect((evidenceSummary.parentElement as HTMLDetailsElement).open).toBe(false);
    expect(screen.getByText(/DeepSeek 的补充说明基于已有知识，可能过时；本次不进行联网搜索/)).toBeTruthy();
    expect(screen.getByText(/硬性要求和部署地区未核验且不参与筛选/)).toBeTruthy();
    const alternativesSummary = screen.getByText("查看另外 1 个备选");
    expect(within(alternativesSummary.parentElement as HTMLElement).getByText("Beta Model Full")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Artificial Analysis/ }).getAttribute("href"))
      .toBe("https://artificialanalysis.ai/leaderboards/models");
    expect(screen.queryByText(/受控官方来源|联网失败|实时核验/)).toBeNull();

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({
      requirement: "推荐一个编程模型",
      deployment_region: "Singapore",
      budget: null,
    });
  });

  it("renders a successful AA-only no-candidate result separately from request failure", async () => {
    const fetchImpl = jsonFetch({
      outcome: "no_eligible_candidate",
      aa_source: {
        url: "https://artificialanalysis.ai/leaderboards/models",
        observed_at: "2026-09-04",
        schema_fingerprint: "fingerprint-test",
      },
      parsed_need: {
        ability_purposes: ["agentic"],
        promoted_objective: "cheapest",
        hard_requirements: [],
      },
      verification_status: "aa_only",
      recommendation: null,
      alternatives: [],
      rejections: [],
      citations: [],
    });
    const user = userEvent.setup();
    render(<AdvisorForm apiOrigin="https://api.example.com" displayNames={new Map()} fetchImpl={fetchImpl} />);

    await user.type(screen.getByLabelText("你的需求"), "最便宜的智能体模型");
    await user.click(screen.getByRole("button", { name: "获取推荐" }));

    expect(await screen.findByText("未联网核验")).toBeTruthy();
    expect(screen.getByText("排序与数值来自 AA 已提交快照")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "没有模型满足当前条件" })).toBeTruthy();
    expect(screen.getByText(/硬性要求和部署地区未核验，也未参与筛选/)).toBeTruthy();
    expect(screen.queryByText("本次推荐未完成")).toBeNull();
  });

  it("keeps legacy verified alternative citations out of an AA-only primary evidence group", async () => {
    const fetchImpl = jsonFetch({
      ...recommendationResponse(),
      verification_status: "aa_only",
      recommendation: candidate("source-alpha", "aa_only"),
      alternatives: [candidate("source-beta", "verified")],
      rejections: [],
      citations: [{
        citation_id: "citation-source-beta",
        title: "Beta API documentation",
        url: "https://beta.example/docs/api",
      }],
    });
    const user = userEvent.setup();
    render(<AdvisorForm apiOrigin="https://api.example.com" displayNames={new Map()} fetchImpl={fetchImpl} />);

    await user.type(screen.getByLabelText("你的需求"), "推荐一个编程模型");
    await user.click(screen.getByRole("button", { name: "获取推荐" }));

    expect(await screen.findByText("推荐依据")).toBeTruthy();
    expect(screen.getAllByText("未联网核验").length).toBeGreaterThan(0);
    expect(screen.getAllByText("旧版响应：已核验").length).toBeGreaterThan(0);

    const primaryEvidence = screen.getByRole("region", { name: "首选 Alpha Model Full 的推荐依据" });
    expect(within(primaryEvidence).getByText("排序与数值来自 AA 已提交快照。")).toBeTruthy();
    expect(within(primaryEvidence).queryByRole("link", { name: "Beta API documentation ↗" })).toBeNull();

    const alternativeEvidence = screen.getByRole("region", { name: "备选 Beta Model Full 的兼容核验依据" });
    expect(within(alternativeEvidence).getByRole("link", { name: "Beta API documentation ↗" }).getAttribute("href"))
      .toBe("https://beta.example/docs/api");
    expect(screen.getAllByRole("link", { name: /Artificial Analysis/ })).toHaveLength(1);
  });

  it("renders legacy cited rejections without claiming AA had no eligible candidates", async () => {
    const fetchImpl = jsonFetch({
      outcome: "no_eligible_candidate",
      aa_source: {
        url: "https://artificialanalysis.ai/leaderboards/models",
        observed_at: "2026-09-04",
        schema_fingerprint: "fingerprint-test",
      },
      parsed_need: {
        ability_purposes: ["coding"],
        promoted_objective: null,
        hard_requirements: ["api_access"],
      },
      verification_status: "partial",
      recommendation: null,
      alternatives: [],
      rejections: [{
        source_id: "source-alpha",
        source_slug: "slug-source-alpha",
        raw_name: "Alpha Model Full",
        creator_id: "creator-alpha",
        creator_name: "Creator Alpha",
        identity_check: {
          requirement: "model_identity",
          status: "satisfied",
          summary: "官方模型页确认 Alpha 的身份。",
          citation_ids: ["identity-source-alpha"],
        },
        contradictions: [{
          requirement: "api_access",
          status: "contradicted",
          summary: "官方文档明确说明不提供所需 API。",
          citation_ids: ["citation-source-alpha"],
        }],
      }, {
        source_id: "source-beta",
        source_slug: "slug-source-beta",
        raw_name: "Beta Model Full",
        creator_id: "creator-beta",
        creator_name: "Creator Beta",
        identity_check: {
          requirement: "model_identity",
          status: "satisfied",
          summary: "官方模型页确认 Beta 的身份。",
          citation_ids: ["identity-source-beta"],
        },
        contradictions: [{
          requirement: "commercial_use",
          status: "contradicted",
          summary: "官方条款不允许当前商业用途。",
          citation_ids: ["citation-source-beta"],
        }],
      }],
      citations: [{
        citation_id: "identity-source-alpha",
        title: "Alpha model documentation",
        url: "https://alpha.example/docs/models/alpha",
      }, {
        citation_id: "citation-source-alpha",
        title: "Alpha API documentation",
        url: "https://alpha.example/docs/api",
      }, {
        citation_id: "identity-source-beta",
        title: "Beta model documentation",
        url: "https://beta.example/docs/models/beta",
      }, {
        citation_id: "citation-source-beta",
        title: "Beta commercial terms",
        url: "https://beta.example/terms",
      }],
    });
    const user = userEvent.setup();
    render(<AdvisorForm apiOrigin="https://api.example.com" displayNames={new Map()} fetchImpl={fetchImpl} />);

    await user.type(screen.getByLabelText("你的需求"), "必须有 API 并允许商业使用");
    await user.click(screen.getByRole("button", { name: "获取推荐" }));

    expect(await screen.findByRole("heading", {
      level: 2,
      name: "兼容响应：候选存在已记录的条件冲突",
    })).toBeTruthy();
    expect(screen.getByText("兼容响应状态")).toBeTruthy();
    expect(screen.getByText("旧版响应：部分核验")).toBeTruthy();
    expect(screen.queryByText(/当前 AA 数据中没有/)).toBeNull();

    const alphaSummary = screen.getByText("Alpha Model Full");
    const alphaDetails = alphaSummary.closest("details") as HTMLDetailsElement;
    expect(alphaDetails.open).toBe(false);
    expect(within(alphaDetails).getByText("官方模型页确认 Alpha 的身份。")).toBeTruthy();
    expect(within(alphaDetails).getByRole("link", { name: "Alpha model documentation ↗" })).toBeTruthy();
    expect(within(alphaDetails).getByText("官方文档明确说明不提供所需 API。")).toBeTruthy();
    expect(within(alphaDetails).getByRole("link", { name: "Alpha API documentation ↗" })).toBeTruthy();
    expect(within(alphaDetails).queryByRole("link", { name: "Beta commercial terms ↗" })).toBeNull();

    const betaDetails = screen.getByText("Beta Model Full").closest("details") as HTMLDetailsElement;
    expect(within(betaDetails).getByRole("link", { name: "Beta commercial terms ↗" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: /Artificial Analysis/ })).toHaveLength(1);
  });

  it("aborts an in-flight request from the stop control", async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })) as unknown as typeof fetch;
    const user = userEvent.setup();
    render(<AdvisorForm apiOrigin="https://api.example.com" displayNames={new Map()} fetchImpl={fetchImpl} />);

    await user.type(screen.getByLabelText("你的需求"), "推荐一个模型");
    await user.click(screen.getByRole("button", { name: "获取推荐" }));
    await user.click(await screen.findByRole("button", { name: "停止推荐" }));

    await waitFor(() => expect(screen.getByText("已停止本次推荐。")).toBeTruthy());
  });

  it("keeps submission disconnected without a configured API origin", () => {
    render(<AdvisorForm apiOrigin={null} displayNames={new Map()} />);

    expect(screen.queryByText("推荐服务未配置，排行榜仍可正常使用。")).toBeNull();
    expect(screen.queryByText("一次提交，不保存历史。")).toBeNull();
    expect(document.querySelector(".advisor-form-actions > p")).toBeNull();
    expect((screen.getByRole("button", { name: "获取推荐" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByRole("form", { name: "模型推荐条件" })).getByLabelText("你的需求")).toBeTruthy();
  });
});
