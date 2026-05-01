import { rotatePoint } from "../../domain/v2/stairs";
import type { Point2 } from "../../domain/v2/types";
import type {
  ElevationProjectionV2,
  ElevationSide,
  PlanBalconyGlyphV2,
  PlanOpeningGlyphV2,
  PlanProjectionV2,
  PlanStairSymbolV2,
  PlanWallSegmentV2,
  RoofViewProjectionV2,
} from "../../projection/v2/types";
import type { Bounds, Point2D, PointMapping } from "./types";

export const SURFACE_WIDTH = 720;
export const SURFACE_HEIGHT = 520;
export const SURFACE_PADDING = 48;

export const ELEVATION_SIDE_BY_VIEW: Record<string, ElevationSide> = {
  "elevation-front": "front",
  "elevation-back": "back",
  "elevation-left": "left",
  "elevation-right": "right",
};

export function createPointMapping(bounds: Bounds): PointMapping {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(
    (SURFACE_WIDTH - SURFACE_PADDING * 2) / width,
    (SURFACE_HEIGHT - SURFACE_PADDING * 2) / height,
  );
  const contentWidth = width * scale;
  const contentHeight = height * scale;
  const offsetX = (SURFACE_WIDTH - contentWidth) / 2;
  const offsetY = (SURFACE_HEIGHT - contentHeight) / 2;

  return {
    project: (point) => ({
      x: offsetX + (point.x - bounds.minX) * scale,
      y: SURFACE_HEIGHT - offsetY - (point.y - bounds.minY) * scale,
    }),
    unproject: (point) => ({
      x: bounds.minX + (point.x - offsetX) / scale,
      y: bounds.minY + (SURFACE_HEIGHT - point.y - offsetY) / scale,
    }),
    scale,
  };
}

export function eventToViewBoxPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point2D {
  const ctm = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
  if (ctm) {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return {
      x: ((clientX - rect.left) * SURFACE_WIDTH) / rect.width,
      y: ((clientY - rect.top) * SURFACE_HEIGHT) / rect.height,
    };
  }
  return { x: clientX, y: clientY };
}

export function computeSolidPanels(
  wallLen: number,
  openings: readonly { offset: number; width: number }[],
): Array<{ x: number; width: number }> {
  if (wallLen <= 0) return [];
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  const panels: Array<{ x: number; width: number }> = [];
  let cursor = 0;
  for (const opening of sorted) {
    if (opening.offset > cursor) {
      panels.push({ x: cursor, width: opening.offset - cursor });
    }
    cursor = Math.max(cursor, opening.offset + opening.width);
  }
  if (cursor < wallLen) {
    panels.push({ x: cursor, width: wallLen - cursor });
  }
  return panels.filter((panel) => panel.width > 1e-4);
}

