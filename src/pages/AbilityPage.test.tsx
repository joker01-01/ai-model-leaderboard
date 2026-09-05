// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CreatorOption } from "../components/LeaderboardLayout";
import { buildAaModelPresentationIndex } from "../lib/modelPresentation";
import type { AaAbilityMetric } from "../lib/aaRankings";
import type { AaPublicModel, AaPublicSnapshot } from "../lib/aaPublicSnapshot";
import AbilityPage from "./AbilityPage";

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
    model("alpha", { rawName: "Alpha", intelligence: 100, coding: null, agentic: 10 }),
    model("beta", { rawName: "Beta", intelligence: 100, coding: 50, agentic: null }),
    model("gamma", { rawName: "Gamma", intelligence: 90, coding: 90, agentic: 20 }),
    model("fable", {
      rawName: "Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)",
      creatorId: "creator-b",
      creatorName: "Creator B",
      intelligence: 80,
      coding: 80,
      agentic: null,
    }),
    model("epsilon", {
      rawName: "Epsilon",
      creatorId: "creator-b",
      creatorName: "Creator B",
      intelligence: 70,
      coding: 0,
      agentic: 40,
    }),
    model("zeta", {
      rawName: "Zeta",
      creatorId: "creator-c",
      creatorName: "Creator C",
      intelligence: 60,
      coding: null,
      agentic: 50,
    }),
    model("metric-partial", {
      rawName: "Metric Partial",
      creatorId: "creator-c",
      creatorName: "Creator C",
      intelligence: null,
      coding: 40,
      agentic: 30,
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

function renderPage(metric: AaAbilityMetric) {
  const data = snapshot();
  const presentations = buildAaModelPresentationIndex(data.models);
  const displayNames = new Map(
    Array.from(presentations, ([sourceId, presentation]) => [sourceId, presentation.displayName]),
  );
  const view = render(
    <AbilityPage
      snapshot={data}
      metric={metric}
      presentations={presentations}
      displayNames={displayNames}
      primaryCreators={PRIMARY_CREATORS}
    />,
  );
  const rerenderMetric = (nextMetric: AaAbilityMetric) => view.rerender(
    <AbilityPage
      snapshot={data}
      metric={nextMetric}
      presentations={presentations}
      displayNames={displayNames}
      primaryCreators={PRIMARY_CREATORS}
    />,
  );
  return { ...view, rerenderMetric };
}

function rankedSourceIds(): string[] {
  const list = screen.getByRole("list", { name: "模型能力排名" });
  return Array.from(list.querySelectorAll<HTMLElement>("[data-source-id]"), (node) =>
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

describe("AbilityPage", () => {
  it("exposes all three metrics and includes every row finite for the selected metric", () => {
    const { rerenderMetric } = renderPage("intelligence");

    const navigation = screen.getByRole("navigation", { name: "榜单分类" });
    expect(within(navigation).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "综合智能",
      "编程智能",
      "智能体能力",
    ]);
    expect(screen.getByRole("link", { name: "综合智能" }).getAttribute("aria-current")).toBe("page");
    expect(rankedSourceIds()).toEqual(["alpha", "beta", "gamma", "fable", "epsilon", "zeta"]);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText(/条结果/)).toBeNull();
    expect(document.querySelector(".leaderboard-masthead p")).toBeNull();

    rerenderMetric("coding");
    expect(screen.getByRole("link", { name: "编程智能" }).getAttribute("aria-current")).toBe("page");
    expect(rankedSourceIds()).toEqual(["gamma", "fable", "beta", "metric-partial", "epsilon"]);
    expect(screen.getAllByRole("listitem")[0]
      .querySelector<HTMLElement>(".single-metric-chart__bar-fill")?.style.width).toBe("90%");

    rerenderMetric("agentic");
    expect(screen.getByRole("link", { name: "智能体能力" }).getAttribute("aria-current")).toBe("page");
    expect(rankedSourceIds()).toEqual(["zeta", "epsilon", "metric-partial", "gamma", "alpha"]);
    expect(screen.getAllByRole("listitem")[0]
      .querySelector<HTMLElement>(".single-metric-chart__bar-fill")?.style.width).toBe("50%");
  });

  it("keeps global competition rank after creator filtering", async () => {
    const user = userEvent.setup();
    renderPage("intelligence");

    await user.click(screen.getByRole("button", { name: "Creator B" }));

    const list = screen.getByRole("list", { name: "模型能力排名" });
    const rows = within(list).getAllByRole("listitem");
    expect(rankedSourceIds()).toEqual(["fable", "epsilon"]);
    expect(within(rows[0]).getByText("第 4 名")).toBeTruthy();
    expect(within(rows[1]).getByText("第 5 名")).toBeTruthy();
  });

  it("renders simplified model names without the removed qualifiers", () => {
    renderPage("intelligence");

    const list = screen.getByRole("list", { name: "模型能力排名" });
    expect(within(list).getByText("Fable 5.1 (Max)")).toBeTruthy();
    expect(within(list).queryByText(/Adaptive Reasoning/)).toBeNull();
  });
});
