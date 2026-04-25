import { wallLength } from "./measurements";
import type { HouseProject } from "./types";

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function validateProject(project: HouseProject): string[] {
  const errors: string[] = [];
  const storeyIds = new Set(project.storeys.map((storey) => storey.id));
  const materialIds = new Set(project.materials.map((material) => material.id));
  const wallsById = new Map(project.walls.map((wall) => [wall.id, wall]));

  for (const wall of project.walls) {
    if (!storeyIds.has(wall.storeyId)) {
      errors.push(`Wall ${wall.id} references missing storey ${wall.storeyId}.`);
    }

    if (!materialIds.has(wall.materialId)) {
      errors.push(`Wall ${wall.id} references missing material ${wall.materialId}.`);
    }

    if (!isPositive(wallLength(wall))) {
      errors.push(`Wall ${wall.id} must have positive length.`);
    }

    if (!isPositive(wall.thickness)) {
      errors.push(`Wall ${wall.id} must have positive thickness.`);
    }

    if (!isPositive(wall.height)) {
      errors.push(`Wall ${wall.id} must have positive height.`);
    }
  }

  for (const opening of project.openings) {
    const wall = wallsById.get(opening.wallId);

    if (!wall) {
      errors.push(`Opening ${opening.id} references missing wall ${opening.wallId}.`);
    }

    if (!isNonNegative(opening.offset)) {
      errors.push(`Opening ${opening.id} offset must be non-negative.`);
    }

    if (!isPositive(opening.width)) {
      errors.push(`Opening ${opening.id} width must be positive.`);
    }

    if (!isPositive(opening.height)) {
      errors.push(`Opening ${opening.id} height must be positive.`);
    }

    if (wall && opening.offset + opening.width > wallLength(wall)) {
      errors.push(`Opening ${opening.id} exceeds wall ${opening.wallId} length.`);
    }

    if (!isNonNegative(opening.sillHeight)) {
      errors.push(`Opening ${opening.id} sill height must be non-negative.`);
    }

    if (wall && opening.sillHeight + opening.height > wall.height) {
      errors.push(`Opening ${opening.id} exceeds wall ${opening.wallId} height.`);
    }

    if (!materialIds.has(opening.frameMaterialId)) {
      errors.push(`Opening ${opening.id} references missing frame material ${opening.frameMaterialId}.`);
    }
  }

  return errors;
}

export function assertValidProject(project: HouseProject): HouseProject {
  const errors = validateProject(project);

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return project;
}
