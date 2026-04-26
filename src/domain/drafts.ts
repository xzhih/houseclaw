import { wallLength } from "./measurements";
import type { Balcony, HouseProject, Opening, OpeningType, Wall } from "./types";

const ID_SLOT = /^[1-9]\d*$/;

const OPENING_DEFAULTS: Record<OpeningType, { width: number; height: number; sillHeight: number }> = {
  door: { width: 0.9, height: 2.1, sillHeight: 0 },
  window: { width: 1.2, height: 1.4, sillHeight: 0.9 },
  void: { width: 1.0, height: 2.0, sillHeight: 0 },
};

const BALCONY_DEFAULTS = {
  width: 2.0,
  depth: 1.2,
  slabThickness: 0.15,
  railingHeight: 1.1,
};

function pickWallMaterialId(project: HouseProject): string {
  return (
    project.materials.find((material) => material.kind === "wall")?.id ??
    project.materials[0]?.id ??
    ""
  );
}

function pickFrameMaterialId(project: HouseProject): string {
  return (
    project.materials.find((material) => material.kind === "frame")?.id ??
    project.materials.find((material) => material.kind === "wall")?.id ??
    project.materials[0]?.id ??
    ""
  );
}

function nextSlotId(prefix: string, existingIds: readonly string[]): string {
  const used = new Set<number>();
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const raw = id.slice(prefix.length);
    if (!ID_SLOT.test(raw)) continue;
    used.add(Number(raw));
  }
  let slot = 1;
  while (used.has(slot)) slot += 1;
  return `${prefix}${slot}`;
}

export function nextOpeningId(project: HouseProject, type: OpeningType, wallId: string): string {
  return nextSlotId(
    `${type}-${wallId}-`,
    project.openings.map((opening) => opening.id),
  );
}

export function nextBalconyId(project: HouseProject, storeyId: string): string {
  return nextSlotId(
    `balcony-${storeyId}-`,
    project.balconies.map((balcony) => balcony.id),
  );
}

function clampOffset(centerOffset: number, total: number, width: number): number {
  const maxOffset = Math.max(0, total - width);
  return Math.max(0, Math.min(maxOffset, centerOffset - width / 2));
}

export function createOpeningDraft(
  project: HouseProject,
  wall: Wall,
  type: OpeningType,
  centerOffset: number,
): Opening {
  const defaults = OPENING_DEFAULTS[type];
  return {
    id: nextOpeningId(project, type, wall.id),
    wallId: wall.id,
    type,
    offset: clampOffset(centerOffset, wallLength(wall), defaults.width),
    width: defaults.width,
    height: defaults.height,
    sillHeight: defaults.sillHeight,
    frameMaterialId: pickFrameMaterialId(project),
  };
}

export function createBalconyDraft(project: HouseProject, wall: Wall, centerOffset: number): Balcony {
  return {
    id: nextBalconyId(project, wall.storeyId),
    storeyId: wall.storeyId,
    attachedWallId: wall.id,
    offset: clampOffset(centerOffset, wallLength(wall), BALCONY_DEFAULTS.width),
    width: BALCONY_DEFAULTS.width,
    depth: BALCONY_DEFAULTS.depth,
    slabThickness: BALCONY_DEFAULTS.slabThickness,
    railingHeight: BALCONY_DEFAULTS.railingHeight,
    materialId: pickWallMaterialId(project),
    railingMaterialId: pickFrameMaterialId(project),
  };
}
