// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AaRankedModel } from "../lib/aaRankings";
import DualMetricChart from "./DualMetricChart";

const DEFAULT_SORT = Object.freeze({ side: "right", direction: "descending" } as const);
const ignoreSortChange = () => undefined;

afterEach(cleanup);

function row(sourceId: string, overrides: Partial<AaRankedModel> = {}): AaRankedModel {
  return {
    sourceId,
    sourceSlug: `slug-${sourceId}`,
    rawName: `Raw ${sourceId}`,
    creatorId: "creator-id",
    creatorName: "Creator",
    releaseDate: null,
    observedAt: "2026-09-04",
    intelligence: null,
    coding: null,
    agentic: null,
    inputPricePerMillion: 0,
    outputPricePerMillion: 0,
    timeToFirstAnswerSeconds: 0,
    outputTokensPerSecond: 0,
    rank: 1,
    primaryValue: 0,
    ...overrides,
  };
}

function barWidths(container: HTMLElement): readonly string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".dual-metric-chart__bar-fill"), (bar) => bar.style.width);
}

function valueOffsets(container: HTMLElement): readonly string[] {
  return Array.from(container.querySelectorAll<HTMLElement>(".dual-metric-chart__value"), (value) => value.style.left);
}

describe("DualMetricChart", () => {
  it("uses complete-view inverse and linear scales for the speed pair", () => {
    const scaleRows = [
      row("fast", { timeToFirstAnswerSeconds: 1, outputTokensPerSecond: 100, primaryValue: 100 }),
      row("middle", { timeToFirstAnswerSeconds: 2, outputTokensPerSecond: 50, primaryValue: 50, rank: 2 }),
      row("slow", { timeToFirstAnswerSeconds: 3, outputTokensPerSecond: 10, primaryValue: 10, rank: 3 }),
    ];
    const { container } = render(
      <DualMetricChart
        rows={[scaleRows[1]]}
        scaleRows={scaleRows}
        displayNames={new Map([["middle", "Middle Model"]])}
        progress={1}
        sort={DEFAULT_SORT}
        onSortChange={ignoreSortChange}
        view="speed"
      />,
    );

    const legend = screen.getByRole("group", { name: "指标图例" });
    expect(within(legend).getByText("首字延迟")).toBeTruthy();
    expect(within(legend).getByText("输出速度")).toBeTruthy();
    expect(container.querySelectorAll(".dual-metric-chart__axis-scale > span")).toHaveLength(5);
    expect(container.querySelector(".dual-metric-chart__axis-scale > span")?.textContent).toBe("4/0");
    expect(Array.from(container.querySelectorAll(".dual-metric-chart__axis-scale > span"), (tick) => tick.textContent).at(-1)).toBe("0/125");
    expect(barWidths(container)).toEqual(["50%", "40%"]);
    expect(valueOffsets(container)).toEqual(["50%", "40%"]);
    expect(screen.getByText("第 2 名").className).toBe("sr-only");
    expect(container.querySelector(".public-rank")).toBeNull();
    expect(screen.getByText("首个答案 Token 时间：2 秒，越低越好").className).toBe("sr-only");
    expect(screen.getByText("输出速度：50 tokens/s，越高越好").className).toBe("sr-only");
    expect(container.querySelectorAll(".dual-metric-chart__identity .model-identity")).toHaveLength(1);
    expect(container.querySelectorAll(".dual-metric-chart__bar[aria-hidden='true']")).toHaveLength(2);
    expect(container.querySelector(".dual-metric-chart__row")?.getAttribute("data-creator-tone")).toBe("other");
    expect(container.querySelector(".dual-metric-chart__label")).toBeNull();
    expect(Array.from(container.querySelectorAll(".metric-number"), (node) => node.textContent)).toEqual(["2", "50"]);
    expect(Array.from(container.querySelectorAll(".metric-unit"), (node) => node.textContent)).toEqual(["秒", "tokens/s"]);
  });

  it("keeps both observed speed extremes below readable axis ceilings", () => {
    const scaleRows = [
      row("fast", { timeToFirstAnswerSeconds: 1, outputTokensPerSecond: 100, primaryValue: 100 }),
      row("slow", { timeToFirstAnswerSeconds: 3, outputTokensPerSecond: 10, primaryValue: 10, rank: 2 }),
    ];
    const { container } = render(
      <DualMetricChart
        rows={[scaleRows[1]]}
        scaleRows={scaleRows}
        displayNames={new Map()}
        progress={1}
        sort={DEFAULT_SORT}
        onSortChange={ignoreSortChange}
        view="speed"
      />,
    );

    expect(barWidths(container)).toEqual(["25%", "8%"]);
    expect(valueOffsets(container)).toEqual(["25%", "8%"]);
    expect(Array.from(container.querySelectorAll(".dual-metric-chart__axis-scale > span"), (tick) => tick.textContent)).toEqual([
      "4/0",
      "3/31",
      "2/63",
      "1/94",
      "0/125",
    ]);
  });

  it("scales each price side independently with log1p while keeping exact linear text", () => {
    const visible = row("visible", {
      inputPricePerMillion: 3,
      outputPricePerMillion: 8,
      primaryValue: 8,
    });
    const scaleRows = [
      visible,
      row("maxima", { inputPricePerMillion: 15, outputPricePerMillion: 80, primaryValue: 80 }),
      row("orphan", { inputPricePerMillion: 999, outputPricePerMillion: null, primaryValue: 999 }),
    ];
    const { container } = render(
      <DualMetricChart
        rows={[visible]}
        scaleRows={scaleRows}
        displayNames={new Map()}
        progress={1}
        sort={DEFAULT_SORT}
        onSortChange={ignoreSortChange}
        view="price"
      />,
    );

    const legend = screen.getByRole("group", { name: "指标图例" });
    expect(within(legend).getByText("输入价格")).toBeTruthy();
    expect(within(legend).getByText("输出价格")).toBeTruthy();
    const widths = barWidths(container).map((width) => Number.parseFloat(width));
    expect(widths[0]).toBeCloseTo((Math.log1p(3) / Math.log1p(20)) * 100);
    expect(widths[1]).toBeCloseTo((Math.log1p(8) / Math.log1p(100)) * 100);
    expect(valueOffsets(container)).toEqual(barWidths(container));
    expect(Array.from(container.querySelectorAll(".dual-metric-chart__axis-scale > span"), (tick) => tick.textContent).at(-1)).toBe("$20/$100");
    expect(screen.getByText("输入价格：$3 / 1M tokens")).toBeTruthy();
    expect(screen.getByText("输出价格：$8 / 1M tokens")).toBeTruthy();
    expect(Array.from(container.querySelectorAll(".metric-number"), (node) => node.textContent)).toEqual(["$3", "$8"]);
    expect(Array.from(container.querySelectorAll(".metric-unit"), (node) => node.textContent)).toEqual([
      "/ 1M tokens",
      "/ 1M tokens",
    ]);
  });

  it("keeps the largest observed prices below the readable axis ceiling", () => {
    const maximum = row("maximum", {
      inputPricePerMillion: 150,
      outputPricePerMillion: 600,
      primaryValue: 600,
    });
    const { container } = render(
      <DualMetricChart
        rows={[maximum]}
        scaleRows={[maximum]}
        displayNames={new Map()}
        progress={1}
        sort={DEFAULT_SORT}
        onSortChange={ignoreSortChange}
        view="price"
      />,
    );

    expect(barWidths(container).every((width) => Number.parseFloat(width) < 100)).toBe(true);
    expect(Array.from(container.querySelectorAll(".dual-metric-chart__axis-scale > span"), (tick) => tick.textContent).at(-1)).toBe("$200/$800");
  });

  it("uses two-percent price stubs for all-zero sides and omits malformed rows", () => {
    const zero = row("zero");
    const missing = row("missing", { inputPricePerMillion: null });
    const { container } = render(
      <DualMetricChart
        rows={[zero, missing]}
        scaleRows={[zero]}
        displayNames={new Map()}
        progress={0}
        sort={DEFAULT_SORT}
        onSortChange={ignoreSortChange}
        preview
        view="price"
      />,
    );

    expect(screen.getByRole("list", { name: "模型速度和价格榜单预览" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "指标图例" })).toBeTruthy();
    expect(container.querySelector(".dual-metric-chart__axis")).toBeNull();
    expect(barWidths(container)).toEqual(["2%", "2%"]);
    expect(valueOffsets(container)).toEqual(["2%", "2%"]);
    expect(container.querySelectorAll(".dual-metric-chart__row")).toHaveLength(1);
    expect(container.innerHTML).not.toContain("NaN");
  });

  it("renders a finite five-point zero axis when a full price view contains only zeroes", () => {
    const zero = row("zero");
    const { container } = render(
      <DualMetricChart
        rows={[zero]}
        scaleRows={[zero]}
        displayNames={new Map()}
        progress={1}
        sort={DEFAULT_SORT}
        onSortChange={ignoreSortChange}
        view="price"
      />,
    );

    expect(Array.from(container.querySelectorAll(".dual-metric-chart__axis-scale > span"), (tick) => tick.textContent)).toEqual([
      "$0/$0",
      "$0/$0",
      "$0/$0",
      "$0/$0",
      "$0/$0",
    ]);
    expect(container.innerHTML).not.toContain("NaN");
    expect(container.innerHTML).not.toContain("Infinity");
  });

  it("renders two accessible sort controls with a split arrow icon", async () => {
    const user = userEvent.setup();
    const onSortChange = vi.fn();
    const visible = row("visible", { timeToFirstAnswerSeconds: 1, outputTokensPerSecond: 100 });
    const { container } = render(
      <DualMetricChart
        rows={[visible]}
        scaleRows={[visible]}
        displayNames={new Map()}
        progress={1}
        sort={DEFAULT_SORT}
        onSortChange={onSortChange}
        view="speed"
      />,
    );

    const leftButton = screen.getByRole("button", { name: /首字延迟，点击按从低到高排序/ });
    const rightButton = screen.getByRole("button", { name: /输出速度，当前从高到低排序/ });
    expect(leftButton.getAttribute("aria-pressed")).toBe("false");
    expect(rightButton.getAttribute("aria-pressed")).toBe("true");
    expect(rightButton.getAttribute("data-sort-direction")).toBe("descending");
    expect(container.querySelectorAll(".dual-metric-chart__sort-icon")).toHaveLength(2);
    expect(container.querySelectorAll(".dual-metric-chart__sort-up")).toHaveLength(2);
    expect(container.querySelectorAll(".dual-metric-chart__sort-down")).toHaveLength(2);
    expect(container.querySelectorAll(".dual-metric-chart__sort-icon[aria-hidden='true']")).toHaveLength(2);
    expect(container.querySelector(".dual-metric-chart__sort-up")?.getAttribute("d"))
      .toBe("M5.25 13V3.25m0 0-2.5 2.5");
    expect(container.querySelector(".dual-metric-chart__sort-down")?.getAttribute("d"))
      .toBe("M10.75 3v9.75m0 0 2.5-2.5");

    await user.click(leftButton);
    await user.click(rightButton);
    expect(onSortChange.mock.calls).toEqual([["left"], ["right"]]);
  });
});
