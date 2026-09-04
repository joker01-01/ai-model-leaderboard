import { useEffect, useMemo, useRef, useState } from "react";
import type { DimKey, Model } from "./data/models";
import { MODELS } from "./data/models";
import AaBoard from "./components/AaBoard";
import Board from "./components/Board";
import Radar from "./components/Radar";
import {
  buildEntries,
  sortEntries,
  type Entry,
  type RankingMode,
  type SortKey,
} from "./lib/entries";
import type { Preset, Weights } from "./lib/score";
import {
  compositePartial,
  DEFAULT_WEIGHTS,
  DIM_KEYS,
  DIM_LABELS,
  PRESETS,
} from "./lib/score";
import AgentPanel from "./features/agent/AgentPanel";
import { normalizeAgentApiOrigin } from "./features/agent/api";
import {
  AA_DATA_API_URL,
  AA_INTELLIGENCE_INDEX_VERSION,
  AA_INTELLIGENCE_LEADERBOARD,
  AA_LEADERBOARD_LIMIT,
  AA_LEADERBOARD_OBSERVED_AT,
  AA_PUBLIC_LEADERBOARD_URL,
  type AaLeaderboardEntry,
} from "./lib/aaLeaderboard";

const AGENT_API_ORIGIN = normalizeAgentApiOrigin(import.meta.env.VITE_AGENT_API_URL);

function loadPref(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function loadMode(): RankingMode {
  const stored = loadPref("almanac.mode", "objective");
  return stored === "editorial" ? "editorial" : "objective";
}

function loadWeights(): Weights {
  try {
    const raw = JSON.parse(localStorage.getItem("almanac.weights") ?? "null") as Partial<Weights> | null;
    if (raw && DIM_KEYS.every((key) => typeof raw[key] === "number" && Number.isFinite(raw[key]) && raw[key] >= 0)) {
      const next = Object.fromEntries(DIM_KEYS.map((key) => [key, Math.min(60, raw[key] as number)])) as Weights;
      if (DIM_KEYS.some((key) => next[key] > 0)) return next;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_WEIGHTS };
}

/** 数字滚动动画；尊重减少动态偏好 */
function useCountUp(target: number, duration = 650): number {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setVal(target); fromRef.current = target; return; }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick); else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return Math.round(val * 10) / 10;
}

