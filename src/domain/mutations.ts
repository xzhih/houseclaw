import { storeyTop } from "./measurements";
import { assertValidProject } from "./constraints";
import type { Balcony, HouseProject, Opening, Storey, Wall } from "./types";

export type OpeningPatch = Partial<Omit<Opening, "id" | "wallId">>;
export type WallPatch = Partial<Omit<Wall, "id" | "storeyId" | "start" | "end">>;
export type BalconyPatch = Partial<Omit<Balcony, "id" | "storeyId" | "attachedWallId">>;
export type StoreyPatch = Partial<Omit<Storey, "id" | "elevation">>;

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

export function updateWall(project: HouseProject, wallId: string, patch: WallPatch): HouseProject {
  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) => (wall.id === wallId ? { ...wall, ...patch } : wall)),
  });
}

export function updateBalcony(project: HouseProject, balconyId: string, patch: BalconyPatch): HouseProject {
  return assertValidProject({
    ...project,
    balconies: project.balconies.map((balcony) =>
      balcony.id === balconyId ? { ...balcony, ...patch } : balcony,
    ),
  });
}

export function updateStorey(project: HouseProject, storeyId: string, patch: StoreyPatch): HouseProject {
  if (patch.height !== undefined) {
    if (!Number.isFinite(patch.height) || patch.height <= 0) {
      throw new Error(`Storey ${storeyId} height must be positive.`);
    }
  }

  let nextElevation = 0;
  const storeys = project.storeys.map((storey) => {
    const next: Storey = {
      ...storey,
      ...(storey.id === storeyId ? patch : {}),
      elevation: nextElevation,
    };
    nextElevation = storeyTop(nextElevation, next.height);
    return next;
  });

  const heightChanged = patch.height !== undefined;
  const walls = heightChanged
    ? project.walls.map((wall) => (wall.storeyId === storeyId ? { ...wall, height: patch.height! } : wall))
    : project.walls;

  return assertValidProject({ ...project, storeys, walls });
}

export function setStoreyHeight(project: HouseProject, storeyId: string, height: number): HouseProject {
  return updateStorey(project, storeyId, { height });
}

export function applyWallMaterial(project: HouseProject, wallId: string, materialId: string): HouseProject {
  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) => (wall.id === wallId ? { ...wall, materialId } : wall)),
  });
}
