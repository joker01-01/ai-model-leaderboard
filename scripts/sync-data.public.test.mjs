import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = resolve(projectRoot, "scripts/fixtures/aa-language-models-pages.json");
const copiedScripts = [
  "sync-data.mjs",
  "aa-leaderboard.mjs",
  "aa-public-snapshot.mjs",
  "generated-snapshot-module.mjs",
];
const legacyArtifacts = [
  "src/data/generated/aaSnapshot.ts",
  "src/data/generated/arenaSnapshot.ts",
  "data/sync-report.json",
  "data/modelops/generated/catalog.json",
  "data/modelops/generated/evidence.json",
];

async function writeSandboxFile(root, relativePath, content) {
  const target = resolve(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

function runPublicSync(
  root,
  preloadPath,
  requestLogPath,
  extraArguments = [],
  apiKey = "fixture-only-key",
) {
  const environment = {
    ...process.env,
    AA_API_KEY: apiKey,
    AA_PUBLIC_FIXTURE_PATH: fixturePath,
    AA_PUBLIC_REQUEST_LOG_PATH: requestLogPath,
  };
  if (apiKey === null) delete environment.AA_API_KEY;
  return spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(preloadPath).href,
      resolve(root, "scripts/sync-data.mjs"),
      "--aa-public-only",
      ...extraArguments,
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: environment,
    },
  );
}

function runDefaultSyncWithoutKey(root) {
  const environment = { ...process.env };
  delete environment.AA_API_KEY;
  return spawnSync(process.execPath, [resolve(root, "scripts/sync-data.mjs")], {
    cwd: root,
    encoding: "utf8",
    env: environment,
  });
}

