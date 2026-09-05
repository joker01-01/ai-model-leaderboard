import type { AaLeaderboardEntry } from "../lib/aaLeaderboard";

export default function AaBoard({ entries, expanded, sourceUrl, scaleMax: requestedScaleMax, onToggle }: {
  entries: AaLeaderboardEntry[];
  expanded: string | null;
  sourceUrl: string;
  scaleMax?: number;
  onToggle: (sourceId: string) => void;
}) {
  const scaleMax = Math.max(1, requestedScaleMax ?? 0, ...entries.map((entry) => entry.value));
  return (
    <section className="board board-aa" aria-label="公开评测榜排名">
      <div className="board-head" aria-hidden="true"><span>名次</span><span>模型配置</span><span>智能指数</span><span className="right">发布</span><span className="right">来源</span><span /></div>
      {entries.length === 0 && <p className="empty">没有找到符合条件的 AA 模型配置，换个搜索词试试。</p>}
      <ol className="rows">{entries.map((entry) => (
        <AaRow
          key={entry.sourceId}
          entry={entry}
          expanded={expanded === entry.sourceId}
          sourceUrl={sourceUrl}
          scaleMax={scaleMax}
          onToggle={() => onToggle(entry.sourceId)}
        />
      ))}</ol>
    </section>
  );
}

function AaRow({ entry, expanded, sourceUrl, scaleMax, onToggle }: {
  entry: AaLeaderboardEntry;
  expanded: boolean;
  sourceUrl: string;
  scaleMax: number;
  onToggle: () => void;
}) {
  const barWidth = `${Math.max(3, Math.min(100, (entry.value / scaleMax) * 100))}%`;
  return (
    <li className={`row${expanded ? " is-expanded" : ""}`}>
      <div className="row-main">
        <span className={`rank${entry.rank === 1 ? " rank-1" : entry.rank <= 3 ? " rank-top" : ""}`}>{String(entry.rank).padStart(2, "0")}</span>
        <div className="who"><p className="who-name">{entry.modelVersion}</p><p className="who-maker">{entry.creatorName ?? "AA 未提供开发者资料"} · {entry.sourceSlug}</p></div>
        <div className="score aa-score"><span className="score-bar" aria-hidden="true"><i style={{ width: barWidth }} /></span><strong className="score-num">{entry.value.toFixed(1)}</strong></div>
        <div className="meta release">{entry.releaseDate ?? "AA 未提供"}</div>
        <div className="meta aa-source"><a href={sourceUrl} target="_blank" rel="noopener noreferrer">查看 ↗</a></div>
        <button type="button" className="toggle" aria-expanded={expanded} onClick={onToggle} aria-label={expanded ? `收起${entry.modelVersion}详情` : `展开${entry.modelVersion}详情`}><span className="chev">▾</span></button>
      </div>
      {expanded && (
        <div className="detail">
          <dl className="detail-meta">
            <div><dt>模型开发者</dt><dd>{entry.creatorName ?? "AA 未提供"}</dd></div>
            <div><dt>发布日期</dt><dd>{entry.releaseDate ?? "AA 未提供"}</dd></div>
            <div><dt>AA 源标识</dt><dd>{entry.sourceSlug}</dd></div>
          </dl>
          <p className="detail-note">源 ID：<code>{entry.sourceId}</code> · 观测日期：{entry.observedAt}。同一模型的不同推理或努力配置按 Artificial Analysis 源条目分别展示，不按模型家族合并。</p>
          <p className="detail-sources">参考来源：<a href={sourceUrl} target="_blank" rel="noopener noreferrer">Artificial Analysis 模型榜单 ↗</a></p>
        </div>
      )}
    </li>
  );
}
