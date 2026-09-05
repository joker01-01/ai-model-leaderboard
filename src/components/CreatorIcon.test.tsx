// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import claudeLogo from "../assets/brands/claude.svg";
import deepseekLogo from "../assets/brands/deepseek.svg";
import geminiLogo from "../assets/brands/gemini.svg";
import glmLogo from "../assets/brands/glm.svg";
import grokLogo from "../assets/brands/grok.svg";
import kimiLogo from "../assets/brands/kimi.svg";
import metaLogo from "../assets/brands/meta.svg";
import openaiLogo from "../assets/brands/openai.svg";
import qwenLogo from "../assets/brands/qwen.svg";
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
  it.each([
    ["OpenAI", "e67e56e3-15cd-43db-b679-da4660a69f41", "openai", openaiLogo, "OpenAI 标志"],
    ["Anthropic", "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128", "claude", claudeLogo, "Anthropic（Claude） 标志"],
    ["Google", "faddc6d9-2c14-445f-9b28-56726f59c793", "gemini", geminiLogo, "Google（Gemini） 标志"],
    ["DeepSeek", "58b835bf-4c87-4f87-a846-df4b692c6e7d", "deepseek", deepseekLogo, "DeepSeek 标志"],
    ["SpaceXAI", "a1e3ddcf-d3e4-44a5-9e8f-029a69850875", "grok", grokLogo, "SpaceXAI（Grok） 标志"],
    ["Z AI", "67437eb6-7dc1-4e93-befd-22c8b8ec2065", "glm", glmLogo, "Z AI（GLM） 标志"],
    ["Kimi", "0a177021-87dd-4250-9a37-f01df196bfe0", "kimi", kimiLogo, "Kimi 标志"],
    ["Alibaba", "d874d370-74d3-4fa0-ba00-5272f92f946b", "qwen", qwenLogo, "Alibaba（Qwen） 标志"],
    ["Meta", "e1694725-0192-4e54-b1b8-c97e816c6cbe", "meta", metaLogo, "Meta 标志"],
  ])("renders the reviewed %s logo for its exact creator ID", (creatorName, creatorId, logoName, asset, accessibleName) => {
    render(<CreatorIcon creatorId={creatorId} creatorName={creatorName} />);

    const icon = screen.getByRole("img", { name: accessibleName });
    const logo = icon.querySelector("img");
    expect(icon.getAttribute("data-creator-logo")).toBe(logoName);
    expect(logo?.getAttribute("alt")).toBe("");
    expect(logo?.getAttribute("src")).toBe(asset);
    expect(icon.querySelector("span")).toBeNull();
  });

  it("renders a stable creator initial and an accessible creator label", () => {
    const { container } = render(<CreatorIcon creatorId="anthropic-id" creatorName="Anthropic" />);

    expect(screen.getByRole("img", { name: "Anthropic 标志" }).textContent).toBe("A");
    expect(container.querySelector(".creator-icon")?.getAttribute("data-creator-id")).toBe("anthropic-id");
  });

  it.each([
    ["wrong-openai-id", "OpenAI", "O"],
    ["wrong-glm-id", "GLM", "G"],
    ["constructor", "Constructor Labs", "C"],
    ["__proto__", "Prototype AI", "P"],
    ["", "Empty ID", "E"],
    [null, "No ID", "N"],
  ])("keeps the initial fallback for unmapped creator ID %s", (creatorId, creatorName, initial) => {
    render(<CreatorIcon creatorId={creatorId} creatorName={creatorName} />);

    const icon = screen.getByRole("img", { name: `${creatorName} 标志` });
    expect(icon.textContent).toBe(initial);
    expect(icon.querySelector("img")).toBeNull();
    expect(icon.hasAttribute("data-creator-logo")).toBe(false);
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
