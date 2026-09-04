import { compareUnicodeCodePoints, getAaNameSortKey, type AaRankedModel } from "./aaRankings";
import type { AaPublicModel } from "./aaPublicSnapshot";

export type AaCreatorBrand = "openai" | "anthropic" | "google" | "deepseek" | "xai";
export type AaCreatorTone = AaCreatorBrand | "other";

export interface AaModelPresentation {
  readonly sourceId: string;
  readonly displayName: string;
  readonly creatorLabel: string;
  readonly creatorInitial: string;
  readonly creatorBrand: AaCreatorBrand | null;
}

export const AA_FEATURED_CREATORS = Object.freeze([
  Object.freeze({
    creatorId: "e67e56e3-15cd-43db-b679-da4660a69f41",
    brand: "openai" as const,
    label: "OpenAI",
  }),
  Object.freeze({
    creatorId: "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128",
    brand: "anthropic" as const,
    label: "Anthropic",
  }),
  Object.freeze({
    creatorId: "faddc6d9-2c14-445f-9b28-56726f59c793",
    brand: "google" as const,
    label: "Google",
  }),
  Object.freeze({
    creatorId: "58b835bf-4c87-4f87-a846-df4b692c6e7d",
    brand: "deepseek" as const,
    label: "DeepSeek",
  }),
  Object.freeze({
    creatorId: "a1e3ddcf-d3e4-44a5-9e8f-029a69850875",
    brand: "xai" as const,
    label: "xAI",
  }),
]);

const BRAND_BY_CREATOR_ID = new Map<string, AaCreatorBrand>(
  AA_FEATURED_CREATORS.map((creator) => [creator.creatorId, creator.brand] as const),
);

export function getAaCreatorTone(creatorId: string | null): AaCreatorTone {
  if (creatorId === null) return "other";
  return BRAND_BY_CREATOR_ID.get(creatorId) ?? "other";
}

interface ParsedName {
  readonly initialLabel: string;
  readonly reasoningQualifier: string | null;
  readonly fallbackQualifier: string | null;
  readonly sourceSlug: string | null;
  readonly sourceId: string;
}

const EFFORT_VALUES = new Map([
  ["max", "Max"],
  ["xhigh", "XHigh"],
  ["high", "High"],
  ["medium", "Medium"],
  ["low", "Low"],
  ["minimal", "Minimal"],
]);

function normalizeEffortToken(token: string): string {
  const withoutEffort = token.replace(/\beffort\b/giu, "").replace(/\s+/g, " ").trim();
  return EFFORT_VALUES.get(withoutEffort.toLowerCase()) ?? withoutEffort;
}

function appendQualifier(label: string, qualifier: string | null): string {
  return qualifier === null ? label : `${label} (${qualifier})`;
}

function appendReasoningQualifier(label: string, qualifier: string | null): string {
  if (qualifier === null) return label;
  const trailingGroup = label.match(/(?: \(([^()]*)\)|（([^（）]*)）)$/u);
  if (trailingGroup === null) return `${label} (${qualifier})`;
  const existing = (trailingGroup[1] ?? trailingGroup[2] ?? "").trim();
  const merged = existing === "" ? qualifier : `${existing}·${qualifier}`;
  return `${label.slice(0, -trailingGroup[0].length)} (${merged})`;
}

