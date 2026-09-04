// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

beforeEach(() => {
  window.location.hash = "#/";
  Object.defineProperty(window, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
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
  window.location.hash = "";
});

describe("public product routes", () => {
  it("opens as a four-card directory with the approved destinations", () => {
    const { container } = render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "AI 模型排行榜" })).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.find((link) => link.textContent?.includes("模型能力榜单"))?.getAttribute("href"))
      .toBe("#/ability/intelligence");
    expect(links.find((link) => link.textContent?.includes("模型速度榜单"))?.getAttribute("href"))
      .toBe("#/efficiency/speed");
    expect(links.find((link) => link.textContent?.includes("模型价格榜单"))?.getAttribute("href"))
      .toBe("#/efficiency/price");
    expect(links.find((link) => link.textContent?.includes("按需求选模型"))?.getAttribute("href"))
      .toBe("#/advisor");
    expect(container.querySelectorAll(".directory-card")).toHaveLength(4);
    expect(container.textContent).not.toContain("编辑推荐榜");
    expect(container.textContent).not.toContain("把模型选择变成可核验结论");
  });

  it("navigates to a complete ability view and always returns home", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("link", { name: /模型能力榜单/ }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "模型能力榜单" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "综合智能" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByText(/条结果/)).toBeNull();
    expect(screen.queryByText(/更新日期/)).toBeNull();

    await user.click(screen.getByRole("link", { name: "返回首页" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "AI 模型排行榜" })).toBeTruthy());
  });

  it("opens the advisor route as a disabled Phase 3 shell without the legacy console", () => {
    window.location.hash = "#/advisor";
    const { container } = render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "按需求选模型" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "你的需求" }) as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "尚未连接" }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector(".agent-panel")).toBeNull();
  });

  it("renders the home directory for an unknown hash", () => {
    window.location.hash = "#/unknown";
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "AI 模型排行榜" })).toBeTruthy();
  });
});
