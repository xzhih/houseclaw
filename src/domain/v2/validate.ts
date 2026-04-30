import { resolveAnchor } from "./anchors";
import { isPolygonCCW, isPolygonSimple } from "./polygon";
import type { Anchor, HouseProject } from "./types";

export const MIN_WALL_HEIGHT = 0.5;

export function validateProject(project: HouseProject): string[] {
  const errors: string[] = [];
  const storeyIds = new Set(project.storeys.map((s) => s.id));

  function checkAnchor(anchor: Anchor, label: string): boolean {
    if (anchor.kind === "storey" && !storeyIds.has(anchor.storeyId)) {
      errors.push(`${label} references missing storey: ${anchor.storeyId}`);
      return false;
    }
    return true;
  }

  for (const wall of project.walls) {
    const bottomOk = checkAnchor(wall.bottom, `Wall ${wall.id} bottom anchor`);
    const topOk = checkAnchor(wall.top, `Wall ${wall.id} top anchor`);
    if (!bottomOk || !topOk) continue;
    const bottomZ = resolveAnchor(wall.bottom, project.storeys);
    const topZ = resolveAnchor(wall.top, project.storeys);
    if (topZ < bottomZ) {
      errors.push(`Wall ${wall.id} top below bottom (top=${topZ.toFixed(3)}, bottom=${bottomZ.toFixed(3)})`);
    } else if (topZ - bottomZ < MIN_WALL_HEIGHT) {
      errors.push(`Wall ${wall.id} height ${(topZ - bottomZ).toFixed(3)}m < 0.5m`);
    }
  }

  for (const slab of project.slabs) {
    checkAnchor(slab.top, `Slab ${slab.id} top anchor`);
    if (slab.thickness <= 0) {
      errors.push(`Slab ${slab.id} thickness must be positive (got ${slab.thickness})`);
    }
    if (slab.polygon.length < 3) {
      errors.push(`Slab ${slab.id} polygon must have ≥ 3 vertices (got ${slab.polygon.length})`);
      continue;
    }
    if (!isPolygonSimple(slab.polygon)) {
      errors.push(`Slab ${slab.id} polygon is self-intersecting`);
    }
    if (!isPolygonCCW(slab.polygon)) {
      errors.push(`Slab ${slab.id} polygon must be CCW`);
    }
  }

  for (const roof of project.roofs) {
    checkAnchor(roof.base, `Roof ${roof.id} base anchor`);
    if (roof.edges.length !== roof.polygon.length) {
      errors.push(
        `Roof ${roof.id} edges length ${roof.edges.length} ≠ polygon length ${roof.polygon.length}`,
      );
    }
    if (roof.pitch < Math.PI / 36 || roof.pitch > Math.PI / 3) {
      errors.push(`Roof ${roof.id} pitch ${roof.pitch.toFixed(3)} out of [π/36, π/3]`);
    }
    if (roof.overhang < 0 || roof.overhang > 2) {
      errors.push(`Roof ${roof.id} overhang ${roof.overhang} out of [0, 2]`);
    }
    if (roof.polygon.length < 3) {
      errors.push(`Roof ${roof.id} polygon must have ≥ 3 vertices`);
    } else if (!isPolygonSimple(roof.polygon)) {
      errors.push(`Roof ${roof.id} polygon is self-intersecting`);
    }
  }

  return errors;
}

export function assertValidProject(project: HouseProject): HouseProject {
  const errors = validateProject(project);
  if (errors.length > 0) {
    throw new Error(`Invalid v2 project:\n${errors.join("\n")}`);
  }
  return project;
}
