import { resolveAnchor } from "./anchors";
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

  return errors;
}

export function assertValidProject(project: HouseProject): HouseProject {
  const errors = validateProject(project);
  if (errors.length > 0) {
    throw new Error(`Invalid v2 project:\n${errors.join("\n")}`);
  }
  return project;
}
