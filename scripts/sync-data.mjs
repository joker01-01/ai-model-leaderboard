import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { asyncBufferFromUrl, parquetReadObjects } from "hyparquet";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--check");
const now = new Date().toISOString();

const paths = {
  aa: resolve(projectRoot, "src/data/generated/aaSnapshot.ts"),
  aliases: resolve(projectRoot, "data/modelops/model-aliases.json"),
  arena: resolve(projectRoot, "src/data/generated/arenaSnapshot.ts"),
  report: resolve(projectRoot, "data/sync-report.json"),
};

/**
 * 映射只允许精确 ID / slug / 名称匹配，禁止模糊匹配或仅按模型家族猜测。
 * 新模型或匹配歧义会进入报告，由人复核后再补充别名。
 */
const aliasConfig = JSON.parse(await readFile(paths.aliases, "utf8"));
if (aliasConfig.schemaVersion !== 1 || !Array.isArray(aliasConfig.models)) {
  throw new Error(`Unsupported model alias schema in ${paths.aliases}`);
}
const modelIds = new Set();
const aliasOwners = {
  aaSlugs: new Map(),
  arenaNames: new Map(),
  benchmarkVersionIds: new Map(),
};
const providerBindingOwners = new Map();
const providerIds = new Set(["alibaba-cloud-model-studio", "anthropic", "deepseek", "openai", "qwen"]);
const trackedModels = aliasConfig.models.map((entry, index) => {
  const entryPath = `model alias entry ${index}`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`${entryPath} must be an object`);
  }
  const keys = Object.keys(entry).sort();
  const expectedKeys = ["aaSlugs", "arenaNames", "modelId"];
  if ("benchmarkVersionIds" in entry) expectedKeys.push("benchmarkVersionIds");
  if ("providerModels" in entry) expectedKeys.push("providerModels");
  if (keys.join("|") !== expectedKeys.sort().join("|")) {
    throw new Error(`${entryPath} has missing or unexpected fields`);
  }
  if (
    typeof entry.modelId !== "string"
    || entry.modelId.trim() === ""
    || entry.modelId.trim() !== entry.modelId
    || modelIds.has(entry.modelId)
  ) {
    throw new Error(`${entryPath}.modelId must be a unique non-empty string`);
  }
  modelIds.add(entry.modelId);
  for (const field of ["aaSlugs", "arenaNames", "benchmarkVersionIds"]) {
    const aliases = entry[field] ?? [];
    if (!Array.isArray(aliases) || aliases.some((alias) => typeof alias !== "string" || alias.trim() === "" || alias.trim() !== alias)) {
      throw new Error(`${entryPath}.${field} must contain only non-empty strings`);
    }
    for (const alias of aliases) {
      const owner = aliasOwners[field].get(alias);
      if (owner) throw new Error(`${field} alias ${JSON.stringify(alias)} is assigned to both ${owner} and ${entry.modelId}`);
      aliasOwners[field].set(alias, entry.modelId);
    }
  }
  const providerModels = entry.providerModels ?? [];
  if (!Array.isArray(providerModels)) throw new Error(`${entryPath}.providerModels must be an array`);
  for (const [bindingIndex, binding] of providerModels.entries()) {
    const bindingPath = `${entryPath}.providerModels[${bindingIndex}]`;
    if (
      !binding
      || typeof binding !== "object"
      || Array.isArray(binding)
      || Object.keys(binding).sort().join("|") !== "providerId|providerModelId"
      || !providerIds.has(binding.providerId)
      || typeof binding.providerModelId !== "string"
      || binding.providerModelId.trim() === ""
      || binding.providerModelId.trim() !== binding.providerModelId
    ) {
      throw new Error(`${bindingPath} must contain one supported providerId and one non-empty providerModelId`);
    }
    const key = `${binding.providerId}|${binding.providerModelId}`;
    const owner = providerBindingOwners.get(key);
    if (owner) throw new Error(`provider binding ${JSON.stringify(key)} is assigned to both ${owner} and ${entry.modelId}`);
    providerBindingOwners.set(key, entry.modelId);
  }
  return entry;
});

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
  // 当前免费 API 的正式入口。必须遍历分页，不能把第一页 200 条误当成完整模型目录。
  const rows = [];
  const seenPages = new Set();
  for (let page = 1; page <= 50; page += 1) {
    const url = new URL("https://artificialanalysis.ai/api/v2/language/models/free");
    url.searchParams.set("page", String(page));
    const payload = await fetchJson(url, { headers: { "x-api-key": key } });
    const batch = Array.isArray(payload.data) ? payload.data : [];
    const pageSignature = batch.map((model) => String(model.id ?? model.slug)).join("|");
    if (batch.length === 0 || seenPages.has(pageSignature)) break;
    seenPages.add(pageSignature);
    rows.push(...batch);

    const pagination = payload.pagination ?? {};
    const totalPages = Number(pagination.total_pages ?? pagination.totalPages);
    const nextPage = pagination.next_page ?? pagination.nextPage;
    if (Number.isFinite(totalPages) && page >= totalPages) break;
    if (nextPage === null || nextPage === false) break;
    // 官方未返回分页元数据时，仅在满页的情况下继续；避免因未知响应无限请求。
    if (!Number.isFinite(totalPages) && nextPage === undefined && batch.length < 200) break;
  }
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
