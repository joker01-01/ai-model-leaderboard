import {
  defaultEfficiencySortDirection,
  type AaEfficiencySort,
  type AaEfficiencySortSide,
  type AaRankedModel,
  type AaSortDirection,
} from "../lib/aaRankings";
import { niceAxisMaximum } from "../lib/chartScale";
import { getAaCreatorTone } from "../lib/modelPresentation";
import ModelIdentity from "./ModelIdentity";

type DualMetricView = "speed" | "price";

const AXIS_POSITIONS = [0, 0.25, 0.5, 0.75, 1] as const;

interface DualMetricChartProps {
  readonly rows: readonly AaRankedModel[];
  readonly displayNames: ReadonlyMap<string, string>;
  readonly progress: number;
  readonly preview?: boolean;
  readonly view: DualMetricView;
  readonly scaleRows: readonly AaRankedModel[];
  readonly sort: AaEfficiencySort;
  readonly onSortChange: (side: AaEfficiencySortSide) => void;
}

interface MetricPresentation {
  readonly leftLabel: string;
  readonly rightLabel: string;
  readonly leftExactText: string;
  readonly rightExactText: string;
  readonly leftAnimatedValue: string;
  readonly rightAnimatedValue: string;
  readonly leftPrefix: string;
  readonly rightPrefix: string;
  readonly leftUnit: string;
  readonly rightUnit: string;
  readonly leftWidth: number;
  readonly rightWidth: number;
}

interface DualMetricScale {
  readonly leftRange: { readonly min: number; readonly max: number } | null;
  readonly rightRange: { readonly min: number; readonly max: number } | null;
  readonly leftMaximum: number | null;
  readonly rightMaximum: number | null;
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

function isNonNegativeFinite(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function extrema(values: readonly number[]): { readonly min: number; readonly max: number } | null {
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

function linearWidth(value: number, maximum: number | null): number {
  if (maximum === null || maximum <= 0) return 2;
  return Math.max(0, Math.min(100, (value / maximum) * 100));
}

function inverseWidth(value: number, maximum: number | null): number {
  if (maximum === null || maximum <= 0) return 2;
  const desirability = (maximum - value) / maximum;
  return Math.max(2, Math.min(100, desirability * 100));
}

function logarithmicWidth(value: number, maximum: number | null): number {
  if (maximum === null || maximum <= 0) return 2;
  return Math.max(0, Math.min(100, (Math.log1p(value) / Math.log1p(maximum)) * 100));
}

function compactAxisNumber(value: number): string {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1000) return `${Number((value / 1000).toPrecision(2))}k`;
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(2)));
}

function logarithmicValue(position: number, maximum: number): number {
  if (maximum <= 0) return 0;
  return Math.expm1(position * Math.log1p(maximum));
}

function axisPair(
  view: DualMetricView,
  scale: DualMetricScale,
  position: number,
): { readonly left: string; readonly right: string } {
  if (scale.leftRange === null || scale.rightRange === null) return { left: "–", right: "–" };
  const leftMaximum = scale.leftMaximum ?? 0;
  const rightMaximum = scale.rightMaximum ?? 0;

  if (view === "speed") {
    const leftValue = leftMaximum * (1 - position);
    const rightValue = position * rightMaximum;
    return {
      left: compactAxisNumber(leftValue),
      right: compactAxisNumber(rightValue),
    };
  }

  return {
    left: `$${compactAxisNumber(logarithmicValue(position, leftMaximum))}`,
    right: `$${compactAxisNumber(logarithmicValue(position, rightMaximum))}`,
  };
}

function metricScale(view: DualMetricView, scaleRows: readonly AaRankedModel[]): DualMetricScale {
  const leftValues: number[] = [];
  const rightValues: number[] = [];
  for (const row of scaleRows) {
    const leftValue = view === "speed" ? row.timeToFirstAnswerSeconds : row.inputPricePerMillion;
    const rightValue = view === "speed" ? row.outputTokensPerSecond : row.outputPricePerMillion;
    if (!isNonNegativeFinite(leftValue) || !isNonNegativeFinite(rightValue)) continue;
    leftValues.push(leftValue);
    rightValues.push(rightValue);
  }
  const leftRange = extrema(leftValues);
  const rightRange = extrema(rightValues);
  const leftMaximum = niceAxisMaximum(leftRange?.max ?? 0) || null;
  const rightMaximum = niceAxisMaximum(rightRange?.max ?? 0) || null;
  return { leftRange, rightRange, leftMaximum, rightMaximum };
}

