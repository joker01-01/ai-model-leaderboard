// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AA_FEATURED_CREATORS } from "../lib/modelPresentation";
import LeaderboardLayout from "./LeaderboardLayout";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("LeaderboardLayout", () => {
  it("renders tabs and color-keyed creator controls without search or source chrome", async () => {
    const user = userEvent.setup();
    const onCreatorChange = vi.fn();
    window.location.hash = "#/ability/intelligence";
    render(
      <LeaderboardLayout
        tone="ability"
        title="模型能力榜单"
        description="完整能力数据"
        tabs={[
          { href: "#/ability/intelligence", label: "综合智能", active: true },
          { href: "#/ability/coding", label: "编程智能", active: false },
        ]}
        creatorId={undefined}
        onCreatorChange={onCreatorChange}
        primaryCreators={AA_FEATURED_CREATORS.map((creator) => ({
          id: creator.creatorId,
          name: creator.label,
        }))}
      >
        <p>榜单内容</p>
      </LeaderboardLayout>,
    );

    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("link", { name: "Artificial Analysis" })).toBeNull();
    expect(screen.queryByText(/更新日期/)).toBeNull();
    expect(screen.getByRole("link", { name: "返回首页" }).getAttribute("href")).toBe("#/");
    expect(screen.getByRole("link", { name: "综合智能" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "编程智能" }).hasAttribute("aria-current")).toBe(false);

    await user.click(screen.getByRole("button", { name: "跳到榜单" }));
    expect(window.location.hash).toBe("#/ability/intelligence");
    expect((document.activeElement as HTMLElement).id).toBe("leaderboard-content");

    expect(screen.getByRole("button", { name: "全部" }).getAttribute("data-creator-tone")).toBe("all");
    for (const creator of AA_FEATURED_CREATORS) {
      expect(screen.getByRole("button", { name: creator.label }).getAttribute("data-creator-tone")).toBe(creator.brand);
    }
    expect(screen.queryByRole("button", { name: /更多/ })).toBeNull();
    expect(screen.queryByRole("listbox", { name: "更多开发者" })).toBeNull();

    const openAi = AA_FEATURED_CREATORS[0];
    await user.click(screen.getByRole("button", { name: openAi.label }));
    expect(onCreatorChange).toHaveBeenCalledWith(openAi.creatorId);
  });

  it("omits the metric navigation when the page has no internal categories", () => {
    render(
      <LeaderboardLayout
        tone="efficiency"
        title="模型速度榜单"
        description="完整速度数据"
        creatorId={undefined}
        onCreatorChange={vi.fn()}
        primaryCreators={[]}
      >
        <p>榜单内容</p>
      </LeaderboardLayout>,
    );

    expect(screen.queryByRole("navigation", { name: "榜单分类" })).toBeNull();
    expect(screen.getByLabelText("开发者筛选")).toBeTruthy();
  });

});
