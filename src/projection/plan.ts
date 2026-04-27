import { computeStairConfig } from "../domain/stairs";
import type { HouseProject, Stair } from "../domain/types";
import type { PlanProjection, PlanStairSymbol } from "./types";

const STAIR_FALLBACK_COLOR = "#b58a64";

function colorForStair(project: HouseProject, stair: Stair): string {
  return project.materials.find((m) => m.id === stair.materialId)?.color ?? STAIR_FALLBACK_COLOR;
}

export function projectPlanView(project: HouseProject, storeyId: string): PlanProjection {
  const walls = project.walls.filter((wall) => wall.storeyId === storeyId);
  const wallIds = new Set(walls.map((wall) => wall.id));

  const sortedStoreys = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const currentIdx = sortedStoreys.findIndex((s) => s.id === storeyId);
  const currentStorey = currentIdx >= 0 ? sortedStoreys[currentIdx] : undefined;
  const upperStorey = currentIdx >= 0 ? sortedStoreys[currentIdx + 1] : undefined;

  const stairs: PlanStairSymbol[] = [];

  if (currentStorey?.stair) {
    const cfg = computeStairConfig(currentStorey.height, currentStorey.stair.treadDepth);
    stairs.push({
      storeyId: currentStorey.id,
      half: "upper",
      rect: {
        x: currentStorey.stair.x,
        y: currentStorey.stair.y,
        width: currentStorey.stair.width,
        depth: currentStorey.stair.depth,
      },
      shape: currentStorey.stair.shape,
      bottomEdge: currentStorey.stair.bottomEdge,
      treadDepth: currentStorey.stair.treadDepth,
      treadCount: cfg.treadCount,
      turn: currentStorey.stair.turn,
      color: colorForStair(project, currentStorey.stair),
    });
  }

  if (upperStorey?.stair) {
    const cfg = computeStairConfig(upperStorey.height, upperStorey.stair.treadDepth);
    stairs.push({
      storeyId: upperStorey.id,
      half: "lower",
      rect: {
        x: upperStorey.stair.x,
        y: upperStorey.stair.y,
        width: upperStorey.stair.width,
        depth: upperStorey.stair.depth,
      },
      shape: upperStorey.stair.shape,
      bottomEdge: upperStorey.stair.bottomEdge,
      treadDepth: upperStorey.stair.treadDepth,
      treadCount: cfg.treadCount,
      turn: upperStorey.stair.turn,
      color: colorForStair(project, upperStorey.stair),
    });
  }

  return {
    viewId: `plan-${storeyId}`,
    wallSegments: walls.map((wall) => ({
      wallId: wall.id,
      start: { ...wall.start },
      end: { ...wall.end },
      thickness: wall.thickness,
    })),
    openings: project.openings
      .filter((opening) => wallIds.has(opening.wallId))
      .map((opening) => ({
        openingId: opening.id,
        wallId: opening.wallId,
        offset: opening.offset,
        width: opening.width,
      })),
    balconies: project.balconies
      .filter((balcony) => balcony.storeyId === storeyId && wallIds.has(balcony.attachedWallId))
      .map((balcony) => ({
        balconyId: balcony.id,
        wallId: balcony.attachedWallId,
        offset: balcony.offset,
        width: balcony.width,
        depth: balcony.depth,
      })),
    stairs,
  };
}
