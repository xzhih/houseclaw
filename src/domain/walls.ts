import type { HouseProject, Point2, Wall } from "./types";

const CANONICAL_SLOT = /^[1-9]\d*$/;

function pickWallMaterialId(project: HouseProject): string {
  const wallMaterial = project.materials.find((material) => material.kind === "wall");
  if (wallMaterial) return wallMaterial.id;
  const fallback = project.materials[0];
  if (fallback) return fallback.id;
  throw new Error("Cannot create wall: project has no materials.");
}

export function nextWallId(project: HouseProject, storeyId: string): string {
  const prefix = `wall-${storeyId}-`;
  const usedSlots = new Set<number>();
  for (const wall of project.walls) {
    if (!wall.id.startsWith(prefix)) continue;
    const raw = wall.id.slice(prefix.length);
    if (!CANONICAL_SLOT.test(raw)) continue;
    usedSlots.add(Number(raw));
  }

  let slot = 1;
  while (usedSlots.has(slot)) slot += 1;
  return `${prefix}${slot}`;
}

export function createWallDraft(
  project: HouseProject,
  storeyId: string,
  start: Point2,
  end: Point2,
): Wall {
  const storey = project.storeys.find((candidate) => candidate.id === storeyId);
  return {
    id: nextWallId(project, storeyId),
    storeyId,
    start,
    end,
    thickness: project.defaultWallThickness,
    height: storey?.height ?? project.defaultStoreyHeight,
    exterior: true,
    materialId: pickWallMaterialId(project),
  };
}
