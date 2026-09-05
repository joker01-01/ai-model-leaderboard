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
    reason: sourceId === "source-alpha" ? "编程能力优先且符合预算。" : "速度更高，可作为备选。",
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
    verification_status: "verified",
    recommendation: candidate("source-alpha", "verified"),
    alternatives: [candidate("source-beta", "partial")],
    rejections: [],
    citations: [
      {
        citation_id: "citation-source-alpha",
        title: "Alpha API documentation",
        url: "https://alpha.example/docs/api",
      },
      {
        citation_id: "citation-source-beta",
        title: "Beta API documentation",
        url: "https://beta.example/docs/api",
      },
    ],
  };
}

function jsonFetch(body: object): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })) as unknown as typeof fetch;
}

describe("AdvisorForm", () => {
  it("shows progressive budget fields and blocks invalid input before fetch", async () => {
    const fetchImpl = jsonFetch(recommendationResponse());
    const user = userEvent.setup();
    render(<AdvisorForm apiOrigin="https://api.example.com" displayNames={new Map()} fetchImpl={fetchImpl} />);

    expect(screen.getByLabelText("你的需求").hasAttribute("aria-describedby")).toBe(false);
    expect(screen.getByLabelText("部署地区（可选）").hasAttribute("aria-describedby")).toBe(false);
    expect(screen.queryByText("写清任务和最重要的偏好；系统只从完整 AA 榜单中筛选。")).toBeNull();
    expect(screen.queryByText("仅作为官方资料核验要求，不代表该地区一定可用。")).toBeNull();
    await user.click(screen.getByRole("button", { name: "获取推荐" }));
    expect(screen.getByText("请输入你的需求。")).toBeTruthy();
    expect(screen.getByLabelText("你的需求").getAttribute("aria-describedby")).toBe("advisor-requirement-error");
    expect(fetchImpl).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "我有明确预算" }));
    expect(screen.getByLabelText("月预算（USD）")).toBeTruthy();
    expect(screen.getByLabelText("平均输入 tokens")).toBeTruthy();
    expect(screen.getByLabelText("平均输出 tokens")).toBeTruthy();
    expect(screen.getByLabelText("每月请求次数")).toBeTruthy();

    await user.type(screen.getByLabelText("你的需求"), "推荐一个编程模型");
    await user.type(screen.getByLabelText("月预算（USD）"), "-1");
    await user.type(screen.getByLabelText("平均输入 tokens"), "0");
    await user.type(screen.getByLabelText("平均输出 tokens"), "0");
    await user.type(screen.getByLabelText("每月请求次数"), "0");
    await user.click(screen.getByRole("button", { name: "获取推荐" }));

    expect(screen.getByText("月预算必须是大于或等于 0 的数字。")).toBeTruthy();
    expect(screen.getByText("每月请求次数必须是正整数。")).toBeTruthy();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("submits trimmed fields, renders the recommendation, and keeps evidence collapsed", async () => {
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
    await user.click(screen.getByRole("checkbox", { name: "我有明确预算" }));
    await user.type(screen.getByLabelText("月预算（USD）"), "20.50");
    await user.type(screen.getByLabelText("平均输入 tokens"), "0");
    await user.type(screen.getByLabelText("平均输出 tokens"), "800");
    await user.type(screen.getByLabelText("每月请求次数"), "1000");
    await user.click(screen.getByRole("button", { name: "获取推荐" }));

    const primaryStatusLabel = await screen.findByText("首选核验状态");
    expect(within(primaryStatusLabel.parentElement as HTMLElement).getByText("已完成实时核验")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "推荐 Alpha 简称" })).toBeTruthy();
    expect(screen.getByText("编程能力优先且符合预算。")).toBeTruthy();
    expect(screen.getAllByText("暂无 AA 数据").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0", { selector: ".advisor-metric-value" }).length).toBeGreaterThan(0);
    expect(screen.getByText("查看依据")).toBeTruthy();
    const alternativesSummary = screen.getByText("查看另外 1 个备选");
    expect(within(alternativesSummary.parentElement as HTMLElement).getByText("Beta Model Full")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Alpha API documentation ↗" }).getAttribute("href"))
      .toBe("https://alpha.example/docs/api");

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init.body))).toEqual({
      requirement: "推荐一个编程模型",
      deployment_region: "Singapore",
      budget: {
        currency: "USD",
        monthly_budget: "20.50",
        average_input_tokens: 0,
        average_output_tokens: 800,
        monthly_request_count: 1000,
      },
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

    expect(await screen.findByText("实时资料未完成核验")).toBeTruthy();
    expect(screen.getByText("仅依据 AA")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "没有模型满足当前条件" })).toBeTruthy();
    expect(screen.queryByText("本次推荐未完成")).toBeNull();
  });

  it("keeps alternative-only citations out of an AA-only primary evidence group", async () => {
    const fetchImpl = jsonFetch({
      ...recommendationResponse(),
      verification_status: "aa_only",
      recommendation: candidate("source-alpha", "aa_only"),
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

    expect(await screen.findByText("首选核验状态")).toBeTruthy();
    expect(screen.getByText("首选仅依据 AA")).toBeTruthy();

    const primaryEvidence = screen.getByRole("region", { name: "首选 Alpha Model Full 的核验依据" });
    expect(within(primaryEvidence).getByText("本候选未使用实时官方资料。")).toBeTruthy();
    expect(within(primaryEvidence).queryByRole("link", { name: "Beta API documentation ↗" })).toBeNull();

    const alternativeEvidence = screen.getByRole("region", { name: "备选 Beta Model Full 的核验依据" });
    expect(within(alternativeEvidence).getByRole("link", { name: "Beta API documentation ↗" }).getAttribute("href"))
      .toBe("https://beta.example/docs/api");
    expect(screen.getAllByRole("link", { name: /Artificial Analysis/ })).toHaveLength(1);
  });

  it("renders cited live rejections without claiming AA had no eligible candidates", async () => {
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
      name: "进入核验的 AA 候选均有官方证据与硬性条件冲突",
    })).toBeTruthy();
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
