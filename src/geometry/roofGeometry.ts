import type { Point2, Point3, Roof, Storey, Wall } from "../domain/types";

export type RoofPanel = {
  /** Convex polygon, 3 or 4 Point3 vertices, CCW from outside. */
  vertices: Point3[];
  materialId: string;
};

export type RoofGable = {
  /** Vertical triangular extension above the wall top. 3 Point3 vertices, CCW from outside. */
  vertices: Point3[];
  wallId: string;
};

export type RoofGeometry = {
  panels: RoofPanel[];
  gables: RoofGable[];
};

type ResolvedEdge = {
  wallId: string;
  side: "front" | "right" | "back" | "left"; // canonical role on axis-aligned rect
  kind: "eave" | "gable";
};

const RECT_TOL = 0.005;

export function buildRoofGeometry(
  topStorey: Storey,
  exteriorRing: Point2[],
  walls: Wall[],
  roof: Roof,
): RoofGeometry | undefined {
  const resolved = resolveEdges(walls, exteriorRing, roof);
  if (!resolved) return undefined;
  if (!resolved.some((e) => e.kind === "eave")) return undefined;

  const wallTopZ = topStorey.elevation + topStorey.height;
  const rect = bbox(exteriorRing);
  if (!rect) return undefined;
  const outer = expandRect(rect, roof.overhang);
  const slope = Math.tan(roof.pitch);

  // Dispatch by eave count + adjacency.
  const eaveCount = resolved.filter((e) => e.kind === "eave").length;
  switch (eaveCount) {
    case 1:
      return buildShed(resolved, outer, wallTopZ, slope, roof.materialId);
    case 2: {
      const eaves = resolved.filter((e) => e.kind === "eave");
      if (eaves[0].side === oppositeSide(eaves[1].side)) {
        return buildGable2Opp(resolved, outer, wallTopZ, slope, roof.materialId);
      }
      // 2-adjacent handled in a later task.
      return undefined;
    }
    case 4:
      return buildHip4(resolved, outer, wallTopZ, slope, roof.materialId);
    default:
      // Other cases added in later tasks.
      return undefined;
  }
}

function resolveEdges(walls: Wall[], ring: Point2[], roof: Roof): ResolvedEdge[] | undefined {
  if (walls.length !== 4) return undefined;
  if (!walls.every((w) => w.exterior)) return undefined;

  // Identify which side of the rectangle each wall is on.
  const rect = bbox(ring);
  if (!rect) return undefined;

  const sided = walls.map<ResolvedEdge | undefined>((w) => {
    const side = sideOfWall(w, rect);
    if (!side) return undefined;
    const tag = roof.edges[w.id];
    return { wallId: w.id, side, kind: tag === "eave" ? "eave" : "gable" };
  });

  if (sided.some((s) => !s)) return undefined;
  // Ensure all 4 sides represented exactly once.
  const sides = new Set(sided.map((s) => s!.side));
  if (sides.size !== 4) return undefined;
  return sided as ResolvedEdge[];
}

type Rect = { xMin: number; xMax: number; yMin: number; yMax: number };

function bbox(ring: Point2[]): Rect | undefined {
  if (ring.length < 4) return undefined;
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  };
}

function expandRect(r: Rect, overhang: number): Rect {
  return {
    xMin: r.xMin - overhang,
    xMax: r.xMax + overhang,
    yMin: r.yMin - overhang,
    yMax: r.yMax + overhang,
  };
}

function sideOfWall(wall: Wall, rect: Rect): ResolvedEdge["side"] | undefined {
  const horizontal = Math.abs(wall.end.y - wall.start.y) < RECT_TOL;
  const vertical = Math.abs(wall.end.x - wall.start.x) < RECT_TOL;
  if (horizontal === vertical) return undefined;
  if (horizontal) {
    if (Math.abs(wall.start.y - rect.yMin) < RECT_TOL) return "front";
    if (Math.abs(wall.start.y - rect.yMax) < RECT_TOL) return "back";
    return undefined;
  }
  if (Math.abs(wall.start.x - rect.xMax) < RECT_TOL) return "right";
  if (Math.abs(wall.start.x - rect.xMin) < RECT_TOL) return "left";
  return undefined;
}

/**
 * Shed (1 eave): the eave's outer line is the low edge; the slope rises
 * across the full footprint to the opposite gable wall, where it terminates
 * in a triangle. Side gables are right triangles climbing the slope.
 */
