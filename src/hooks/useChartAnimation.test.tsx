// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHART_ANIMATION_DURATION_MS, easeChartProgress, useChartAnimation } from "./useChartAnimation";

const cancelAnimation = vi.fn();
const animate = vi.fn((_frames: Keyframe[], _options: KeyframeAnimationOptions) => ({ cancel: cancelAnimation }));

beforeEach(() => {
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = this.dataset.offscreen === "true" ? 10000 : 100;
    return { top, bottom: top + 44, left: 0, right: 100, width: 100, height: 44 } as DOMRect;
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  animate.mockClear();
  cancelAnimation.mockClear();
  Reflect.deleteProperty(Element.prototype, "animate");
});

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

function installAnimationFrames() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const request = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId;
    nextId += 1;
    callbacks.set(id, callback);
    return id;
  });
  const cancel = vi.fn((id: number) => callbacks.delete(id));
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", cancel);

  return {
    request,
    cancel,
    get pendingCount() {
      return callbacks.size;
    },
    advance(timestamp: number) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      act(() => pending.forEach((callback) => callback(timestamp)));
    },
  };
}

function Chart({ metricKey, renderSpy = () => {}, query = "", rowCount = 2, value = "65.7" }: {
  metricKey: string; renderSpy?: () => void; query?: string; rowCount?: number; value?: string;
}) {
  renderSpy();
  const ref = useChartAnimation(metricKey);
  return <div ref={ref} data-query={query}>
    {Array.from({ length: rowCount }, (_, index) => <div key={index} className="single-metric-chart__row" data-offscreen={index > 0}>
      <span className="single-metric-chart__plot">
        <span className="single-metric-chart__bar-fill" style={{ width: "100px" }} />
        <span className="single-metric-chart__value">
          <span className="sr-only">Exact score 65.7</span>
          <span className="metric-number" data-final-value={value} data-testid={index === 0 ? "visible" : index === 1 ? "offscreen" : undefined}>{value}</span>
        </span>
      </span>
    </div>)}
  </div>;
}

describe("useChartAnimation", () => {
  it("animates only visible bars using transforms without frame-by-frame React renders", () => {
    setReducedMotion(false);
    const frames = installAnimationFrames();
    const renders = vi.fn();
    render(<Chart metricKey="intelligence" renderSpy={renders} rowCount={630} />);
    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate.mock.calls[0][0]).toEqual([
      { transform: "scaleX(0)", transformOrigin: "left center" },
      { transform: "scaleX(1)", transformOrigin: "left center" },
    ]);
    expect(screen.getByTestId("visible").textContent).toBe("0");
    expect(screen.getByTestId("offscreen").textContent).toBe("65.7");
    frames.advance(300);
    expect(Number(screen.getByTestId("visible").textContent)).toBeGreaterThan(32);
    frames.advance(CHART_ANIMATION_DURATION_MS);
    expect(screen.getByTestId("visible").textContent).toBe("65.7");
    expect(screen.getAllByText("Exact score 65.7")).toHaveLength(630);
    expect(renders).toHaveBeenCalledOnce();
    expect(frames.pendingCount).toBe(0);
  });

  it("restarts when the selected metric, creator or sort changes, not on unrelated renders", () => {
    setReducedMotion(false);
    const frames = installAnimationFrames();
    const { rerender } = render(<Chart metricKey="intelligence" />);
    frames.advance(600);
    rerender(<Chart metricKey="intelligence" query="OpenAI" />);
    expect(animate).toHaveBeenCalledTimes(2);
    rerender(<Chart metricKey="coding" query="OpenAI" />);
    expect(animate).toHaveBeenCalledTimes(4);
    expect(frames.pendingCount).toBe(1);
    rerender(<Chart metricKey="coding:OpenAI" />);
    expect(animate).toHaveBeenCalledTimes(6);
    rerender(<Chart metricKey="price:OpenAI:left:ascending" />);
    expect(animate).toHaveBeenCalledTimes(8);
    rerender(<Chart metricKey="price:OpenAI:left:descending" />);
    expect(animate).toHaveBeenCalledTimes(10);
  });

  it("keeps new metric values when interrupting an unfinished animation on reused rows", () => {
    setReducedMotion(false);
    const frames = installAnimationFrames();
    const { rerender } = render(<Chart metricKey="intelligence" />);
    frames.advance(100);
    rerender(<Chart metricKey="coding" value="42.3" />);
    frames.advance(600);
    expect(screen.getByTestId("visible").textContent).toBe("42.3");
    expect(screen.getByTestId("offscreen").textContent).toBe("42.3");
    expect(frames.pendingCount).toBe(0);
  });

  it("keeps final values with no animation or RAF for reduced motion", () => {
    setReducedMotion(true);
    const frames = installAnimationFrames();
    render(<Chart metricKey="intelligence" />);
    expect(screen.getByTestId("visible").textContent).toBe("65.7");
    expect(animate).not.toHaveBeenCalled();
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("falls back to static exact values when Web Animations is unavailable", () => {
    setReducedMotion(false);
    Reflect.deleteProperty(Element.prototype, "animate");
    const frames = installAnimationFrames();
    render(<Chart metricKey="intelligence" />);
    expect(screen.getByTestId("visible").textContent).toBe("65.7");
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("cancels the number frame and compositor animations on unmount", () => {
    setReducedMotion(false);
    const frames = installAnimationFrames();
    const { unmount } = render(<Chart metricKey="price" />);
    unmount();
    expect(cancelAnimation).toHaveBeenCalledTimes(2);
    expect(frames.pendingCount).toBe(0);
  });

  it("keeps the approved duration and easing endpoints", () => {
    expect(CHART_ANIMATION_DURATION_MS).toBe(600);
    expect(easeChartProgress(0)).toBe(0);
    expect(easeChartProgress(0.5)).toBeGreaterThan(0.5);
    expect(easeChartProgress(1)).toBe(1);
  });
});
