const LEGACY_SNAPSHOT_FORMATS = Object.freeze({
  AA_SNAPSHOT: {
    kind: "AaSnapshot",
    comment: "由 `npm run sync:data` 生成；请不要手工编辑。",
    interfaces: `export interface SyncedAaMetric {
  value: number;
  modelVersion: string;
  observedAt: string;
  sourceId: string;
  sourceSlug: string;
}

export interface SyncedAaLeaderboardEntry {
  sourceId: string;
  sourceSlug: string;
  modelVersion: string;
  creatorId: string | null;
  creatorName: string | null;
  releaseDate: string | null;
  value: number;
  observedAt: string;
}

export interface AaSnapshot {
  generatedAt: string | null;
  source: "Artificial Analysis Data API" | "manual";
  sourceUrl: string;
  intelligenceIndexVersion: number;
  intelligenceLeaderboard: SyncedAaLeaderboardEntry[];
  models: Record<string, Partial<Record<"intelligence" | "coding", SyncedAaMetric>>>;
}`,
  },
  ARENA_SNAPSHOT: {
    kind: "ArenaSnapshot",
    comment: "由 `npm run sync:data` 生成；Arena 分数不参与本站主榜排序。",
    interfaces: `export interface ArenaMetric {
  value: number;
  rank: number | null;
  lower: number | null;
  upper: number | null;
  observations: number | null;
  category: string;
  observedAt: string;
  modelVersion: string;
}

export interface ArenaSnapshot {
  generatedAt: string | null;
  sourceUrl: string;
  models: Record<string, Partial<Record<"text" | "webdev" | "agent", ArenaMetric>>>;
}`,
  },
});

export function renderLegacySnapshotModule(constantName, value) {
  const format = LEGACY_SNAPSHOT_FORMATS[constantName];
  if (!format) throw new Error(`Unsupported legacy snapshot constant: ${String(constantName)}`);
  return `/** ${format.comment} */
${format.interfaces}

export const ${constantName}: ${format.kind} = ${JSON.stringify(value, null, 2)};
`;
}
