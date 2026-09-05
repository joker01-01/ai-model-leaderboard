// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AaRankedModel } from "../lib/aaRankings";
import SingleMetricChart from "./SingleMetricChart";

afterEach(cleanup);

function row(
  sourceId: string,
  primaryValue: number,
  rank: number,
  overrides: Partial<AaRankedModel> = {},
): AaRankedModel {
  return {
    sourceId,
    sourceSlug: `slug-${sourceId}`,
    rawName: `Raw ${sourceId}`,
    creatorId: "creator-id",
    creatorName: "Creator",
    releaseDate: null,
    observedAt: "2026-09-04",
    intelligence: primaryValue,
    coding: null,
    agentic: null,
    inputPricePerMillion: null,
    outputPricePerMillion: null,
    timeToFirstAnswerSeconds: null,
    outputTokensPerSecond: null,
    rank,
    primaryValue,
    ...overrides,
  };
}

describe("SingleMetricChart", () => {
  it("keeps global ranks and scales bars from the supplied complete-view maximum", () => {
    const rows = [row("one", 100, 1), row("filtered", 50, 3)];
    const displayNames = new Map([
      ["one", "Model One"],
      ["filtered", "Model Filtered"],
    ]);
    const { container } = render(
      <SingleMetricChart rows={rows.slice(1)} displayNames={displayNames} scaleMax={100} progress={0.5} />,
    );

    expect(screen.getByText("第 3 名").className).toBe("sr-only");
    expect(container.querySelector(".public-rank")).toBeNull();
    expect(container.textContent).not.toContain("03");
    expect(screen.getByText("Model Filtered")).toBeTruthy();
    expect(container.querySelector<HTMLElement>(".single-metric-chart__bar-fill")?.style.width).toBe("25%");
    expect(container.querySelector(".single-metric-chart__bar")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByText("得分 50").className).toBe("sr-only");
    expect(container.querySelector(".single-metric-chart__value [aria-hidden='true']")?.textContent).toBe("25");
    expect((container.querySelector(".single-metric-chart__value") as HTMLElement).style.left).toBe("25%");
    expect(Array.from(
      container.querySelectorAll(".single-metric-chart__axis-scale > span"),
      (tick) => tick.textContent,
    )).toEqual(["0", "25", "50", "75", "100"]);
  });

  it("uses a two-percent stub for an all-zero domain and marks previews", () => {
    const { container } = render(
      <SingleMetricChart
        rows={[row("zero", 0, 1)]}
        displayNames={new Map()}
        scaleMax={0}
        progress={0}
        preview
      />,
    );

    expect(screen.getByRole("list", { name: "模型能力榜单预览" })).toBeTruthy();
    expect(container.querySelector(".single-metric-chart")?.classList.contains("single-metric-chart--preview")).toBe(true);
    expect(container.querySelector(".single-metric-chart__axis")).toBeNull();
    expect((container.querySelector(".single-metric-chart__value") as HTMLElement).style.left).toBe("2%");
    expect(container.querySelector<HTMLElement>(".single-metric-chart__bar-fill")?.style.width).toBe("2%");
    expect(screen.getByText("得分 0")).toBeTruthy();
  });

  it("clamps invalid progress without emitting NaN widths", () => {
    const { container } = render(
      <SingleMetricChart rows={[row("one", 10, 1)]} displayNames={new Map()} scaleMax={10} progress={Number.NaN} />,
    );

    expect(container.querySelector<HTMLElement>(".single-metric-chart__bar-fill")?.style.width).toBe("0%");
    expect(container.innerHTML).not.toContain("NaN");
  });

  it("renders metric prefixes and units as separate visual parts with an exact accessible value", () => {
    const { container } = render(
      <SingleMetricChart
        rows={[row("priced", 30, 1)]}
        displayNames={new Map()}
        scaleMax={60}
        progress={1}
        preview
        tone="price"
        ariaLabel="模型输出价格榜单预览"
        metricLabel="输出价格"
        valuePrefix="$"
        valueSuffix="/ 1M tokens"
      />,
    );

    expect(screen.getByRole("list", { name: "模型输出价格榜单预览" })).toBeTruthy();
    expect(screen.getByText("输出价格：$30 / 1M tokens").className).toBe("sr-only");
    expect(container.querySelector(".metric-number")?.textContent).toBe("$30");
    expect(container.querySelector(".metric-unit")?.textContent).toBe("/ 1M tokens");
    expect(container.querySelector(".single-metric-chart--price")).toBeTruthy();
  });

  it("marks rows with an exact creator tone and falls unknown creators back to other", () => {
    const openAiId = "e67e56e3-15cd-43db-b679-da4660a69f41";
    const { container } = render(
      <SingleMetricChart
        rows={[
          row("featured", 10, 1, { creatorId: openAiId, creatorName: "OpenAI" }),
          row("unknown", 9, 2, { creatorId: "unknown", creatorName: "OpenAI" }),
        ]}
        displayNames={new Map()}
        scaleMax={10}
        progress={1}
      />,
    );

    expect(container.querySelector("[data-source-id='featured']")?.closest("li")?.getAttribute("data-creator-tone")).toBe("openai");
    expect(container.querySelector("[data-source-id='unknown']")?.closest("li")?.getAttribute("data-creator-tone")).toBe("other");
  });
});