function displayNameFor(row: AaRankedModel, displayNames: ReadonlyMap<string, string>): string {
  return displayNames.get(row.sourceId) ?? row.rawName ?? row.sourceSlug ?? `未命名模型 ${row.sourceId}`;
}

function metricPresentation(
  row: AaRankedModel,
  view: DualMetricView,
  scale: DualMetricScale,
  progress: number,
): MetricPresentation | null {
  if (view === "speed") {
    const leftValue = row.timeToFirstAnswerSeconds;
    const rightValue = row.outputTokensPerSecond;
    if (!isNonNegativeFinite(leftValue) || !isNonNegativeFinite(rightValue)) return null;

    return {
      leftLabel: "首个答案 Token 时间",
      rightLabel: "输出速度",
      leftExactText: `${exactNumber(leftValue)} 秒，越低越好`,
      rightExactText: `${exactNumber(rightValue)} tokens/s，越高越好`,
      leftAnimatedValue: animatedNumber(leftValue, progress),
      rightAnimatedValue: animatedNumber(rightValue, progress),
      leftPrefix: "",
      rightPrefix: "",
      leftUnit: "秒",
      rightUnit: "tokens/s",
      leftWidth: inverseWidth(leftValue, scale.leftMaximum),
      rightWidth: linearWidth(rightValue, scale.rightMaximum),
    };
  }

  const leftValue = row.inputPricePerMillion;
  const rightValue = row.outputPricePerMillion;
  if (!isNonNegativeFinite(leftValue) || !isNonNegativeFinite(rightValue)) return null;

  return {
    leftLabel: "输入价格",
    rightLabel: "输出价格",
    leftExactText: `$${exactNumber(leftValue)} / 1M tokens`,
    rightExactText: `$${exactNumber(rightValue)} / 1M tokens`,
    leftAnimatedValue: animatedNumber(leftValue, progress),
    rightAnimatedValue: animatedNumber(rightValue, progress),
    leftPrefix: "$",
    rightPrefix: "$",
    leftUnit: "/ 1M tokens",
    rightUnit: "/ 1M tokens",
    leftWidth: logarithmicWidth(leftValue, scale.leftMaximum),
    rightWidth: logarithmicWidth(rightValue, scale.rightMaximum),
  };
}

function MetricSide({
  side,
  label,
  exactText,
  animatedValue,
  prefix,
  unit,
  width,
  progress,
}: {
  readonly side: "left" | "right";
  readonly label: string;
  readonly exactText: string;
  readonly animatedValue: string;
  readonly prefix: string;
  readonly unit: string;
  readonly width: number;
  readonly progress: number;
}) {
  const currentWidth = width * progress;

  return (
    <span className={`dual-metric-chart__metric dual-metric-chart__metric--${side}`}>
      <span className="dual-metric-chart__plot">
        <span className="dual-metric-chart__bar" aria-hidden="true">
          <span className="dual-metric-chart__bar-fill" style={{ width: `${currentWidth}%` }} />
        </span>
        <span className="dual-metric-chart__value" style={{ left: `${currentWidth}%` }}>
          <span className="sr-only">{label}：{exactText}</span>
          <span className="metric-number" data-final-value={`${prefix}${animatedValue}`} aria-hidden="true">{prefix}{animatedValue}</span>
          <span className="metric-unit" aria-hidden="true">{unit}</span>
        </span>
      </span>
    </span>
  );
}

function oppositeDirection(direction: AaSortDirection): AaSortDirection {
  return direction === "ascending" ? "descending" : "ascending";
}

function directionLabel(direction: AaSortDirection): string {
  return direction === "ascending" ? "从低到高" : "从高到低";
}

function SortIcon() {
  return (
    <svg
      className="dual-metric-chart__sort-icon"
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path className="dual-metric-chart__sort-up" d="M5.25 13V3.25m0 0-2.5 2.5" />
      <path className="dual-metric-chart__sort-down" d="M10.75 3v9.75m0 0 2.5-2.5" />
    </svg>
  );
}

