import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--check");
const now = new Date().toISOString();

const paths = {
  aa: resolve(projectRoot, "src/data/generated/aaSnapshot.ts"),
  arena: resolve(projectRoot, "src/data/generated/arenaSnapshot.ts"),
  report: resolve(projectRoot, "data/sync-report.json"),
};

/**
 * 映射只允许精确 ID / slug / 名称匹配，禁止模糊匹配或仅按模型家族猜测。
 * 新模型或匹配歧义会进入报告，由人复核后再补充别名。
 */
const trackedModels = [
  { modelId: "deepseek-v4-pro", aaSlugs: ["deepseek-v4-pro-0813"], arenaNames: ["deepseek-v4-pro-0813", "DeepSeek V4 Pro"] },
  { modelId: "claude-opus-4-8", aaSlugs: ["claude-opus-4-8"], arenaNames: ["claude-opus-4-8", "Claude Opus 4.8"] },
  { modelId: "gpt-56-sol", aaSlugs: ["gpt-5-6-sol"], arenaNames: ["gpt-5.6-sol", "GPT-5.6 Sol"] },
  { modelId: "gpt-56-luna", aaSlugs: ["gpt-5-6-luna"], arenaNames: ["gpt-5.6-luna", "GPT-5.6 Luna"] },
  { modelId: "gemini-3-7-flash", aaSlugs: ["gemini-3-7-flash"], arenaNames: ["gemini-3.7-flash", "Gemini 3.7 Flash"] },
  { modelId: "qwen-3-5", aaSlugs: ["qwen3-5-397b-a17b", "qwen-qwen3-5-397b-a17b"], arenaNames: ["qwen3.5-397b-a17b", "Qwen3.5-397B-A17B"] },
  { modelId: "deepseek-v4", aaSlugs: ["deepseek-v4"], arenaNames: ["deepseek-v4", "DeepSeek V4"] },
  { modelId: "claude-sonnet-4-6", aaSlugs: ["claude-sonnet-4-6"], arenaNames: ["claude-sonnet-4-6", "Claude Sonnet 4.6"] },
  { modelId: "glm-5-3", aaSlugs: ["glm-5-3"], arenaNames: ["glm-5.3", "GLM-5.3"] },
  { modelId: "grok-4-6", aaSlugs: ["grok-4-6"], arenaNames: ["grok-4.6", "Grok 4.6"] },
  { modelId: "kimi-k3", aaSlugs: ["kimi-k3"], arenaNames: ["kimi-k3", "Kimi K3"] },
  { modelId: "llama-5", aaSlugs: ["llama-5"], arenaNames: ["llama-5", "Llama 5"] },
  { modelId: "gemini-3-1-pro", aaSlugs: ["gemini-3-1-pro-preview"], arenaNames: ["gemini-3.1-pro-preview", "Gemini 3.1 Pro"] },
  { modelId: "minimax-m3", aaSlugs: ["minimax-m3"], arenaNames: ["minimax-m3", "MiniMax M3"] },
  { modelId: "deepseek-v4-flash", aaSlugs: ["deepseek-v4-flash-0731"], arenaNames: ["deepseek-v4-flash-0731", "DeepSeek V4 Flash"] },
  { modelId: "claude-fable-5", aaSlugs: ["claude-fable-5"], arenaNames: ["claude-fable-5", "Claude Fable 5"] },
  { modelId: "grok-4-20", aaSlugs: ["grok-4-20"], arenaNames: ["grok-4.20", "Grok 4.20"] },
  { modelId: "motif-3", aaSlugs: ["motif-3"], arenaNames: ["motif-3", "Motif 3"] },
  { modelId: "doubao-2-1-pro", aaSlugs: ["doubao-2-1-pro"], arenaNames: ["doubao-2.1-pro", "Doubao 2.1 Pro"] },
  { modelId: "mistral-large-3", aaSlugs: ["mistral-large-3"], arenaNames: ["mistral-large-3", "Mistral Large 3"] },
];

async function fetchJson(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { accept: "application/json", ...(options.headers ?? {}) } });
      if (response.ok) return response.json();
      lastError = new Error(`${response.status} ${response.statusText}: ${url}`);
      if (![429, 500, 502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 2) await new Promise((resolveDelay) => setTimeout(resolveDelay, 800 * (attempt + 1)));
  }
  throw lastError;
}

