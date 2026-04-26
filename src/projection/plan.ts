import type { HouseProject } from "../domain/types";
import type { PlanProjection } from "./types";

export function projectPlanView(project: HouseProject, storeyId: string): PlanProjection {
  const walls = project.walls.filter((wall) => wall.storeyId === storeyId);
  const wallIds = new Set(walls.map((wall) => wall.id));

  return {
    viewId: `plan-${storeyId}`,
    wallSegments: walls.map((wall) => ({
      wallId: wall.id,
      start: { ...wall.start },
      end: { ...wall.end },
      thickness: wall.thickness,
    })),
    openings: project.openings
      .filter((opening) => wallIds.has(opening.wallId))
      .map((opening) => ({
        openingId: opening.id,
        wallId: opening.wallId,
        offset: opening.offset,
        width: opening.width,
      })),
    balconies: project.balconies
      .filter((balcony) => balcony.storeyId === storeyId && wallIds.has(balcony.attachedWallId))
      .map((balcony) => ({
        balconyId: balcony.id,
        wallId: balcony.attachedWallId,
        offset: balcony.offset,
        width: balcony.width,
        depth: balcony.depth,
      })),
  };
}
