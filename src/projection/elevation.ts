import { wallLength } from "../domain/measurements";
import type { HouseProject, Wall } from "../domain/types";
import type { ElevationProjection, ElevationSide } from "./types";

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

function sideAxisStart(wall: Wall, side: ElevationSide): number {
  if (side === "front" || side === "back") {
    return Math.min(wall.start.x, wall.end.x);
  }
  return Math.min(wall.start.y, wall.end.y);
}

export function projectElevationView(
  project: HouseProject,
  side: ElevationSide,
): ElevationProjection {
  const isSideWall = sideWallPredicate(project, side);
  const walls = project.walls.filter(isSideWall);
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]));

  return {
    viewId: `elevation-${side}`,
    side,
    wallBands: walls.map((wall) => {
      const storey = project.storeys.find((candidate) => candidate.id === wall.storeyId);
      return {
        wallId: wall.id,
        storeyId: wall.storeyId,
        x: sideAxisStart(wall, side),
        y: storey?.elevation ?? 0,
        width: wallLength(wall),
        height: wall.height,
      };
    }),
    openings: project.openings
      .filter((opening) => wallsById.has(opening.wallId))
      .map((opening) => ({
        openingId: opening.id,
        wallId: opening.wallId,
        x: sideAxisStart(wallsById.get(opening.wallId)!, side) + opening.offset,
        y: opening.sillHeight,
        width: opening.width,
        height: opening.height,
      })),
  };
}
