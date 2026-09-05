import { useEffect, useMemo, useState } from "react";

import DualMetricChart from "../components/DualMetricChart";
import LeaderboardLayout, { type CreatorOption } from "../components/LeaderboardLayout";
import { useChartProgress } from "../hooks/useChartProgress";
import {
  filterPresentedRanking,
  type AaModelPresentation,
} from "../lib/modelPresentation";
import {
  DEFAULT_EFFICIENCY_SORTS,
  defaultEfficiencySortDirection,
  selectPriceRanking,
  selectSpeedRanking,
  type AaEfficiencySort,
  type AaEfficiencySortSide,
} from "../lib/aaRankings";
import type { AaPublicSnapshot } from "../lib/aaPublicSnapshot";
import type { EfficiencyMetric } from "../lib/hashRoute";

interface EfficiencyPageProps {
  readonly snapshot: AaPublicSnapshot;
  readonly metric: EfficiencyMetric;
  readonly presentations: ReadonlyMap<string, AaModelPresentation>;
  readonly displayNames: ReadonlyMap<string, string>;
  readonly primaryCreators: readonly CreatorOption[];
}

type EfficiencySortState = Readonly<AaEfficiencySort & { readonly view: EfficiencyMetric }>;

function sortStateFor(view: EfficiencyMetric): EfficiencySortState {
  return Object.freeze({ view, ...DEFAULT_EFFICIENCY_SORTS[view] });
}

function oppositeDirection(direction: AaEfficiencySort["direction"]): AaEfficiencySort["direction"] {
  return direction === "ascending" ? "descending" : "ascending";
}

export default function EfficiencyPage({
  snapshot,
  metric,
  presentations,
  displayNames,
  primaryCreators,
}: EfficiencyPageProps) {
  const [creatorId, setCreatorId] = useState<string | null | undefined>(undefined);
  const [sortState, setSortState] = useState<EfficiencySortState>(() => sortStateFor(metric));
  const activeSort = sortState.view === metric ? sortState : sortStateFor(metric);

  useEffect(() => {
    setSortState((current) => current.view === metric ? current : sortStateFor(metric));
  }, [metric]);

  const allRows = useMemo(
    () => metric === "speed"
      ? selectSpeedRanking(snapshot.models, {}, activeSort)
      : selectPriceRanking(snapshot.models, {}, activeSort),
    [snapshot.models, metric, activeSort.side, activeSort.direction],
  );
  const visibleRows = useMemo(
    () => filterPresentedRanking(allRows, presentations, "", creatorId),
    [allRows, presentations, creatorId],
  );
  const progress = useChartProgress(`efficiency:${metric}`);

  const handleSortChange = (side: AaEfficiencySortSide) => {
    setSortState((current) => {
      const selected = current.view === metric ? current : sortStateFor(metric);
      const direction = selected.side === side
        ? oppositeDirection(selected.direction)
        : defaultEfficiencySortDirection(metric, side);
      return Object.freeze({ view: metric, side, direction });
    });
  };

  return (
    <LeaderboardLayout
      tone="efficiency"
      titleTone={metric}
      title={metric === "speed" ? "模型速度榜单" : "模型价格榜单"}
      creatorId={creatorId}
      onCreatorChange={setCreatorId}
      primaryCreators={primaryCreators}
    >
      {visibleRows.length > 0 ? (
        <DualMetricChart
          view={metric}
          rows={visibleRows}
          scaleRows={allRows}
          displayNames={displayNames}
          progress={progress}
          sort={activeSort}
          onSortChange={handleSortChange}
        />
      ) : (
        <p className="public-empty">没有符合当前筛选条件的模型。</p>
      )}
    </LeaderboardLayout>
  );
}
