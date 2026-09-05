// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHART_ANIMATION_DURATION_MS,
  easeChartProgress,
  useChartProgress,
} from "./useChartProgress";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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

function Progress({ metricKey, query = "" }: { metricKey: string; query?: string }) {
  const progress = useChartProgress(metricKey);
  return <output aria-label="progress" data-query={query}>{progress}</output>;
}

describe("useChartProgress", () => {
  it("uses one RAF chain for the whole 600ms chart transition", () => {
    setReducedMotion(false);
    const frames = installAnimationFrames();
    render(<Progress metricKey="intelligence" />);

    expect(screen.getByLabelText("progress").textContent).toBe("0");
    expect(frames.pendingCount).toBe(1);
    frames.advance(100);
    expect(frames.pendingCount).toBe(1);
    frames.advance(100 + CHART_ANIMATION_DURATION_MS / 2);
    const halfway = Number(screen.getByLabelText("progress").textContent);
    expect(halfway).toBeGreaterThan(0.5);
    expect(halfway).toBeLessThan(1);
    expect(frames.pendingCount).toBe(1);
    frames.advance(100 + CHART_ANIMATION_DURATION_MS);
    expect(screen.getByLabelText("progress").textContent).toBe("1");
    expect(frames.pendingCount).toBe(0);
  });

  it("replays only when the route metric key changes", () => {
    setReducedMotion(false);
    const frames = installAnimationFrames();
    const { rerender } = render(<Progress metricKey="intelligence" query="" />);
    frames.advance(0);
    frames.advance(CHART_ANIMATION_DURATION_MS);
    expect(screen.getByLabelText("progress").textContent).toBe("1");

    const requestsAfterCompletion = frames.request.mock.calls.length;
    rerender(<Progress metricKey="intelligence" query="claude" />);
    expect(screen.getByLabelText("progress").textContent).toBe("1");
    expect(frames.request).toHaveBeenCalledTimes(requestsAfterCompletion);

    rerender(<Progress metricKey="coding" query="claude" />);
    expect(screen.getByLabelText("progress").textContent).toBe("0");
    expect(frames.pendingCount).toBe(1);
  });

  it("renders the final values without scheduling animation for reduced motion", () => {
    setReducedMotion(true);
    const frames = installAnimationFrames();
    const { rerender } = render(<Progress metricKey="intelligence" />);

    expect(screen.getByLabelText("progress").textContent).toBe("1");
    expect(frames.request).not.toHaveBeenCalled();
    rerender(<Progress metricKey="coding" />);
    expect(screen.getByLabelText("progress").textContent).toBe("1");
    expect(frames.request).not.toHaveBeenCalled();
  });

  it("cancels the pending chart frame when the chart unmounts", () => {
    setReducedMotion(false);
    const frames = installAnimationFrames();
    const { unmount } = render(<Progress metricKey="price" />);
    expect(frames.pendingCount).toBe(1);

    unmount();
    expect(frames.cancel).toHaveBeenCalledOnce();
    expect(frames.pendingCount).toBe(0);
  });

  it("implements the approved easing endpoints", () => {
    expect(easeChartProgress(-1)).toBe(0);
    expect(easeChartProgress(0)).toBe(0);
    expect(easeChartProgress(0.5)).toBeGreaterThan(0.5);
    expect(easeChartProgress(1)).toBe(1);
    expect(easeChartProgress(2)).toBe(1);
  });
});
