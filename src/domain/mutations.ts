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

export function resizeStoreyExtent(
  project: HouseProject,
  storeyId: string,
  axis: "x" | "y",
  newSize: number,
): HouseProject {
  if (!Number.isFinite(newSize) || newSize <= 0) {
    throw new Error(`Storey ${storeyId} ${axis} extent must be positive.`);
  }

  const storeyWalls = project.walls.filter((wall) => wall.storeyId === storeyId);
  if (storeyWalls.length === 0) return project;

  const coords = storeyWalls.flatMap((wall) =>
    axis === "x" ? [wall.start.x, wall.end.x] : [wall.start.y, wall.end.y],
  );
  const minCoord = Math.min(...coords);
  const maxCoord = Math.max(...coords);
  const oldSize = maxCoord - minCoord;
  if (oldSize <= 0) {
    throw new Error(`Storey ${storeyId} has zero ${axis} extent and cannot be resized.`);
  }

  const factor = newSize / oldSize;
  if (factor === 1) return project;

  const scaleAlong = (value: number) => minCoord + (value - minCoord) * factor;

  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) => {
      if (wall.storeyId !== storeyId) return wall;
      if (axis === "x") {
        return {
          ...wall,
          start: { x: scaleAlong(wall.start.x), y: wall.start.y },
          end: { x: scaleAlong(wall.end.x), y: wall.end.y },
        };
      }
      return {
        ...wall,
        start: { x: wall.start.x, y: scaleAlong(wall.start.y) },
        end: { x: wall.end.x, y: scaleAlong(wall.end.y) },
      };
    }),
    storeys: project.storeys.map((storey) => {
      if (storey.id !== storeyId || !storey.stairOpening) return storey;
      const opening = storey.stairOpening;
      if (axis === "x") {
        return {
          ...storey,
          stairOpening: {
            ...opening,
            x: scaleAlong(opening.x),
            width: opening.width * factor,
          },
        };
      }
      return {
        ...storey,
        stairOpening: {
          ...opening,
          y: scaleAlong(opening.y),
          depth: opening.depth * factor,
        },
      };
    }),
  });
}

export function translateStorey(
  project: HouseProject,
  storeyId: string,
  dx: number,
  dy: number,
): HouseProject {
  if (dx === 0 && dy === 0) return project;
  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) =>
      wall.storeyId === storeyId
        ? {
            ...wall,
            start: { x: wall.start.x + dx, y: wall.start.y + dy },
            end: { x: wall.end.x + dx, y: wall.end.y + dy },
          }
        : wall,
    ),
    storeys: project.storeys.map((storey) =>
      storey.id === storeyId && storey.stairOpening
        ? {
            ...storey,
            stairOpening: {
              ...storey.stairOpening,
              x: storey.stairOpening.x + dx,
              y: storey.stairOpening.y + dy,
            },
          }
        : storey,
    ),
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

export function removeStorey(project: HouseProject, storeyId: string): HouseProject {
  if (project.storeys.length <= 1) {
    throw new Error("Cannot remove the last storey.");
  }
  if (!project.storeys.some((storey) => storey.id === storeyId)) {
    return project;
  }

  const remainingWalls = project.walls.filter((wall) => wall.storeyId !== storeyId);
  const remainingWallIds = new Set(remainingWalls.map((wall) => wall.id));
  const remainingOpenings = project.openings.filter((opening) =>
    remainingWallIds.has(opening.wallId),
  );
  const remainingBalconies = project.balconies.filter(
    (balcony) =>
      balcony.storeyId !== storeyId && remainingWallIds.has(balcony.attachedWallId),
  );

  let nextElevation = 0;
  const remainingStoreys = project.storeys
    .filter((storey) => storey.id !== storeyId)
    .map((storey) => {
      const next: Storey = { ...storey, elevation: nextElevation };
      nextElevation = storeyTop(nextElevation, next.height);
      return next;
    });

  return assertValidProject({
    ...project,
    storeys: remainingStoreys,
    walls: remainingWalls,
    openings: remainingOpenings,
    balconies: remainingBalconies,
  });
}
