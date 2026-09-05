import type { AaRankedModel } from "../lib/aaRankings";
import { getAaCreatorTone } from "../lib/modelPresentation";
import ModelIdentity from "./ModelIdentity";

interface SingleMetricChartProps {
  readonly rows: readonly AaRankedModel[];
  readonly displayNames: ReadonlyMap<string, string>;
  readonly scaleMax: number;
  readonly progress: number;
  readonly preview?: boolean;
  readonly ariaLabel?: string;
  readonly metricLabel?: string;
  readonly tone?: "ability" | "speed" | "price";
  readonly lowerIsBetter?: boolean;
  readonly valuePrefix?: string;
  readonly valueSuffix?: string;
}

function clampProgress(progress: number): number {
  return Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
}

function exactNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

function animatedNumber(value: number, progress: number): string {
  if (progress >= 1) return exactNumber(value);
  return exactNumber(Number((value * progress).toFixed(6)));
}

function targetWidth(value: number, scaleMax: number, lowerIsBetter: boolean): number {
  if (!Number.isFinite(scaleMax) || scaleMax <= 0) return 2;
  const ratio = lowerIsBetter ? (scaleMax - value) / scaleMax : value / scaleMax;
  return Math.max(lowerIsBetter ? 2 : 0, Math.min(100, ratio * 100));
}

function displayNameFor(row: AaRankedModel, displayNames: ReadonlyMap<string, string>): string {
  return displayNames.get(row.sourceId) ?? row.rawName ?? row.sourceSlug ?? `未命名模型 ${row.sourceId}`;
}

const NORMALIZED_TICKS = [0, 25, 50, 75, 100] as const;

function NormalizedAxis() {
  return (
    <div className="single-metric-chart__axis" aria-hidden="true">
      <span />
      <span className="single-metric-chart__axis-metric">
        <span className="single-metric-chart__axis-scale">
          {NORMALIZED_TICKS.map((tick) => <span key={tick}>{tick}</span>)}
        </span>
        <span />
      </span>
    </div>
  );
}

export default function SingleMetricChart({
  rows,
  displayNames,
  scaleMax,
  progress,
  preview = false,
  ariaLabel,
  metricLabel = "得分",
  tone = "ability",
  lowerIsBetter = false,
  valuePrefix = "",
  valueSuffix = "",
}: SingleMetricChartProps) {
  const currentProgress = preview ? 1 : clampProgress(progress);

  return (
    <>
      {!preview && tone === "ability" ? <NormalizedAxis /> : null}
      <ol
        className={`single-metric-chart single-metric-chart--${tone}${preview ? " single-metric-chart--preview" : ""}`}
        aria-label={ariaLabel ?? (preview ? "模型能力榜单预览" : "模型能力排名")}
      >
        {rows.map((row) => {
          const finalValue = exactNumber(row.primaryValue);
          const currentValue = animatedNumber(row.primaryValue, currentProgress);
          const width = targetWidth(row.primaryValue, scaleMax, lowerIsBetter) * currentProgress;
          const exactText = `${valuePrefix}${finalValue}${valueSuffix === "" ? "" : ` ${valueSuffix}`}`;
          const accessibleText = metricLabel === "得分"
            ? `得分 ${exactText}`
            : `${metricLabel}：${exactText}`;

          return (
            <li
              className="single-metric-chart__row"
              data-creator-tone={getAaCreatorTone(row.creatorId)}
              key={row.sourceId}
            >
              <span className="sr-only">第 {row.rank} 名</span>
              <ModelIdentity model={row} displayName={displayNameFor(row, displayNames)} />
              <span className="single-metric-chart__metric">
                <span className="single-metric-chart__plot">
                  <span className="single-metric-chart__bar" aria-hidden="true">
                    <span className="single-metric-chart__bar-fill" style={{ width: `${width}%` }} />
                  </span>
                  <span
                    className="single-metric-chart__value"
                    style={{ left: `${width}%` }}
                  >
                    <span className="sr-only">{accessibleText}</span>
                    <span aria-hidden="true">
                      <span className="metric-number" data-final-value={`${valuePrefix}${currentValue}`}>{valuePrefix}{currentValue}</span>
                      {valueSuffix === "" ? null : <span className="metric-unit">{valueSuffix}</span>}
                    </span>
                  </span>
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </>
  );
}
