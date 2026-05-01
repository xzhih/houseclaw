import type { Point2, Storey, Wall } from "../domain/types";
import { resolveAnchor } from "../domain/anchors";
import type { FootprintQuad, WallSegment } from "./types";

export type WallFootprint = FootprintQuad & { wallId: string };
export type PanelFootprint = FootprintQuad;

export type BuildWallNetworkOptions = {
  tolerance?: number;
};

// Below the rounding precision used by wallLength (1e-4) so panel boundaries
// produced from a rounded wall length still register as "touching" the end.
const SLICE_ENDPOINT_TOLERANCE = 1e-3;

const DEFAULT_TOLERANCE = 0.005;
const PARALLEL_EPSILON = 1e-6;

type WallEndKind = "start" | "end";

type Incidence = {
  wallId: string;
  end: WallEndKind;
  thickness: number;
  // Outgoing unit direction at this junction (points away from the junction
  // along the wall's centerline).
  dx: number;
  dy: number;
  angle: number;
};

type IncidenceCorners = {
  outgoingRight: Point2;
  outgoingLeft: Point2;
};

type Junction = {
  x: number;
  y: number;
  incidences: Incidence[];
};

function rightNormalOf(dx: number, dy: number): Point2 {
  return { x: dy, y: -dx };
}

function leftNormalOf(dx: number, dy: number): Point2 {
  return { x: -dy, y: dx };
}

function cross2(a: Point2, b: Point2): number {
  return a.x * b.y - a.y * b.x;
}

function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function findOrCreateJunction(
  junctions: Junction[],
  point: Point2,
  tolerance: number,
): Junction {
  for (const junction of junctions) {
    if (distance({ x: junction.x, y: junction.y }, point) <= tolerance) {
      return junction;
    }
  }
  const fresh: Junction = { x: point.x, y: point.y, incidences: [] };
  junctions.push(fresh);
  return fresh;
}

function freeEndCorners(
  junction: Junction,
  incidence: Incidence,
): IncidenceCorners {
  const half = incidence.thickness / 2;
  const rn = rightNormalOf(incidence.dx, incidence.dy);
  const ln = leftNormalOf(incidence.dx, incidence.dy);
  return {
    outgoingRight: {
      x: junction.x + half * rn.x,
      y: junction.y + half * rn.y,
    },
    outgoingLeft: {
      x: junction.x + half * ln.x,
      y: junction.y + half * ln.y,
    },
  };
}

function emptyCorners(): IncidenceCorners {
  return {
    outgoingRight: { x: 0, y: 0 },
    outgoingLeft: { x: 0, y: 0 },
  };
}