function metric(value, row, kind) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return {
    value,
    rank: typeof row.rank === "number" ? row.rank : null,
    lower: typeof (kind === "agent" ? row.score_ci_lower : row.rating_lower) === "number" ? (kind === "agent" ? row.score_ci_lower : row.rating_lower) : null,
    upper: typeof (kind === "agent" ? row.score_ci_upper : row.rating_upper) === "number" ? (kind === "agent" ? row.score_ci_upper : row.rating_upper) : null,
    observations: typeof (kind === "agent" ? row.observation_count : row.vote_count) === "number" ? (kind === "agent" ? row.observation_count : row.vote_count) : null,
    category: String(row.category ?? "overall"),
    observedAt: String(row.leaderboard_publish_date ?? now.slice(0, 10)),
    modelVersion: String(row.model_name),
  };
}

async function arenaRows(config, names) {
  // 直接读取 Arena 官方发布的 latest Parquet 文件，避开 Dataset Viewer 的不稳定筛选服务。
  // latest 每个 Arena 只有一个小文件；只解码需要的列，再以精确别名筛选。
  const url = `https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset/resolve/main/${config}/latest-00000-of-00001.parquet?download=true`;
  const file = await asyncBufferFromUrl({ url });
  const rows = await parquetReadObjects({
    file,
    columns: ["model_name", "rating", "rating_lower", "rating_upper", "vote_count", "score", "score_ci_lower", "score_ci_upper", "observation_count", "rank", "category", "leaderboard_publish_date"],
  });
  const aliases = new Set(names);
  return rows.filter((row) => String(row.category ?? "").toLowerCase() === "overall" && aliases.has(String(row.model_name)));
}

function findArenaMatch(rows, names) {
  const aliases = new Set(names);
  const matches = rows.filter((row) => aliases.has(String(row.model_name)));
  const overall = matches.filter((row) => String(row.category ?? "").toLowerCase() === "overall");
  const eligible = overall.length > 0 ? overall : matches;
  if (eligible.length !== 1) return { match: null, count: eligible.length };
  return { match: eligible[0], count: 1 };
}

async function syncArena() {
  const configs = [
    ["text", "text_style_control"],
    ["webdev", "webdev"],
    ["agent", "agent"],
  ];
  const arenaNames = trackedModels.flatMap((model) => model.arenaNames);
  const allRows = await Promise.all(configs.map(async ([kind, config]) => [kind, await arenaRows(config, arenaNames)]));
  const models = {};
  const matched = [];
  const unmatched = [];
  const ambiguous = [];

  for (const model of trackedModels) {
    const profile = {};
    for (const [kind, rows] of allRows) {
      const result = findArenaMatch(rows, model.arenaNames);
      if (result.match) {
        const value = kind === "agent" ? result.match.score : result.match.rating;
        const next = metric(value, result.match, kind);
        if (next) profile[kind] = next;
      } else if (result.count > 1) {
        ambiguous.push({ modelId: model.modelId, arena: kind, matches: result.count });
      }
    }
    if (Object.keys(profile).length > 0) {
      models[model.modelId] = profile;
      matched.push(model.modelId);
    } else {
      unmatched.push(model.modelId);
    }
  }

  return {
    snapshot: {
      generatedAt: now,
      sourceUrl: "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset",
      models,
    },
    report: { matched, unmatched, ambiguous, rows: Object.fromEntries(allRows.map(([kind, rows]) => [kind, rows.length])) },
  };
}

function findAaMatch(models, entry) {
  const aliases = new Set(entry.aaSlugs);
  const matches = models.filter((model) => aliases.has(String(model.slug)));
  if (matches.length !== 1) return { match: null, count: matches.length };
  return { match: matches[0], count: 1 };
}