export function planBounds(projection: PlanProjectionV2): Bounds {
  const wallsById = new Map(projection.wallSegments.map((wall) => [wall.wallId, wall]));
  const points: Point2[] = [
    ...projection.wallSegments.flatMap((wall) => [wall.start, wall.end]),
    ...projection.slabOutlines.flatMap((slab) => [
      ...slab.outline,
      ...slab.holes.flat(),
    ]),
    ...projection.balconies.flatMap((balcony) => {
      const wall = wallsById.get(balcony.wallId);
      return wall ? balconyPolygon(balcony, wall) : [];
    }),
    ...projection.stairs.flatMap((stair) => [
      { x: stair.rect.x, y: stair.rect.y },
      { x: stair.rect.x + stair.rect.width, y: stair.rect.y + stair.rect.depth },
    ]),
  ];

  if (points.length === 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

export function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function elevationAxisToWorld(side: ElevationSide, dxAxis: number): { dx: number; dy: number } {
  switch (side) {
    case "front":
      return { dx: dxAxis, dy: 0 };
    case "back":
      return { dx: -dxAxis, dy: 0 };
    case "left":
      return { dx: 0, dy: -dxAxis };
    case "right":
      return { dx: 0, dy: dxAxis };
  }
}

export function elevationBounds(projection: ElevationProjectionV2): Bounds {
  const xValues = projection.wallBands.flatMap((band) => [band.x, band.x + band.width]);
  const yValues = projection.wallBands.flatMap((band) => [band.y, band.y + band.height]);
  for (const line of projection.slabLines) {
    xValues.push(line.start.x, line.end.x);
    yValues.push(line.start.y, line.end.y);
  }
  for (const opening of projection.openings) {
    xValues.push(opening.x, opening.x + opening.width);
    yValues.push(opening.y, opening.y + opening.height);
  }
  for (const balcony of projection.balconies) {
    xValues.push(balcony.x, balcony.x + balcony.width);
    yValues.push(balcony.y, balcony.y + balcony.height);
  }
  for (const poly of projection.roofPolygons) {
    for (const v of poly.vertices) {
      xValues.push(v.x);
      yValues.push(v.y);
    }
  }

  if (xValues.length === 0 || yValues.length === 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }

  return {
    minX: Math.min(...xValues),
    maxX: Math.max(...xValues),
    minY: Math.min(...yValues),
    maxY: Math.max(...yValues),
  };
}

export function openingLine(
  opening: PlanOpeningGlyphV2,
  segment: PlanWallSegmentV2,
): { start: { x: number; y: number }; end: { x: number; y: number } } | undefined {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return undefined;

  const unitX = dx / length;
  const unitY = dy / length;
  const start = {
    x: segment.start.x + unitX * opening.offset,
    y: segment.start.y + unitY * opening.offset,
  };

  return {
    start,
    end: {
      x: start.x + unitX * opening.width,
      y: start.y + unitY * opening.width,
    },
  };
}

export function balconyPolygon(balcony: PlanBalconyGlyphV2, segment: PlanWallSegmentV2) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [];

  const unitX = dx / length;
  const unitY = dy / length;
  const normalX = unitY;
  const normalY = -unitX;
  const innerStart = {
    x: segment.start.x + unitX * balcony.offset,
    y: segment.start.y + unitY * balcony.offset,
  };
  const innerEnd = {
    x: segment.start.x + unitX * (balcony.offset + balcony.width),
    y: segment.start.y + unitY * (balcony.offset + balcony.width),
  };

  return [
    innerStart,
    innerEnd,
    {
      x: innerEnd.x + normalX * balcony.depth,
      y: innerEnd.y + normalY * balcony.depth,
    },
    {
      x: innerStart.x + normalX * balcony.depth,
      y: innerStart.y + normalY * balcony.depth,
    },
  ];
}

export function polyPoints(points: Point2D[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

export type StairSymbolGeometry = {
  outline: Point2D[];
  flights: Point2D[][];
  landings: Point2D[][];
  treadLines: Array<{ from: Point2D; to: Point2D }>;
  cutLine: Point2D[]; // zig-zag polyline; empty array = no cut drawn
  labelPos: Point2D;
};

export function buildStairSymbolGeometry(
  stair: PlanStairSymbolV2,
  projectPoint: (point: Point2) => Point2D,
): StairSymbolGeometry {
  const { rect, bottomEdge, treadDepth, treadCount, shape } = stair;

  // Rotate a world-space plan point around the stair's center before projecting.
  const rotateAndProject = (p: Point2): Point2D =>
    projectPoint(stair.rotation !== 0 ? rotatePoint(p, stair.center, stair.rotation) : p);

  // Map (run, cross) — local coords where run=0 is bottomEdge — to world (x, y).
  const worldFromRunCross = (run: number, cross: number): Point2 => {
    switch (bottomEdge) {
      case "+y": return { x: rect.x + cross, y: rect.y + rect.depth - run };
      case "-y": return { x: rect.x + cross, y: rect.y + run };
      case "+x": return { x: rect.x + rect.width - run, y: rect.y + cross };
      case "-x": return { x: rect.x + run, y: rect.y + cross };
    }
  };
  const runLength = bottomEdge === "+y" || bottomEdge === "-y" ? rect.depth : rect.width;
  const crossLength = bottomEdge === "+y" || bottomEdge === "-y" ? rect.width : rect.depth;
  const proj = (run: number, cross: number) => rotateAndProject(worldFromRunCross(run, cross));

  const rectAt = (r0: number, c0: number, r1: number, c1: number): Point2D[] => [
    proj(r0, c0), proj(r0, c1), proj(r1, c1), proj(r1, c0),
  ];

  const outline: Point2D[] = [
    rotateAndProject({ x: rect.x, y: rect.y }),
    rotateAndProject({ x: rect.x + rect.width, y: rect.y }),
    rotateAndProject({ x: rect.x + rect.width, y: rect.y + rect.depth }),
    rotateAndProject({ x: rect.x, y: rect.y + rect.depth }),
  ];

  const flights: Point2D[][] = [];
  const landings: Point2D[][] = [];
  const treadLines: Array<{ from: Point2D; to: Point2D }> = [];

  if (shape === "straight") {
    flights.push(rectAt(0, 0, treadCount * treadDepth, crossLength));
    for (let i = 1; i < treadCount; i += 1) {
      treadLines.push({ from: proj(i * treadDepth, 0), to: proj(i * treadDepth, crossLength) });
    }
  } else if (shape === "l") {
    const lw = Math.min(rect.width, rect.depth) / 2;
    const nLow = Math.floor(treadCount / 2);
    const nUp = treadCount - nLow - 1;
    const turn = stair.turn ?? "right";
    const lowerCrossStart = turn === "right" ? 0 : crossLength - lw;
    const lowerCrossEnd = lowerCrossStart + lw;
    flights.push(rectAt(0, lowerCrossStart, nLow * treadDepth, lowerCrossEnd));
    for (let i = 1; i < nLow; i += 1) {
      treadLines.push({
        from: proj(i * treadDepth, lowerCrossStart),
        to: proj(i * treadDepth, lowerCrossEnd),
      });
    }
    landings.push(rectAt(nLow * treadDepth, lowerCrossStart, nLow * treadDepth + lw, lowerCrossEnd));
    const upperCrossStart = turn === "right" ? lw : 0;
    const upperCrossEnd = upperCrossStart + nUp * treadDepth;
    flights.push(rectAt(nLow * treadDepth, upperCrossStart, nLow * treadDepth + lw, upperCrossEnd));
    for (let j = 1; j < nUp; j += 1) {
      const cs = upperCrossStart + j * treadDepth;
      treadLines.push({
        from: proj(nLow * treadDepth, cs),
        to: proj(nLow * treadDepth + lw, cs),
      });
    }
  } else {
    // U
    const GAP = 0.05;
    const flightWidth = (crossLength - GAP) / 2;
    const nLow = Math.floor(treadCount / 2);
    const nUp = treadCount - nLow - 1;
    flights.push(rectAt(0, 0, nLow * treadDepth, flightWidth));
    for (let i = 1; i < nLow; i += 1) {
      treadLines.push({ from: proj(i * treadDepth, 0), to: proj(i * treadDepth, flightWidth) });
    }
    // Upper flight is right-justified to the lower flight's far edge, so the landing
    // sits BEYOND both flights as a clean U-turn rectangle.
    const upperRunEnd = nLow * treadDepth;
    const upperRunStart = upperRunEnd - nUp * treadDepth;
    flights.push(rectAt(upperRunStart, crossLength - flightWidth, upperRunEnd, crossLength));
    for (let j = 1; j < nUp; j += 1) {
      const r = upperRunEnd - j * treadDepth;
      treadLines.push({
        from: proj(r, crossLength - flightWidth),
        to: proj(r, crossLength),
      });
    }
    // Landing: ideally one flight deep, but never beyond the stair bbox.
    const landingNearRun = nLow * treadDepth;
    const landingDepth = Math.max(0, Math.min(flightWidth, runLength - landingNearRun));
    if (landingDepth > 0) {
      landings.push(rectAt(landingNearRun, 0, landingNearRun + landingDepth, crossLength));
    }
  }

  // UP label sits on the lower flight (near bottomEdge); for U-shape this is
  // the bottomEdge-side flight, not the gap.
  const labelRunCenter = runLength * 0.25;
  let labelCross = crossLength / 2;
  if (shape === "u") {
    const GAP = 0.05;
    const flightWidth = (crossLength - GAP) / 2;
    labelCross = flightWidth / 2;
  }
  const labelPos = proj(labelRunCenter, labelCross);

  // CAD cut line: zig-zag across the run at midpoint, marking where the upper
  // floor's slab severs the staircase.
  const cutRun = runLength / 2;
  const cutOffset = Math.min(0.12, runLength * 0.08); // stagger half-depth
  const cutLine: Point2D[] = [
    proj(cutRun - cutOffset, 0),
    proj(cutRun + cutOffset, crossLength * 0.5),
    proj(cutRun - cutOffset, crossLength),
  ];

  return { outline, flights, landings, treadLines, cutLine, labelPos };
}

export function roofViewBounds(projection: RoofViewProjectionV2): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of projection.polygons) {
    for (const v of poly.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}
