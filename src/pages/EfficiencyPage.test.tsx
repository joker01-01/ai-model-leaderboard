// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreatorOption } from "../components/LeaderboardLayout";
import type { EfficiencyMetric } from "../lib/hashRoute";
import { buildAaModelPresentationIndex } from "../lib/modelPresentation";
import type { AaPublicModel, AaPublicSnapshot } from "../lib/aaPublicSnapshot";
import EfficiencyPage from "./EfficiencyPage";

function model(sourceId: string, overrides: Partial<AaPublicModel> = {}): AaPublicModel {
  return {
    sourceId,
    sourceSlug: `slug-${sourceId}`,
    rawName: `Model ${sourceId}`,
    creatorId: "creator-a",
    creatorName: "Creator A",
    releaseDate: null,
    observedAt: "2026-09-04",
    intelligence: null,
    coding: null,
    agentic: null,
    inputPricePerMillion: null,
    outputPricePerMillion: null,
    timeToFirstAnswerSeconds: null,
    outputTokensPerSecond: null,
    ...overrides,
  };
}

function snapshot(): AaPublicSnapshot {
  const models = [
    model("alpha", {
      rawName: "Alpha",
      timeToFirstAnswerSeconds: 0.5,
      outputTokensPerSecond: 200,
      inputPricePerMillion: 1,
      outputPricePerMillion: 10,
    }),
    model("beta", {
      rawName: "Beta",
      creatorId: "creator-b",
      creatorName: "Creator B",
      timeToFirstAnswerSeconds: 0.1,
      outputTokensPerSecond: 300,
      inputPricePerMillion: 2,
      outputPricePerMillion: 30,
    }),
    model("gamma", {
      rawName: "Gamma",
      timeToFirstAnswerSeconds: 2,
      outputTokensPerSecond: 100,
      inputPricePerMillion: 0,
      outputPricePerMillion: 0,
    }),
    model("delta", {
      rawName: "Delta",
      creatorId: "creator-b",
      creatorName: "Creator B",
      timeToFirstAnswerSeconds: null,
      outputTokensPerSecond: 500,
      inputPricePerMillion: 5,
      outputPricePerMillion: 20,
    }),
    model("epsilon", {
      rawName: "Epsilon",
      creatorId: "creator-c",
      creatorName: "Creator C",
      timeToFirstAnswerSeconds: 0.3,
      outputTokensPerSecond: 300,
      inputPricePerMillion: null,
      outputPricePerMillion: 100,
    }),
  ];
  return {
    schemaVersion: 1,
    source: {
      url: "https://artificialanalysis.ai/leaderboards/models",
      observedAt: "2026-09-04",
      schemaFingerprint: "test-fingerprint",
      intelligenceIndexVersion: 4,
      pagination: {
        pageSize: 100,
        totalPages: 1,
        declaredTotalRows: null,
        fetchedRowCount: models.length,
      },
    },
    models,
  };
}

const PRIMARY_CREATORS: readonly CreatorOption[] = [
  { id: "creator-a", name: "Creator A" },
  { id: "creator-b", name: "Creator B" },
];

function renderPage(metric: EfficiencyMetric) {
  const data = snapshot();
  const presentations = buildAaModelPresentationIndex(data.models);
  const displayNames = new Map(
    Array.from(presentations, ([sourceId, presentation]) => [sourceId, presentation.displayName]),
  );
  return render(
    <EfficiencyPage
      snapshot={data}
      metric={metric}
      presentations={presentations}
      displayNames={displayNames}
      primaryCreators={PRIMARY_CREATORS}
    />,
  );
}

function rankingList(metric: EfficiencyMetric): HTMLElement {
  return screen.getByRole("list", { name: metric === "speed" ? "模型速度排名" : "模型价格排名" });
}

function rankedSourceIds(metric: EfficiencyMetric): string[] {
  return Array.from(rankingList(metric).querySelectorAll<HTMLElement>("[data-source-id]"), (node) =>
    node.dataset.sourceId ?? "");
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

afterEach(cleanup);

describe("EfficiencyPage", () => {
  it("orders speed by output throughput, keeps both values, and filters without reranking", async () => {
    const user = userEvent.setup();
    renderPage("speed");

    expect(screen.getByRole("heading", { level: 1, name: "模型速度榜单" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "榜单分类" })).toBeNull();
    expect(screen.queryByRole("link", { name: "价格" })).toBeNull();
    const legend = screen.getByRole("group", { name: "指标图例" });
    expect(within(legend).getByText("首字延迟")).toBeTruthy();
    expect(within(legend).getByText("输出速度")).toBeTruthy();
    expect(rankedSourceIds("speed")).toEqual(["beta", "epsilon", "alpha", "gamma"]);
    const firstRow = within(rankingList("speed")).getAllByRole("listitem")[0];
    expect(within(firstRow).getByText("首个答案 Token 时间：0.1 秒，越低越好")).toBeTruthy();
    expect(within(firstRow).getByText("输出速度：300 tokens/s，越高越好")).toBeTruthy();
    expect(within(firstRow).getByText("第 1 名")).toBeTruthy();
    expect(firstRow.querySelectorAll(".model-identity")).toHaveLength(1);
    expect(firstRow.querySelectorAll(".dual-metric-chart__bar")).toHaveLength(2);
    expect(Array.from(firstRow.querySelectorAll(".metric-number"), (node) => node.textContent)).toEqual(["0.1", "300"]);
    expect(Array.from(firstRow.querySelectorAll(".metric-unit"), (node) => node.textContent)).toEqual(["秒", "tokens/s"]);

    await user.click(screen.getByRole("button", { name: "Creator A" }));

    const filteredRows = within(rankingList("speed")).getAllByRole("listitem");
    expect(rankedSourceIds("speed")).toEqual(["alpha", "gamma"]);
    expect(within(filteredRows[0]).getByText("第 3 名")).toBeTruthy();
    expect(within(filteredRows[1]).getByText("第 4 名")).toBeTruthy();
  });

  it("orders price by output price from high to low and requires both prices", () => {
    renderPage("price");

    expect(screen.getByRole("heading", { level: 1, name: "模型价格榜单" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "榜单分类" })).toBeNull();
    expect(screen.queryByRole("link", { name: "速度" })).toBeNull();
    const legend = screen.getByRole("group", { name: "指标图例" });
    expect(within(legend).getByText("输入价格")).toBeTruthy();
    expect(within(legend).getByText("输出价格")).toBeTruthy();
    expect(rankedSourceIds("price")).toEqual(["beta", "delta", "alpha", "gamma"]);
    const firstRow = within(rankingList("price")).getAllByRole("listitem")[0];
    expect(within(firstRow).getByText("输入价格：$2 / 1M tokens")).toBeTruthy();
    expect(within(firstRow).getByText("输出价格：$30 / 1M tokens")).toBeTruthy();
    expect(Array.from(firstRow.querySelectorAll(".metric-number"), (node) => node.textContent)).toEqual(["$2", "$30"]);
    expect(Array.from(firstRow.querySelectorAll(".metric-unit"), (node) => node.textContent)).toEqual([
      "/ 1M tokens",
      "/ 1M tokens",
    ]);
    expect(within(rankingList("price")).queryByText("Epsilon")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText(/条结果/)).toBeNull();
  });
});
