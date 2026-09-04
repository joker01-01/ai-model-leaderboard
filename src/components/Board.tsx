import type { DimKey } from "../data/models";
import { ARENA_SNAPSHOT, type ArenaMetric } from "../data/generated/arenaSnapshot";
import {
  entryValue,
  observationsFor,
  type Entry,
  type RankingMode,
  type SortKey,
} from "../lib/entries";
import { competitionRanks } from "../lib/ranking";
import {
  DIM_KEYS,
  DIM_LABELS,
  OBJECTIVE_DIM_KEYS,
  OBJECTIVE_DIM_LABELS,
  type ObjectiveDimKey,
} from "../lib/score";
import Radar from "./Radar";

export default function Board({ mode, entries, sortKey, expanded, onToggle }: {
  mode: RankingMode;
  entries: Entry[];
  sortKey: SortKey;
  expanded: string | null;
  onToggle: (id: string) => void;
}) {
  const sortLabel = sortKey === "composite"
    ? (mode === "objective" ? "智能指数" : "推荐分")
    : mode === "objective"
      ? OBJECTIVE_DIM_LABELS[sortKey as ObjectiveDimKey]
      : DIM_LABELS[sortKey as DimKey];
  const rankedEntries = mode === "objective"
    ? entries.filter((entry) => entry.objectiveScore.score !== null)
    : entries.filter((entry) => entry.editorialScore !== null);
  const pendingEntries = mode === "objective"
    ? entries.filter((entry) => entry.objectiveScore.score === null)
    : entries.filter((entry) => entry.editorialScore === null);
  const ranks = competitionRanks(rankedEntries.map((entry) => entryValue(entry, mode, sortKey)));
  const pendingLabel = mode === "objective" ? "待补公开成绩" : "待补编辑基础分";
  const pendingDescription = mode === "objective"
    ? "以下模型暂时没有可核验的同版本智能指数，因此不显示名次或主榜分数。"
    : "以下模型暂时没有同版本 AA 智能指数，编辑榜不使用手工分数替代，因此暂不显示推荐分。";

  return (
    <section className="board" aria-label={`${mode === "objective" ? "公开评测榜" : "编辑推荐榜"}排名`}>
      <div className="board-head" aria-hidden="true"><span>名次</span><span>模型</span><span className="right">{sortLabel}</span><span>{mode === "objective" ? "评测覆盖" : "六项评分"}</span><span className="right">价格带</span><span className="right">发布</span><span /></div>
      {entries.length === 0 && <p className="empty">没有找到符合条件的模型，换个搜索词试试。</p>}
      <ol className="rows">{rankedEntries.map((entry, index) => (
        <Row
          key={`${entry.model.id}-${mode}-${sortKey}`}
          entry={entry}
          mode={mode}
          rank={ranks[index]}
          sortKey={sortKey}
          expanded={expanded === entry.model.id}
          onToggle={() => onToggle(entry.model.id)}
        />
      ))}</ol>
      {pendingEntries.length > 0 && (
        <section className="unranked" aria-label={pendingLabel}>
          <div className="unranked-head"><div><h3>{pendingLabel}</h3><p>{pendingDescription}</p></div><span>{pendingEntries.length} 个模型</span></div>
          <ol className="rows rows-unranked">{pendingEntries.map((entry) => (
            <Row
              key={`${entry.model.id}-pending`}
              entry={entry}
              mode={mode}
              rank={null}
              sortKey={sortKey}
              expanded={expanded === entry.model.id}
              onToggle={() => onToggle(entry.model.id)}
            />
          ))}</ol>
        </section>
      )}
    </section>
  );
}

