import { wallLength } from "../domain/measurements";
import type { HouseProject, Wall } from "../domain/types";
import type { ElevationProjection, ElevationSide } from "./types";

function sideWallPredicate(project: HouseProject, side: ElevationSide): (wall: Wall) => boolean {
  const allPoints = project.walls.flatMap((wall) => [wall.start, wall.end]);
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));

  return (wall: Wall) => {
    const horizontal = wall.start.y === wall.end.y;
    const vertical = wall.start.x === wall.end.x;
    if (side === "front") return horizontal && wall.start.y === minY && wall.end.y === minY;
    if (side === "back") return horizontal && wall.start.y === maxY && wall.end.y === maxY;
    if (side === "left") return vertical && wall.start.x === minX && wall.end.x === minX;
    return vertical && wall.start.x === maxX && wall.end.x === maxX;
  };
}

export function projectElevationView(
  project: HouseProject,
  side: ElevationSide,
): ElevationProjection {
  const isSideWall = sideWallPredicate(project, side);
  const walls = project.walls.filter(isSideWall);
  const wallIds = new Set(walls.map((wall) => wall.id));

  return {
    viewId: `elevation-${side}` as ElevationProjection["viewId"],
    side,
    wallBands: walls.map((wall) => {
      const storey = project.storeys.find((candidate) => candidate.id === wall.storeyId);
      return {
        wallId: wall.id,
        storeyId: wall.storeyId,
        x: 0,
        y: storey?.elevation ?? 0,
        width: wallLength(wall),
        height: wall.height,
      };
    }),
    openings: project.openings
      .filter((opening) => wallIds.has(opening.wallId))
      .map((opening) => ({
        openingId: opening.id,
        wallId: opening.wallId,
        x: opening.offset,
        y: opening.sillHeight,
        width: opening.width,
        height: opening.height,
      })),
  };
}
