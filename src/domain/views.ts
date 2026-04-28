import type { HouseProject, Storey } from "./types";

/**
 * Returns the storey id encoded in a `plan-<id>` view, or undefined if the
 * view is not a plan view or the encoded id does not match a known storey.
 */
export function planStoreyIdFromView(
  activeView: string,
  storeys: readonly Pick<Storey, "id">[],
): string | undefined {
  const match = /^plan-(.+)$/.exec(activeView);
  if (!match) return undefined;
  const candidate = match[1];
  return storeys.some((storey) => storey.id === candidate) ? candidate : undefined;
}

const RECT_TOL = 0.005;

/**
 * True iff the top storey has exactly 4 exterior walls forming an
 * axis-aligned rectangle (each wall horizontal or vertical, 4 distinct
 * corner points sharing exactly two x-values and two y-values).
 *
 * Known limitation: two coincident walls + two perpendicular walls can
 * pass this check even though one rectangle side is missing. Downstream
 * geometry construction catches that case; this predicate is only a
 * fast UI gate.
 */
export function canBuildRoof(project: HouseProject): boolean {
  if (project.storeys.length === 0) return false;
  const top = [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
  const walls = project.walls.filter(
    (wall) => wall.storeyId === top.id && wall.exterior,
  );
  if (walls.length !== 4) return false;

  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const wall of walls) {
    const dx = Math.abs(wall.end.x - wall.start.x);
    const dy = Math.abs(wall.end.y - wall.start.y);
    if (dx > RECT_TOL && dy > RECT_TOL) return false; // not axis-aligned
    xs.add(roundTo(wall.start.x, RECT_TOL));
    xs.add(roundTo(wall.end.x, RECT_TOL));
    ys.add(roundTo(wall.start.y, RECT_TOL));
    ys.add(roundTo(wall.end.y, RECT_TOL));
  }
  return xs.size === 2 && ys.size === 2;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
