// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import SiteFooter from "./SiteFooter";

afterEach(cleanup);

const SOURCE_URL = "https://artificialanalysis.ai/leaderboards/models";

describe("SiteFooter", () => {
  it("renders the confirmed accounts, attribution, date, and safe external links", () => {
    const { container } = render(
      <SiteFooter observedAt="2026-09-04" sourceUrl={SOURCE_URL} />,
    );

    expect(screen.queryByText("WS")).toBeNull();

    const github = screen.getByRole("link", { name: "GitHub" });
    expect(github.getAttribute("href")).toBe("https://github.com/joker01-01");
    expect(github.getAttribute("target")).toBe("_blank");
    expect(github.getAttribute("rel")).toBe("noopener noreferrer");

    const bilibili = screen.getByRole("link", { name: "Bilibili" });
    expect(bilibili.getAttribute("href")).toBe("https://space.bilibili.com/691663896");
    expect(bilibili.getAttribute("target")).toBe("_blank");
    expect(bilibili.getAttribute("rel")).toBe("noopener noreferrer");

    const source = screen.getByRole("link", { name: "Artificial Analysis" });
    expect(source.getAttribute("href")).toBe(SOURCE_URL);
    expect(source.getAttribute("target")).toBe("_blank");
    expect(source.getAttribute("rel")).toBe("noopener noreferrer");
    expect(container.querySelector(".site-footer__meta")?.textContent)
      .toBe("数据来源：Artificial Analysis · 更新日期：2026-09-04");

    const wechat = screen.getByRole("button", { name: "23号切片二维码" });
    expect(wechat.hasAttribute("title")).toBe(false);
    expect(wechat.hasAttribute("aria-haspopup")).toBe(false);
    expect(wechat.hasAttribute("aria-expanded")).toBe(false);
    expect(container.querySelectorAll(".site-footer__social-icon")).toHaveLength(3);
  });

  it("keeps the QR preview text-free and keyboard reachable without a dialog", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <SiteFooter observedAt="2026-09-04" sourceUrl={SOURCE_URL} />,
    );

    const wechat = screen.getByRole("button", { name: "23号切片二维码" });
    const preview = container.querySelector<HTMLElement>(".site-footer__wechat-popover");
    const qrImage = preview?.querySelector<HTMLImageElement>(".site-footer__wechat-qr");

    expect(preview?.getAttribute("aria-hidden")).toBe("true");
    expect(preview?.textContent).toBe("");
    expect(qrImage?.getAttribute("alt")).toBe("");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(container.textContent).not.toContain("微信公众号");
    expect(container.textContent).not.toContain("使用微信扫描");

    await user.tab();
    await user.tab();
    await user.tab();
    expect(document.activeElement).toBe(wechat);
  });
});
