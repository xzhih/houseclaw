const NICE_LENGTHS = [0.1, 0.2, 0.5, 1, 2, 5, 10] as const;
const TARGET_PX_MIN = 60;
const TARGET_PX_MAX = 150;

export function pickRulerLength(pixelsPerMeter: number): number {
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return 1;

  const midPx = (TARGET_PX_MIN + TARGET_PX_MAX) / 2;
  let bestInRange: number | null = null;
  let bestOverall: number = NICE_LENGTHS[0];
  let bestDist = Infinity;

  for (const len of NICE_LENGTHS) {
    const px = len * pixelsPerMeter;
    if (px >= TARGET_PX_MIN && px <= TARGET_PX_MAX) {
      if (bestInRange === null || len > bestInRange) bestInRange = len;
    }
    const dist = Math.abs(px - midPx);
    if (dist < bestDist) {
      bestDist = dist;
      bestOverall = len;
    }
  }
  return bestInRange ?? bestOverall;
}

export const RULER_TARGET_PX_MIN = TARGET_PX_MIN;
export const RULER_TARGET_PX_MAX = TARGET_PX_MAX;
