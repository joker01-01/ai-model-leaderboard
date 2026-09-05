import { useEffect, useLayoutEffect, useRef, useState } from "react";

import SiteFooter from "../components/SiteFooter";
import SingleMetricChart from "../components/SingleMetricChart";
import { useChartAnimation } from "../hooks/useChartAnimation";
import { selectAbilityRanking, selectPriceRanking, selectSpeedRanking } from "../lib/aaRankings";
import type { AaPublicSnapshot } from "../lib/aaPublicSnapshot";
import { alignedPreviewScaleMaximum, niceAxisMaximum } from "../lib/chartScale";

interface HomePageProps {
  readonly snapshot: AaPublicSnapshot;
  readonly displayNames: ReadonlyMap<string, string>;
  readonly previewLimit?: 3 | 5;
}

export default function HomePage({ snapshot, displayNames, previewLimit = 5 }: HomePageProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const gridRef = useRef<HTMLElement>(null);
  const abilityRows = selectAbilityRanking(snapshot.models, "intelligence");
  const speedRows = selectSpeedRanking(snapshot.models);
  const priceRows = selectPriceRanking(snapshot.models);
  const abilityPreview = abilityRows.slice(0, previewLimit);
  const speedPreview = speedRows.slice(0, previewLimit);
  const pricePreview = priceRows.slice(0, previewLimit);
  const speedMax = niceAxisMaximum(Math.max(
    0,
    ...speedPreview.map((row) => row.primaryValue),
  ));
  const priceMax = niceAxisMaximum(Math.max(0, priceRows[0]?.primaryValue ?? 0));
  const leadingAbilityValue = abilityPreview[0]?.primaryValue ?? 0;
  const leadingPriceValue = pricePreview[0]?.primaryValue ?? 0;
  const [abilityPreviewMax, setAbilityPreviewMax] = useState(100);

  useEffect(() => {
    document.title = "AI 模型排行榜";
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (grid === null) return undefined;

    const updateAbilityPreviewScale = () => {
      let nextMaximum = 100;
      const hasDesktopColumns = typeof window.matchMedia === "function"
        && window.matchMedia("(min-width: 1025px)").matches;

      if (hasDesktopColumns && leadingAbilityValue > 0 && leadingPriceValue >= 0) {
        // The full-width ability plot and half-width price plot have different origins.
        // Measure the visible price endpoint so their leading fills share one desktop edge.
        const abilityPlot = grid.querySelector<HTMLElement>(
          ".ability-card .single-metric-chart__plot",
        );
        const leadingPriceFill = grid.querySelector<HTMLElement>(
          ".price-card .single-metric-chart__bar-fill",
        );

        if (abilityPlot !== null && leadingPriceFill !== null) {
          const abilityPlotRect = abilityPlot.getBoundingClientRect();
          const priceFillRect = leadingPriceFill.getBoundingClientRect();
          nextMaximum = alignedPreviewScaleMaximum(
            leadingAbilityValue,
            abilityPlotRect.left,
            abilityPlotRect.width,
            priceFillRect.left + Number.parseFloat(getComputedStyle(leadingPriceFill).width),
            100,
          );
        }
      }

      setAbilityPreviewMax((currentMaximum) => (
        Math.abs(currentMaximum - nextMaximum) < 0.000001 ? currentMaximum : nextMaximum
      ));
    };

    updateAbilityPreviewScale();
    const alignmentFrame = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame(updateAbilityPreviewScale)
      : null;
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateAbilityPreviewScale);
    resizeObserver?.observe(grid);
    window.addEventListener("resize", updateAbilityPreviewScale);
    return () => {
      if (alignmentFrame !== null) window.cancelAnimationFrame(alignmentFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateAbilityPreviewScale);
    };
  }, [leadingAbilityValue, leadingPriceValue, priceMax]);

  const abilityAnimation = useChartAnimation<HTMLAnchorElement>(`home:ability:${previewLimit}:${abilityPreviewMax}`);
  const speedAnimation = useChartAnimation<HTMLAnchorElement>(`home:speed:${previewLimit}`);
  const priceAnimation = useChartAnimation<HTMLAnchorElement>(`home:price:${previewLimit}`);

  return (
    <main className="public-page home-page">
      <header className="home-header">
        <h1 ref={titleRef} tabIndex={-1}>AI 模型排行榜</h1>
      </header>

      <section ref={gridRef} className="home-grid" aria-label="排行榜目录">
        <a ref={abilityAnimation} className="directory-card ability-card" href="#/ability/intelligence" aria-label="模型能力榜单">
          <header>
            <h2>模型能力榜单</h2>
          </header>
          {abilityPreview.length > 0 ? (
            <SingleMetricChart
              rows={abilityPreview}
              displayNames={displayNames}
              scaleMax={abilityPreviewMax}
              progress={1}
              preview
            />
          ) : (
            <p className="home-preview-empty">综合智能数据暂不可用，仍可查看榜单来源与更新时间。</p>
          )}
        </a>

        <a ref={speedAnimation} className="directory-card speed-card" href="#/efficiency/speed" aria-label="模型速度榜单">
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
              lowerIsBetter
              ariaLabel="模型首字延迟榜单预览"
              metricLabel="首字延迟"
              valueSuffix="秒"
            />
          ) : (
            <p className="home-preview-empty">速度数据暂不可用，仍可查看榜单来源与更新时间。</p>
          )}
        </a>

        <a ref={priceAnimation} className="directory-card price-card" href="#/efficiency/price" aria-label="模型价格榜单">
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
            <h2>按需求选模型</h2>
          </div>
          <div className="advisor-card-action">
            <span>开始选择</span>
            <span aria-hidden="true">→</span>
          </div>
        </a>
      </section>

      <SiteFooter
        observedAt={snapshot.source.observedAt}
        sourceUrl={snapshot.source.url}
      />
    </main>
  );
}
