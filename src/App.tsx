import { useEffect, useMemo, useRef, useState } from "react";
import type { DimKey, Model } from "./data/models";
import { DATA_DATE, MODELS } from "./data/models";
import {
  BENCHMARK_DATE,
  BENCHMARK_DEFINITIONS,
  calibrateBenchmarkValue,
  OBJECTIVE_SNAPSHOT,
  type BenchmarkDefinition,
  type BenchmarkId,
  type BenchmarkObservation,
} from "./data/benchmarks";
import type { ObjectiveDimKey, Preset, Weights } from "./lib/score";
import {
  composite,
  DEFAULT_WEIGHTS,
  DIM_KEYS,
  DIM_LABELS,
  OBJECTIVE_DIM_KEYS,
  OBJECTIVE_DIM_LABELS,
  objectiveScore,
  PRESETS,
} from "./lib/score";
import Radar from "./components/Radar";

type RankingMode = "objective" | "editorial";
type SortKey = DimKey | ObjectiveDimKey | "composite";

interface Entry {
  model: Model;
  editorialScore: number;
  objectiveScore: ReturnType<typeof objectiveScore>;
  objectiveDims: Partial<Record<ObjectiveDimKey, number>>;
  observations: Partial<Record<BenchmarkId, BenchmarkObservation>>;
  objectiveSignalCount: number;
}

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

function entryValue(entry: Entry, mode: RankingMode, sortKey: SortKey): number {
  if (mode === "objective") {
    if (sortKey === "composite") return entry.objectiveScore.score ?? Number.NEGATIVE_INFINITY;
    return entry.objectiveDims[sortKey as ObjectiveDimKey] ?? Number.NEGATIVE_INFINITY;
  }
  if (sortKey === "composite") return entry.editorialScore;
  return entry.model.dims[sortKey as DimKey];
}

function sortEntries(entries: Entry[], mode: RankingMode, sortKey: SortKey): Entry[] {
  return [...entries].sort((a, b) => {
    if (mode === "objective") {
      const aHas = a.objectiveScore.score !== null;
      const bHas = b.objectiveScore.score !== null;
      if (aHas !== bHas) return aHas ? -1 : 1;
    }
    return entryValue(b, mode, sortKey) - entryValue(a, mode, sortKey)
      || b.editorialScore - a.editorialScore;
  });
}

function observationsForMap(observations: Partial<Record<BenchmarkId, BenchmarkObservation>>, dim: ObjectiveDimKey): Array<{ definition: BenchmarkDefinition; observation: BenchmarkObservation }> {
  return BENCHMARK_DEFINITIONS.flatMap((definition) => {
    if (definition.dim !== dim) return [];
    const observation = observations[definition.id];
    return observation ? [{ definition, observation }] : [];
  });
}