test("public-only sync fetches all fixture pages and writes only the three public artifacts", async () => {
  const sandbox = await mkdtemp(resolve(projectRoot, ".tmp-aa-public-sync-"));
  try {
    await mkdir(resolve(sandbox, "scripts"), { recursive: true });
    for (const script of copiedScripts) {
      await copyFile(resolve(projectRoot, "scripts", script), resolve(sandbox, "scripts", script));
    }
    await writeSandboxFile(
      sandbox,
      "node_modules/hyparquet/package.json",
      `${JSON.stringify({ type: "module", exports: "./index.mjs" })}\n`,
    );
    await writeSandboxFile(
      sandbox,
      "node_modules/hyparquet/index.mjs",
      `export async function asyncBufferFromUrl({ url }) { return url; }
export async function parquetReadObjects() {
  return [{
    model_name: "Fixture Arena Model",
    rating: 1200,
    rating_lower: 1100,
    rating_upper: 1300,
    vote_count: 10,
    score: 50,
    score_ci_lower: 45,
    score_ci_upper: 55,
    observation_count: 10,
    rank: 1,
    category: "overall",
    leaderboard_publish_date: "2026-09-04"
  }];
}
`,
    );
    await writeSandboxFile(
      sandbox,
      "data/modelops/model-aliases.json",
      `${JSON.stringify({
        schemaVersion: 1,
        models: [{
          modelId: "fixture-model",
          aaSlugs: [],
          arenaNames: ["Fixture Arena Model"],
        }],
      })}\n`,
    );

    const sentinelByPath = new Map();
    for (const [index, relativePath] of legacyArtifacts.entries()) {
      const sentinel = `legacy-sentinel-${index}\n`;
      sentinelByPath.set(relativePath, sentinel);
      await writeSandboxFile(sandbox, relativePath, sentinel);
    }

    const preloadPath = resolve(sandbox, "scripts/mock-aa-fetch.mjs");
    const requestLogPath = resolve(sandbox, "request-log.json");
    await writeFile(
      preloadPath,
      `import { readFileSync, writeFileSync } from "node:fs";
const fixture = JSON.parse(readFileSync(process.env.AA_PUBLIC_FIXTURE_PATH, "utf8"));
const requests = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  const headers = new Headers(init.headers);
  if (url.origin !== "https://artificialanalysis.ai" || url.pathname !== "/api/v2/language/models/free") {
    throw new Error(\`unexpected request: \${url}\`);
  }
  if (headers.get("x-api-key") !== "fixture-only-key") throw new Error("missing fixture API key");
  const page = Number(url.searchParams.get("page"));
  if (!Number.isSafeInteger(page) || page < 1 || page > fixture.pages.length) {
    throw new Error(\`unexpected page: \${url}\`);
  }
  requests.push(url.toString());
  return new Response(JSON.stringify(fixture.pages[page - 1]), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
process.on("exit", () => writeFileSync(process.env.AA_PUBLIC_REQUEST_LOG_PATH, JSON.stringify(requests)));
`,
      "utf8",
    );

    const missingKeyRun = runPublicSync(sandbox, preloadPath, requestLogPath, [], null);
    assert.notEqual(missingKeyRun.status, 0);
    assert.match(missingKeyRun.stderr, /AA_API_KEY is required for --aa-public-only/);
    for (const relativePath of [
      "src/data/generated/aaPublicSnapshot.ts",
      "data/aa/generated/snapshot.json",
      "data/aa/generated/sync-report.json",
    ]) {
      await assert.rejects(readFile(resolve(sandbox, relativePath), "utf8"), { code: "ENOENT" });
    }
    for (const [relativePath, sentinel] of sentinelByPath) {
      assert.equal(await readFile(resolve(sandbox, relativePath), "utf8"), sentinel);
    }

    const firstRun = runPublicSync(sandbox, preloadPath, requestLogPath);
    assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
    assert.match(firstRun.stdout, /Updated 3 public AA file\(s\)/);
    assert.match(firstRun.stdout, /AA public: 5 source row\(s\)/);

    const publicModule = await readFile(resolve(sandbox, "src/data/generated/aaPublicSnapshot.ts"), "utf8");
    const publicJson = JSON.parse(await readFile(resolve(sandbox, "data/aa/generated/snapshot.json"), "utf8"));
    const publicReport = JSON.parse(await readFile(resolve(sandbox, "data/aa/generated/sync-report.json"), "utf8"));
    const moduleMatch = publicModule.match(/export const AA_PUBLIC_SNAPSHOT: AaPublicSnapshot = ([\s\S]+);\n$/);
    assert.ok(moduleMatch, "generated TypeScript must contain one JSON initializer");
    assert.deepEqual(JSON.parse(moduleMatch[1]), publicJson);
    assert.equal(publicReport.rowCount, publicJson.models.length);
    assert.deepEqual(
      JSON.parse(await readFile(requestLogPath, "utf8")),
      [
        "https://artificialanalysis.ai/api/v2/language/models/free?page=1",
        "https://artificialanalysis.ai/api/v2/language/models/free?page=2",
      ],
    );

    for (const [relativePath, sentinel] of sentinelByPath) {
      assert.equal(await readFile(resolve(sandbox, relativePath), "utf8"), sentinel);
    }

    const checkRun = runPublicSync(sandbox, preloadPath, requestLogPath, ["--check"]);
    assert.equal(checkRun.status, 0, checkRun.stderr || checkRun.stdout);
    assert.match(checkRun.stdout, /Checked 0 public AA file\(s\)/);

    const publicPaths = [
      "src/data/generated/aaPublicSnapshot.ts",
      "data/aa/generated/snapshot.json",
      "data/aa/generated/sync-report.json",
    ];
    const publicContents = new Map(await Promise.all(publicPaths.map(async (relativePath) => [
      relativePath,
      await readFile(resolve(sandbox, relativePath), "utf8"),
    ])));
    const defaultMissingKeyRun = runDefaultSyncWithoutKey(sandbox);
    assert.equal(defaultMissingKeyRun.status, 0, defaultMissingKeyRun.stderr || defaultMissingKeyRun.stdout);
    assert.match(defaultMissingKeyRun.stdout, /AA: skipped \(AA_API_KEY missing\)/);
    for (const [relativePath, content] of publicContents) {
      assert.equal(await readFile(resolve(sandbox, relativePath), "utf8"), content);
    }
    assert.equal(
      await readFile(resolve(sandbox, "src/data/generated/aaSnapshot.ts"), "utf8"),
      sentinelByPath.get("src/data/generated/aaSnapshot.ts"),
    );
    for (const relativePath of [
      "data/modelops/generated/catalog.json",
      "data/modelops/generated/evidence.json",
    ]) {
      assert.equal(await readFile(resolve(sandbox, relativePath), "utf8"), sentinelByPath.get(relativePath));
    }
    const defaultReport = JSON.parse(await readFile(resolve(sandbox, "data/sync-report.json"), "utf8"));
    assert.equal(defaultReport.artificialAnalysis.status, "skipped_missing_AA_API_KEY");
    assert.equal(defaultReport.arena.status, "updated");
  } finally {
    assert.equal(dirname(sandbox), projectRoot, "temporary sync sandbox must stay under the project root");
    assert.match(basename(sandbox), /^\.tmp-aa-public-sync-/);
    await rm(sandbox, { recursive: true, force: true });
  }
});
