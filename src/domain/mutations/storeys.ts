import { assertValidProject } from "../validate";
import type { HouseProject, Storey } from "../types";
import { EntityNotFoundError, EntityStateError } from "./errors";

const DEFAULT_STOREY_HEIGHT = 3.2;

function findStorey(project: HouseProject, storeyId: string): Storey {
  const s = project.storeys.find((x) => x.id === storeyId);
  if (!s) throw new EntityNotFoundError("storey", storeyId);
  return s;
}

function generateStoreyId(existing: readonly string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`s${n}`)) n += 1;
  return `s${n}`;
}

export function setStoreyLabel(
  project: HouseProject,
  storeyId: string,
  label: string,
): HouseProject {
  findStorey(project, storeyId);
  const storeys = project.storeys.map((s) =>
    s.id === storeyId ? { ...s, label } : s,
  );
  return assertValidProject({ ...project, storeys });
}

export function setStoreyElevation(
  project: HouseProject,
  storeyId: string,
  elevation: number,
): HouseProject {
  findStorey(project, storeyId);
  const storeys = project.storeys.map((s) =>
    s.id === storeyId ? { ...s, elevation } : s,
  );
  return assertValidProject({ ...project, storeys });
}

/** Swap the elevations of two storeys atomically — the way "reorder" is
 *  modeled in HouseClaw, since z is the only physical ordering. Walls/slabs
 *  anchored to the storeys move with them. Throws if the swap would
 *  produce an invalid project (e.g. a wall whose top anchor sat on the
 *  higher of the two storeys and bottom on the lower would invert). */
export function swapStoreyElevations(
  project: HouseProject,
  aId: string,
  bId: string,
): HouseProject {
  if (aId === bId) return project;
  const a = findStorey(project, aId);
  const b = findStorey(project, bId);
  const storeys = project.storeys.map((s) => {
    if (s.id === a.id) return { ...s, elevation: b.elevation };
    if (s.id === b.id) return { ...s, elevation: a.elevation };
    return s;
  });
  return assertValidProject({ ...project, storeys });
}

/** Edit "this storey's height" = adjust the next storey's elevation + cascade
 *  every storey above by the same delta. */
export function setStoreyHeight(
  project: HouseProject,
  storeyId: string,
  newHeight: number,
): HouseProject {
  const sorted = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const idx = sorted.findIndex((s) => s.id === storeyId);
  if (idx === -1) throw new EntityNotFoundError("storey", storeyId);
  if (idx === sorted.length - 1) {
    throw new EntityStateError("Storey is topmost — no height to set");
  }
  const current = sorted[idx];
  const next = sorted[idx + 1];
  const currentHeight = next.elevation - current.elevation;
  const delta = newHeight - currentHeight;
  const shiftedIds = new Set(sorted.slice(idx + 1).map((s) => s.id));
  const storeys = project.storeys.map((s) =>
    shiftedIds.has(s.id) ? { ...s, elevation: s.elevation + delta } : s,
  );
  return assertValidProject({ ...project, storeys });
}

export function addStorey(project: HouseProject, label?: string): HouseProject {
  const sorted = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const top = sorted[sorted.length - 1];
  const newId = generateStoreyId(project.storeys.map((s) => s.id));
  const newElevation = top
    ? top.elevation + DEFAULT_STOREY_HEIGHT
    : 0;
  const newLabel = label ?? `${project.storeys.length + 1}F`;
  const storeys = [
    ...project.storeys,
    { id: newId, label: newLabel, elevation: newElevation },
  ];
  return assertValidProject({ ...project, storeys });
}

export function removeStorey(project: HouseProject, storeyId: string): HouseProject {
  findStorey(project, storeyId);
  const referencedByAnchor = (anchor: { kind: string; storeyId?: string }): boolean =>
    anchor.kind === "storey" && anchor.storeyId === storeyId;
  const refCounts: Record<string, number> = {};
  const wallCount = project.walls.filter(
    (w) => referencedByAnchor(w.bottom) || referencedByAnchor(w.top),
  ).length;
  const slabCount = project.slabs.filter((s) => referencedByAnchor(s.top)).length;
  const roofCount = project.roofs.filter((r) => referencedByAnchor(r.base)).length;
  const balconyCount = project.balconies.filter((b) => referencedByAnchor(b.slabTop)).length;
  const stairCount = project.stairs.filter(
    (st) => referencedByAnchor(st.from) || referencedByAnchor(st.to),
  ).length;
  if (wallCount) refCounts["墙"] = wallCount;
  if (slabCount) refCounts["楼板"] = slabCount;
  if (roofCount) refCounts["屋顶"] = roofCount;
  if (balconyCount) refCounts["阳台"] = balconyCount;
  if (stairCount) refCounts["楼梯"] = stairCount;
  if (Object.keys(refCounts).length > 0) {
    const detail = Object.entries(refCounts)
      .map(([kind, n]) => `${n} 个${kind}`)
      .join("、");
    throw new EntityStateError(
      `楼层 ${storeyId} 仍被 ${detail} 引用，先删除或改锚定后再删`,
    );
  }
  const storeys = project.storeys.filter((s) => s.id !== storeyId);
  return assertValidProject({ ...project, storeys });
}
