import { resolveAnchor } from "../../domain/v2/anchors";
import type { Point2, Point3, Roof, RoofEdgeKind, Storey } from "../../domain/v2/types";
import type { RoofGable, RoofGeometryV2, RoofPanel } from "./types";

// v1 limit: Roof.polygon must be 4 vertices (axis-aligned rect after bbox).
// v1.1 simplification: edge kind "hip" is treated as "gable" — produces
// a vertical triangular gable end instead of the proper diagonal hip slope.
// True per-edge hip geometry will land alongside L/T-shape polygons in v2.1
// (straight skeleton).

type ResolvedEdge = {
  edgeIndex: number;
  side: "front" | "right" | "back" | "left";
  kind: "eave" | "gable";
};

const RECT_TOL = 0.005;

export function buildRoofGeometry(
  roof: Roof,
  storeys: Storey[],
): RoofGeometryV2 | undefined {
  if (roof.polygon.length !== 4) return undefined;
  const resolved = resolveEdges(roof.polygon, roof.edges);
  if (!resolved) return undefined;
  if (!resolved.some((e) => e.kind === "eave")) return undefined;

  const wallTopZ = resolveAnchor(roof.base, storeys);
  const rect = bbox(roof.polygon);
  if (!rect) return undefined;
  const outer = expandRect(rect, roof.overhang);
  const slope = Math.tan(roof.pitch);

  const eaveCount = resolved.filter((e) => e.kind === "eave").length;
  let result: { panels: RoofPanel[]; gables: RoofGable[] } | undefined;
  switch (eaveCount) {
    case 1:
      result = buildShed(resolved, outer, wallTopZ, slope, roof.materialId);
      break;
    case 2: {
      const eaves = resolved.filter((e) => e.kind === "eave");
      if (eaves[0].side === oppositeSide(eaves[1].side)) {
        result = buildGable2Opp(resolved, outer, wallTopZ, slope, roof.materialId);
      } else {
        result = buildCornerSlope2Adj(resolved, outer, wallTopZ, slope, roof.materialId);
      }
      break;
    }
    case 3:
      result = buildHalfHip3(resolved, outer, wallTopZ, slope, roof.materialId);
      break;
    case 4:
      result = buildHip4(resolved, outer, wallTopZ, slope, roof.materialId);
      break;
    default:
      return undefined;
  }
  if (!result) return undefined;
  return { roofId: roof.id, panels: result.panels, gables: result.gables };
}

function resolveEdges(
  polygon: Point2[],
  edges: RoofEdgeKind[],
): ResolvedEdge[] | undefined {
  if (polygon.length !== 4 || edges.length !== 4) return undefined;
  const rect = bbox(polygon);
  if (!rect) return undefined;

  const sided = polygon.map<ResolvedEdge | undefined>((p, i) => {
    const next = polygon[(i + 1) % polygon.length];
    const side = sideOfEdge(p, next, rect);
    if (!side) return undefined;
    const tag = edges[i];
    // v1.1 simplification: "hip" → "gable".
    const kind: "eave" | "gable" = tag === "eave" ? "eave" : "gable";
    return { edgeIndex: i, side, kind };
  });

  if (sided.some((s) => !s)) return undefined;
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

function sideOfEdge(a: Point2, b: Point2, rect: Rect): ResolvedEdge["side"] | undefined {
  const horizontal = Math.abs(b.y - a.y) < RECT_TOL;
  const vertical = Math.abs(b.x - a.x) < RECT_TOL;
  if (horizontal === vertical) return undefined;
  if (horizontal) {
    if (Math.abs(a.y - rect.yMin) < RECT_TOL) return "front";
    if (Math.abs(a.y - rect.yMax) < RECT_TOL) return "back";
    return undefined;
  }
  if (Math.abs(a.x - rect.xMax) < RECT_TOL) return "right";
  if (Math.abs(a.x - rect.xMin) < RECT_TOL) return "left";
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
): { panels: RoofPanel[]; gables: RoofGable[] } {
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
    materialId,
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
      materialId,
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
  let verts: Point3[];
  if (mode === "full") {
    const mid = (u0 + u1) / 2;
    const apex = liftToWorld(side, outer, mid, sideV(side, outer), wallTopZ + apexRise);
    verts = [baseStart, baseEnd, apex];
  } else {
    const apexU = mode === "apex-at-u0" ? u0 : u1;
    const apex = liftToWorld(side, outer, apexU, sideV(side, outer), wallTopZ + apexRise);
    verts = [baseStart, baseEnd, apex];
  }
  // liftToWorld swaps u→y and v→x for "left"/"right" sides. This swap changes
  // the cross-product sign relative to "front"/"back", so gable triangles on
  // left/right walls end up CW from outside. Reverse to restore CCW winding.
  if (side === "left" || side === "right") {
    verts.reverse();
  }
  return verts;
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
): { panels: RoofPanel[]; gables: RoofGable[] } {
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
      materialId,
      vertices: triangleAlong(g.side, outer, wallTopZ, ridgeZ - wallTopZ, "full"),
    });
  }
  return { panels, gables: result };
}