function MetricSortButton({
  side,
  label,
  view,
  sort,
  onSortChange,
}: {
  readonly side: AaEfficiencySortSide;
  readonly label: string;
  readonly view: DualMetricView;
  readonly sort: AaEfficiencySort;
  readonly onSortChange: (side: AaEfficiencySortSide) => void;
}) {
  const isActive = sort.side === side;
  const nextDirection = isActive
    ? oppositeDirection(sort.direction)
    : defaultEfficiencySortDirection(view, side);
  const accessibleLabel = isActive
    ? `${label}，当前${directionLabel(sort.direction)}排序，点击切换为${directionLabel(nextDirection)}`
    : `${label}，点击按${directionLabel(nextDirection)}排序`;

  return (
    <button
      type="button"
      className={`dual-metric-chart__legend-item dual-metric-chart__legend-item--${side}${isActive ? " is-active" : ""}`}
      data-sort-direction={isActive ? sort.direction : undefined}
      aria-label={accessibleLabel}
      aria-pressed={isActive}
      onClick={() => onSortChange(side)}
    >
      <span
        className={`dual-metric-chart__legend-swatch dual-metric-chart__legend-swatch--${side}`}
        aria-hidden="true"
      />
      <span aria-hidden="true">{label}</span>
      <SortIcon />
    </button>
  );
}

function MetricLegend({
  view,
  sort,
  onSortChange,
}: {
  readonly view: DualMetricView;
  readonly sort: AaEfficiencySort;
  readonly onSortChange: (side: AaEfficiencySortSide) => void;
}) {
  const leftLabel = view === "speed" ? "首字延迟" : "输入价格";
  const rightLabel = view === "speed" ? "输出速度" : "输出价格";

  return (
    <div className={`dual-metric-chart__legend dual-metric-chart__legend--${view}`} role="group" aria-label="指标图例">
      <MetricSortButton
        side="left"
        label={leftLabel}
        view={view}
        sort={sort}
        onSortChange={onSortChange}
      />
      <MetricSortButton
        side="right"
        label={rightLabel}
        view={view}
        sort={sort}
        onSortChange={onSortChange}
      />
      <span className="sr-only" aria-live="polite">
        当前按{sort.side === "left" ? leftLabel : rightLabel}{directionLabel(sort.direction)}排序
      </span>
    </div>
  );
}

function MetricPairAxis({ view, scale }: { readonly view: DualMetricView; readonly scale: DualMetricScale }) {
  return (
    <div className="dual-metric-chart__axis" aria-hidden="true">
      <span />
      <span className="dual-metric-chart__axis-metric">
        <span className="dual-metric-chart__axis-scale">
          {AXIS_POSITIONS.map((position) => {
            const pair = axisPair(view, scale, position);
            return (
              <span key={position}>
                <span className="dual-metric-chart__axis-left">{pair.left}</span>
                <span className="dual-metric-chart__axis-separator">/</span>
                <span className="dual-metric-chart__axis-right">{pair.right}</span>
              </span>
            );
          })}
        </span>
        <span />
      </span>
    </div>
  );
}

export default function DualMetricChart({
  rows,
  displayNames,
  progress,
  preview = false,
  view,
  scaleRows,
  sort,
  onSortChange,
}: DualMetricChartProps) {
  const currentProgress = preview ? 1 : clampProgress(progress);
  const scale = metricScale(view, scaleRows);

  return (
    <>
      <MetricLegend view={view} sort={sort} onSortChange={onSortChange} />
      {preview ? null : <MetricPairAxis view={view} scale={scale} />}
      <ol
        className={`dual-metric-chart dual-metric-chart--${view}${preview ? " dual-metric-chart--preview" : ""}`}
        aria-label={preview ? "模型速度和价格榜单预览" : view === "speed" ? "模型速度排名" : "模型价格排名"}
      >
        {rows.map((row) => {
          const metric = metricPresentation(row, view, scale, currentProgress);
          if (metric === null) return null;

          return (
            <li
              className="dual-metric-chart__row"
              data-creator-tone={getAaCreatorTone(row.creatorId)}
              key={row.sourceId}
            >
              <span className="sr-only">第 {row.rank} 名</span>
              <span className="dual-metric-chart__identity">
                <ModelIdentity model={row} displayName={displayNameFor(row, displayNames)} />
              </span>
              <MetricSide
                side="left"
                label={metric.leftLabel}
                exactText={metric.leftExactText}
                animatedValue={metric.leftAnimatedValue}
                prefix={metric.leftPrefix}
                unit={metric.leftUnit}
                width={metric.leftWidth}
                progress={currentProgress}
              />
              <MetricSide
                side="right"
                label={metric.rightLabel}
                exactText={metric.rightExactText}
                animatedValue={metric.rightAnimatedValue}
                prefix={metric.rightPrefix}
                unit={metric.rightUnit}
                width={metric.rightWidth}
                progress={currentProgress}
              />
            </li>
          );
        })}
      </ol>
    </>
  );
}
