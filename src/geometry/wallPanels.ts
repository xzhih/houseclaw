import type { Opening, Wall } from "../domain/types";
import type { WallPanel, WallPanelRole } from "./types";

const EPS = 1e-4;

function wallLength(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

function round(n: number): number {
  return Number(n.toFixed(4));
}

function makePanel(
  role: WallPanelRole,
  x: number,
  y: number,
  width: number,
  height: number,
): WallPanel | undefined {
  if (![x, y, width, height].every(Number.isFinite)) return undefined;
  const w = round(width);
  const h = round(height);
  if (w <= EPS || h <= EPS) return undefined;
  return { role, x: round(x), y: round(y), width: w, height: h };
}

/** Build wall fill panels by subtracting opening rectangles from the
 *  wall's [0..wallWidth] × [0..wallHeight] face.
 *
 *  Algorithm: sweep across the unique x-edges from openings, producing
 *  one or more vertical strips. Within each strip, subtract the y-ranges
 *  of openings active in that strip from [0..wallHeight]. The remaining
 *  y-segments become solid panels.
 *
 *  Why this matters: stacked openings (e.g. windows at the same x on
 *  different storeys) used to leave each other's holes covered by the
 *  other's "above"/"below" stripe. Sweep + subtract handles that correctly. */
export function buildWallPanels(
  wall: Wall,
  openings: Opening[],
  wallHeight: number,
): WallPanel[] {
  const wallWidth = wallLength(wall);
  if (wallWidth <= EPS || wallHeight <= EPS) return [];

  if (openings.length === 0) {
    const full = makePanel("full", 0, 0, wallWidth, wallHeight);
    return full ? [full] : [];
  }

  // Collect & dedupe x-edges, clamped to [0, wallWidth].
  const xEdgesSet = new Set<number>();
  xEdgesSet.add(0);
  xEdgesSet.add(wallWidth);
  for (const o of openings) {
    const a = Math.max(0, Math.min(wallWidth, o.offset));
    const b = Math.max(0, Math.min(wallWidth, o.offset + o.width));
    xEdgesSet.add(round(a));
    xEdgesSet.add(round(b));
  }
  const xEdges = [...xEdgesSet].sort((a, b) => a - b);

  const panels: WallPanel[] = [];

  for (let i = 0; i < xEdges.length - 1; i += 1) {
    const xLo = xEdges[i];
    const xHi = xEdges[i + 1];
    const stripWidth = xHi - xLo;
    if (stripWidth <= EPS) continue;

    // Openings active in this strip = those that fully span [xLo..xHi].
    const active = openings.filter(
      (o) => o.offset <= xLo + EPS && o.offset + o.width >= xHi - EPS,
    );

    if (active.length === 0) {
      // Entire strip is solid full-height.
      const full = makePanel("full", xLo, 0, stripWidth, wallHeight);
      if (full) panels.push(full);
      continue;
    }

    // Sort active openings by sillHeight, then walk the wall vertically
    // emitting solid stripes between/around them.
    const sorted = [...active].sort((a, b) => a.sillHeight - b.sillHeight);
    let cursor = 0;
    for (const o of sorted) {
      const top = o.sillHeight + o.height;
      if (o.sillHeight - cursor > EPS) {
        const role: WallPanelRole = cursor === 0 ? "below" : "between";
        const p = makePanel(role, xLo, cursor, stripWidth, o.sillHeight - cursor);
        if (p) panels.push(p);
      }
      // Advance cursor past this opening, allowing for openings that
      // overlap vertically (rare, but don't double-fill).
      if (top > cursor) cursor = top;
    }
    if (wallHeight - cursor > EPS) {
      const p = makePanel("above", xLo, cursor, stripWidth, wallHeight - cursor);
      if (p) panels.push(p);
    }
  }

  return panels;
}