export default function App() {
  const [mode, setMode] = useState<RankingMode>(loadMode);
  const [weights, setWeights] = useState<Weights>(loadWeights);
  const [preset, setPreset] = useState<string>(() => loadPref("almanac.preset", "综合（含性价比）"));
  const [sortKey, setSortKey] = useState<SortKey>("composite");
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("全部");
  const [openOnly, setOpenOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { try { localStorage.setItem("almanac.mode", mode); } catch { /* ignore */ } }, [mode]);
  useEffect(() => { try { localStorage.setItem("almanac.weights", JSON.stringify(weights)); } catch { /* ignore */ } }, [weights]);
  useEffect(() => { try { localStorage.setItem("almanac.preset", preset); } catch { /* ignore */ } }, [preset]);

  const entries = useMemo<Entry[]>(() => buildEntries(weights), [weights]);

  const editorialChampion = useMemo(
    () => sortEntries(entries, "editorial", "composite").find((entry) => entry.editorialScore !== null) ?? entries[0],
    [entries],
  );
  const objectiveChampion = AA_INTELLIGENCE_LEADERBOARD[0] ?? null;
  const pureChampion = useMemo(() => {
    const pure = PRESETS.find((item) => item.name === "只看智能")!;
    return entries
      .map((entry) => ({ model: entry.model, score: compositePartial(entry.editorialDims, pure.weights) }))
      .filter((entry): entry is { model: Model; score: number } => entry.score !== null)
      .sort((a, b) => b.score - a.score)[0];
  }, [entries]);
  const countries = useMemo(() => ["全部", ...Array.from(new Set(MODELS.map((model) => model.country)))], []);
  const visibleEditorialEntries = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      if (openOnly && !entry.model.open) return false;
      if (country !== "全部" && entry.model.country !== country) return false;
      if (!needle) return true;
      return [entry.model.name, entry.model.maker, entry.model.makerEn, ...entry.model.badges]
        .join(" ").toLowerCase().includes(needle);
    });
    if (sortKey !== "composite" && !DIM_KEYS.includes(sortKey as DimKey)) return sortEntries(filtered, "editorial", "composite");
    return sortEntries(filtered, "editorial", sortKey);
  }, [entries, q, country, openOnly, sortKey]);
  const visibleObjectiveEntries = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return AA_INTELLIGENCE_LEADERBOARD;
    return AA_INTELLIGENCE_LEADERBOARD.filter((entry) => (
      [entry.modelVersion, entry.creatorName, entry.sourceSlug]
        .filter((value): value is string => value !== null)
        .join(" ")
        .toLowerCase()
        .includes(needle)
    ));
  }, [q]);

  const applyPreset = (next: Preset) => { setPreset(next.name); setWeights({ ...next.weights }); };
  const setDimWeight = (key: DimKey, value: number) => {
    setPreset("自定义");
    setWeights((current) => {
      const next = { ...current, [key]: value };
      if (DIM_KEYS.every((item) => next[item] === 0)) next[key] = 1;
      return next;
    });
  };
  const changeMode = (next: RankingMode) => {
    setMode(next);
    setSortKey("composite");
    setExpanded(null);
  };
  const reset = () => applyPreset(PRESETS[0]);
  const altName = mode === "objective" ? editorialChampion.model.name : pureChampion.model.name;
  const onAltSwitch = mode === "objective" ? () => changeMode("editorial") : () => applyPreset(PRESETS.find((item) => item.name === "只看智能")!);

  return (
    <div className="page">
      <Masthead />
      <ModeSwitch mode={mode} onChange={changeMode} />
      <section className="hero">
        {mode === "objective"
          ? <AaChampion entry={objectiveChampion} altName={altName} onAltSwitch={onAltSwitch} />
          : <Champion entry={editorialChampion} presetLabel={preset} altName={altName} onAltSwitch={onAltSwitch} />}
        {mode === "objective"
          ? <ObjectivePanel />
          : <WeightPanel weights={weights} preset={preset} onPreset={applyPreset} onWeight={setDimWeight} onReset={reset} />}
      </section>
      <AgentPanel apiOrigin={AGENT_API_ORIGIN} />
      <Controls mode={mode} sortKey={sortKey} setSortKey={setSortKey} q={q} setQ={setQ}
        country={country} setCountry={setCountry} countries={countries} openOnly={openOnly} setOpenOnly={setOpenOnly} />
      {mode === "objective"
        ? <AaBoard entries={visibleObjectiveEntries} expanded={expanded} sourceUrl={AA_PUBLIC_LEADERBOARD_URL}
          onToggle={(id) => setExpanded((current) => (current === id ? null : id))} />
        : <Board mode="editorial" entries={visibleEditorialEntries} sortKey={sortKey} expanded={expanded}
          onToggle={(id) => setExpanded((current) => (current === id ? null : id))} />}
      <Footer />
    </div>
  );
}

/* ---------- 顶部 ---------- */
function Masthead() {
  const aaReady = AA_INTELLIGENCE_LEADERBOARD.length === AA_LEADERBOARD_LIMIT;
  return (
    <header className="masthead">
      <div className="masthead-logo" aria-hidden="true"><span>AI</span><small>LAB / 06</small></div>
      <div className="masthead-center">
        <p className="masthead-kicker">公开评测 · 编辑推荐 · 具体版本</p>
        <h1 className="masthead-title">AI 模型排行榜</h1>
        <p className="masthead-sub">先看公开成绩，再按你的使用偏好选择</p>
      </div>
      <div className="masthead-side">
        <span className="masthead-side-label">数据状态</span>
        <span className={"sys-status" + (aaReady ? "" : " is-pending")}><i className="dot" aria-hidden="true" />{aaReady ? "AA 完整榜已同步" : "AA 完整榜待同步"}</span>
        <span className="stamp">AA {AA_LEADERBOARD_OBSERVED_AT ?? "—"}</span>
      </div>
    </header>
  );
}