function Row({ entry, mode, rank, sortKey, expanded, onToggle }: {
  entry: Entry;
  mode: RankingMode;
  rank: number | null;
  sortKey: SortKey;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { model } = entry;
  const dimScore = entryValue(entry, mode, sortKey);
  const hasScore = Number.isFinite(dimScore);
  const bars = mode === "objective" ? OBJECTIVE_DIM_KEYS : DIM_KEYS;
  return (
    <li className={`row${expanded ? " is-expanded" : ""}${!hasScore ? " is-pending" : ""}${rank === null ? " is-unranked" : ""}`} style={rank === null ? undefined : { animationDelay: `${Math.min(rank * 34, 680)}ms` }}>
      <div className="row-main">
        <span className={`rank${rank === 1 ? " rank-1" : rank !== null && rank <= 3 ? " rank-top" : ""}`}>{rank === null ? "—" : String(rank).padStart(2, "0")}</span>
        <div className="who"><p className="who-name">{model.name}</p><p className="who-maker">{model.flag} {model.maker} · {model.country}</p><ul className="chips">{model.badges.map((badge) => <li key={badge} className="chip">{badge}</li>)}</ul></div>
        <div className={`score${!hasScore ? " score-pending" : ""}`}><span className="score-num">{hasScore ? dimScore.toFixed(1) : "待补"}</span><span className="score-bar"><i style={{ width: `${hasScore ? Math.max(0, Math.min(100, dimScore)) : 0}%` }} /></span></div>
        <div className="spark" role="img" aria-label={mode === "objective" ? "四项能力得分" : "六项评分"}>{bars.map((key) => { const value = mode === "objective" ? entry.objectiveDims[key as ObjectiveDimKey] : entry.editorialDims[key as DimKey]; return <span key={key} title={`${mode === "objective" ? OBJECTIVE_DIM_LABELS[key as ObjectiveDimKey] : DIM_LABELS[key as DimKey]} ${value ?? "待补"}`} className={`spark-bar${sortKey === key ? " is-active" : ""}`} style={{ height: `${Math.max(8, value ?? 8)}%` }} />; })}</div>
        <div className="meta"><span className={`tier tier-${model.priceTier}`}>{model.priceTier}</span></div><div className="meta release">{model.release}</div>
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
      {mode === "editorial" && <div className="detail-cols"><div className="detail-radar"><Radar dims={entry.editorialDims} size={210} highlight={sortKey === "composite" ? null : sortKey as DimKey} /><p className="detail-radar-cap">六项基础分 · 公开数据 + 规则</p></div><div><h4 className="detail-head">强项</h4><ul>{model.strengths.map((strength) => <li key={strength}>+ {strength}</li>)}</ul></div><div><h4 className="detail-head">短板</h4><ul>{model.weaknesses.map((weakness) => <li key={weakness}>− {weakness}</li>)}</ul></div></div>}
      <p className="detail-blurb">{mode === "objective" ? "补充说明：" : ""}{model.blurb}</p>
      {mode === "editorial" && <p className="detail-note">编辑基础分覆盖 {Math.round(entry.editorialCoverage * 6)}/6 项：综合智能与编程来自 AA，推理·数学来自 GPQA，工具使用取 τ²-Bench / BrowseComp 可用均值；性价比和开源按固定规则计算。没有同版本 AA 智能指数的模型不进入编辑推荐排名。</p>}
      <dl className="detail-meta"><div><dt>上下文</dt><dd>{model.ctx ?? "以官网为准"}</dd></div><div><dt>许可</dt><dd>{model.license}</dd></div><div><dt>价格</dt><dd>{model.priceNote}</dd></div></dl>
      <p className="detail-sources">参考来源：{model.sources.map((source, index) => <span key={source.url}><sup>{index + 1}</sup><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}</a>{index < model.sources.length - 1 ? "，" : ""}</span>)}</p>
    </div>
  );
}

function ObjectiveDetail({ entry }: { entry: Entry }) {
  return (
    <div className="objective-detail">
      <div className="objective-detail-head"><h4 className="detail-head">公开评测拆分</h4><span className="coverage">覆盖 {entry.objectiveScore.available}/{entry.objectiveScore.total} · {entry.objectiveScore.confidence}可信度</span></div>
      <div className="benchmark-grid">{OBJECTIVE_DIM_KEYS.map((key) => { const observations = observationsFor(entry, key); const value = entry.objectiveDims[key]; return <article className={`benchmark-card${value == null ? " is-missing" : ""}`} key={key}><span className="benchmark-label">{OBJECTIVE_DIM_LABELS[key]}</span><strong>{value == null ? "—" : value.toFixed(1)}</strong><small>{observations.length > 0 ? `${observations.length} 个信号 · 分类均值` : "暂无同版本快照"}</small>{observations.length > 0 && <div className="benchmark-signals">{observations.map(({ definition, observation }) => <span key={definition.id}><b>{definition.shortLabel}</b> {observation.value.toFixed(1)} · {observation.modelVersion} <a href={definition.sourceUrl} target="_blank" rel="noopener noreferrer">来源 ↗</a></span>)}</div>}</article>; })}</div>
      <ArenaDetail modelId={entry.model.id} />
      <p className="detail-note">主榜只按同版本智能指数排名；其他成绩用于补充说明，不混入主榜分数。使用前可以点击来源查看原始榜单。</p>
    </div>
  );
}

function ArenaDetail({ modelId }: { modelId: string }) {
  const profile = ARENA_SNAPSHOT.models[modelId];
  if (!profile || Object.keys(profile).length === 0) return null;
  const labels: Record<keyof typeof profile, string> = { text: "文本偏好", webdev: "代码对战", agent: "Agent 对战" };
  return <section className="arena-detail" aria-label="Arena 用户对战参考"><div className="objective-detail-head"><h4 className="detail-head">Arena 用户对战参考</h4><a className="coverage" href={ARENA_SNAPSHOT.sourceUrl} target="_blank" rel="noopener noreferrer">查看原始数据 ↗</a></div><div className="benchmark-grid">{(Object.entries(profile) as Array<[keyof typeof profile, ArenaMetric]>).map(([key, metric]) => { const isAgent = key === "agent"; const score = isAgent ? metric.value.toFixed(3) : metric.value.toFixed(0); const interval = metric.lower != null && metric.upper != null ? isAgent ? `${metric.lower.toFixed(3)}–${metric.upper.toFixed(3)}` : `${metric.lower.toFixed(0)}–${metric.upper.toFixed(0)}` : null; return <article className="benchmark-card" key={key}><span className="benchmark-label">{labels[key]}</span><strong>{score}</strong><small>{metric.rank == null ? (isAgent ? "IPS 得分" : "Arena Score") : `第 ${metric.rank} 名`} · {metric.category}</small><div className="benchmark-signals"><span><b>{metric.observations ?? "—"}</b> 次{isAgent ? "观测" : "对战"} · {metric.modelVersion}</span><span>{metric.observedAt}{interval ? ` · 区间 ${interval}` : ""}</span></div></article>; })}</div><p className="detail-note">Arena 衡量用户在盲测对战中的偏好，量纲不同；Agent 使用 IPS 得分。两者均仅作参考，不参与本站公开评测榜名次。</p></section>;
}
