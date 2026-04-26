import { storeyTop } from "./measurements";
import { assertValidProject } from "./constraints";
import type { Balcony, HouseProject, Opening, Point2, Storey, Wall } from "./types";

export type OpeningPatch = Partial<Omit<Opening, "id" | "wallId">>;
export type WallPatch = Partial<Omit<Wall, "id" | "storeyId" | "start" | "end">>;
export type BalconyPatch = Partial<Omit<Balcony, "id" | "storeyId" | "attachedWallId">>;
export type StoreyPatch = Partial<Omit<Storey, "id" | "elevation">>;

type UnsafeOpeningPatch = OpeningPatch & Partial<Pick<Opening, "id" | "wallId">>;
type UnsafeWallPatch = WallPatch & Partial<Pick<Wall, "id" | "storeyId" | "start" | "end">>;
type UnsafeBalconyPatch = BalconyPatch & Partial<Pick<Balcony, "id" | "storeyId" | "attachedWallId">>;
type UnsafeStoreyPatch = StoreyPatch & Partial<Pick<Storey, "id" | "elevation">>;

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

export function addBalcony(project: HouseProject, balcony: Balcony): HouseProject {
  return assertValidProject({
    ...project,
    balconies: [...project.balconies, balcony],
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
  const {
    id: _ignoredId,
    storeyId: _ignoredStoreyId,
    start: _ignoredStart,
    end: _ignoredEnd,
    ...allowedPatch
  } = patch as UnsafeWallPatch;

  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) => (wall.id === wallId ? { ...wall, ...allowedPatch } : wall)),
  });
}

export function updateBalcony(project: HouseProject, balconyId: string, patch: BalconyPatch): HouseProject {
  const {
    id: _ignoredId,
    storeyId: _ignoredStoreyId,
    attachedWallId: _ignoredAttachedWallId,
    ...allowedPatch
  } = patch as UnsafeBalconyPatch;

  return assertValidProject({
    ...project,
    balconies: project.balconies.map((balcony) =>
      balcony.id === balconyId ? { ...balcony, ...allowedPatch } : balcony,
    ),
  });
}

export function updateStorey(project: HouseProject, storeyId: string, patch: StoreyPatch): HouseProject {
  const { id: _ignoredId, elevation: _ignoredElevation, ...allowedPatch } = patch as UnsafeStoreyPatch;
  const nextHeight = allowedPatch.height;

  if (nextHeight !== undefined && (!Number.isFinite(nextHeight) || nextHeight <= 0)) {
    throw new Error(`Storey ${storeyId} height must be positive.`);
  }

  let nextElevation = 0;
  const storeys = project.storeys.map((storey) => {
    const next: Storey = {
      ...storey,
      ...(storey.id === storeyId ? allowedPatch : {}),
      elevation: nextElevation,
    };
    nextElevation = storeyTop(nextElevation, next.height);
    return next;
  });

  const walls =
    nextHeight !== undefined
      ? project.walls.map((wall) => (wall.storeyId === storeyId ? { ...wall, height: nextHeight } : wall))
      : project.walls;

  return assertValidProject({ ...project, storeys, walls });
}

export function applyWallMaterial(project: HouseProject, wallId: string, materialId: string): HouseProject {
  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) => (wall.id === wallId ? { ...wall, materialId } : wall)),
  });
}

export function moveWall(project: HouseProject, wallId: string, start: Point2, end: Point2): HouseProject {
  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) => (wall.id === wallId ? { ...wall, start, end } : wall)),
  });
}

export function removeWall(project: HouseProject, wallId: string): HouseProject {
  return assertValidProject({
    ...project,
    walls: project.walls.filter((wall) => wall.id !== wallId),
    openings: project.openings.filter((opening) => opening.wallId !== wallId),
    balconies: project.balconies.filter((balcony) => balcony.attachedWallId !== wallId),
  });
}

export function removeOpening(project: HouseProject, openingId: string): HouseProject {
  return assertValidProject({
    ...project,
    openings: project.openings.filter((opening) => opening.id !== openingId),
  });
}

export function removeBalcony(project: HouseProject, balconyId: string): HouseProject {
  return assertValidProject({
    ...project,
    balconies: project.balconies.filter((balcony) => balcony.id !== balconyId),
  });
}
