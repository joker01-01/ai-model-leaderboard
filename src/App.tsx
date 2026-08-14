import { useEffect, useMemo, useRef, useState } from "react";
import type { DimKey, Model } from "./data/models";
import { DATA_DATE, MODELS } from "./data/models";
import type { Preset, Weights } from "./lib/score";
import { composite, DEFAULT_WEIGHTS, DIM_KEYS, DIM_LABELS, PRESETS } from "./lib/score";
import Radar from "./components/Radar";

type SortKey = DimKey | "composite";
interface Entry { model: Model; score: number }

function loadPref(key: string, fallback: string): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
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
  const [weights, setWeights] = useState<Weights>(() => {
    try {
      const raw = localStorage.getItem("almanac.weights");
      if (raw) return JSON.parse(raw) as Weights;
    } catch { /* ignore */ }
    return DEFAULT_WEIGHTS;
  });
  const [preset, setPreset] = useState<string>(() => loadPref("almanac.preset", "综合（含性价比）"));
  const [sortKey, setSortKey] = useState<SortKey>("composite");
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("全部");
  const [openOnly, setOpenOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { try { localStorage.setItem("almanac.weights", JSON.stringify(weights)); } catch { /* ignore */ } }, [weights]);
  useEffect(() => { try { localStorage.setItem("almanac.preset", preset); } catch { /* ignore */ } }, [preset]);

  const scored: Entry[] = useMemo(
    () => MODELS.map((model) => ({ model, score: composite(model.dims, weights) })),
    [weights],
  );
  const champion = useMemo(() => [...scored].sort((a, b) => b.score - a.score)[0], [scored]);
  const altChampion = useMemo(() => {
    const pure = PRESETS.find((p) => p.name === "纯智力")!;
    return [...MODELS.map((m) => ({ m, s: composite(m.dims, pure.weights) }))].sort((a, b) => b.s - a.s)[0];
  }, []);

  const countries = useMemo(() => ["全部", ...Array.from(new Set(MODELS.map((m) => m.country)))], []);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return scored
      .filter((e) => {
        if (openOnly && !e.model.open) return false;
        if (country !== "全部" && e.model.country !== country) return false;
        if (!needle) return true;
        return [e.model.name, e.model.maker, e.model.makerEn, ...e.model.badges]
          .join(" ").toLowerCase().includes(needle);
      })
      .sort((a, b) => {
        const va = sortKey === "composite" ? a.score : a.model.dims[sortKey];
        const vb = sortKey === "composite" ? b.score : b.model.dims[sortKey];
        return vb - va || b.score - a.score;
      });
  }, [scored, q, country, openOnly, sortKey]);

  const applyPreset = (p: Preset) => { setPreset(p.name); setWeights({ ...p.weights }); };
  const setDimWeight = (k: DimKey, v: number) => { setPreset("自定义"); setWeights((w) => ({ ...w, [k]: v })); };
  const reset = () => applyPreset(PRESETS[0]);

  return (
    <div className="page">
      <Masthead />
      <section className="hero">
        <Champion entry={champion} presetLabel={preset} altName={altChampion.m.name}
          onSwitch={() => applyPreset(PRESETS.find((p) => p.name === "纯智力")!)} />
        <WeightPanel weights={weights} preset={preset} onPreset={applyPreset} onWeight={setDimWeight} onReset={reset} />
      </section>
      <Controls sortKey={sortKey} setSortKey={setSortKey} q={q} setQ={setQ}
        country={country} setCountry={setCountry} countries={countries} openOnly={openOnly} setOpenOnly={setOpenOnly} />
      <Board entries={visible} sortKey={sortKey} expanded={expanded}
        onToggle={(id) => setExpanded((cur) => (cur === id ? null : id))} />
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
        <span className="sys-status"><i className="dot" aria-hidden="true" />数据同步</span>
        <span className="stamp">DATA {DATA_DATE}</span>
      </div>
    </header>
  );
}

/* ---------- 冠军牌 ---------- */
function Champion({ entry, presetLabel, altName, onSwitch }: {
  entry: Entry; presetLabel: string; altName: string; onSwitch: () => void;
}) {
  const display = useCountUp(entry.score);
  const { model } = entry;
  return (
    <article className="champion" key={model.id}>
      <p className="eyebrow">当前权重方案 · 榜首</p>
      <div className="champion-main">
        <div className="champion-id">
          <h2 className="champion-name">{model.name}</h2>
          <p className="champion-maker">{model.flag} {model.maker} · {model.country}</p>
          <ul className="chips">
            {model.badges.map((b) => <li key={b} className="chip">{b}</li>)}
          </ul>
        </div>
        <div className="champion-score">
          <span className="champion-num">{display.toFixed(1)}</span>
          <span className="champion-denom">/ 100</span>
        </div>
        <div className="champion-radar">
          <Radar dims={model.dims} size={180} />
        </div>
      </div>
      <p className="champion-blurb">「{model.blurb}」</p>
      <p className="champion-alt">
        切到「纯智力」权重方案，榜首是 <strong>{altName}</strong>
        <button type="button" className="textlink" onClick={onSwitch}>切换试试 →</button>
      </p>
      <p className="champion-note">当前权重方案：{presetLabel} · 右侧可调</p>
    </article>
  );
}

