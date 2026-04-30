import { resolveAnchor } from "../../domain/v2/anchors";
import type { HouseProject, Point2, Wall } from "../../domain/v2/types";
import { buildRoofGeometry } from "../../geometry/v2/roofGeometry";
import type {
  ElevationBalconyRectV2,
  ElevationOpeningRectV2,
  ElevationProjectionV2,
  ElevationRoofPolygonV2,
  ElevationSide,
  ElevationSlabLine,
  ElevationWallBandV2,
} from "./types";

const PARALLEL_TOL = 0.005;

function isVisibleWall(wall: Wall, side: ElevationSide): boolean {
  if (!wall.exterior) return false;
  if (side === "front" || side === "back") {
    return Math.abs(wall.end.y - wall.start.y) < PARALLEL_TOL;
  }
  return Math.abs(wall.end.x - wall.start.x) < PARALLEL_TOL;
}

function projectAxis(point: { x: number; y: number }, side: ElevationSide): number {
  if (side === "front") return point.x;
  if (side === "back") return -point.x;
  if (side === "left") return -point.y;
  return point.y;
}

function depthFor(point: { x: number; y: number }, side: ElevationSide): number {
  if (side === "front") return point.y;
  if (side === "back") return -point.y;
  if (side === "left") return point.x;
  return -point.x;
}

function pointAlongWall(wall: Wall, distance: number): Point2 {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: wall.start.x, y: wall.start.y };
  return {
    x: wall.start.x + (dx / len) * distance,
    y: wall.start.y + (dy / len) * distance,
  };
}

function spanExtent(
  wall: Wall,
  offset: number,
  width: number,
  side: ElevationSide,
): { x: number; width: number } {
  const a = projectAxis(pointAlongWall(wall, offset), side);
  const b = projectAxis(pointAlongWall(wall, offset + width), side);
  return { x: Math.min(a, b), width: Math.abs(b - a) };
}

function wallExtent(wall: Wall, side: ElevationSide): { x: number; width: number } {
  const a = projectAxis(wall.start, side);
  const b = projectAxis(wall.end, side);
  return { x: Math.min(a, b), width: Math.abs(b - a) };
}

function wallDepth(wall: Wall, side: ElevationSide): number {
  return (depthFor(wall.start, side) + depthFor(wall.end, side)) / 2;
}

function polygonProjectedBounds(polygon: Point2[], side: ElevationSide) {
  const xs = polygon.map((p) => projectAxis(p, side));
  const depths = polygon.map((p) => depthFor(p, side));
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    avgDepth: depths.reduce((s, d) => s + d, 0) / depths.length,
  };
}

export function projectElevationV2(
  project: HouseProject,
  side: ElevationSide,
): ElevationProjectionV2 {
  const storeys = project.storeys;
  const visibleWalls = project.walls.filter((w) => isVisibleWall(w, side));
  const wallsById = new Map(visibleWalls.map((w) => [w.id, w]));

  const wallBands: ElevationWallBandV2[] = visibleWalls.map((wall) => {
    const ext = wallExtent(wall, side);
    return {
      wallId: wall.id,
      x: ext.x,
      y: resolveAnchor(wall.bottom, storeys),
      width: ext.width,
      height: resolveAnchor(wall.top, storeys) - resolveAnchor(wall.bottom, storeys),
      depth: wallDepth(wall, side),
    };
  });

  const slabLines: ElevationSlabLine[] = project.slabs.map((slab) => {
    const z = resolveAnchor(slab.top, storeys);
    const bounds = polygonProjectedBounds(slab.polygon, side);
    return {
      slabId: slab.id,
      start: { x: bounds.minX, y: z },
      end: { x: bounds.maxX, y: z },
      thickness: slab.thickness,
      depth: bounds.avgDepth,
    };
  });

  const openings: ElevationOpeningRectV2[] = project.openings
    .filter((o) => wallsById.has(o.wallId))
    .map((o) => {
      const wall = wallsById.get(o.wallId)!;
      const ext = spanExtent(wall, o.offset, o.width, side);
      return {
        openingId: o.id,
        wallId: o.wallId,
        type: o.type,
        x: ext.x,
        y: resolveAnchor(wall.bottom, storeys) + o.sillHeight,
        width: ext.width,
        height: o.height,
        depth: wallDepth(wall, side),
      };
    });

  const balconies: ElevationBalconyRectV2[] = project.balconies
    .filter((b) => wallsById.has(b.attachedWallId))
    .map((b) => {
      const wall = wallsById.get(b.attachedWallId)!;
      const ext = spanExtent(wall, b.offset, b.width, side);
      return {
        balconyId: b.id,
        wallId: b.attachedWallId,
        x: ext.x,
        y: resolveAnchor(b.slabTop, storeys),
        width: ext.width,
        height: b.slabThickness + b.railingHeight,
        depth: wallDepth(wall, side),
      };
    });

  const roofPolygons: ElevationRoofPolygonV2[] = [];
  for (const roof of project.roofs) {
    const geom = buildRoofGeometry(roof, storeys);
    if (!geom) continue;
    for (const panel of geom.panels) {
      const verts = panel.vertices.map((v) => ({ x: projectAxis(v, side), y: v.z }));
      const avgDepth =
        panel.vertices.reduce((s, v) => s + depthFor(v, side), 0) / panel.vertices.length;
      roofPolygons.push({ roofId: roof.id, vertices: verts, kind: "panel", depth: avgDepth });
    }
    for (const gable of geom.gables) {
      const verts = gable.vertices.map((v) => ({ x: projectAxis(v, side), y: v.z }));
      const avgDepth =
        gable.vertices.reduce((s, v) => s + depthFor(v, side), 0) / gable.vertices.length;
      roofPolygons.push({ roofId: roof.id, vertices: verts, kind: "gable", depth: avgDepth });
    }
  }

  return {
    viewId: `elevation-${side}`,
    side,
    wallBands,
    slabLines,
    openings,
    balconies,
    roofPolygons,
  };
}