function ModeSwitch({ mode, onChange }: { mode: RankingMode; onChange: (mode: RankingMode) => void }) {
  return (
    <nav className="mode-switch" aria-label="选择排行榜">
      <span className="mode-kicker">选择排行榜</span>
      <button type="button" className={"mode-button" + (mode === "objective" ? " is-active" : "")} aria-pressed={mode === "objective"}
        onClick={() => onChange("objective")}><strong>公开评测榜</strong><small>按公开成绩排名</small></button>
      <button type="button" className={"mode-button" + (mode === "editorial" ? " is-active is-editorial" : "")} aria-pressed={mode === "editorial"}
        onClick={() => onChange("editorial")}><strong>编辑推荐榜</strong><small>按你的偏好调整</small></button>
    </nav>
  );
}

/* ---------- 冠军牌 ---------- */
function AaChampion({ entry, altName, onAltSwitch }: {
  entry: AaLeaderboardEntry | null;
  altName: string;
  onAltSwitch: () => void;
}) {
  const display = useCountUp(entry?.value ?? 0);
  if (!entry) {
    return <article className="champion champion-objective"><p className="eyebrow">公开评测榜 · 智能指数</p><h2 className="champion-name">AA 数据暂不可用</h2><p className="champion-blurb">当前生成快照没有可展示的智能指数条目，未回退到编辑推荐数据。</p></article>;
  }
  return (
    <article className="champion champion-objective">
      <p className="eyebrow">公开评测榜 · 智能指数当前第一</p>
      <div className="champion-main">
        <div className="champion-primary">
          <div className="champion-id">
            <h2 className="champion-name">{entry.modelVersion}</h2>
            <p className="champion-maker">{entry.creatorName ?? "AA 未提供开发者资料"} · {entry.sourceSlug}</p>
            <ul className="chips"><li className="chip">Artificial Analysis</li>{AA_INTELLIGENCE_INDEX_VERSION !== null && <li className="chip">指数 v{AA_INTELLIGENCE_INDEX_VERSION}</li>}</ul>
          </div>
          <div className="champion-score"><span className="champion-num">{display.toFixed(1)}</span><span className="champion-denom">智能指数</span></div>
        </div>
        <dl className="aa-champion-facts">
          <div><dt>指数口径</dt><dd>{AA_INTELLIGENCE_INDEX_VERSION === null ? "等待完整快照" : `v${AA_INTELLIGENCE_INDEX_VERSION}`}</dd></div>
          <div><dt>观测日期</dt><dd>{entry.observedAt}</dd></div>
          <div><dt>模型发布</dt><dd>{entry.releaseDate ?? "AA 未提供"}</dd></div>
        </dl>
      </div>
      <p className="champion-blurb">Artificial Analysis 当前源条目；同一模型的推理、努力等配置分别展示，不按模型家族合并。</p>
      <p className="champion-alt">切到「编辑推荐榜」，当前第一是 <strong>{altName}</strong> <button type="button" className="textlink" onClick={onAltSwitch}>查看推荐 →</button></p>
      <p className="champion-note">智能指数 {entry.observedAt} · 具体配置 {entry.sourceSlug} · <a href={AA_PUBLIC_LEADERBOARD_URL} target="_blank" rel="noopener noreferrer">查看 AA 榜单 ↗</a></p>
    </article>
  );
}

