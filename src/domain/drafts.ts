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

function findFreeCenter(
  total: number,
  occupied: readonly { offset: number; width: number }[],
  newWidth: number,
): number | undefined {
  if (total < newWidth) return undefined;
  const sorted = [...occupied].sort((a, b) => a.offset - b.offset);
  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const item of sorted) {
    if (item.offset > cursor) gaps.push({ start: cursor, end: item.offset });
    cursor = Math.max(cursor, item.offset + item.width);
  }
  if (cursor < total) gaps.push({ start: cursor, end: total });

  const fits = gaps.filter((gap) => gap.end - gap.start >= newWidth);
  if (fits.length === 0) return undefined;
  const largest = fits.reduce((best, gap) =>
    gap.end - gap.start > best.end - best.start ? gap : best,
  );
  return (largest.start + largest.end) / 2;
}

export function findOpeningInsertionCenter(
  wall: Wall,
  type: OpeningType,
  openings: readonly Opening[],
): number | undefined {
  const width = OPENING_DEFAULTS[type].width;
  const occupied = openings.filter((opening) => opening.wallId === wall.id);
  return findFreeCenter(wallLength(wall), occupied, width);
}

export function findBalconyInsertionCenter(
  wall: Wall,
  balconies: readonly Balcony[],
): number | undefined {
  const occupied = balconies.filter((balcony) => balcony.attachedWallId === wall.id);
  return findFreeCenter(wallLength(wall), occupied, BALCONY_DEFAULTS.width);
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