function observationsFor(entry: Entry, dim: ObjectiveDimKey): Array<{ definition: BenchmarkDefinition; observation: BenchmarkObservation }> {
  return observationsForMap(entry.observations, dim);
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

  const entries = useMemo<Entry[]>(() => MODELS.map((model) => {
    const profile = OBJECTIVE_SNAPSHOT[model.id];
    const objectiveDims: Partial<Record<ObjectiveDimKey, number>> = {};
    const observations = profile?.observations ?? {};
    OBJECTIVE_DIM_KEYS.forEach((dim) => {
      const values = observationsForMap(observations, dim).map(({ definition, observation }) => calibrateBenchmarkValue(definition, observation.value));
      if (values.length > 0) objectiveDims[dim] = values.reduce((sum, value) => sum + value, 0) / values.length;
    });
    return {
      model,
      editorialScore: composite(model.dims, weights),
      objectiveScore: objectiveScore(objectiveDims),
      objectiveDims,
      observations,
      objectiveSignalCount: Object.keys(observations).length,
    };
  }), [weights]);

  const editorialChampion = useMemo(() => sortEntries(entries, "editorial", "composite")[0], [entries]);
  const objectiveChampion = useMemo(
    () => sortEntries(entries, "objective", "composite").find((entry) => entry.objectiveScore.score !== null) ?? null,
    [entries],
  );
  const pureChampion = useMemo(() => {
    const pure = PRESETS.find((item) => item.name === "纯智力")!;
    return [...MODELS]
      .map((model) => ({ model, score: composite(model.dims, pure.weights) }))
      .sort((a, b) => b.score - a.score)[0];
  }, []);
  const champion = mode === "objective" ? (objectiveChampion ?? editorialChampion) : editorialChampion;

  const countries = useMemo(() => ["全部", ...Array.from(new Set(MODELS.map((model) => model.country)))], []);
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const keys = mode === "objective" ? OBJECTIVE_DIM_KEYS : DIM_KEYS;
    const filtered = entries.filter((entry) => {
      if (openOnly && !entry.model.open) return false;
      if (country !== "全部" && entry.model.country !== country) return false;
      if (!needle) return true;
      return [entry.model.name, entry.model.maker, entry.model.makerEn, ...entry.model.badges]
        .join(" ").toLowerCase().includes(needle);
    });
    if (sortKey !== "composite" && !keys.includes(sortKey as never)) return sortEntries(filtered, mode, "composite");
    return sortEntries(filtered, mode, sortKey);
  }, [entries, q, country, openOnly, mode, sortKey]);

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
  const onAltSwitch = mode === "objective" ? () => changeMode("editorial") : () => applyPreset(PRESETS.find((item) => item.name === "纯智力")!);

  return (
    <div className="page">
      <Masthead />
      <ModeSwitch mode={mode} onChange={changeMode} />
      <section className="hero">
        <Champion entry={champion} mode={mode} presetLabel={preset} altName={altName} onAltSwitch={onAltSwitch} />
        {mode === "objective"
          ? <ObjectivePanel entries={entries} />
          : <WeightPanel weights={weights} preset={preset} onPreset={applyPreset} onWeight={setDimWeight} onReset={reset} />}
      </section>
      <Controls mode={mode} sortKey={sortKey} setSortKey={setSortKey} q={q} setQ={setQ}
        country={country} setCountry={setCountry} countries={countries} openOnly={openOnly} setOpenOnly={setOpenOnly} />
      <Board mode={mode} entries={visible} sortKey={sortKey} expanded={expanded}
        onToggle={(id) => setExpanded((current) => (current === id ? null : id))} />
      <Footer />
    </div>
  );
}

/* ---------- 报头 ---------- */
function Masthead() {
  return (
    <header className="masthead">
      <div className="masthead-logo" aria-hidden="true">AI</div>
      <div className="masthead-center">
        <h1 className="masthead-title">AI 模型矩阵</h1>
        <p className="masthead-sub">MODEL MATRIX · 主流大模型战力榜</p>
      </div>
      <div className="masthead-side">
        <span className="sys-status"><i className="dot" aria-hidden="true" />静态快照</span>
        <span className="stamp">DATA {DATA_DATE}</span>
      </div>
    </header>
  );
}

function ModeSwitch({ mode, onChange }: { mode: RankingMode; onChange: (mode: RankingMode) => void }) {
  return (
    <nav className="mode-switch" aria-label="选择榜单口径">
      <span className="mode-kicker">RANKING MODE</span>
      <button type="button" className={"mode-button" + (mode === "objective" ? " is-active" : "")} aria-pressed={mode === "objective"}
        onClick={() => onChange("objective")}><strong>客观能力榜</strong><small>benchmark 快照</small></button>
      <button type="button" className={"mode-button" + (mode === "editorial" ? " is-active is-editorial" : "")} aria-pressed={mode === "editorial"}
        onClick={() => onChange("editorial")}><strong>编辑推荐榜</strong><small>可调权重口径</small></button>
    </nav>
  );
}

