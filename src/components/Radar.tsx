import type { DimKey } from "../data/models";
import { DIM_KEYS, DIM_LABELS } from "../lib/score";

interface RadarProps {
  dims: Partial<Record<DimKey, number>>;
  size?: number;
  highlight?: DimKey | null;
}

const RINGS = [25, 50, 75, 100];

/** 六维雷达图（内联 SVG，无图表库依赖） */
export default function Radar({ dims, size = 190, highlight = null }: RadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;
  const pt = (i: number, scale: number): [number, number] => {
    const ang = ((-90 + i * 60) * Math.PI) / 180;
    return [cx + r * scale * Math.cos(ang), cy + r * scale * Math.sin(ang)];
  };
  const ringPoints = (scale: number) => DIM_KEYS.map((_, i) => pt(i, scale).join(",")).join(" ");
  const valuePoints = DIM_KEYS.map((k, i) => pt(i, (dims[k] ?? 0) / 100).join(",")).join(" ");
  const labelPos = (i: number): { x: number; y: number; anchor: "middle" | "start" | "end" } => {
    const ang = ((-90 + i * 60) * Math.PI) / 180;
    const cos = Math.cos(ang);
    return {
      x: cx + (r + 18) * cos,
      y: cy + (r + 18) * Math.sin(ang) + 3,
      anchor: Math.abs(cos) < 0.3 ? "middle" : cos > 0 ? "start" : "end",
    };
  };
  return (
    <svg
      className="radar"
      width={size}
      height={size}
      viewBox={"0 0 " + size + " " + size}
      role="img"
      aria-label="六维雷达图"
    >
      <defs>
        <filter id="radar-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {RINGS.map((lv) => (
        <polygon
          key={lv}
          points={ringPoints(lv / 100)}
          fill={lv === 100 ? "rgba(255,255,255,0.035)" : "none"}
          stroke="rgba(255,255,255,0.14)"
          strokeWidth="1"
        />
      ))}
      {DIM_KEYS.map((k, i) => {
        const [x, y] = pt(i, 1);
        return (
          <line
            key={k}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke={highlight === k ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.18)"}
            strokeWidth={highlight === k ? 1.6 : 1}
          />
        );
      })}
      <polygon
        className="radar-value"
        points={valuePoints}
        fill="rgba(255,255,255,0.16)"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinejoin="round"
        filter="url(#radar-glow)"
      />
      {DIM_KEYS.map((k, i) => {
        const p = labelPos(i);
        return (
          <text key={k} x={p.x} y={p.y} textAnchor={p.anchor} className="radar-label">
            {DIM_LABELS[k] + " " + (dims[k] == null ? "待补" : dims[k])}
          </text>
        );
      })}
    </svg>
  );
}