function Champion({ entry, presetLabel, altName, onAltSwitch }: {
  entry: Entry; presetLabel: string; altName: string; onAltSwitch: () => void;
}) {
  const display = useCountUp(entry.editorialScore ?? 0);
  const { model } = entry;
  return (
    <article className="champion champion-editorial">
      <p className="eyebrow">编辑推荐榜 · 当前第一</p>
      <div className="champion-main">
        <div className="champion-primary">
          <div className="champion-id">
            <h2 className="champion-name">{model.name}</h2>
            <p className="champion-maker">{model.flag} {model.maker} · {model.country}</p>
            <ul className="chips">{model.badges.map((badge) => <li key={badge} className="chip">{badge}</li>)}</ul>
          </div>
          <div className="champion-score"><span className="champion-num">{display.toFixed(1)}</span><span className="champion-denom">/ 100</span></div>
        </div>
        <div className="champion-radar"><Radar dims={entry.editorialDims} size={180} /></div>
      </div>
      <p className="champion-blurb">「{model.blurb}」</p>
      <p className="champion-alt">切到「偏重智能」方案，当前第一是 <strong>{altName}</strong> <button type="button" className="textlink" onClick={onAltSwitch}>切换试试 →</button></p>
      <p className="champion-note">当前权重方案：{presetLabel} · 基础分覆盖 {Math.round(entry.editorialCoverage * 6)}/6 项 · 右侧可调</p>
    </article>
  );
}

/* ---------- 公开评测说明 ---------- */
function ObjectivePanel() {
  return (
    <aside className="objective-panel">
      <div className="panel-head"><h2 className="panel-title">公开评测数据</h2><p className="panel-note">按 AA 当前智能指数排序</p></div>
      <div className="objective-summary"><div><strong>{AA_INTELLIGENCE_INDEX_VERSION === null ? "—" : `v${AA_INTELLIGENCE_INDEX_VERSION}`}</strong><span>Artificial Analysis 智能指数口径</span></div><div><strong>{AA_LEADERBOARD_OBSERVED_AT ?? "—"}</strong><span>最近一次完整榜单观测</span></div></div>
      <div className="objective-source-grid">
        <a className="objective-source" href={AA_PUBLIC_LEADERBOARD_URL} target="_blank" rel="noopener noreferrer"><span>AA 模型榜单</span><strong>当前排名</strong></a>
        <a className="objective-source" href={AA_DATA_API_URL} target="_blank" rel="noopener noreferrer"><span>AA 数据 API</span><strong>字段口径</strong></a>
      </div>
      <p className="panel-footnote">每个 AA 源配置独立成行；未提供的价格、许可、国家和开放状态不会被推断补齐。</p>
    </aside>
  );
}

/* ---------- 编辑推荐设置 ---------- */
function WeightPanel({ weights, preset, onPreset, onWeight, onReset }: {
  weights: Weights; preset: string;
  onPreset: (preset: Preset) => void; onWeight: (key: DimKey, value: number) => void; onReset: () => void;
}) {
  const total = DIM_KEYS.reduce((sum, key) => sum + weights[key], 0);
  return (
    <aside className="weights">
      <div className="panel-head"><h2 className="panel-title">编辑推荐设置</h2><p className="panel-note">基础分来自公开数据与固定规则，拖动权重改变推荐顺序</p></div>
      <div className="presets">{PRESETS.map((item) => <button key={item.name} type="button" className={"preset" + (preset === item.name ? " is-active" : "")} onClick={() => onPreset(item)}><span className="preset-name">{item.name}</span><span className="preset-note">{item.note}</span></button>)}</div>
      <div className="sliders">
        {DIM_KEYS.map((key) => {
          const normalized = total > 0 ? Math.round((weights[key] / total) * 100) : 0;
          return <label key={key} className="slider"><span className="slider-label">{DIM_LABELS[key]}</span><input aria-label={`${DIM_LABELS[key]}原始权重`} type="range" min={0} max={60} step={1} value={weights[key]} onChange={(event) => onWeight(key, Number(event.target.value))} /><span className="slider-val">{normalized}%</span></label>;
        })}
      </div>
      <div className={"weight-total" + (total === 0 ? " is-warning" : "")}>{total === 0 ? "至少保留一个权重" : `当前权重 ${total} · 已按比例显示`}</div>
      <button type="button" className="textlink reset" onClick={onReset}>恢复默认权重</button>
    </aside>
  );
}

