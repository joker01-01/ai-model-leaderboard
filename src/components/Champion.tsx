import { BENCHMARK_DATE } from "../data/benchmarks";
import type { Entry, RankingMode } from "../lib/entries";
import { OBJECTIVE_DIM_KEYS, OBJECTIVE_DIM_LABELS } from "../lib/score";
import Radar from "./Radar";
import useCountUp from "./useCountUp";

/* ---------- 冠军牌 ---------- */
export function Champion({ entry, mode, presetLabel, altName, onAltSwitch }: {
  entry: Entry; mode: RankingMode; presetLabel: string; altName: string; onAltSwitch: () => void;
}) {
  const scoreValue = mode === "objective" ? entry.objectiveScore.score ?? 0 : entry.editorialScore ?? 0;
  const display = useCountUp(scoreValue);
  const { model } = entry;
  return (
    <article className={"champion " + (mode === "objective" ? "champion-objective" : "champion-editorial")}>
      <p className="eyebrow">{mode === "objective" ? "公开评测榜 · 智能指数当前第一" : "编辑推荐榜 · 当前第一"}</p>
      <div className="champion-main">
        <div className="champion-primary">
          <div className="champion-id">
            <h2 className="champion-name">{model.name}</h2>
            <p className="champion-maker">{model.flag} {model.maker} · {model.country}</p>
            <ul className="chips">{model.badges.map((badge) => <li key={badge} className="chip">{badge}</li>)}</ul>
          </div>
          <div className="champion-score"><span className="champion-num">{display.toFixed(1)}</span><span className="champion-denom">/ 100</span></div>
        </div>
        {mode === "objective" ? <ObjectiveBars entry={entry} compact /> : <div className="champion-radar"><Radar dims={entry.editorialDims} size={180} /></div>}
      </div>
      <p className="champion-blurb">「{model.blurb}」</p>
      <p className="champion-alt">{mode === "objective" ? "切到「编辑推荐榜」，当前第一是" : "切到「偏重智能」方案，当前第一是"} <strong>{altName}</strong> <button type="button" className="textlink" onClick={onAltSwitch}>{mode === "objective" ? "查看推荐 →" : "切换试试 →"}</button></p>
      <p className="champion-note">{mode === "objective" ? `智能指数 ${BENCHMARK_DATE} · 另有 ${entry.objectiveScore.available}/${entry.objectiveScore.total} 项公开明细 · ${entry.objectiveScore.confidence}可信度` : `当前权重方案：${presetLabel} · 基础分覆盖 ${Math.round(entry.editorialCoverage * 6)}/6 项 · 右侧可调`}</p>
    </article>
  );
}

function ObjectiveBars({ entry, compact = false }: { entry: Entry; compact?: boolean }) {
  return (
    <div className={"objective-bars" + (compact ? " is-compact" : "")} role="img" aria-label="四项能力得分">
      {OBJECTIVE_DIM_KEYS.map((key) => {
        const value = entry.objectiveDims[key];
        return <div className="objective-bar" key={key}><span>{OBJECTIVE_DIM_LABELS[key]}</span><i><b style={{ width: (value ?? 0) + "%" }} /></i><em>{value == null ? "—" : value.toFixed(1)}</em></div>;
      })}
    </div>
  );
}
