// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAaModelPresentationIndex } from "../lib/modelPresentation";
import type { AaPublicModel, AaPublicSnapshot } from "../lib/aaPublicSnapshot";
import HomePage from "./HomePage";

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
      intelligence: 100,
      inputPricePerMillion: 1,
      outputPricePerMillion: 10,
      timeToFirstAnswerSeconds: 0.2,
      outputTokensPerSecond: 600,
    }),
    model("beta", {
      rawName: "Beta",
      intelligence: 100,
      inputPricePerMillion: 2,
      outputPricePerMillion: 60,
      timeToFirstAnswerSeconds: 0.4,
      outputTokensPerSecond: 500,
    }),
    model("gamma", {
      rawName: "Gamma",
      intelligence: 90,
      inputPricePerMillion: 3,
      outputPricePerMillion: 50,
      timeToFirstAnswerSeconds: 0.6,
      outputTokensPerSecond: 400,
    }),
    model("delta", {
      rawName: "Delta",
      intelligence: 80,
      inputPricePerMillion: 4,
      outputPricePerMillion: 40,
      timeToFirstAnswerSeconds: 0.8,
      outputTokensPerSecond: 300,
    }),
    model("epsilon", {
      rawName: "Epsilon",
      intelligence: 70,
      inputPricePerMillion: 5,
      outputPricePerMillion: 30,
      timeToFirstAnswerSeconds: 1,
      outputTokensPerSecond: 200,
    }),
    model("zeta", {
      rawName: "Zeta",
      intelligence: 60,
      inputPricePerMillion: 6,
      outputPricePerMillion: 20,
      timeToFirstAnswerSeconds: 1.2,
      outputTokensPerSecond: 100,
    }),
    model("missing-speed-side", {
      rawName: "Missing Speed Side",
      intelligence: 50,
      outputTokensPerSecond: 700,
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

function sourceIds(list: HTMLElement): string[] {
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HomePage", () => {
  it("keeps the four directory links in visual reading order", async () => {
    const user = userEvent.setup();
    const data = snapshot();
    const presentations = buildAaModelPresentationIndex(data.models);
    const displayNames = new Map(
      Array.from(presentations, ([sourceId, presentation]) => [sourceId, presentation.displayName]),
    );
    render(<HomePage snapshot={data} displayNames={displayNames} />);

    const title = screen.getByRole("heading", { level: 1, name: "AI 模型排行榜" });
    const ability = screen.getByRole("link", { name: "模型能力榜单" });
    const speed = screen.getByRole("link", { name: "模型速度榜单" });
    const price = screen.getByRole("link", { name: "模型价格榜单" });
    const advisor = screen.getByRole("link", { name: "按需求选模型" });

    expect(within(ability).getByRole("heading", { level: 2, name: "模型能力榜单" })).toBeTruthy();
    expect(within(speed).getByRole("heading", { level: 2, name: "模型速度榜单" })).toBeTruthy();
    expect(within(price).getByRole("heading", { level: 2, name: "模型价格榜单" })).toBeTruthy();
    expect(within(advisor).getByRole("heading", { level: 2, name: "按需求选模型" })).toBeTruthy();
    expect(within(advisor).queryByText("按你的任务、预算和部署需求筛选")).toBeNull();
    expect(within(advisor).getByText("开始选择")).toBeTruthy();
    expect(within(advisor).queryByText("下一阶段接入")).toBeNull();
    expect(document.activeElement).toBe(title);
    await user.tab();
    expect(document.activeElement).toBe(ability);
    await user.tab();
    expect(document.activeElement).toBe(speed);
    await user.tab();
    expect(document.activeElement).toBe(price);
    await user.tab();
    expect(document.activeElement).toBe(advisor);
  });

  it("keeps all ranking destinations usable when preview metrics are unavailable", () => {
    const data = { ...snapshot(), models: [] };
    render(<HomePage snapshot={data} displayNames={new Map()} />);

    const ability = screen.getByRole("link", { name: "模型能力榜单" });
    const speed = screen.getByRole("link", { name: "模型速度榜单" });
    const price = screen.getByRole("link", { name: "模型价格榜单" });

    expect(within(ability).getByText("综合智能数据暂不可用，仍可查看榜单来源与更新时间。")).toBeTruthy();
    expect(within(speed).getByText("速度数据暂不可用，仍可查看榜单来源与更新时间。")).toBeTruthy();
    expect(within(price).getByText("价格数据暂不可用，仍可查看榜单来源与更新时间。")).toBeTruthy();
    expect(ability.getAttribute("href")).toBe("#/ability/intelligence");
    expect(speed.getAttribute("href")).toBe("#/efficiency/speed");
    expect(price.getAttribute("href")).toBe("#/efficiency/price");
  });

  it("shows exactly the first five ability rows without expanding a competition tie", () => {
    const data = snapshot();
    const presentations = buildAaModelPresentationIndex(data.models);
    const displayNames = new Map(
      Array.from(presentations, ([sourceId, presentation]) => [sourceId, presentation.displayName]),
    );
    render(<HomePage snapshot={data} displayNames={displayNames} />);

    const abilityCard = screen.getByRole("link", { name: /模型能力榜单/ });
    const preview = within(abilityCard).getByRole("list", { name: "模型能力榜单预览" });
    const rows = within(preview).getAllByRole("listitem");

    expect(rows).toHaveLength(5);
    expect(sourceIds(preview)).toEqual(["alpha", "beta", "gamma", "delta", "epsilon"]);
    expect(within(rows[0]).getByText("第 1 名")).toBeTruthy();
    expect(within(rows[1]).getByText("第 1 名")).toBeTruthy();
    expect(within(rows[2]).getByText("第 3 名")).toBeTruthy();
    expect(within(preview).queryByText("Zeta")).toBeNull();
  });

  it("aligns the leading desktop ability fill to the leading price fill without changing its value", () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.matches(".ability-card .single-metric-chart__plot")) {
        return { left: 100, right: 1100, width: 1000 } as DOMRect;
      }
      if (this.matches(".price-card .single-metric-chart__bar-fill")) {
        return { left: 700, right: 900, width: 200 } as DOMRect;
      }
      return { left: 0, right: 0, width: 0 } as DOMRect;
    });
    const data = snapshot();
    const presentations = buildAaModelPresentationIndex(data.models);
    const displayNames = new Map(
      Array.from(presentations, ([sourceId, presentation]) => [sourceId, presentation.displayName]),
    );

    render(<HomePage snapshot={data} displayNames={displayNames} />);

    const abilityCard = screen.getByRole("link", { name: /模型能力榜单/ });
    const leadingRow = within(abilityCard).getAllByRole("listitem")[0];
    expect(leadingRow.querySelector<HTMLElement>(".single-metric-chart__bar-fill")?.style.width).toBe("80%");
    expect(within(leadingRow).getByText("得分 100")).toBeTruthy();
    expect(rectSpy).toHaveBeenCalled();
  });

  it("shows one output-speed bar for each of five static preview rows", () => {
    const data = snapshot();
    const presentations = buildAaModelPresentationIndex(data.models);
    const displayNames = new Map(
      Array.from(presentations, ([sourceId, presentation]) => [sourceId, presentation.displayName]),
    );
    const { container } = render(
      <HomePage snapshot={data} displayNames={displayNames} />,
    );

    const speedCard = screen.getByRole("link", { name: /模型速度榜单/ });
    const preview = within(speedCard).getByRole("list", { name: "模型输出速度榜单预览" });
    const rows = within(preview).getAllByRole("listitem");

    expect(rows).toHaveLength(5);
    expect(sourceIds(preview)).toEqual(["alpha", "beta", "gamma", "delta", "epsilon"]);
    expect(within(rows[0]).getByText("输出速度：600 tokens/s")).toBeTruthy();
    expect(rows[0].querySelector(".metric-number")?.textContent).toBe("600");
    expect(rows[0].querySelector(".metric-unit")?.textContent).toBe("tokens/s");
    expect(rows[0].querySelectorAll(".single-metric-chart__bar")).toHaveLength(1);
    expect(rows[0].querySelector<HTMLElement>(".single-metric-chart__bar-fill")?.style.width).toBe("75%");
    expect(speedCard.textContent).not.toContain("首字");
    expect(container.querySelector(".single-metric-chart--speed.single-metric-chart--preview")).toBeTruthy();
    expect(container.querySelector(".dual-metric-chart--preview")).toBeNull();
  });

  it("shows one output-price bar for each of five independently ranked preview rows", () => {
    const data = snapshot();
    const presentations = buildAaModelPresentationIndex(data.models);
    const displayNames = new Map(
      Array.from(presentations, ([sourceId, presentation]) => [sourceId, presentation.displayName]),
    );
    const { container } = render(
      <HomePage snapshot={data} displayNames={displayNames} />,
    );

    const priceCard = screen.getByRole("link", { name: /模型价格榜单/ });
    const preview = within(priceCard).getByRole("list", { name: "模型输出价格榜单预览" });
    const rows = within(preview).getAllByRole("listitem");

    expect(rows).toHaveLength(5);
    expect(sourceIds(preview)).toEqual(["beta", "gamma", "delta", "epsilon", "zeta"]);
    expect(within(rows[0]).getByText("输出价格：$60 / 1M tokens")).toBeTruthy();
    expect(rows[0].querySelector(".metric-number")?.textContent).toBe("$60");
    expect(rows[0].querySelector(".metric-unit")?.textContent).toBe("/ 1M tokens");
    expect(rows[0].querySelectorAll(".single-metric-chart__bar")).toHaveLength(1);
    expect(rows[0].querySelector<HTMLElement>(".single-metric-chart__bar-fill")?.style.width).toBe("75%");
    expect(container.querySelector(".single-metric-chart--price.single-metric-chart--preview")).toBeTruthy();
  });
});
