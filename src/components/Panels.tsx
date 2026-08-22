import { BENCHMARK_DEFINITIONS } from "../data/benchmarks";
import type { DimKey } from "../data/models";
import type { Entry } from "../lib/entries";
import type { Preset, Weights } from "../lib/score";
import { DIM_KEYS, DIM_LABELS, PRESETS } from "../lib/score";

/* ---------- 公开评测说明 ---------- */
export function ObjectivePanel({ entries }: { entries: Entry[] }) {
  const ready = entries.filter((entry) => entry.objectiveScore.score !== null).length;
  const high = entries.filter((entry) => entry.objectiveScore.confidence === "高").length;
  return (
    <aside className="objective-panel">
      <div className="panel-head"><h2 className="panel-title">公开评测数据</h2><p className="panel-note">主榜只看 AA 同版本智能指数</p></div>
      <div className="objective-summary"><div><strong>{ready}</strong><span>/ {entries.length} 个模型有同版本智能指数</span></div><div><strong>{high}</strong><span>个模型覆盖至少 3 项明细</span></div></div>
      <div className="objective-source-grid">
        {BENCHMARK_DEFINITIONS.map((definition) => <a className="objective-source" key={definition.id} href={definition.sourceUrl} target="_blank" rel="noopener noreferrer"><span>{definition.shortLabel}</span><strong>{definition.unit === "%" ? "百分比" : "指数"}</strong></a>)}
      </div>
      <p className="panel-footnote">AA 自动更新主指数；Arena 仅在详情作用户偏好参考。版本对不上就不计入。</p>
    </aside>
  );
}

/* ---------- 编辑推荐设置 ---------- */
export function WeightPanel({ weights, preset, onPreset, onWeight, onReset }: {
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
