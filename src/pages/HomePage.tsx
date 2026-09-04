import { useEffect, useRef } from "react";

import SingleMetricChart from "../components/SingleMetricChart";
import { selectAbilityRanking, selectPriceRanking, selectSpeedRanking } from "../lib/aaRankings";
import type { AaPublicSnapshot } from "../lib/aaPublicSnapshot";
import { niceAxisMaximum } from "../lib/chartScale";

interface HomePageProps {
  readonly snapshot: AaPublicSnapshot;
  readonly displayNames: ReadonlyMap<string, string>;
}

export default function HomePage({ snapshot, displayNames }: HomePageProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const abilityRows = selectAbilityRanking(snapshot.models, "intelligence");
  const speedRows = selectSpeedRanking(snapshot.models);
  const priceRows = selectPriceRanking(snapshot.models);
  const abilityPreview = abilityRows.slice(0, 5);
  const speedPreview = speedRows.slice(0, 5);
  const pricePreview = priceRows.slice(0, 5);
  const speedMax = niceAxisMaximum(Math.max(0, speedRows[0]?.primaryValue ?? 0));
  const priceMax = niceAxisMaximum(Math.max(0, priceRows[0]?.primaryValue ?? 0));

  useEffect(() => {
    document.title = "AI 模型排行榜";
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <main className="public-page home-page">
      <header className="home-header">
        <h1 ref={titleRef} tabIndex={-1}>AI 模型排行榜</h1>
      </header>

      <section className="home-grid" aria-label="排行榜目录">
        <a className="directory-card ability-card" href="#/ability/intelligence" aria-label="模型能力榜单">
          <header>
            <h2>模型能力榜单</h2>
          </header>
          {abilityPreview.length > 0 ? (
            <SingleMetricChart
              rows={abilityPreview}
              displayNames={displayNames}
              scaleMax={100}
              progress={1}
              preview
            />
          ) : (
            <p className="home-preview-empty">综合智能数据暂不可用，仍可查看榜单来源与更新时间。</p>
          )}
        </a>

        <a className="directory-card speed-card" href="#/efficiency/speed" aria-label="模型速度榜单">
          <header>
            <h2>模型速度榜单</h2>
          </header>
          {speedPreview.length > 0 ? (
            <SingleMetricChart
              rows={speedPreview}
              displayNames={displayNames}
              scaleMax={speedMax}
              progress={1}
              preview
              tone="speed"
              ariaLabel="模型输出速度榜单预览"
              metricLabel="输出速度"
              valueSuffix="tokens/s"
            />
          ) : (
            <p className="home-preview-empty">速度数据暂不可用，仍可查看榜单来源与更新时间。</p>
          )}
        </a>

        <a className="directory-card price-card" href="#/efficiency/price" aria-label="模型价格榜单">
          <header>
            <h2>模型价格榜单</h2>
          </header>
          {pricePreview.length > 0 ? (
            <SingleMetricChart
              rows={pricePreview}
              displayNames={displayNames}
              scaleMax={priceMax}
              progress={1}
              preview
              tone="price"
              ariaLabel="模型输出价格榜单预览"
              metricLabel="输出价格"
              valuePrefix="$"
              valueSuffix="/ 1M tokens"
            />
          ) : (
            <p className="home-preview-empty">价格数据暂不可用，仍可查看榜单来源与更新时间。</p>
          )}
        </a>

        <a className="directory-card advisor-card" href="#/advisor" aria-label="按需求选模型">
          <div>
            <p>按你的任务、预算和部署需求筛选</p>
            <h2>按需求选模型</h2>
          </div>
          <div className="advisor-card-action">
            <span>下一阶段接入</span>
            <span aria-hidden="true">→</span>
          </div>
        </a>
      </section>
    </main>
  );
}
