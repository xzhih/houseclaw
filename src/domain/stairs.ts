export const TARGET_RISER = 0.165;

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