function parseDisplayName(model: AaPublicModel): ParsedName {
  const raw = getAaNameSortKey(model)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^Claude\s+(?=\S)/iu, "");
  let reasoningQualifier: string | null = null;
  let fallbackQualifier: string | null = null;

  const captureReasoning = (qualifier: "R" | "NR") => {
    reasoningQualifier = qualifier;
    return " ";
  };
  const normalizeEffortPhrases = (value: string) => {
    let normalized = value;
    for (const [effort, label] of EFFORT_VALUES) {
      normalized = normalized.replace(
        new RegExp(`\\b${effort}\\s+effort\\b`, "giu"),
        label,
      );
    }
    return normalized.replace(/\beffort\b/giu, " ");
  };
  const cleanOutsideText = (value: string) => {
    let cleaned = value
      .replace(/\bnon[-\s]+reasoning\b/giu, () => captureReasoning("NR"))
      .replace(/\badaptive\s+reasoning\b/giu, () => captureReasoning("R"))
      .replace(/\breasoning\b/giu, () => captureReasoning("R"))
      .replace(/\bdefault\s+fallback\b/giu, " ");
    cleaned = cleaned.replace(
      /\b([\p{L}\p{N}+._-]+)(?:\s+([\p{L}\p{N}+._-]+))?\s+fallback\b/giu,
      (_match, first: string, second: string | undefined) => {
        if (second === undefined) {
          fallbackQualifier = `${first} Fallback`;
          return " ";
        }
        if (/\d/u.test(second)) {
          fallbackQualifier = `${first} ${second} Fallback`;
          return " ";
        }
        fallbackQualifier = `${second} Fallback`;
        return `${first} `;
      },
    );
    return normalizeEffortPhrases(cleaned);
  };
  const cleanGroupToken = (value: string) => {
    let cleaned = value
      .trim()
      .replace(/\bnon[-\s]+reasoning\b/giu, () => captureReasoning("NR"))
      .replace(/\badaptive\s+reasoning\b/giu, () => captureReasoning("R"))
      .replace(/\breasoning\b/giu, () => captureReasoning("R"))
      .replace(/\bdefault\s+fallback\b/giu, " ")
      .replace(/\s+/g, " ")
      .trim();
    const fallback = cleaned.match(/^(.+?)\s+fallback$/iu);
    if (fallback) {
      fallbackQualifier = `${fallback[1].trim()} Fallback`;
      return "";
    }
    cleaned = normalizeEffortPhrases(cleaned).replace(/\s+/g, " ").trim();
    return normalizeEffortToken(cleaned);
  };

  let initialLabel = "";
  let cursor = 0;
  for (const match of raw.matchAll(/\([^()]*\)|（[^（）]*）/g)) {
    const index = match.index ?? 0;
    initialLabel += cleanOutsideText(raw.slice(cursor, index));
    const visible = match[0]
      .slice(1, -1)
      .split(",")
      .map(cleanGroupToken)
      .filter((token) => token !== "");
    if (visible.length > 0) {
      const group = visible.join("、");
      const closesLabel = index + match[0].length === raw.length;
      initialLabel = closesLabel
        ? `${initialLabel.replace(/\s+$/g, "")} (${group})`
        : `${initialLabel.replace(/\s+$/g, "")}（${group}）`;
    } else {
      initialLabel += " ";
    }
    cursor = index + match[0].length;
  }
  initialLabel += cleanOutsideText(raw.slice(cursor));
  initialLabel = initialLabel.replace(/\s+/g, " ").trim();
  return {
    initialLabel,
    reasoningQualifier,
    fallbackQualifier,
    sourceSlug: model.sourceSlug,
    sourceId: model.sourceId,
  };
}

function duplicateGroups<T>(items: readonly T[], labelFor: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = labelFor(item);
    const group = groups.get(label);
    if (group) group.push(item);
    else groups.set(label, [item]);
  }
  return new Map(Array.from(groups).filter(([, group]) => group.length > 1));
}

function slugContainsParts(slug: string, candidate: readonly string[]): boolean {
  const parts = slug.split("-").filter(Boolean);
  for (let start = 0; start <= parts.length - candidate.length; start += 1) {
    if (candidate.every((part, offset) => parts[start + offset] === part)) return true;
  }
  return false;
}

