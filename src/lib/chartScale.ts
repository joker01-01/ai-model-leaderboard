const NICE_MANTISSAS = [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] as const;
const AXIS_HEADROOM = 1.05;

export function niceAxisMaximum(maximum: number): number {
  if (!Number.isFinite(maximum) || maximum <= 0) return 0;

  const paddedMaximum = maximum * AXIS_HEADROOM;
  const exponent = Math.floor(Math.log10(paddedMaximum));
  const magnitude = 10 ** exponent;
  const normalized = paddedMaximum / magnitude;
  const mantissa = NICE_MANTISSAS.find((candidate) => candidate >= normalized) ?? 10;

  return mantissa * magnitude;
}
