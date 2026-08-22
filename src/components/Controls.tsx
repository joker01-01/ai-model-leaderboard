import type { DimKey } from "../data/models";
import type { RankingMode, SortKey } from "../lib/entries";
import { DIM_KEYS, DIM_LABELS, OBJECTIVE_DIM_KEYS, OBJECTIVE_DIM_LABELS, type ObjectiveDimKey } from "../lib/score";

/* ---------- 控制条 ---------- */
export function Controls({ mode, sortKey, setSortKey, q, setQ, country, setCountry, countries, openOnly, setOpenOnly }: {
  mode: RankingMode; sortKey: SortKey; setSortKey: (key: SortKey) => void;
  q: string; setQ: (value: string) => void;
  country: string; setCountry: (value: string) => void; countries: string[];
  openOnly: boolean; setOpenOnly: (value: boolean) => void;
}) {
  const keys = mode === "objective" ? OBJECTIVE_DIM_KEYS : DIM_KEYS;
  return (
    <div className="controls">
      <div className="dims" role="tablist" aria-label={`${mode === "objective" ? "公开评测榜" : "编辑推荐榜"}分类`}>
        <button type="button" role="tab" aria-selected={sortKey === "composite"} className={"dim" + (sortKey === "composite" ? " is-active" : "")} onClick={() => setSortKey("composite")}>{mode === "objective" ? "智能指数" : "推荐排名"}</button>
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
