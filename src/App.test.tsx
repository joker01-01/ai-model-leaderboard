// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("scales a desktop canvas on phones and restores normal layout after resizing", () => {
    const originalWidth = window.innerWidth;
    try {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
      const { container } = render(<App />);
      const canvas = container.querySelector<HTMLElement>(".public-app")!;
      expect(canvas.style.width).toBe("1100px");
      expect(Number(canvas.style.zoom)).toBeCloseTo(390 / 1100);

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 430 });
      fireEvent(window, new Event("resize"));
      expect(Number(canvas.style.zoom)).toBeCloseTo(430 / 1100);

      Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
      fireEvent(window, new Event("resize"));
      expect(canvas.style.width).toBe("");
      expect(canvas.style.zoom).toBe("");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });

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
    expect(screen.queryByText("WS")).toBeNull();
    expect(screen.getByRole("link", { name: "GitHub" }).getAttribute("href"))
      .toBe("https://github.com/joker01-01");
    expect(screen.getByRole("link", { name: "Bilibili" }).getAttribute("href"))
      .toBe("https://space.bilibili.com/691663896");
    expect(screen.getByRole("button", { name: "23号切片二维码" })).toBeTruthy();
    expect(screen.getByText("更新日期：2026-09-04")).toBeTruthy();
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
    expect(document.querySelector(".site-footer")).toBeNull();

    await user.click(screen.getByRole("link", { name: "返回首页" }));
    await waitFor(() => expect(screen.getByRole("heading", { level: 1, name: "AI 模型排行榜" })).toBeTruthy());
  });

  it("opens the one-shot advisor form without the legacy console", () => {
    window.location.hash = "#/advisor";
    const { container } = render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "按需求选模型" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "你的需求" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "部署地区（可选）" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "我有明确预算" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "获取推荐" }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.textContent).not.toContain("写下任务、预算和部署要求");
    expect(container.textContent).not.toContain("写清任务和最重要的偏好");
    expect(container.textContent).not.toContain("仅作为官方资料核验要求");
    expect(container.textContent).not.toContain("推荐服务未配置");
    expect(container.textContent).not.toContain("下一阶段接入");
    expect(container.querySelector(".agent-panel")).toBeNull();
    expect(container.querySelector(".site-footer")).toBeNull();
  });

  it("renders the home directory for an unknown hash", () => {
    window.location.hash = "#/unknown";
    render(<App />);
    expect(screen.getByRole("heading", { level: 1, name: "AI 模型排行榜" })).toBeTruthy();
  });
});