export function buildWallNetwork(
  walls: Wall[],
  storeys: Storey[],
  options?: BuildWallNetworkOptions,
): WallFootprint[] {
  const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE;
  const junctions: Junction[] = [];

  type Slot = { junction: Junction; incidence: Incidence };
  const wallSlots = new Map<string, { start: Slot; end: Slot }>();

  for (const wall of walls) {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.hypot(dx, dy);
    if (len <= 0) continue;

    const ux = dx / len;
    const uy = dy / len;

    const startJunction = findOrCreateJunction(junctions, wall.start, tolerance);
    const startInc: Incidence = {
      wallId: wall.id,
      end: "start",
      thickness: wall.thickness,
      dx: ux,
      dy: uy,
      angle: Math.atan2(uy, ux),
    };
    startJunction.incidences.push(startInc);

    const endJunction = findOrCreateJunction(junctions, wall.end, tolerance);
    const endInc: Incidence = {
      wallId: wall.id,
      end: "end",
      thickness: wall.thickness,
      dx: -ux,
      dy: -uy,
      angle: Math.atan2(-uy, -ux),
    };
    endJunction.incidences.push(endInc);

    wallSlots.set(wall.id, {
      start: { junction: startJunction, incidence: startInc },
      end: { junction: endJunction, incidence: endInc },
    });
  }

  const corners = new Map<Incidence, IncidenceCorners>();

  for (const junction of junctions) {
    const sorted = [...junction.incidences].sort((a, b) => a.angle - b.angle);

    // Z-overlap gate (v2): if the intersection of all incident walls'
    // [bottomZ, topZ] intervals is empty, no mitering is meaningful;
    // emit free-end corners for every incidence and skip this junction.
    if (sorted.length > 1) {
      const intervals = sorted.map((inc) => {
        const wall = walls.find((w) => w.id === inc.wallId)!;
        return {
          lo: resolveAnchor(wall.bottom, storeys),
          hi: resolveAnchor(wall.top, storeys),
        };
      });
      const lo = Math.max(...intervals.map((i) => i.lo));
      const hi = Math.min(...intervals.map((i) => i.hi));
      if (lo >= hi) {
        for (const inc of sorted) {
          corners.set(inc, freeEndCorners(junction, inc));
        }
        continue;
      }
    }

    if (sorted.length === 1) {
      corners.set(sorted[0], freeEndCorners(junction, sorted[0]));
      continue;
    }

    for (let i = 0; i < sorted.length; i += 1) {
      const x = sorted[i];
      const y = sorted[(i + 1) % sorted.length];
      const halfX = x.thickness / 2;
      const halfY = y.thickness / 2;
      const xLeft = leftNormalOf(x.dx, x.dy);
      const yRight = rightNormalOf(y.dx, y.dy);
      const px = { x: junction.x + halfX * xLeft.x, y: junction.y + halfX * xLeft.y };
      const py = { x: junction.x + halfY * yRight.x, y: junction.y + halfY * yRight.y };
      const dxv = { x: x.dx, y: x.dy };
      const dyv = { x: y.dx, y: y.dy };

      const denom = cross2(dxv, dyv);

      let cornerForX: Point2;
      let cornerForY: Point2;
      if (Math.abs(denom) < PARALLEL_EPSILON) {
        cornerForX = px;
        cornerForY = py;
      } else {
        const offset = { x: py.x - px.x, y: py.y - px.y };
        const s = cross2(offset, dyv) / denom;
        const intersection = { x: px.x + s * dxv.x, y: px.y + s * dxv.y };
        cornerForX = intersection;
        cornerForY = intersection;
      }

      const xCorners = corners.get(x) ?? emptyCorners();
      xCorners.outgoingLeft = cornerForX;
      corners.set(x, xCorners);

      const yCorners = corners.get(y) ?? emptyCorners();
      yCorners.outgoingRight = cornerForY;
      corners.set(y, yCorners);
    }
  }

  const result: WallFootprint[] = [];
  for (const wall of walls) {
    const slots = wallSlots.get(wall.id);
    if (!slots) continue;
    const startCorners = corners.get(slots.start.incidence);
    const endCorners = corners.get(slots.end.incidence);
    if (!startCorners || !endCorners) continue;

    result.push({
      wallId: wall.id,
      rightStart: startCorners.outgoingRight,
      leftStart: startCorners.outgoingLeft,
      leftEnd: endCorners.outgoingRight,
      rightEnd: endCorners.outgoingLeft,
    });
  }

  return result;
}

export function slicePanelFootprint(
  footprint: FootprintQuad,
  segment: WallSegment,
  panel: { x: number; width: number },
): PanelFootprint {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 0) {
    return {
      rightStart: { ...footprint.rightStart },
      rightEnd: { ...footprint.rightEnd },
      leftStart: { ...footprint.leftStart },
      leftEnd: { ...footprint.leftEnd },
    };
  }

  const ux = dx / length;
  const uy = dy / length;
  const half = segment.thickness / 2;
  // Right normal of (ux, uy) is (uy, -ux); left normal is the negation.
  const rnx = uy;
  const rny = -ux;
  const lnx = -uy;
  const lny = ux;

  const interiorRight = (distance: number): Point2 => ({
    x: segment.start.x + ux * distance + half * rnx,
    y: segment.start.y + uy * distance + half * rny,
  });
  const interiorLeft = (distance: number): Point2 => ({
    x: segment.start.x + ux * distance + half * lnx,
    y: segment.start.y + uy * distance + half * lny,
  });

  const startDistance = panel.x;
  const endDistance = panel.x + panel.width;
  const touchesStart = startDistance <= SLICE_ENDPOINT_TOLERANCE;
  const touchesEnd = endDistance >= length - SLICE_ENDPOINT_TOLERANCE;

  return {
    rightStart: touchesStart ? { ...footprint.rightStart } : interiorRight(startDistance),
    leftStart: touchesStart ? { ...footprint.leftStart } : interiorLeft(startDistance),
    rightEnd: touchesEnd ? { ...footprint.rightEnd } : interiorRight(endDistance),
    leftEnd: touchesEnd ? { ...footprint.leftEnd } : interiorLeft(endDistance),
  };
}
