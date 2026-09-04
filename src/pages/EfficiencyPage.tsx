import { useMemo, useState } from "react";

import DualMetricChart from "../components/DualMetricChart";
import LeaderboardLayout, { type CreatorOption } from "../components/LeaderboardLayout";
import { useChartProgress } from "../hooks/useChartProgress";
import {
  filterPresentedRanking,
  type AaModelPresentation,
} from "../lib/modelPresentation";
import { selectPriceRanking, selectSpeedRanking } from "../lib/aaRankings";
import type { AaPublicSnapshot } from "../lib/aaPublicSnapshot";
import type { EfficiencyMetric } from "../lib/hashRoute";

interface EfficiencyPageProps {
  readonly snapshot: AaPublicSnapshot;
  readonly metric: EfficiencyMetric;
  readonly presentations: ReadonlyMap<string, AaModelPresentation>;
  readonly displayNames: ReadonlyMap<string, string>;
  readonly primaryCreators: readonly CreatorOption[];
}

export default function EfficiencyPage({
  snapshot,
  metric,
  presentations,
  displayNames,
  primaryCreators,
}: EfficiencyPageProps) {
  const [creatorId, setCreatorId] = useState<string | null | undefined>(undefined);
  const allRows = useMemo(
    () => metric === "speed" ? selectSpeedRanking(snapshot.models) : selectPriceRanking(snapshot.models),
    [snapshot.models, metric],
  );
  const visibleRows = useMemo(
    () => filterPresentedRanking(allRows, presentations, "", creatorId),
    [allRows, presentations, creatorId],
  );
  const progress = useChartProgress(`efficiency:${metric}`);

  return (
    <LeaderboardLayout
      tone="efficiency"
      title={metric === "speed" ? "模型速度榜单" : "模型价格榜单"}
      description={metric === "speed"
        ? "按输出速度从高到低排列；每个模型同时显示首字延迟和输出速度"
        : "按输出价格从高到低排列；每个模型同时显示输入价格和输出价格，条形长度使用对数尺度"}
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
        />
      ) : (
        <p className="public-empty">没有符合当前筛选条件的模型。</p>
      )}
    </LeaderboardLayout>
  );
}