/* ---------- 冠军牌 ---------- */
function Champion({ entry, mode, presetLabel, altName, onAltSwitch }: {
  entry: Entry; mode: RankingMode; presetLabel: string; altName: string; onAltSwitch: () => void;
}) {
  const scoreValue = mode === "objective" ? entry.objectiveScore.score ?? 0 : entry.editorialScore;
  const display = useCountUp(scoreValue);
  const { model } = entry;
  return (
    <article className={"champion " + (mode === "objective" ? "champion-objective" : "champion-editorial")}>
      <p className="eyebrow">{mode === "objective" ? "客观能力榜 · 当前领先" : "编辑推荐榜 · 当前领先"}</p>
      <div className="champion-main">
        <div className="champion-id">
          <h2 className="champion-name">{model.name}</h2>
          <p className="champion-maker">{model.flag} {model.maker} · {model.country}</p>
          <ul className="chips">{model.badges.map((badge) => <li key={badge} className="chip">{badge}</li>)}</ul>
        </div>
        <div className="champion-score"><span className="champion-num">{display.toFixed(1)}</span><span className="champion-denom">/ 100</span></div>
        {mode === "objective" ? <ObjectiveBars entry={entry} compact /> : <div className="champion-radar"><Radar dims={model.dims} size={180} /></div>}
      </div>
      <p className="champion-blurb">「{model.blurb}」</p>
      <p className="champion-alt">{mode === "objective" ? "切到「编辑推荐榜」，当前默认榜首是" : "切到「纯智力」权重方案，榜首是"} <strong>{altName}</strong> <button type="button" className="textlink" onClick={onAltSwitch}>{mode === "objective" ? "查看推荐 →" : "切换试试 →"}</button></p>
      <p className="champion-note">{mode === "objective" ? `客观快照 ${BENCHMARK_DATE} · 数据覆盖 ${entry.objectiveScore.available}/${entry.objectiveScore.total} 项 · ${entry.objectiveScore.confidence}置信度` : `当前权重方案：${presetLabel} · 右侧可调`}</p>
    </article>
  );
}

function ObjectiveBars({ entry, compact = false }: { entry: Entry; compact?: boolean }) {
  return (
    <div className={"objective-bars" + (compact ? " is-compact" : "")} role="img" aria-label="客观能力四维得分">
      {OBJECTIVE_DIM_KEYS.map((key) => {
        const value = entry.objectiveDims[key];
        return <div className="objective-bar" key={key}><span>{OBJECTIVE_DIM_LABELS[key]}</span><i><b style={{ width: (value ?? 0) + "%" }} /></i><em>{value == null ? "—" : value.toFixed(1)}</em></div>;
      })}
    </div>
  );
}

/* ---------- 客观榜说明 ---------- */
function ObjectivePanel({ entries }: { entries: Entry[] }) {
  const ready = entries.filter((entry) => entry.objectiveScore.score !== null).length;
  const high = entries.filter((entry) => entry.objectiveScore.confidence === "高").length;
  const signalCount = entries.reduce((sum, entry) => sum + entry.objectiveSignalCount, 0);
  return (
    <aside className="objective-panel">
      <div className="panel-head"><h2 className="panel-title">客观能力口径</h2><p className="panel-note">公开聚合榜快照 · 第二信号逐步接入</p></div>
      <div className="objective-summary"><div><strong>{ready}</strong><span>/ {entries.length} 模型可排名</span></div><div><strong>{high}</strong><span>个模型覆盖 ≥ 3/4 指标</span></div></div>
      <div className="objective-source-grid">
        {BENCHMARK_DEFINITIONS.map((definition) => <a className="objective-source" key={definition.id} href={definition.sourceUrl} target="_blank" rel="noopener noreferrer"><span>{definition.shortLabel}</span><strong>{definition.unit === "%" ? "百分比" : "指数"}</strong></a>)}
      </div>
      <p className="panel-footnote">综合分按四项固定权重计算；当前已收录 {signalCount} 条信号。一个维度有多个信号时取简单平均，缺失数据不按 0 分处理。</p>
    </aside>
  );
}