async function syncArtificialAnalysis() {
  const key = process.env.AA_API_KEY;
  if (!key) return { skipped: true, report: { matched: [], unmatched: trackedModels.map((model) => model.modelId), ambiguous: [] } };
  // 当前免费 API 的正式入口。接口分页字段升级时，未识别的分页信息会安全地停在首屏，
  // 而不是按名称猜测未拉取到的模型。
  const payload = await fetchJson("https://artificialanalysis.ai/api/v2/language/models/free", { headers: { "x-api-key": key } });
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const models = {};
  const matched = [];
  const unmatched = [];
  const ambiguous = [];

  for (const entry of trackedModels) {
    const result = findAaMatch(rows, entry);
    if (!result.match) {
      (result.count > 1 ? ambiguous : unmatched).push(result.count > 1 ? { modelId: entry.modelId, matches: result.count } : entry.modelId);
      continue;
    }
    const evaluations = result.match.evaluations ?? {};
    const profile = {};
    const values = [
      ["intelligence", evaluations.artificial_analysis_intelligence_index],
      ["coding", evaluations.artificial_analysis_coding_index],
    ];
    for (const [kind, value] of values) {
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      profile[kind] = {
        value,
        modelVersion: String(result.match.name ?? result.match.slug),
        observedAt: now.slice(0, 10),
        sourceId: String(result.match.id),
        sourceSlug: String(result.match.slug),
      };
    }
    if (Object.keys(profile).length === 0) {
      unmatched.push(entry.modelId);
      continue;
    }
    models[entry.modelId] = profile;
    matched.push(entry.modelId);
  }

  return {
    skipped: false,
    snapshot: {
      generatedAt: now,
      source: "Artificial Analysis Data API",
      sourceUrl: "https://artificialanalysis.ai/data-api/docs",
      models,
    },
    report: { matched, unmatched, ambiguous, rows: rows.length },
  };
}

function renderTs(constName, value) {
  const kind = constName === "AA_SNAPSHOT" ? "AaSnapshot" : "ArenaSnapshot";
  const comment = constName === "AA_SNAPSHOT"
    ? "由 `npm run sync:data` 生成；请不要手工编辑。"
    : "由 `npm run sync:data` 生成；Arena 分数不参与本站主榜排序。";
  const interfaces = constName === "AA_SNAPSHOT"
    ? `export interface SyncedAaMetric {\n  value: number;\n  modelVersion: string;\n  observedAt: string;\n  sourceId: string;\n  sourceSlug: string;\n}\n\nexport interface AaSnapshot {\n  generatedAt: string | null;\n  source: "Artificial Analysis Data API" | "manual";\n  sourceUrl: string;\n  models: Record<string, Partial<Record<"intelligence" | "coding", SyncedAaMetric>>>;\n}`
    : `export interface ArenaMetric {\n  value: number;\n  rank: number | null;\n  lower: number | null;\n  upper: number | null;\n  observations: number | null;\n  category: string;\n  observedAt: string;\n  modelVersion: string;\n}\n\nexport interface ArenaSnapshot {\n  generatedAt: string | null;\n  sourceUrl: string;\n  models: Record<string, Partial<Record<"text" | "webdev" | "agent", ArenaMetric>>>;\n}`;
  return `/** ${comment} */\n${interfaces}\n\nexport const ${constName}: ${kind} = ${JSON.stringify(value, null, 2)};\n`;
}

async function writeOrCheck(path, content) {
  let existing = "";
  try { existing = await readFile(path, "utf8"); } catch { /* first generation */ }
  if (existing === content) return false;
  if (!dryRun) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
  }
  return true;
}

const [arena, aa] = await Promise.all([syncArena(), syncArtificialAnalysis()]);
const report = {
  generatedAt: now,
  policy: "仅精确版本映射；匹配歧义和缺失不改榜单。Arena 仅作详情参考，不参与主榜。",
  artificialAnalysis: aa.skipped ? { status: "skipped_missing_AA_API_KEY", ...aa.report } : { status: "updated", ...aa.report },
  arena: { status: "updated", ...arena.report },
};

const changes = [
  await writeOrCheck(paths.arena, renderTs("ARENA_SNAPSHOT", arena.snapshot)),
  await writeOrCheck(paths.report, `${JSON.stringify(report, null, 2)}\n`),
];
if (!aa.skipped) changes.push(await writeOrCheck(paths.aa, renderTs("AA_SNAPSHOT", aa.snapshot)));

console.log(`${dryRun ? "Checked" : "Updated"} ${changes.filter(Boolean).length} file(s).`);
console.log(`AA: ${aa.skipped ? "skipped (AA_API_KEY missing)" : `${aa.report.matched.length} matched`}; Arena: ${arena.report.matched.length} matched.`);
