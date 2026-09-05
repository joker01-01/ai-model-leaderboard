import claudeLogo from "../assets/brands/claude.svg";
import deepseekLogo from "../assets/brands/deepseek.svg";
import geminiLogo from "../assets/brands/gemini.svg";
import glmLogo from "../assets/brands/glm.svg";
import grokLogo from "../assets/brands/grok.svg";
import kimiLogo from "../assets/brands/kimi.svg";
import metaLogo from "../assets/brands/meta.svg";
import openaiLogo from "../assets/brands/openai.svg";
import qwenLogo from "../assets/brands/qwen.svg";

interface CreatorIconProps {
  readonly creatorId: string | null;
  readonly creatorName: string | null;
}

interface CreatorLogo {
  readonly name: string;
  readonly src: string;
  readonly accessibleName?: string;
}

const CREATOR_LOGOS = new Map<string, Readonly<CreatorLogo>>([
  ["e67e56e3-15cd-43db-b679-da4660a69f41", { name: "openai", src: openaiLogo }],
  ["f0aa413f-e8ae-4fcd-9c48-0e049f4f3128", {
    name: "claude",
    src: claudeLogo,
    accessibleName: "Anthropic（Claude）",
  }],
  ["faddc6d9-2c14-445f-9b28-56726f59c793", {
    name: "gemini",
    src: geminiLogo,
    accessibleName: "Google（Gemini）",
  }],
  ["58b835bf-4c87-4f87-a846-df4b692c6e7d", { name: "deepseek", src: deepseekLogo }],
  ["a1e3ddcf-d3e4-44a5-9e8f-029a69850875", {
    name: "grok",
    src: grokLogo,
    accessibleName: "SpaceXAI（Grok）",
  }],
  ["67437eb6-7dc1-4e93-befd-22c8b8ec2065", {
    name: "glm",
    src: glmLogo,
    accessibleName: "Z AI（GLM）",
  }],
  ["0a177021-87dd-4250-9a37-f01df196bfe0", { name: "kimi", src: kimiLogo }],
  ["d874d370-74d3-4fa0-ba00-5272f92f946b", {
    name: "qwen",
    src: qwenLogo,
    accessibleName: "Alibaba（Qwen）",
  }],
  ["e1694725-0192-4e54-b1b8-c97e816c6cbe", { name: "meta", src: metaLogo }],
]);

function creatorInitial(creatorName: string | null): string {
  const normalizedName = creatorName?.trim();
  if (!normalizedName) return "?";
  const firstCharacter = Array.from(normalizedName)[0] ?? "?";
  return Array.from(firstCharacter.toLocaleUpperCase("en-US"))[0] ?? "?";
}

export default function CreatorIcon({ creatorId, creatorName }: CreatorIconProps) {
  const accessibleName = creatorName?.trim() || "未知开发者";
  const logo = creatorId === null ? undefined : CREATOR_LOGOS.get(creatorId);

  return (
    <span
      className="creator-icon"
      data-creator-id={creatorId ?? undefined}
      data-creator-logo={logo?.name}
      role="img"
      aria-label={`${logo?.accessibleName ?? accessibleName} 标志`}
    >
      {logo
        ? <img className="creator-icon__logo" src={logo.src} alt="" />
        : <span aria-hidden="true">{creatorInitial(creatorName)}</span>}
    </span>
  );
}
