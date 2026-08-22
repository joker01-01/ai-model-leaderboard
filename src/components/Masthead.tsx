import { BENCHMARK_DATE } from "../data/benchmarks";
import type { RankingMode } from "../lib/entries";

/* ---------- 顶部 ---------- */
export function Masthead() {
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
        <span className="sys-status"><i className="dot" aria-hidden="true" />官方数据已同步</span>
        <span className="stamp">AA {BENCHMARK_DATE}</span>
      </div>
    </header>
  );
}

export function ModeSwitch({ mode, onChange }: { mode: RankingMode; onChange: (mode: RankingMode) => void }) {
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
