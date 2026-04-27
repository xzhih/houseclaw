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

export function computeStairConfig(storeyHeight: number, _treadDepth: number): StairConfig {
  const riserCount = Math.max(2, Math.round(storeyHeight / TARGET_RISER));
  const riserHeight = storeyHeight / riserCount;
  const treadCount = riserCount - 1;
  return { riserCount, riserHeight, treadCount };
}