function shortestUniqueSlugPart(item: ParsedName, group: readonly ParsedName[]): string | null {
  if (item.sourceSlug === null) return null;
  const ownParts = item.sourceSlug.split("-").filter(Boolean);
  const candidates: { readonly text: string; readonly start: number; readonly partCount: number }[] = [];
  for (let length = 1; length <= ownParts.length; length += 1) {
    for (let start = ownParts.length - length; start >= 0; start -= 1) {
      const candidate = ownParts.slice(start, start + length);
      const isUnique = group.every((other) => (
        other.sourceId === item.sourceId
        || other.sourceSlug === null
        || !slugContainsParts(other.sourceSlug, candidate)
      ));
      if (isUnique) candidates.push({ text: candidate.join("-"), start, partCount: length });
    }
  }
  candidates.sort((left, right) => {
    const lengthOrder = Array.from(left.text).length - Array.from(right.text).length;
    if (lengthOrder !== 0) return lengthOrder;
    if (left.partCount !== right.partCount) return left.partCount - right.partCount;
    if (left.start !== right.start) return right.start - left.start;
    return compareUnicodeCodePoints(left.text, right.text);
  });
  return candidates[0]?.text ?? null;
}

function groupHasDistinctQualifiers(
  group: readonly ParsedName[],
  qualifierFor: (item: ParsedName) => string | null,
): boolean {
  return new Set(group.map((item) => qualifierFor(item))).size > 1;
}

function buildUniqueDisplayNames(models: readonly AaPublicModel[]): ReadonlyMap<string, string> {
  const parsed = models.map(parseDisplayName);
  const labels = new Map(parsed.map((item) => [item.sourceId, item.initialLabel]));

  for (const group of duplicateGroups(parsed, (item) => labels.get(item.sourceId) ?? "").values()) {
    if (!groupHasDistinctQualifiers(group, (item) => item.reasoningQualifier)) continue;
    for (const item of group) {
      labels.set(
        item.sourceId,
        appendReasoningQualifier(labels.get(item.sourceId) ?? item.initialLabel, item.reasoningQualifier),
      );
    }
  }

  for (const group of duplicateGroups(parsed, (item) => labels.get(item.sourceId) ?? "").values()) {
    if (!groupHasDistinctQualifiers(group, (item) => item.fallbackQualifier)) continue;
    for (const item of group) {
      labels.set(item.sourceId, appendQualifier(labels.get(item.sourceId) ?? item.initialLabel, item.fallbackQualifier));
    }
  }

  for (const group of duplicateGroups(parsed, (item) => labels.get(item.sourceId) ?? "").values()) {
    for (const item of group) {
      const distinguishingPart = shortestUniqueSlugPart(item, group);
      labels.set(item.sourceId, appendQualifier(labels.get(item.sourceId) ?? item.initialLabel, distinguishingPart));
    }
  }

  for (const group of duplicateGroups(parsed, (item) => labels.get(item.sourceId) ?? "").values()) {
    for (const item of group) {
      labels.set(item.sourceId, appendQualifier(labels.get(item.sourceId) ?? item.initialLabel, item.sourceId));
    }
  }
  return labels;
}

function initialFor(label: string): string {
  return Array.from(label.trim())[0]?.toLocaleUpperCase() ?? "?";
}

export function buildAaModelPresentationIndex(
  models: readonly AaPublicModel[],
): ReadonlyMap<string, AaModelPresentation> {
  const displayNames = buildUniqueDisplayNames(models);
  const presentations = new Map<string, AaModelPresentation>();
  for (const model of models) {
    const creatorLabel = model.creatorName ?? "未知开发者";
    const creatorTone = getAaCreatorTone(model.creatorId);
    presentations.set(model.sourceId, Object.freeze({
      sourceId: model.sourceId,
      displayName: displayNames.get(model.sourceId) ?? getAaNameSortKey(model),
      creatorLabel,
      creatorInitial: initialFor(creatorLabel),
      creatorBrand: creatorTone === "other" ? null : creatorTone,
    }));
  }
  return presentations;
}

export function filterPresentedRanking(
  rows: readonly AaRankedModel[],
  presentations: ReadonlyMap<string, AaModelPresentation>,
  query: string,
  creatorId: string | null | undefined,
): readonly AaRankedModel[] {
  const needle = query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    if (creatorId !== undefined && row.creatorId !== creatorId) return false;
    if (needle === "") return true;
    const presentation = presentations.get(row.sourceId);
    return [
      presentation?.displayName,
      row.rawName,
      row.sourceSlug,
      row.sourceId,
      row.creatorName,
    ].some((value) => value?.toLocaleLowerCase().includes(needle) === true);
  });
}
