import { useEffect, useState } from "react";

export const CHART_ANIMATION_DURATION_MS = 600;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

/**
 * Supplies one shared progress value for a complete chart. Callers use only
 * the route's metric key, so filtering and other rerenders do not replay it.
 */
export function useChartProgress(
  metricKey: string,
  durationMs = CHART_ANIMATION_DURATION_MS,
): number {
  const [progress, setProgress] = useState(() => (prefersReducedMotion() ? 1 : 0));

  useEffect(() => {
    if (prefersReducedMotion() || durationMs <= 0) {
      setProgress(1);
      return undefined;
    }

    setProgress(0);
    let frameId = 0;
    let startedAt: number | null = null;
    const tick = (timestamp: number) => {
      startedAt ??= timestamp;
      const linearProgress = Math.min(1, Math.max(0, (timestamp - startedAt) / durationMs));
      setProgress(easeChartProgress(linearProgress));
      if (linearProgress < 1) frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [metricKey, durationMs]);

  return progress;
}