/* ---------- 控制条 ---------- */
function Controls({ mode, sortKey, setSortKey, q, setQ, country, setCountry, countries, openOnly, setOpenOnly }: {
  mode: RankingMode; sortKey: SortKey; setSortKey: (key: SortKey) => void;
  q: string; setQ: (value: string) => void;
  country: string; setCountry: (value: string) => void; countries: string[];
  openOnly: boolean; setOpenOnly: (value: boolean) => void;
}) {
  return (
    <div className="controls">
      <div className="dims" role="tablist" aria-label={`${mode === "objective" ? "公开评测榜" : "编辑推荐榜"}分类`}>
        <button type="button" role="tab" aria-selected={sortKey === "composite"} className={"dim" + (sortKey === "composite" ? " is-active" : "")} onClick={() => setSortKey("composite")}>{mode === "objective" ? "智能指数" : "推荐排名"}</button>
        {mode === "editorial" && DIM_KEYS.map((key) => <button key={key} type="button" role="tab" aria-selected={sortKey === key} className={"dim" + (sortKey === key ? " is-active" : "")} onClick={() => setSortKey(key)}>{DIM_LABELS[key]}</button>)}
      </div>
      <div className={"filters" + (mode === "objective" ? " filters-objective" : "")}>
        <label className="sr-only" htmlFor="model-search">{mode === "objective" ? "搜索模型配置或开发者" : "搜索模型或厂商"}</label><input id="model-search" className="search" type="search" placeholder={mode === "objective" ? "搜索模型配置 / 开发者…" : "搜索模型 / 厂商…"} value={q} onChange={(event) => setQ(event.target.value)} />
        {mode === "editorial" && <div className="country-chips" aria-label="国家或地区筛选">{countries.map((item) => <button key={item} type="button" className={"country" + (country === item ? " is-active" : "")} onClick={() => setCountry(item)}>{item}</button>)}</div>}
        {mode === "editorial" && <label className="open-toggle"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} /><span>只看开源</span></label>}
      </div>
    </div>
  );
}

/* ---------- 页脚 ---------- */
function Footer() {
  return (
    <footer className="footer">
      <h3 className="footer-title">排行榜说明</h3>
      <ol className="method"><li>公开评测榜直接按 Artificial Analysis 当前 Intelligence Index 排名；推理、努力等配置按 AA 源条目分别展示，不按模型家族合并。</li><li>编辑推荐榜和 ModelOps Agent 继续使用经过精确版本映射的精选模型目录；编辑权重不会改变公开榜。</li><li>AA 免费数据没有提供的国家、开放状态、许可和上下文不会被猜测，也不会套用相似模型资料。</li><li>Arena 是用户盲测对战参考，只绑定到精选目录详情，不参与公开榜名次或基础分。</li><li>数据每天同步一次并生成更新 PR；例行更新通过严格门禁后自动合并发布，成员、身份或来源异常则保留给人工审核。</li></ol>
      <div className="source-links"><span>公开数据来源：</span><a href="https://artificialanalysis.ai/data-api/docs" target="_blank" rel="noopener noreferrer">综合智能 / 编程</a><a href="https://artificialanalysis.ai/" target="_blank" rel="noopener noreferrer">推理</a><a href="https://benchlm.ai/benchmarks/swe-bench-pro" target="_blank" rel="noopener noreferrer">SWE-bench Pro</a><a href="https://benchlm.ai/benchmarks/browsecomp" target="_blank" rel="noopener noreferrer">BrowseComp</a><a href="https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset" target="_blank" rel="noopener noreferrer">Arena 用户对战</a></div>
      <p className="colophon">AI 模型排行榜 · AA 主榜 {AA_LEADERBOARD_OBSERVED_AT ?? "待同步"} · Arena 仅作参考 · 每日同步，例行自动发布 / 异常人工审核</p>
    </footer>
  );
}