function buildShed(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): RoofGeometry {
  const eave = edges.find((e) => e.kind === "eave")!;
  const opposite = edges.find((e) => e.side === oppositeSide(eave.side))!;
  const sides = edges.filter((e) => e !== eave && e !== opposite);

  // Pick the local frame: u runs along the eave, v points from eave inward.
  const { u0, u1, v0, v1 } = eaveAxes(eave.side, outer);
  // Width along u, depth along v.
  const D = Math.abs(v1 - v0);
  const peakRise = D * slope;

  // Panel: 4 vertices, low side at v0 (outer eave edge), high side at v1.
  const panelLow0 = liftToWorld(eave.side, outer, u0, v0, wallTopZ);
  const panelLow1 = liftToWorld(eave.side, outer, u1, v0, wallTopZ);
  const panelHigh1 = liftToWorld(eave.side, outer, u1, v1, wallTopZ + peakRise);
  const panelHigh0 = liftToWorld(eave.side, outer, u0, v1, wallTopZ + peakRise);

  const panel: RoofPanel = {
    vertices: [panelLow0, panelLow1, panelHigh1, panelHigh0],
    materialId,
  };

  const gables: RoofGable[] = [];
  gables.push({
    wallId: opposite.wallId,
    vertices: triangleAlong(opposite.side, outer, wallTopZ, peakRise, "full"),
  });
  for (const side of sides) {
    const { u0, u1 } = eaveAxes(side.side, outer);
    // The apex must be at whichever end of the side wall is adjacent to the
    // opposite (high-end) wall. Compare each end's u-coordinate to the
    // v-coordinate of the opposite wall along the same axis.
    const opp = sideV(opposite.side, outer);
    const mode = Math.abs(u0 - opp) < Math.abs(u1 - opp) ? "apex-at-u0" : "apex-at-u1";
    gables.push({
      wallId: side.wallId,
      vertices: triangleAlong(side.side, outer, wallTopZ, peakRise, mode),
    });
  }

  return { panels: [panel], gables };
}

function oppositeSide(side: ResolvedEdge["side"]): ResolvedEdge["side"] {
  switch (side) {
    case "front": return "back";
    case "back": return "front";
    case "left": return "right";
    case "right": return "left";
  }
}

/**
 * For each side, return the parametric axes u (along the side) and v (inward).
 * u0..u1 spans the full outer rect along the side; v0..v1 runs from the side
 * inward to the opposite side.
 */
function eaveAxes(side: ResolvedEdge["side"], outer: Rect) {
  switch (side) {
    case "front": return { u0: outer.xMin, u1: outer.xMax, v0: outer.yMin, v1: outer.yMax };
    case "back":  return { u0: outer.xMax, u1: outer.xMin, v0: outer.yMax, v1: outer.yMin };
    case "left":  return { u0: outer.yMin, u1: outer.yMax, v0: outer.xMin, v1: outer.xMax };
    case "right": return { u0: outer.yMax, u1: outer.yMin, v0: outer.xMax, v1: outer.xMin };
  }
}

function liftToWorld(
  side: ResolvedEdge["side"],
  _outer: Rect,
  u: number,
  v: number,
  z: number,
): Point3 {
  switch (side) {
    case "front":
    case "back":
      return { x: u, y: v, z };
    case "left":
    case "right":
      return { x: v, y: u, z };
  }
}

type TriangleApexMode =
  | "full"        // apex at side midpoint (used for the gable wall opposite the eave)
  | "apex-at-u0"  // apex at u0 end of side
  | "apex-at-u1"; // apex at u1 end of side

/**
 * Build the gable triangle for a given side.
 *
 * `"full"` — apex at the side's midpoint at peak height (opposite-eave gable in shed).
 * `"apex-at-u0"` / `"apex-at-u1"` — apex at the u0 or u1 end of the side (side gables).
 *
 * The triangle's base sits at z = wallTopZ along the side; the apex is at
 * z = wallTopZ + apexRise.
 */
function triangleAlong(
  side: ResolvedEdge["side"],
  outer: Rect,
  wallTopZ: number,
  apexRise: number,
  mode: TriangleApexMode,
): Point3[] {
  const { u0, u1 } = eaveAxes(side, outer);
  const baseStart = liftToWorld(side, outer, u0, sideV(side, outer), wallTopZ);
  const baseEnd = liftToWorld(side, outer, u1, sideV(side, outer), wallTopZ);
  if (mode === "full") {
    const mid = (u0 + u1) / 2;
    const apex = liftToWorld(side, outer, mid, sideV(side, outer), wallTopZ + apexRise);
    return [baseStart, baseEnd, apex];
  }
  const apexU = mode === "apex-at-u0" ? u0 : u1;
  const apex = liftToWorld(side, outer, apexU, sideV(side, outer), wallTopZ + apexRise);
  return [baseStart, baseEnd, apex];
}

