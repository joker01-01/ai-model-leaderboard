// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HOME_ROUTE, parseHashRoute, routeHref, useHashRoute, type AppRoute } from "./hashRoute";

beforeEach(() => {
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("hash routes", () => {
  it.each([
    ["", { page: "home" }],
    ["#", { page: "home" }],
    ["#/", { page: "home" }],
    ["#/ability/intelligence", { page: "ability", metric: "intelligence" }],
    ["#/ability/coding", { page: "ability", metric: "coding" }],
    ["#/ability/agentic", { page: "ability", metric: "agentic" }],
    ["#/efficiency/speed", { page: "efficiency", metric: "speed" }],
    ["#/efficiency/price", { page: "efficiency", metric: "price" }],
    ["#/advisor", { page: "advisor" }],
  ] as const)("parses %s", (hash, expected) => {
    expect(parseHashRoute(hash)).toEqual(expected);
  });

  it.each([
    "#/unknown",
    "#/ability",
    "#/ability/INTELLIGENCE",
    "#/ability/intelligence/",
    "#/efficiency/speed?mode=fast",
    "/ability/intelligence",
  ])("returns home for the unknown hash %s", (hash) => {
    expect(parseHashRoute(hash)).toBe(HOME_ROUTE);
  });

  it("creates exact refresh-safe hash links which round-trip", () => {
    const routes: readonly AppRoute[] = [
      HOME_ROUTE,
      { page: "ability", metric: "intelligence" },
      { page: "ability", metric: "coding" },
      { page: "ability", metric: "agentic" },
      { page: "efficiency", metric: "speed" },
      { page: "efficiency", metric: "price" },
      { page: "advisor" },
    ];

    for (const route of routes) {
      expect(parseHashRoute(routeHref(route))).toEqual(route);
    }
  });

  it("tracks hash history changes and normalizes unknown routes to home", () => {
    window.history.replaceState(null, "", "#/ability/intelligence");
    const { result } = renderHook(() => useHashRoute());
    expect(result.current).toEqual({ page: "ability", metric: "intelligence" });

    act(() => {
      window.history.pushState(null, "", "#/efficiency/price");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current).toEqual({ page: "efficiency", metric: "price" });
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: "auto" });

    act(() => {
      window.history.pushState(null, "", "#/not-a-route");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(result.current).toBe(HOME_ROUTE);
  });
});