/* ---------- 编辑口径 / 权重面板 ---------- */
function WeightPanel({ weights, preset, onPreset, onWeight, onReset }: {
  weights: Weights; preset: string;
  onPreset: (preset: Preset) => void; onWeight: (key: DimKey, value: number) => void; onReset: () => void;
}) {
  const total = DIM_KEYS.reduce((sum, key) => sum + weights[key], 0);
  return (
    <aside className="weights">
      <div className="panel-head"><h2 className="panel-title">编辑权重</h2><p className="panel-note">推荐分 = 已选维度加权平均 · 最终占比自动归一化</p></div>
      <div className="presets">{PRESETS.map((item) => <button key={item.name} type="button" className={"preset" + (preset === item.name ? " is-active" : "")} onClick={() => onPreset(item)}><span className="preset-name">{item.name}</span><span className="preset-note">{item.note}</span></button>)}</div>
      <div className="sliders">
        {DIM_KEYS.map((key) => {
          const normalized = total > 0 ? Math.round((weights[key] / total) * 100) : 0;
          return <label key={key} className="slider"><span className="slider-label">{DIM_LABELS[key]}</span><input aria-label={`${DIM_LABELS[key]}原始权重`} type="range" min={0} max={60} step={1} value={weights[key]} onChange={(event) => onWeight(key, Number(event.target.value))} /><span className="slider-val">{normalized}%</span></label>;
        })}
      </div>
      <div className={"weight-total" + (total === 0 ? " is-warning" : "")}>{total === 0 ? "至少保留一个非零权重" : `当前总权重 ${total} · 显示为最终占比`}</div>
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
  const keys = mode === "objective" ? OBJECTIVE_DIM_KEYS : DIM_KEYS;
  return (
    <div className="controls">
      <div className="dims" role="tablist" aria-label={`${mode === "objective" ? "客观能力榜" : "编辑推荐榜"}维度`}>
        <button type="button" role="tab" aria-selected={sortKey === "composite"} className={"dim" + (sortKey === "composite" ? " is-active" : "")} onClick={() => setSortKey("composite")}>{mode === "objective" ? "能力总榜" : "推荐总榜"}</button>
        {keys.map((key) => <button key={key} type="button" role="tab" aria-selected={sortKey === key} className={"dim" + (sortKey === key ? " is-active" : "")} onClick={() => setSortKey(key)}>{mode === "objective" ? OBJECTIVE_DIM_LABELS[key as ObjectiveDimKey] : DIM_LABELS[key as DimKey]}</button>)}
      </div>
      <div className="filters">
        <label className="sr-only" htmlFor="model-search">搜索模型或厂商</label><input id="model-search" className="search" type="search" placeholder="搜索模型 / 厂商…" value={q} onChange={(event) => setQ(event.target.value)} />
        <div className="country-chips" aria-label="国家或地区筛选">{countries.map((item) => <button key={item} type="button" className={"country" + (country === item ? " is-active" : "")} onClick={() => setCountry(item)}>{item}</button>)}</div>
        <label className="open-toggle"><input type="checkbox" checked={openOnly} onChange={(event) => setOpenOnly(event.target.checked)} /><span>只看开源</span></label>
      </div>
    </div>
  );
}

/* ---------- 榜单 ---------- */
function Board({ mode, entries, sortKey, expanded, onToggle }: {
  mode: RankingMode; entries: Entry[]; sortKey: SortKey; expanded: string | null; onToggle: (id: string) => void;
}) {
  const sortLabel = sortKey === "composite" ? (mode === "objective" ? "能力分" : "推荐分") : mode === "objective" ? OBJECTIVE_DIM_LABELS[sortKey as ObjectiveDimKey] : DIM_LABELS[sortKey as DimKey];
  return (
    <section className="board" aria-label={`${mode === "objective" ? "客观能力榜" : "编辑推荐榜"}模型排名`}>
      <div className="board-head" aria-hidden="true"><span>名次</span><span>模型</span><span className="right">{sortLabel}</span><span>{mode === "objective" ? "覆盖 / 四维" : "六维速览"}</span><span className="right">价格带</span><span className="right">发布</span><span /></div>
      {entries.length === 0 && <p className="empty">没有符合条件的模型，换个条件试试。</p>}
      <ol className="rows">{entries.map((entry, index) => <Row key={entry.model.id + "-" + mode + "-" + sortKey} entry={entry} mode={mode} rank={index + 1} sortKey={sortKey} expanded={expanded === entry.model.id} onToggle={() => onToggle(entry.model.id)} />)}</ol>
    </section>
  );
}

function Row({ entry, mode, rank, sortKey, expanded, onToggle }: {
  entry: Entry; mode: RankingMode; rank: number; sortKey: SortKey; expanded: boolean; onToggle: () => void;
}) {
  const { model } = entry;
  const dimScore = entryValue(entry, mode, sortKey);
  const hasScore = Number.isFinite(dimScore);
  const bars = mode === "objective" ? OBJECTIVE_DIM_KEYS : DIM_KEYS;
  return (
    <li className={"row" + (expanded ? " is-expanded" : "") + (!hasScore ? " is-pending" : "")} style={{ animationDelay: Math.min(rank * 34, 680) + "ms" }}>
      <div className="row-main">
        <span className={"rank" + (rank === 1 ? " rank-1" : rank <= 3 ? " rank-top" : "")}>{String(rank).padStart(2, "0")}</span>
        <div className="who"><p className="who-name">{model.name}</p><p className="who-maker">{model.flag} {model.maker} · {model.country}</p><ul className="chips">{model.badges.map((badge) => <li key={badge} className="chip">{badge}</li>)}</ul></div>
        <div className={"score" + (!hasScore ? " score-pending" : "")}><span className="score-num">{hasScore ? dimScore.toFixed(1) : "待补"}</span><span className="score-bar"><i style={{ width: (hasScore ? Math.max(0, Math.min(100, dimScore)) : 0) + "%" }} /></span></div>
        <div className="spark" role="img" aria-label={mode === "objective" ? "客观四维得分" : "编辑六维得分"}>{bars.map((key) => { const value = mode === "objective" ? entry.objectiveDims[key as ObjectiveDimKey] : model.dims[key as DimKey]; return <span key={key} title={(mode === "objective" ? OBJECTIVE_DIM_LABELS[key as ObjectiveDimKey] : DIM_LABELS[key as DimKey]) + " " + (value ?? "待补")} className={"spark-bar" + (sortKey === key ? " is-active" : "")} style={{ height: Math.max(8, value ?? 8) + "%" }} />; })}</div>
        <div className="meta"><span className={"tier tier-" + model.priceTier}>{model.priceTier}</span></div><div className="meta release">{model.release}</div>
        <button type="button" className="toggle" aria-expanded={expanded} onClick={onToggle} aria-label={expanded ? `收起${model.name}详情` : `展开${model.name}详情`}><span className="chev">▾</span></button>
      </div>
      {expanded && <Detail entry={entry} mode={mode} sortKey={sortKey} />}
    </li>
  );
}

function Detail({ entry, mode, sortKey }: { entry: Entry; mode: RankingMode; sortKey: SortKey }) {
  const { model } = entry;
  return (
    <div className="detail">
      {mode === "objective" && <ObjectiveDetail entry={entry} />}
      {mode === "editorial" && <div className="detail-cols"><div className="detail-radar"><Radar dims={model.dims} size={210} highlight={sortKey === "composite" ? null : sortKey as DimKey} /><p className="detail-radar-cap">六维雷达 · 编辑评分 0–100</p></div><div><h4 className="detail-head">强项</h4><ul>{model.strengths.map((strength) => <li key={strength}>+ {strength}</li>)}</ul></div><div><h4 className="detail-head">短板</h4><ul>{model.weaknesses.map((weakness) => <li key={weakness}>− {weakness}</li>)}</ul></div></div>}
      <p className="detail-blurb">{mode === "objective" ? "编辑摘要：" : ""}{model.blurb}</p>
      <dl className="detail-meta"><div><dt>上下文</dt><dd>{model.ctx ?? "以官网为准"}</dd></div><div><dt>许可</dt><dd>{model.license}</dd></div><div><dt>价格</dt><dd>{model.priceNote}</dd></div></dl>
      <p className="detail-sources">编辑资料：{model.sources.map((source, index) => <span key={source.url}><sup>{index + 1}</sup><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>{index < model.sources.length - 1 ? "，" : ""}</span>)}</p>
    </div>
  );
}

function ObjectiveDetail({ entry }: { entry: Entry }) {
  return (
    <div className="objective-detail">
      <div className="objective-detail-head"><h4 className="detail-head">客观数据拆解</h4><span className="coverage">覆盖 {entry.objectiveScore.available}/{entry.objectiveScore.total} · {entry.objectiveScore.confidence}置信度</span></div>
      <div className="benchmark-grid">{OBJECTIVE_DIM_KEYS.map((key) => { const observations = observationsFor(entry, key); const value = entry.objectiveDims[key]; return <article className={"benchmark-card" + (value == null ? " is-missing" : "")} key={key}><span className="benchmark-label">{OBJECTIVE_DIM_LABELS[key]}</span><strong>{value == null ? "—" : value.toFixed(1)}</strong><small>{observations.length > 0 ? `${observations.length} 个信号 · 分类均值` : "暂无同版本快照"}</small>{observations.length > 0 && <div className="benchmark-signals">{observations.map(({ definition, observation }) => <span key={definition.id}><b>{definition.shortLabel}</b> {observation.value.toFixed(1)} · {observation.modelVersion} <a href={definition.sourceUrl} target="_blank" rel="noopener noreferrer">来源 ↗</a></span>)}</div>}</article>; })}</div>
      <p className="detail-note">客观分只使用已观测指标并按固定权重重归一化；信号先按声明的固定 0–100 量表校准，同一维度多个信号取简单平均，缺失数据不按 0 分处理。当前来源仍以公开聚合榜为主，后续应继续替换为原始 benchmark 记录。</p>
    </div>
  );
}

/* ---------- 页脚 ---------- */
function Footer() {
  return (
    <footer className="footer">
      <h3 className="footer-title">方法论与免责声明</h3>
      <ol className="method"><li>客观能力榜只展示具体模型版本的公开快照，当前覆盖综合智能、编程、推理·数学和 Agent 四项；缺失数据不会补成 0 分，并会显示覆盖率。</li><li>编辑推荐榜保留性价比和开源两个价值维度。综合分 = Σ 维度分 × 权重 ÷ 权重总和，滑块显示归一化后的最终占比。</li><li>公开榜单、价格、上下文和许可证可能滞后。客观数据当前来自公开聚合榜快照，最终使用前应回到原始 benchmark 和厂商官网核验。</li></ol>
      <div className="source-links"><span>客观数据入口：</span><a href="https://www.requesty.ai/models/rankings/intelligence" target="_blank" rel="noopener noreferrer">Intelligence Index</a><a href="https://www.requesty.ai/models/rankings/coding" target="_blank" rel="noopener noreferrer">Coding Index</a><a href="https://www.requesty.ai/models/rankings/reasoning" target="_blank" rel="noopener noreferrer">GPQA Diamond</a><a href="https://www.requesty.ai/models/rankings/tool-use" target="_blank" rel="noopener noreferrer">τ²-Bench</a><a href="https://benchlm.ai/benchmarks/swe-bench-pro" target="_blank" rel="noopener noreferrer">SWE-bench Pro</a><a href="https://benchlm.ai/benchmarks/browsecomp" target="_blank" rel="noopener noreferrer">BrowseComp</a></div>
      <p className="colophon">AI 模型矩阵 · 客观快照 {BENCHMARK_DATE} · 编辑资料 {DATA_DATE} · 建议每月复核</p>
    </footer>
  );
}
