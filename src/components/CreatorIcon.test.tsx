// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { AaPublicModel } from "../lib/aaPublicSnapshot";
import CreatorIcon from "./CreatorIcon";
import ModelIdentity from "./ModelIdentity";

afterEach(cleanup);

function model(overrides: Partial<AaPublicModel> = {}): AaPublicModel {
  return {
    sourceId: "claude-fable-max",
    sourceSlug: "claude-fable-max",
    rawName: "Claude Fable 5.1 (Adaptive Reasoning, Max Effort, Default Fallback)",
    creatorId: "anthropic-id",
    creatorName: "Anthropic",
    releaseDate: null,
    observedAt: "2026-09-04",
    intelligence: 50,
    coding: 40,
    agentic: 30,
    inputPricePerMillion: 3,
    outputPricePerMillion: 15,
    timeToFirstAnswerSeconds: 0.5,
    outputTokensPerSecond: 100,
    ...overrides,
  };
}

describe("CreatorIcon", () => {
  it("renders a stable creator initial and an accessible creator label", () => {
    const { container } = render(<CreatorIcon creatorId="anthropic-id" creatorName="Anthropic" />);

    expect(screen.getByRole("img", { name: "Anthropic 标志" }).textContent).toBe("A");
    expect(container.querySelector(".creator-icon")?.getAttribute("data-creator-id")).toBe("anthropic-id");
  });

  it("keeps an unknown creator visible with a question-mark fallback", () => {
    render(<CreatorIcon creatorId={null} creatorName={null} />);

    expect(screen.getByRole("img", { name: "未知开发者 标志" }).textContent).toBe("?");
  });

  it("renders only the supplied simplified model label before the icon", () => {
    const { container } = render(<ModelIdentity model={model()} displayName="Fable 5.1 (Max)" />);

    expect(screen.getByText("Fable 5.1 (Max)").getAttribute("title")).toBe("Fable 5.1 (Max)");
    expect(screen.queryByText(/Adaptive Reasoning/)).toBeNull();
    expect(screen.getByRole("img", { name: "Anthropic 标志" })).toBeTruthy();
    expect(Array.from(container.querySelector(".model-identity")?.children ?? [], (node) => node.className))
      .toEqual(["model-identity__name", "creator-icon"]);
  });
});
