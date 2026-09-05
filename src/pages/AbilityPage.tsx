import { useMemo, useState } from "react";

import LeaderboardLayout, { type CreatorOption } from "../components/LeaderboardLayout";
import SingleMetricChart from "../components/SingleMetricChart";
import { useChartAnimation } from "../hooks/useChartAnimation";
import {
  filterPresentedRanking,
  type AaModelPresentation,
} from "../lib/modelPresentation";
import { selectAbilityRanking, type AaAbilityMetric } from "../lib/aaRankings";
import type { AaPublicSnapshot } from "../lib/aaPublicSnapshot";

interface AbilityPageProps {
  readonly snapshot: AaPublicSnapshot;
  readonly metric: AaAbilityMetric;
  readonly presentations: ReadonlyMap<string, AaModelPresentation>;
  readonly displayNames: ReadonlyMap<string, string>;
  readonly primaryCreators: readonly CreatorOption[];
}

const TABS = [
  { metric: "intelligence" as const, href: "#/ability/intelligence", label: "综合智能" },
  { metric: "coding" as const, href: "#/ability/coding", label: "编程智能" },
  { metric: "agentic" as const, href: "#/ability/agentic", label: "智能体能力" },
];

export default function AbilityPage({
  snapshot,
  metric,
  presentations,
  displayNames,
  primaryCreators,
}: AbilityPageProps) {
  const [creatorId, setCreatorId] = useState<string | null | undefined>(undefined);
  const allRows = useMemo(() => selectAbilityRanking(snapshot.models, metric), [snapshot.models, metric]);
  const visibleRows = useMemo(
    () => filterPresentedRanking(allRows, presentations, "", creatorId),
    [allRows, presentations, creatorId],
  );
  const chartRef = useChartAnimation(`ability:${metric}:${creatorId ?? "all"}`);

  return (
    <LeaderboardLayout
      tone="ability"
      titleTone="ability"
      title="模型能力榜单"
      tabs={TABS.map((tab) => ({ ...tab, active: tab.metric === metric }))}
      creatorId={creatorId}
      onCreatorChange={setCreatorId}
      primaryCreators={primaryCreators}
    >
      <div ref={chartRef}>
        {visibleRows.length > 0 ? (
          <SingleMetricChart
            rows={visibleRows}
            displayNames={displayNames}
            scaleMax={100}
            progress={1}
          />
        ) : (
          <p className="public-empty">没有符合当前筛选条件的模型。</p>
        )}
      </div>
    </LeaderboardLayout>
  );
}
