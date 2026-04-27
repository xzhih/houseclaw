import { storeyTop } from "./measurements";
import { assertValidProject } from "./constraints";
import { canBuildRoof } from "./views";
import type { Balcony, HouseProject, Opening, Point2, Roof, RoofEdgeKind, Stair, Storey, Wall } from "./types";

export type OpeningPatch = Partial<Omit<Opening, "id" | "wallId">>;
export type WallPatch = Partial<Omit<Wall, "id" | "storeyId" | "start" | "end">>;
export type BalconyPatch = Partial<Omit<Balcony, "id" | "storeyId" | "attachedWallId">>;
export type StoreyPatch = Partial<Omit<Storey, "id" | "elevation">>;
export type StairPatch = Partial<Omit<Stair, never>>;

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
      if (storey.id !== storeyId || !storey.stair) return storey;
      const stair = storey.stair;
      if (axis === "x") {
        return {
          ...storey,
          stair: {
            ...stair,
            x: scaleAlong(stair.x),
            width: stair.width * factor,
          },
        };
      }
      return {
        ...storey,
        stair: {
          ...stair,
          y: scaleAlong(stair.y),
          depth: stair.depth * factor,
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
      storey.id === storeyId && storey.stair
        ? {
            ...storey,
            stair: {
              ...storey.stair,
              x: storey.stair.x + dx,
              y: storey.stair.y + dy,
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

function nextStoreyNumber(project: HouseProject): number {
  const used = new Set<number>();
  for (const storey of project.storeys) {
    const match = /^(\d+)f$/i.exec(storey.id);
    if (match) used.add(Number(match[1]));
  }
  let n = project.storeys.length + 1;
  while (used.has(n)) n += 1;
  return n;
}

function freshStoreyIdAndLabel(
  project: HouseProject,
): { id: string; label: string } {
  const taken = new Set(project.storeys.map((storey) => storey.id));
  let n = nextStoreyNumber(project);
  while (taken.has(`${n}f`)) n += 1;
  return { id: `${n}f`, label: `${n}F` };
}

function dedupeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function reindexId(
  oldId: string,
  oldStoreyId: string,
  newStoreyId: string,
  taken: Set<string>,
): string {
  const candidate = oldId.includes(oldStoreyId)
    ? oldId.replace(oldStoreyId, newStoreyId)
    : `${oldId}-${newStoreyId}`;
  return dedupeId(candidate, taken);
}

export function addStorey(project: HouseProject): HouseProject {
  const last = project.storeys[project.storeys.length - 1];
  const { id, label } = freshStoreyIdAndLabel(project);
  const elevation = last ? storeyTop(last.elevation, last.height) : 0;
  const storey: Storey = {
    id,
    label,
    elevation,
    height: last?.height ?? project.defaultStoreyHeight,
    slabThickness: last?.slabThickness ?? project.defaultWallThickness,
  };
  return assertValidProject({
    ...project,
    storeys: [...project.storeys, storey],
    roof: undefined,
  });
}

export function duplicateStorey(project: HouseProject, sourceStoreyId: string): HouseProject {
  const source = project.storeys.find((storey) => storey.id === sourceStoreyId);
  if (!source) {
    throw new Error(`Storey ${sourceStoreyId} not found.`);
  }

  const { id: newStoreyId, label: newLabel } = freshStoreyIdAndLabel(project);
  const last = project.storeys[project.storeys.length - 1];
  const elevation = last ? storeyTop(last.elevation, last.height) : 0;

  const wallIdsTaken = new Set(project.walls.map((wall) => wall.id));
  const openingIdsTaken = new Set(project.openings.map((opening) => opening.id));
  const balconyIdsTaken = new Set(project.balconies.map((balcony) => balcony.id));
  const wallIdMap = new Map<string, string>();

  const sourceWalls = project.walls.filter((wall) => wall.storeyId === sourceStoreyId);
  const newWalls: Wall[] = sourceWalls.map((wall) => {
    const newId = reindexId(wall.id, sourceStoreyId, newStoreyId, wallIdsTaken);
    wallIdsTaken.add(newId);
    wallIdMap.set(wall.id, newId);
    return {
      ...wall,
      id: newId,
      storeyId: newStoreyId,
      start: { ...wall.start },
      end: { ...wall.end },
    };
  });

  const sourceWallIds = new Set(sourceWalls.map((wall) => wall.id));
  const newOpenings: Opening[] = project.openings
    .filter((opening) => sourceWallIds.has(opening.wallId))
    .map((opening) => {
      const newId = reindexId(opening.id, sourceStoreyId, newStoreyId, openingIdsTaken);
      openingIdsTaken.add(newId);
      const remappedWallId = wallIdMap.get(opening.wallId);
      if (!remappedWallId) {
        throw new Error(`Cannot duplicate opening ${opening.id}: source wall missing.`);
      }
      return { ...opening, id: newId, wallId: remappedWallId };
    });

  const newBalconies: Balcony[] = project.balconies
    .filter((balcony) => balcony.storeyId === sourceStoreyId)
    .map((balcony) => {
      const newId = reindexId(balcony.id, sourceStoreyId, newStoreyId, balconyIdsTaken);
      balconyIdsTaken.add(newId);
      const remappedWallId = wallIdMap.get(balcony.attachedWallId);
      if (!remappedWallId) {
        throw new Error(`Cannot duplicate balcony ${balcony.id}: source wall missing.`);
      }
      return {
        ...balcony,
        id: newId,
        storeyId: newStoreyId,
        attachedWallId: remappedWallId,
      };
    });

  const newStorey: Storey = {
    id: newStoreyId,
    label: newLabel,
    elevation,
    height: source.height,
    slabThickness: source.slabThickness,
    stair: source.stair ? { ...source.stair } : undefined,
  };

  return assertValidProject({
    ...project,
    storeys: [...project.storeys, newStorey],
    walls: [...project.walls, ...newWalls],
    openings: [...project.openings, ...newOpenings],
    balconies: [...project.balconies, ...newBalconies],
    roof: undefined,
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
    roof: undefined,
  });
}

export function addStair(project: HouseProject, storeyId: string, stair: Stair): HouseProject {
  return assertValidProject({
    ...project,
    storeys: project.storeys.map((storey) =>
      storey.id === storeyId ? { ...storey, stair } : storey,
    ),
  });
}

export function updateStair(project: HouseProject, storeyId: string, patch: StairPatch): HouseProject {
  return assertValidProject({
    ...project,
    storeys: project.storeys.map((storey) => {
      if (storey.id !== storeyId) return storey;
      if (!storey.stair) return storey;
      return { ...storey, stair: { ...storey.stair, ...patch } };
    }),
  });
}

export function removeStair(project: HouseProject, storeyId: string): HouseProject {
  return assertValidProject({
    ...project,
    storeys: project.storeys.map((storey) => {
      if (storey.id !== storeyId) return storey;
      const { stair: _ignored, ...rest } = storey;
      return rest as Storey;
    }),
  });
}

const PITCH_MIN = Math.PI / 36;
const PITCH_MAX = Math.PI / 3;
const OVERHANG_MIN = 0;
const OVERHANG_MAX = 2;
const DEFAULT_PITCH = Math.PI / 6; // 30°
const DEFAULT_OVERHANG = 0.6;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function topStoreyOf(project: HouseProject) {
  return [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
}

export function addRoof(project: HouseProject): HouseProject {
  if (project.roof) throw new Error("Roof already exists.");
  if (!canBuildRoof(project)) throw new Error("Top storey is not a 4-wall axis-aligned rectangle.");
  const top = topStoreyOf(project);
  const topWalls = project.walls.filter((w) => w.storeyId === top.id && w.exterior);
  const lengths = topWalls.map((w) => ({
    wall: w,
    length: Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y),
  }));
  // Sort longest first; tie-break by id for determinism.
  lengths.sort((a, b) => b.length - a.length || a.wall.id.localeCompare(b.wall.id));
  const eaveIds = new Set([lengths[0].wall.id, lengths[1].wall.id]);
  const edges: Record<string, RoofEdgeKind> = {};
  for (const w of topWalls) edges[w.id] = eaveIds.has(w.id) ? "eave" : "gable";

  const roofMaterial =
    project.materials.find((m) => m.kind === "roof") ?? project.materials[0];
  const roof: Roof = {
    edges,
    pitch: DEFAULT_PITCH,
    overhang: DEFAULT_OVERHANG,
    materialId: roofMaterial.id,
  };
  return assertValidProject({ ...project, roof });
}

export function removeRoof(project: HouseProject): HouseProject {
  if (!project.roof) return project;
  return assertValidProject({ ...project, roof: undefined });
}

export function updateRoof(
  project: HouseProject,
  patch: Partial<Pick<Roof, "pitch" | "overhang" | "materialId">>,
): HouseProject {
  if (!project.roof) throw new Error("No roof to update.");
  const next: Roof = {
    ...project.roof,
    ...(patch.pitch !== undefined ? { pitch: clamp(patch.pitch, PITCH_MIN, PITCH_MAX) } : {}),
    ...(patch.overhang !== undefined ? { overhang: clamp(patch.overhang, OVERHANG_MIN, OVERHANG_MAX) } : {}),
    ...(patch.materialId !== undefined ? { materialId: patch.materialId } : {}),
  };
  return assertValidProject({ ...project, roof: next });
}

export function toggleRoofEdge(project: HouseProject, wallId: string): HouseProject {
  if (!project.roof) throw new Error("No roof to toggle.");
  const flipped: RoofEdgeKind = project.roof.edges[wallId] === "eave" ? "gable" : "eave";
  const top = topStoreyOf(project);
  const topWalls = project.walls.filter((w) => w.storeyId === top.id && w.exterior);
  const nextEdges = { ...project.roof.edges, [wallId]: flipped };
  // Recount effective eaves (apply edge-resolution rule).
  const effectiveEaves = topWalls.filter((w) => nextEdges[w.id] === "eave").length;
  if (effectiveEaves === 0) throw new Error("Roof must keep at least one eave.");
  return assertValidProject({ ...project, roof: { ...project.roof, edges: nextEdges } });
}