/* ---------- 口径 / 权重面板 ---------- */
function WeightPanel({ weights, preset, onPreset, onWeight, onReset }: {
  weights: Weights; preset: string;
  onPreset: (p: Preset) => void; onWeight: (k: DimKey, v: number) => void; onReset: () => void;
}) {
  return (
    <aside className="weights">
      <div className="panel-head">
        <h2 className="panel-title">榜单权重</h2>
        <p className="panel-note">综合分 = Σ 维度分 × 权重 ÷ 权重总和，权重决定排名。</p>
      </div>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.name} type="button"
            className={"preset" + (preset === p.name ? " is-active" : "")}
            onClick={() => onPreset(p)}>
            <span className="preset-name">{p.name}</span>
            <span className="preset-note">{p.note}</span>
          </button>
        ))}
      </div>
      <div className="sliders">
        {DIM_KEYS.map((k) => (
          <label key={k} className="slider">
            <span className="slider-label">{DIM_LABELS[k]}</span>
            <input type="range" min={0} max={60} step={1} value={weights[k]}
              onChange={(e) => onWeight(k, Number(e.target.value))} />
            <span className="slider-val">{weights[k]}%</span>
          </label>
        ))}
      </div>
      <button type="button" className="textlink reset" onClick={onReset}>恢复默认权重</button>
    </aside>
  );
}

/* ---------- 控制条 ---------- */
function Controls({ sortKey, setSortKey, q, setQ, country, setCountry, countries, openOnly, setOpenOnly }: {
  sortKey: SortKey; setSortKey: (k: SortKey) => void;
  q: string; setQ: (s: string) => void;
  country: string; setCountry: (s: string) => void; countries: string[];
  openOnly: boolean; setOpenOnly: (b: boolean) => void;
}) {
  return (
    <div className="controls">
      <div className="dims" role="tablist" aria-label="榜单维度">
        <button type="button" role="tab" aria-selected={sortKey === "composite"}
          className={"dim" + (sortKey === "composite" ? " is-active" : "")}
          onClick={() => setSortKey("composite")}>总榜</button>
        {DIM_KEYS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={sortKey === k}
            className={"dim" + (sortKey === k ? " is-active" : "")}
            onClick={() => setSortKey(k)}>{DIM_LABELS[k]}</button>
        ))}
      </div>
      <div className="filters">
        <input className="search" type="search" placeholder="搜索模型 / 厂商…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="country-chips">
          {countries.map((c) => (
            <button key={c} type="button"
              className={"country" + (country === c ? " is-active" : "")}
              onClick={() => setCountry(c)}>{c}</button>
          ))}
        </div>
        <label className="open-toggle">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          <span>只看开源</span>
        </label>
      </div>
    </div>
  );
}

/* ---------- 榜单 ---------- */
function Board({ entries, sortKey, expanded, onToggle }: {
  entries: Entry[]; sortKey: SortKey; expanded: string | null; onToggle: (id: string) => void;
}) {
  const sortLabel = sortKey === "composite" ? "综合分" : DIM_LABELS[sortKey];
  return (
    <section className="board">
      <div className="board-head" aria-hidden="true">
        <span>名次</span><span>模型</span><span className="right">{sortLabel}</span>
        <span>六维速览</span><span className="right">价格带</span><span className="right">发布</span><span />
      </div>
      {entries.length === 0 && <p className="empty">没有符合条件的模型，换个条件试试。</p>}
      <ol className="rows">
        {entries.map((e, i) => (
          <Row key={e.model.id + "-" + sortKey} entry={e} rank={i + 1} sortKey={sortKey}
            expanded={expanded === e.model.id} onToggle={() => onToggle(e.model.id)} />
        ))}
      </ol>
    </section>
  );
}

