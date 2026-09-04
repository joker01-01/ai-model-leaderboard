// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import { AA_INTELLIGENCE_LEADERBOARD, AA_LEADERBOARD_LIMIT } from "./lib/aaLeaderboard";

beforeEach(() => {
  localStorage.clear();
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

describe("App leaderboard modes", () => {
  it("keeps the public board on Intelligence-only source data without count labels", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    expect(screen.getByRole("tab", { name: "智能指数" })).toBeTruthy();
    expect(screen.queryByLabelText("国家或地区筛选")).toBeNull();
    expect(screen.queryByText("只看开源")).toBeNull();
    expect(container.textContent).not.toMatch(/Top\s*20/i);
    expect(container.textContent).not.toContain("当前共");
    expect(container.textContent).not.toContain("个模型有同版本智能指数");
    expect(screen.getByText("公开评测榜 · 智能指数")).toBeTruthy();
    expect(screen.getByText(
      AA_INTELLIGENCE_LEADERBOARD.length === AA_LEADERBOARD_LIMIT ? "AA 完整榜已同步" : "AA 完整榜待同步",
    )).toBeTruthy();
    expect(container.querySelectorAll(".board .rows > .row")).toHaveLength(AA_INTELLIGENCE_LEADERBOARD.length);
    if (AA_INTELLIGENCE_LEADERBOARD.length === 0) {
      expect(screen.getByRole("heading", { name: "AA 数据暂不可用" })).toBeTruthy();
    }
    expect(container.textContent).not.toContain("官方数据已同步");

    await user.click(screen.getByRole("button", { name: /编辑推荐榜/ }));

    expect(screen.getByLabelText("国家或地区筛选")).toBeTruthy();
    expect(screen.getByText("只看开源")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "编程" })).toBeTruthy();
  });
});