function sideV(side: ResolvedEdge["side"], outer: Rect): number {
  switch (side) {
    case "front": return outer.yMin;
    case "back":  return outer.yMax;
    case "left":  return outer.xMin;
    case "right": return outer.xMax;
  }
}

function buildGable2Opp(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): RoofGeometry {
  const eaves = edges.filter((e) => e.kind === "eave");
  const eaveA = eaves[0];
  const eaveB = eaves[1];
  const gables = edges.filter((e) => e.kind === "gable");

  // Compute axes from eaveA's perspective — depth (eave→eave) and ridge along
  // the gable side direction. Use the bbox to derive width W and depth D.
  // For the 2-opp case both eaves are parallel so geometry is symmetric.
  const fullDepth =
    eaveA.side === "front" || eaveA.side === "back"
      ? outer.yMax - outer.yMin
      : outer.xMax - outer.xMin;
  const halfDepth = fullDepth / 2;
  const ridgeZ = wallTopZ + halfDepth * slope;

  const panels: RoofPanel[] = [];
  for (const eave of [eaveA, eaveB]) {
    const { u0, u1 } = eaveAxes(eave.side, outer);
    const eaveV = sideV(eave.side, outer);
    const ridgeV = midV(eave.side, outer);
    const lo0 = liftToWorld(eave.side, outer, u0, eaveV, wallTopZ);
    const lo1 = liftToWorld(eave.side, outer, u1, eaveV, wallTopZ);
    const hi1 = liftToWorld(eave.side, outer, u1, ridgeV, ridgeZ);
    const hi0 = liftToWorld(eave.side, outer, u0, ridgeV, ridgeZ);
    panels.push({ vertices: [lo0, lo1, hi1, hi0], materialId });
  }

  const result: RoofGable[] = [];
  for (const g of gables) {
    result.push({
      wallId: g.wallId,
      vertices: triangleAlong(g.side, outer, wallTopZ, ridgeZ - wallTopZ, "full"),
    });
  }
  return { panels, gables: result };
}

function midV(side: ResolvedEdge["side"], outer: Rect): number {
  switch (side) {
    case "front":
    case "back":
      return (outer.yMin + outer.yMax) / 2;
    case "left":
    case "right":
      return (outer.xMin + outer.xMax) / 2;
  }
}

function buildHip4(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): RoofGeometry {
  const W = outer.xMax - outer.xMin;
  const D = outer.yMax - outer.yMin;
  const halfMin = Math.min(W, D) / 2;
  const ridgeZ = wallTopZ + halfMin * slope;

  // Inset the hip apex points: ridge is along the longer axis, of length
  // |W - D|, centered.
  const cx = (outer.xMin + outer.xMax) / 2;
  const cy = (outer.yMin + outer.yMax) / 2;
  const ridgeAlongX = W >= D;
  const ridgeHalfLen = Math.abs(W - D) / 2;

  const apexA: Point3 = ridgeAlongX
    ? { x: cx - ridgeHalfLen, y: cy, z: ridgeZ }
    : { x: cx, y: cy - ridgeHalfLen, z: ridgeZ };
  const apexB: Point3 = ridgeAlongX
    ? { x: cx + ridgeHalfLen, y: cy, z: ridgeZ }
    : { x: cx, y: cy + ridgeHalfLen, z: ridgeZ };

  // Helpers for the 4 outer corners (bottom-z = wall top).
  const c00: Point3 = { x: outer.xMin, y: outer.yMin, z: wallTopZ };
  const c10: Point3 = { x: outer.xMax, y: outer.yMin, z: wallTopZ };
  const c11: Point3 = { x: outer.xMax, y: outer.yMax, z: wallTopZ };
  const c01: Point3 = { x: outer.xMin, y: outer.yMax, z: wallTopZ };

  const panels: RoofPanel[] = [];
  for (const e of edges) {
    let verts: Point3[];
    switch (e.side) {
      case "front":
        verts = ridgeAlongX
          ? [c00, c10, apexB, apexA]   // long-side trapezoid
          : [c00, c10, apexA];         // short-side triangle
        break;
      case "back":
        verts = ridgeAlongX
          ? [c11, c01, apexA, apexB]
          : [c11, c01, apexB];
        break;
      case "right":
        verts = ridgeAlongX
          ? [c10, c11, apexB]          // short-side triangle
          : [c10, c11, apexB, apexA];  // long-side trapezoid
        break;
      case "left":
        verts = ridgeAlongX
          ? [c01, c00, apexA]
          : [c01, c00, apexA, apexB];
        break;
      default:
        verts = [];
    }
    panels.push({ vertices: verts, materialId });
  }

  return { panels, gables: [] };
}