/**
 * Returns true when the gable end of a side-eave panel falls at the u0 end of
 * eaveAxes(eaveSide). eaveAxes reverses direction for "back" and "right", so
 * the gable/hip alignment must be checked per (eaveSide, gableSide) pair.
 *
 * CCW_GABLE_AT_U0 pairs: (front,left), (back,right), (left,front), (right,back).
 */
function isGableAtU0(eaveSide: ResolvedEdge["side"], gableSide: ResolvedEdge["side"]): boolean {
  return (
    (eaveSide === "front" && gableSide === "left") ||
    (eaveSide === "back"  && gableSide === "right") ||
    (eaveSide === "left"  && gableSide === "front") ||
    (eaveSide === "right" && gableSide === "back")
  );
}

function buildHalfHip3(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): { panels: RoofPanel[]; gables: RoofGable[] } {
  const gable = edges.find((e) => e.kind === "gable")!;
  const eaves = edges.filter((e) => e.kind === "eave");
  // The eave opposite the gable is the hipped end.
  const oppToGable = eaves.find((e) => e.side === oppositeSide(gable.side))!;
  const sideEaves = eaves.filter((e) => e !== oppToGable);

  // Depth = perpendicular distance across the two side eaves.
  const sideAxisHorizontal = sideEaves[0].side === "front" || sideEaves[0].side === "back";
  const fullDepth = sideAxisHorizontal
    ? outer.yMax - outer.yMin
    : outer.xMax - outer.xMin;
  const halfDepth = fullDepth / 2;
  const ridgeZ = wallTopZ + halfDepth * slope;

  // Ridge endpoints in plan: starts at gable wall midpoint, ends at the
  // hip-meeting point (halfDepth in from the opposite-to-gable side).
  const ridgeAtGable: Point3 = ridgePointAtSide(gable.side, outer, ridgeZ);
  const ridgeHipApex: Point3 = ridgeHipApexPoint(oppToGable.side, outer, halfDepth, ridgeZ);

  const panels: RoofPanel[] = [];
  // Two side-eave panels (trapezoids): from outer eave edge up to the ridge.
  for (const e of sideEaves) {
    const { u0, u1 } = eaveAxes(e.side, outer);
    const eaveV = sideV(e.side, outer);
    const lo0 = liftToWorld(e.side, outer, u0, eaveV, wallTopZ);
    const lo1 = liftToWorld(e.side, outer, u1, eaveV, wallTopZ);
    // eaveAxes u0→u1 establishes the CCW sweep for each face. The top edge must
    // close CCW as u1→u0, so ridge points follow: [lo0, lo1, ridge_u1, ridge_u0].
    // Determine which ridge endpoint aligns with u0 vs u1 based on whether the
    // gable end is at u0. (e.g. "front" has u0=xMin; if gable=left then u0 is the
    // gable end; if gable=right then u0 is the hip end.)
    const gableAtU0 = isGableAtU0(e.side, gable.side);
    const ridgeU0 = gableAtU0 ? ridgeAtGable : ridgeHipApex;
    const ridgeU1 = gableAtU0 ? ridgeHipApex : ridgeAtGable;
    panels.push({
      vertices: [lo0, lo1, ridgeU1, ridgeU0],
      materialId,
    });
  }
  // One opposite-to-gable triangle panel (the hipped end).
  {
    const e = oppToGable;
    const { u0, u1 } = eaveAxes(e.side, outer);
    const eaveV = sideV(e.side, outer);
    const lo0 = liftToWorld(e.side, outer, u0, eaveV, wallTopZ);
    const lo1 = liftToWorld(e.side, outer, u1, eaveV, wallTopZ);
    let verts: Point3[] = [lo0, lo1, ridgeHipApex];
    // Reverse for "left"/"right" sides: liftToWorld swaps u→y and v→x there,
    // flipping the cross-product sign relative to "front"/"back".
    if (e.side === "left" || e.side === "right") verts = verts.reverse();
    panels.push({ vertices: verts, materialId });
  }

  return {
    panels,
    gables: [
      { materialId, vertices: triangleAlong(gable.side, outer, wallTopZ, ridgeZ - wallTopZ, "full") },
    ],
  };
}

