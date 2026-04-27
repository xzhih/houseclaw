export const TARGET_RISER = 0.165;

/**
 * Rotate point `p` around `center` by `angleRad` radians (CCW positive, standard math convention).
 */
export function rotatePoint(
  p: { x: number; y: number },
  center: { x: number; y: number },
  angleRad: number,
): { x: number; y: number } {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/**
 * Returns the center point of a stair's bounding rectangle in plan space.
 */
export function stairCenter(stair: { x: number; y: number; width: number; depth: number }): {
  x: number;
  y: number;
} {
  return { x: stair.x + stair.width / 2, y: stair.y + stair.depth / 2 };
}

export type StairConfig = {
  riserCount: number;
  riserHeight: number;
  treadCount: number;
};

/**
 * Stair geometry config. The stair climbs to the upper storey's slab BOTTOM
 * (storeyHeight - slabThickness); the slab's own thickness is the final
 * "riser" the user steps over to reach the floor surface. So:
 *   treadCount × riserHeight = storeyHeight - slabThickness
 *   riserCount = treadCount + 1   (the +1 = slab thickness)
 *
 * Aligning the topmost tread's top with the slab bottom makes the slab read
 * as a real, independent thickness band at the hole edge instead of just
 * another riser.
 */
export function computeStairConfig(
  storeyHeight: number,
  slabThickness: number,
  _treadDepth: number,
): StairConfig {
  const stairClimb = Math.max(TARGET_RISER, storeyHeight - slabThickness);
  const treadCount = Math.max(1, Math.round(stairClimb / TARGET_RISER));
  const riserHeight = stairClimb / treadCount;
  const riserCount = treadCount + 1;
  return { riserCount, riserHeight, treadCount };
}
