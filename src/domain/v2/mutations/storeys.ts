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
  const used =
    project.walls.some(
      (w) => referencedByAnchor(w.bottom) || referencedByAnchor(w.top),
    ) ||
    project.slabs.some((s) => referencedByAnchor(s.top)) ||
    project.roofs.some((r) => referencedByAnchor(r.base)) ||
    project.balconies.some((b) => referencedByAnchor(b.slabTop)) ||
    project.stairs.some(
      (st) => referencedByAnchor(st.from) || referencedByAnchor(st.to),
    );
  if (used) {
    throw new EntityStateError(`Storey ${storeyId} is in use by anchored objects`);
  }
  const storeys = project.storeys.filter((s) => s.id !== storeyId);
  return assertValidProject({ ...project, storeys });
}
