import type { HouseProject, Point2, Point3, Wall } from "../domain/types";
import { buildProjectRoof } from "../geometry/houseGeometry";
import { buildSkirtGeometry } from "../geometry/skirtGeometry";
import type { RoofGeometry } from "../geometry/roofGeometry";
import type { ElevationProjection, ElevationRoofPolygon, ElevationSide } from "./types";

type StoreyBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

function storeyBoundsById(walls: Wall[]): Map<string, StoreyBounds> {
  const boundsById = new Map<string, StoreyBounds>();

  for (const wall of walls) {
    for (const point of [wall.start, wall.end]) {
      const bounds = boundsById.get(wall.storeyId);
      if (bounds) {
        bounds.minX = Math.min(bounds.minX, point.x);
        bounds.maxX = Math.max(bounds.maxX, point.x);
        bounds.minY = Math.min(bounds.minY, point.y);
        bounds.maxY = Math.max(bounds.maxY, point.y);
      } else {
        boundsById.set(wall.storeyId, {
          minX: point.x,
          maxX: point.x,
          minY: point.y,
          maxY: point.y,
        });
      }
    }
  }

  return boundsById;
}

function sideWallPredicate(project: HouseProject, side: ElevationSide): (wall: Wall) => boolean {
  const boundsById = storeyBoundsById(project.walls);

  return (wall: Wall) => {
    const bounds = boundsById.get(wall.storeyId);
    if (!bounds) return false;

    const horizontal = wall.start.y === wall.end.y;
    const vertical = wall.start.x === wall.end.x;
    if (side === "front") return horizontal && wall.start.y === bounds.minY && wall.end.y === bounds.minY;
    if (side === "back") return horizontal && wall.start.y === bounds.maxY && wall.end.y === bounds.maxY;
    if (side === "left") return vertical && wall.start.x === bounds.minX && wall.end.x === bounds.minX;
    return vertical && wall.start.x === bounds.maxX && wall.end.x === bounds.maxX;
  };
}

function projectAxis(point: Point2, side: ElevationSide): number {
  if (side === "front") return point.x;
  if (side === "back") return -point.x;
  if (side === "left") return -point.y;
  return point.y;
}

function projectRoofToElevation(
  geom: RoofGeometry,
  side: ElevationSide,
): ElevationRoofPolygon[] {
  const project = (v: Point3): Point2 => ({ x: projectAxis(v, side), y: v.z });
  const polygons: ElevationRoofPolygon[] = [];
  for (const panel of geom.panels) {
    polygons.push({ kind: "panel", vertices: panel.vertices.map(project) });
  }
  for (const gable of geom.gables) {
    polygons.push({ kind: "gable", vertices: gable.vertices.map(project) });
  }
  return polygons;
}

function projectSkirtsToElevation(
  project: HouseProject,
  side: ElevationSide,
): ElevationRoofPolygon[] {
  const projectVert = (v: Point3): Point2 => ({ x: projectAxis(v, side), y: v.z });
  const result: ElevationRoofPolygon[] = [];
  for (const skirt of project.skirts) {
    const wall = project.walls.find((w) => w.id === skirt.hostWallId);
    if (!wall) continue;
    const geom = buildSkirtGeometry(skirt, wall);
    result.push({ kind: "panel", vertices: geom.panel.vertices.map(projectVert) });
    for (const cap of geom.endCaps) {
      result.push({ kind: "gable", vertices: cap.vertices.map(projectVert) });
    }
  }
  return result;
}

/**
 * Sign that maps a unit of `offset` along the wall (start → end) to a unit on the
 * elevation view's x-axis. +1 when the wall is drawn in the canonical direction for
 * its side (so dragging right increases offset); -1 when drawn the other way (so
 * dragging right *decreases* offset, because the back/left views are mirrored).
 */
export function elevationOffsetSign(wall: Wall, side: ElevationSide): 1 | -1 {
  return projectAxis(wall.end, side) >= projectAxis(wall.start, side) ? 1 : -1;
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
  return { x: Math.min(a, b), width };
}

function wallExtent(wall: Wall, side: ElevationSide): { x: number; width: number } {
  const a = projectAxis(wall.start, side);
  const b = projectAxis(wall.end, side);
  return { x: Math.min(a, b), width: Math.abs(b - a) };
}

export function projectElevationView(
  project: HouseProject,
  side: ElevationSide,
): ElevationProjection {
  const isSideWall = sideWallPredicate(project, side);
  const walls = project.walls.filter(isSideWall);
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]));
  const storeysById = new Map(project.storeys.map((storey) => [storey.id, storey]));

  const roofGeom = buildProjectRoof(project);
  const roof = roofGeom ? projectRoofToElevation(roofGeom, side) : undefined;
  const skirts = projectSkirtsToElevation(project, side);

  return {
    viewId: `elevation-${side}`,
    side,
    roof,
    skirts: skirts.length > 0 ? skirts : undefined,
    wallBands: walls.map((wall) => {
      const storey = storeysById.get(wall.storeyId);
      const extent = wallExtent(wall, side);
      return {
        wallId: wall.id,
        storeyId: wall.storeyId,
        x: extent.x,
        y: storey?.elevation ?? 0,
        width: extent.width,
        height: wall.height,
      };
    }),
    openings: project.openings
      .filter((opening) => wallsById.has(opening.wallId))
      .map((opening) => {
        const wall = wallsById.get(opening.wallId)!;
        const storey = storeysById.get(wall.storeyId);
        const extent = spanExtent(wall, opening.offset, opening.width, side);

        return {
          openingId: opening.id,
          wallId: opening.wallId,
          type: opening.type,
          x: extent.x,
          y: (storey?.elevation ?? 0) + opening.sillHeight,
          width: extent.width,
          height: opening.height,
        };
      }),
    balconies: project.balconies
      .filter((balcony) => wallsById.has(balcony.attachedWallId))
      .map((balcony) => {
        const wall = wallsById.get(balcony.attachedWallId)!;
        const storey = storeysById.get(balcony.storeyId);
        const extent = spanExtent(wall, balcony.offset, balcony.width, side);

        return {
          balconyId: balcony.id,
          wallId: balcony.attachedWallId,
          x: extent.x,
          y: storey?.elevation ?? 0,
          width: extent.width,
          height: balcony.slabThickness + balcony.railingHeight,
        };
      }),
  };
}
