import { AA_SNAPSHOT } from "../data/generated/aaSnapshot";
import { competitionRanks } from "./ranking";

export const AA_LEADERBOARD_LIMIT = 20;
export const AA_PUBLIC_LEADERBOARD_URL = "https://artificialanalysis.ai/leaderboards/models";

export interface AaLeaderboardEntry {
  sourceId: string;
  sourceSlug: string;
  modelVersion: string;
  creatorId: string | null;
  creatorName: string | null;
  releaseDate: string | null;
  value: number;
  observedAt: string;
  rank: number;
}

interface SnapshotExtension {
  generatedAt?: unknown;
  sourceUrl?: unknown;
  intelligenceIndexVersion?: unknown;
  intelligenceLeaderboard?: unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "" || value.trim() !== value) {
    throw new Error(`${path} must be a non-empty trimmed string`);
  }
  return value;
}

function nullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return requiredString(value, path);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function nullableDate(value: unknown, path: string): string | null {
  if (value === null) return null;
  const date = requiredString(value, path);
  if (!isIsoDate(date)) throw new Error(`${path} must be an ISO date or null`);
  return date;
}

function requiredDate(value: unknown, path: string): string {
  const date = nullableDate(value, path);
  if (date === null) throw new Error(`${path} must be an ISO date`);
  return date;
}

function parseIndexVersion(value: unknown, required: boolean): number | null {
  if (value === undefined && !required) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error("AA intelligenceIndexVersion must be a positive finite number");
  }
  return value;
}

function compareEntries(left: Omit<AaLeaderboardEntry, "rank">, right: Omit<AaLeaderboardEntry, "rank">): number {
  if (left.value !== right.value) return right.value - left.value;
  if (left.modelVersion !== right.modelVersion) return left.modelVersion < right.modelVersion ? -1 : 1;
  return left.sourceId < right.sourceId ? -1 : left.sourceId > right.sourceId ? 1 : 0;
}

function parseSyncedEntries(value: unknown): Array<Omit<AaLeaderboardEntry, "rank">> {
  if (!Array.isArray(value)) throw new Error("AA intelligenceLeaderboard must be an array");
  if (value.length !== AA_LEADERBOARD_LIMIT) {
    throw new Error(`AA intelligenceLeaderboard must contain exactly ${AA_LEADERBOARD_LIMIT} entries`);
  }

  const sourceIds = new Set<string>();
  const entries = value.map((item, index) => {
    const path = `AA intelligenceLeaderboard[${index}]`;
    if (!isObject(item)) throw new Error(`${path} must be an object`);
    const sourceId = requiredString(item.sourceId, `${path}.sourceId`);
    if (sourceIds.has(sourceId)) throw new Error(`AA intelligenceLeaderboard contains duplicate sourceId ${sourceId}`);
    sourceIds.add(sourceId);
    if (typeof item.value !== "number" || !Number.isFinite(item.value)) {
      throw new Error(`${path}.value must be a finite number`);
    }
    return {
      sourceId,
      sourceSlug: requiredString(item.sourceSlug, `${path}.sourceSlug`),
      modelVersion: requiredString(item.modelVersion, `${path}.modelVersion`),
      creatorId: nullableString(item.creatorId, `${path}.creatorId`),
      creatorName: nullableString(item.creatorName, `${path}.creatorName`),
      releaseDate: nullableDate(item.releaseDate, `${path}.releaseDate`),
      value: item.value,
      observedAt: requiredDate(item.observedAt, `${path}.observedAt`),
    };
  });
  if (new Set(entries.map((entry) => entry.observedAt)).size !== 1) {
    throw new Error("AA intelligenceLeaderboard entries must share one observedAt date");
  }
  return entries;
}

export function buildAaLeaderboardEntries(snapshotValue: unknown): AaLeaderboardEntry[] {
  if (!isObject(snapshotValue)) throw new Error("AA snapshot must be an object");
  const snapshot = snapshotValue as SnapshotExtension;
  const hasLeaderboard = snapshot.intelligenceLeaderboard !== undefined;
  if (!hasLeaderboard && snapshot.intelligenceIndexVersion !== undefined) {
    throw new Error("AA intelligenceIndexVersion requires intelligenceLeaderboard");
  }
  parseIndexVersion(snapshot.intelligenceIndexVersion, hasLeaderboard);
  const entries = hasLeaderboard ? parseSyncedEntries(snapshot.intelligenceLeaderboard) : [];
  const sorted = entries.sort(compareEntries).slice(0, AA_LEADERBOARD_LIMIT);
  const ranks = competitionRanks(sorted.map((entry) => entry.value));
  return sorted.map((entry, index) => ({ ...entry, rank: ranks[index] }));
}

const snapshot = AA_SNAPSHOT as unknown as SnapshotExtension;

export const AA_INTELLIGENCE_LEADERBOARD = buildAaLeaderboardEntries(snapshot);
export const AA_INTELLIGENCE_INDEX_VERSION = parseIndexVersion(
  snapshot.intelligenceIndexVersion,
  snapshot.intelligenceLeaderboard !== undefined,
);
export const AA_LEADERBOARD_OBSERVED_AT = AA_INTELLIGENCE_LEADERBOARD[0]?.observedAt ?? null;
export const AA_DATA_API_URL = typeof snapshot.sourceUrl === "string" ? snapshot.sourceUrl : "https://artificialanalysis.ai/data-api/docs";