function Row({ entry, rank, sortKey, expanded, onToggle }: {
  entry: Entry; rank: number; sortKey: SortKey; expanded: boolean; onToggle: () => void;
}) {
  const { model } = entry;
  const dimScore = sortKey === "composite" ? entry.score : model.dims[sortKey];
  return (
    <li className={"row" + (expanded ? " is-expanded" : "")} style={{ animationDelay: Math.min(rank * 34, 680) + "ms" }}>
      <div className="row-main">
        <span className={"rank" + (rank === 1 ? " rank-1" : rank <= 3 ? " rank-top" : "")}>
          {String(rank).padStart(2, "0")}
        </span>
        <div className="who">
          <p className="who-name">{model.name}</p>
          <p className="who-maker">{model.flag} {model.maker} · {model.country}</p>
          <ul className="chips">
            {model.badges.map((b) => <li key={b} className="chip">{b}</li>)}
          </ul>
        </div>
        <div className="score">
          <span className="score-num">{dimScore.toFixed(1)}</span>
          <span className="score-bar"><i style={{ width: dimScore + "%" }} /></span>
        </div>
        <div className="spark" aria-label="六维得分">
          {DIM_KEYS.map((k) => (
            <span key={k} title={DIM_LABELS[k] + " " + model.dims[k]}
              className={"spark-bar" + (sortKey === k ? " is-active" : "")}
              style={{ height: Math.max(8, model.dims[k]) + "%" }} />
          ))}
        </div>
        <div className="meta"><span className={"tier tier-" + model.priceTier}>{model.priceTier}</span></div>
        <div className="meta release">{model.release}</div>
        <button type="button" className="toggle" aria-expanded={expanded} onClick={onToggle} aria-label="展开详情">
          <span className="chev">▾</span>
        </button>
      </div>
      {expanded && <Detail model={model} sortKey={sortKey} />}
    </li>
  );
}

function Detail({ model, sortKey }: { model: Model; sortKey: SortKey }) {
  return (
    <div className="detail">
      <p className="detail-blurb">{model.blurb}</p>
      <div className="detail-cols">
        <div className="detail-radar">
          <Radar dims={model.dims} size={210} highlight={sortKey === "composite" ? null : sortKey} />
          <p className="detail-radar-cap">六维雷达 · 0–100</p>
        </div>
        <div>
          <h4 className="detail-head">强项</h4>
          <ul>{model.strengths.map((s) => <li key={s}>+ {s}</li>)}</ul>
        </div>
        <div>
          <h4 className="detail-head">短板</h4>
          <ul>{model.weaknesses.map((s) => <li key={s}>− {s}</li>)}</ul>
        </div>
      </div>
      <dl className="detail-meta">
        <div><dt>上下文</dt><dd>{model.ctx ?? "以官网为准"}</dd></div>
        <div><dt>许可</dt><dd>{model.license}</dd></div>
        <div><dt>价格</dt><dd>{model.priceNote}</dd></div>
      </dl>
      <p className="detail-sources">
        来源：
        {model.sources.map((s, i) => (
          <span key={s.url}>
            <sup>{i + 1}</sup>
            <a href={s.url} target="_blank" rel="noopener noreferrer">{s.label}</a>
            {i < model.sources.length - 1 ? "，" : ""}
          </span>
        ))}
      </p>
    </div>
  );
}

/* ---------- 页脚 ---------- */
function Footer() {
  return (
    <footer className="footer">
      <h3 className="footer-title">方法论与免责声明</h3>
      <ol className="method">
        <li>本榜收录 20 个主流大模型，各维度分数为<strong>编辑部基于公开信息的评估值（0–100）</strong>，依据 2026-08-14 前公开榜单（Artificial Analysis、LMArena、Ramp SWE-Bench 及各厂商官方发布），<strong>非任何机构的官方排名</strong>。</li>
        <li>综合分 = Σ 维度分 × 权重 ÷ 权重总和，权重决定排名：本页提供「综合 / 纯智力 / 编程 / 性价比 / 开源」预设与自定义滑块，不同权重会给出不同排名——这正是本页想展示的事。</li>
        <li>价格带、上下文、许可证为公开信息摘录，可能滞后，<strong>请以各厂商官网为准</strong>。模型迭代极快，本榜数据会过期。</li>
      </ol>
      <div className="source-links">
        <span>主要数据源：</span>
        <a href="https://artificialanalysis.ai/" target="_blank" rel="noopener noreferrer">Artificial Analysis</a>
        <a href="https://lmarena.ai/" target="_blank" rel="noopener noreferrer">LMArena</a>
        <a href="https://benchlm.ai/" target="_blank" rel="noopener noreferrer">BenchLM</a>
        <a href="https://www.datalearner.com/" target="_blank" rel="noopener noreferrer">DataLearner</a>
        <a href="https://llm-stats.com/" target="_blank" rel="noopener noreferrer">LLM-Stats</a>
      </div>
      <p className="colophon">AI 模型矩阵 · 数据截至 {DATA_DATE} · 编辑评估，非官方 · 建议每月更新</p>
    </footer>
  );
}