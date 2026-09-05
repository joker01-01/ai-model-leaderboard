import { useLayoutEffect, useRef } from "react";

export const CHART_ANIMATION_DURATION_MS = 600;

function cubicBezierCoordinate(time: number, firstControl: number, secondControl: number): number {
  const inverse = 1 - time;
  return 3 * inverse * inverse * time * firstControl
    + 3 * inverse * time * time * secondControl
    + time * time * time;
}

function cubicBezierDerivative(time: number, firstControl: number, secondControl: number): number {
  const inverse = 1 - time;
  return 3 * inverse * inverse * firstControl
    + 6 * inverse * time * (secondControl - firstControl)
    + 3 * time * time * (1 - secondControl);
}

/** Evaluates cubic-bezier(0.22, 1, 0.36, 1) at a linear time fraction. */
export function easeChartProgress(linearProgress: number): number {
  const target = Math.max(0, Math.min(1, linearProgress));
  if (target === 0 || target === 1) return target;

  let parameter = target;
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const error = cubicBezierCoordinate(parameter, 0.22, 0.36) - target;
    const derivative = cubicBezierDerivative(parameter, 0.22, 0.36);
    if (Math.abs(error) < 1e-7 || Math.abs(derivative) < 1e-7) break;
    parameter = Math.max(0, Math.min(1, parameter - error / derivative));
  }
  return cubicBezierCoordinate(parameter, 1, 1);
}

/** Animate only the entry viewport, without rerendering the full ranking each frame. */
export function useChartAnimation<T extends HTMLElement = HTMLDivElement>(metricKey: string, durationMs = CHART_ANIMATION_DURATION_MS) {
  const chartRef = useRef<T>(null);

  useLayoutEffect(() => {
    const chart = chartRef.current;
    if (chart === null || durationMs <= 0
      || typeof Element.prototype.animate !== "function") return undefined;

    // Read all geometry before starting any animations or changing number text.
    const targets: { fill: HTMLElement; value: HTMLElement; number: HTMLElement;
      width: number; exact: string; prefix: string; numeric: number }[] = [];
    for (const row of chart.querySelectorAll<HTMLElement>(
      ".single-metric-chart__row, .dual-metric-chart__row",
    )) {
      const bounds = row.getBoundingClientRect();
      if (bounds.top >= window.innerHeight) break;
      if (bounds.bottom <= 0) continue;
      for (const plot of row.querySelectorAll<HTMLElement>(
        ".single-metric-chart__plot, .dual-metric-chart__plot",
      )) {
        const fill = plot.querySelector<HTMLElement>(".single-metric-chart__bar-fill, .dual-metric-chart__bar-fill");
        const value = plot.querySelector<HTMLElement>(".single-metric-chart__value, .dual-metric-chart__value");
        const number = value?.querySelector<HTMLElement>(".metric-number");
        if (!fill || !value || !number) continue;
        const exact = number.dataset.finalValue ?? number.textContent ?? "";
        const prefix = exact.startsWith("$") ? "$" : "";
        const numeric = Number(exact.slice(prefix.length));
        const width = Number.parseFloat(getComputedStyle(fill).width);
        if (!Number.isFinite(width) || !Number.isFinite(numeric)) continue;
        targets.push({ fill, value, number, width, exact, prefix, numeric });
      }
    }
    if (targets.length === 0) return undefined;

    const timing = { duration: durationMs, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
    const animations: Animation[] = [];
    for (const target of targets) {
      animations.push(target.fill.animate([
        { transform: "scaleX(0)", transformOrigin: "left center" },
        { transform: "scaleX(1)", transformOrigin: "left center" },
      ], timing));
      // Individual translate leaves the dual value's vertical centering intact.
      animations.push(target.value.animate([
        { translate: `${-target.width}px 0` }, { translate: "0px 0" },
      ], timing));
      target.number.textContent = `${target.prefix}0`;
    }
    const startedAt = performance.now();
    let frameId = 0;
    const tick = (timestamp: number) => {
      const linear = Math.min(1, Math.max(0, (timestamp - startedAt) / durationMs));
      const progress = easeChartProgress(linear);
      for (const target of targets) {
        if (!target.number.isConnected) continue;
        target.number.textContent = linear === 1 ? target.exact
          : `${target.prefix}${Number((target.numeric * progress).toFixed(3))}`;
      }
      if (linear < 1) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frameId);
      for (const animation of animations) animation.cancel();
      for (const target of targets) {
        if (target.number.dataset.finalValue === target.exact) target.number.textContent = target.exact;
      }
    };
  }, [metricKey, durationMs]);

  return chartRef;
}
