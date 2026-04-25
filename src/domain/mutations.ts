import { storeyTop } from "./measurements";
import { assertValidProject } from "./constraints";
import type { HouseProject, Opening, Wall } from "./types";

export type OpeningPatch = Partial<Omit<Opening, "id" | "wallId">>;
type UnsafeOpeningPatch = OpeningPatch & Partial<Pick<Opening, "id" | "wallId">>;

export function addWall(project: HouseProject, wall: Wall): HouseProject {
  return assertValidProject({
    ...project,
    walls: [...project.walls, wall],
  });
}

export function addOpening(project: HouseProject, opening: Opening): HouseProject {
  return assertValidProject({
    ...project,
    openings: [...project.openings, opening],
  });
}

export function updateOpening(project: HouseProject, openingId: string, patch: OpeningPatch): HouseProject {
  const { id: _ignoredId, wallId: _ignoredWallId, ...allowedPatch } = patch as UnsafeOpeningPatch;

  return assertValidProject({
    ...project,
    openings: project.openings.map((opening) => (opening.id === openingId ? { ...opening, ...allowedPatch } : opening)),
  });
}

export function setStoreyHeight(project: HouseProject, storeyId: string, height: number): HouseProject {
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`Storey ${storeyId} height must be positive.`);
  }

  let nextElevation = 0;
  const storeys = project.storeys.map((storey) => {
    const nextStorey = {
      ...storey,
      elevation: nextElevation,
      height: storey.id === storeyId ? height : storey.height,
    };
    nextElevation = storeyTop(nextStorey.elevation, nextStorey.height);
    return nextStorey;
  });

  return assertValidProject({
    ...project,
    storeys,
    walls: project.walls.map((wall) => (wall.storeyId === storeyId ? { ...wall, height } : wall)),
  });
}

export function applyWallMaterial(project: HouseProject, wallId: string, materialId: string): HouseProject {
  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) => (wall.id === wallId ? { ...wall, materialId } : wall)),
  });
}
