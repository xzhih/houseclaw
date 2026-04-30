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

  const wallsById = new Map(project.walls.map((w) => [w.id, w]));

  for (const opening of project.openings) {
    const wall = wallsById.get(opening.wallId);
    if (!wall) {
      errors.push(`Opening ${opening.id} references missing wall: ${opening.wallId}`);
      continue;
    }
    // Wall length
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const wallLength = Math.hypot(dx, dy);
    if (opening.offset + opening.width > wallLength + 1e-6) {
      errors.push(
        `Opening ${opening.id} offset+width ${(opening.offset + opening.width).toFixed(3)} exceeds wall length ${wallLength.toFixed(3)}`,
      );
    }
    // Wall vertical height (skip if wall anchors invalid — already flagged above).
    if (wall.bottom.kind === "storey" && !storeyIds.has(wall.bottom.storeyId)) continue;
    if (wall.top.kind === "storey" && !storeyIds.has(wall.top.storeyId)) continue;
    const wallHeight =
      resolveAnchor(wall.top, project.storeys) - resolveAnchor(wall.bottom, project.storeys);
    if (opening.sillHeight + opening.height > wallHeight + 1e-6) {
      errors.push(
        `Opening ${opening.id} sillHeight+height ${(opening.sillHeight + opening.height).toFixed(3)} exceeds wall height ${wallHeight.toFixed(3)}`,
      );
    }
  }

  for (const stair of project.stairs) {
    const fromOk = checkAnchor(stair.from, `Stair ${stair.id} from anchor`);
    const toOk = checkAnchor(stair.to, `Stair ${stair.id} to anchor`);
    if (!fromOk || !toOk) continue;
    const fromZ = resolveAnchor(stair.from, project.storeys);
    const toZ = resolveAnchor(stair.to, project.storeys);
    if (toZ <= fromZ) {
      errors.push(`Stair ${stair.id} to must be above from (from=${fromZ.toFixed(3)}, to=${toZ.toFixed(3)})`);
    }
  }

  for (const balcony of project.balconies) {
    if (!wallsById.has(balcony.attachedWallId)) {
      errors.push(`Balcony ${balcony.id} references missing wall: ${balcony.attachedWallId}`);
    }
    checkAnchor(balcony.slabTop, `Balcony ${balcony.id} slabTop anchor`);
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