function ridgePointAtSide(side: ResolvedEdge["side"], outer: Rect, z: number): Point3 {
  const cx = (outer.xMin + outer.xMax) / 2;
  const cy = (outer.yMin + outer.yMax) / 2;
  switch (side) {
    case "front": return { x: cx, y: outer.yMin, z };
    case "back":  return { x: cx, y: outer.yMax, z };
    case "left":  return { x: outer.xMin, y: cy, z };
    case "right": return { x: outer.xMax, y: cy, z };
  }
}

function ridgeHipApexPoint(
  oppSide: ResolvedEdge["side"],
  outer: Rect,
  halfDepth: number,
  z: number,
): Point3 {
  const cx = (outer.xMin + outer.xMax) / 2;
  const cy = (outer.yMin + outer.yMax) / 2;
  // Hip apex sits on the rect's central axis, halfDepth in from oppSide.
  switch (oppSide) {
    case "front": return { x: cx, y: outer.yMin + halfDepth, z };
    case "back":  return { x: cx, y: outer.yMax - halfDepth, z };
    case "left":  return { x: outer.xMin + halfDepth, y: cy, z };
    case "right": return { x: outer.xMax - halfDepth, y: cy, z };
  }
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

/**
 * Corner slope (2 adjacent eaves): one hip line descends from the shared
 * eave corner (low corner) diagonally to where it exits the opposite pair of
 * gable walls. The high corner (where the two gables meet) sits at height
 * min(W, D) * slope above wall top. When W ≠ D the hip exits the shorter
 * dimension's gable wall first, then a horizontal ridge runs the remaining
 * distance to the high corner.
 *
 * Panels:
 *   - "wide" eave (dimension > min): trapezoid from its eave edge up to
 *     hipExit + highCorner (two high vertices).
 *   - "short" eave (dimension = min): triangle from its eave edge up to
 *     hipExit (single high vertex shared with the wide panel).
 *   When W == D both panels are triangles sharing the single apex.
 *
 * Gables: each gable wall gets a triangle with base along the wall and apex
 * at the high corner (which lies on the gable wall at wallTopZ + min(W,D)*slope).
 */
function buildCornerSlope2Adj(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): { panels: RoofPanel[]; gables: RoofGable[] } {
  const eaves = edges.filter((e) => e.kind === "eave");
  const gables = edges.filter((e) => e.kind === "gable");

  const W = outer.xMax - outer.xMin; // x-dimension
  const D = outer.yMax - outer.yMin; // y-dimension
  const eaveSides = new Set(eaves.map((e) => e.side));

  // Low corner: where the two eave walls meet (at wallTopZ).
  const lowCorner: Point3 = {
    x: eaveSides.has("right") ? outer.xMax : outer.xMin,
    y: eaveSides.has("back")  ? outer.yMax : outer.yMin,
    z: wallTopZ,
  };

  // High corner: where the two gable walls meet, at wallTopZ + min(W,D)*slope.
  // It is the corner diagonally opposite the lowCorner.
  const highCorner: Point3 = {
    x: eaveSides.has("right") ? outer.xMin : outer.xMax,
    y: eaveSides.has("front") ? outer.yMax : outer.yMin,
    z: wallTopZ + Math.min(W, D) * slope,
  };

  // Hip exit: the point where the equal-pitch hip line first touches a gable
  // wall. When W <= D the hip hits the gable wall parallel to the y-eave
  // (left/right side) first; when D <= W it hits the gable wall parallel to
  // the x-eave (front/back) first.
  const hipExit: Point3 = (() => {
    if (W <= D) {
      // Hip exits the left/right gable wall (x = highCorner.x) after W units.
      return {
        x: highCorner.x,
        y: lowCorner.y + (eaveSides.has("front") ? +W : -W),
        z: wallTopZ + W * slope,
      };
    }
    // Hip exits the front/back gable wall (y = highCorner.y) after D units.
    return {
      x: lowCorner.x + (eaveSides.has("right") ? -D : +D),
      y: highCorner.y,
      z: wallTopZ + D * slope,
    };
  })();

  // Identify which eave is "long" (its perpendicular span == max(W,D)) and
  // which is "short" (span == min(W,D)). The long eave gets a trapezoid
  // (hipExit + highCorner as its two upper vertices); the short eave gets a
  // triangle (hipExit as its single upper vertex).
  //
  // A horizontal eave (front/back) spans the y-depth D; a vertical eave
  // (left/right) spans the x-width W. "Long" means its span >= the other.
  const panels: RoofPanel[] = [];
  for (const e of eaves) {
    const span = (e.side === "front" || e.side === "back") ? D : W;
    const otherSpan = (e.side === "front" || e.side === "back") ? W : D;
    const { u0, u1 } = eaveAxes(e.side, outer);
    const eaveV = sideV(e.side, outer);
    const lo0 = liftToWorld(e.side, outer, u0, eaveV, wallTopZ);
    const lo1 = liftToWorld(e.side, outer, u1, eaveV, wallTopZ);

    if (span < otherSpan) {
      // Short eave → trapezoid: base lo0..lo1, top two vertices
      // are hipExit and highCorner (in CCW order relative to this face).
      // We need to determine which end of the base is adjacent to the low
      // corner to get the winding right.
      // lo0 is at u0; lo1 is at u1 (eaveAxes convention).
      // lowCorner aligns with the OTHER eave's wall (the short eave direction).
      // For the short eave the low corner is at u1 (the end of the eave that
      // meets the long eave). Check by comparing u1 to the low corner coord.
      const lowU = (e.side === "front" || e.side === "back") ? lowCorner.x : lowCorner.y;
      const lowIsAtU1 = Math.abs(u1 - lowU) < 0.01;
      if (lowIsAtU1) {
        // lo1 is the low corner end; going CCW: lo0 → lo1 → hipExit → highCorner
        panels.push({ vertices: [lo0, lo1, hipExit, highCorner], materialId });
      } else {
        // lo0 is the low corner end; going CCW: highCorner → hipExit → lo0 → lo1
        // (reversed so lo0..lo1 is still the base going CCW)
        panels.push({ vertices: [highCorner, hipExit, lo0, lo1], materialId });
      }
    } else {
      // Long (or equal) eave → triangle: base lo1..lo0, single apex at hipExit.
      // The long eave's apex (hipExit) is inward. CCW winding requires swapping
      // lo0/lo1 relative to the trapezoid branch.
      const lowU = (e.side === "front" || e.side === "back") ? lowCorner.x : lowCorner.y;
      const lowIsAtU1 = Math.abs(u1 - lowU) < 0.01;
      if (lowIsAtU1) {
        panels.push({ vertices: [lo1, lo0, hipExit], materialId });
      } else {
        panels.push({ vertices: [hipExit, lo1, lo0], materialId });
      }
    }
  }

  // Gables: each gable wall gets a triangle, except when hipExit lies on the
  // gable wall and is distinct from highCorner (W != D case) — then a 4-vert
  // quad is needed to capture the knee in the upper profile.
  const TOL = 0.001;
  const result: RoofGable[] = [];
  for (const g of gables) {
    const { u0, u1 } = eaveAxes(g.side, outer);
    const gV = sideV(g.side, outer);
    const baseStart = liftToWorld(g.side, outer, u0, gV, wallTopZ);
    const baseEnd = liftToWorld(g.side, outer, u1, gV, wallTopZ);

    const hipOnWall = (g.side === "front" || g.side === "back")
      ? Math.abs(hipExit.y - gV) < TOL
      : Math.abs(hipExit.x - gV) < TOL;
    const hipDistinct =
      Math.abs(hipExit.x - highCorner.x) > TOL ||
      Math.abs(hipExit.y - highCorner.y) > TOL;

    if (hipOnWall && hipDistinct) {
      // Knee in the gable's upper profile: emit 4-vert quad.
      // Reverse for "left"/"right" sides: liftToWorld swaps u→y and v→x there,
      // flipping the cross-product sign relative to "front"/"back".
      let verts: Point3[] = [baseStart, baseEnd, highCorner, hipExit];
      if (g.side === "left" || g.side === "right") verts = verts.reverse();
      result.push({ materialId, vertices: verts });
    } else {
      let verts: Point3[] = [baseStart, baseEnd, highCorner];
      if (g.side === "left" || g.side === "right") verts = verts.reverse();
      result.push({ materialId, vertices: verts });
    }
  }

  return { panels, gables: result };
}

function buildHip4(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): { panels: RoofPanel[]; gables: RoofGable[] } {
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
