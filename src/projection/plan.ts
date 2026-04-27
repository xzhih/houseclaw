import { computeStairConfig } from "../domain/stairs";
import type { HouseProject } from "../domain/types";
import type { PlanProjection, PlanStairSymbol } from "./types";

export function projectPlanView(project: HouseProject, storeyId: string): PlanProjection {
  const walls = project.walls.filter((wall) => wall.storeyId === storeyId);
  const wallIds = new Set(walls.map((wall) => wall.id));

  const sortedStoreys = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const currentIdx = sortedStoreys.findIndex((s) => s.id === storeyId);
  const currentStorey = currentIdx >= 0 ? sortedStoreys[currentIdx] : undefined;
  const lowerStorey = currentIdx > 0 ? sortedStoreys[currentIdx - 1] : undefined;
  const upperStorey =
    currentIdx >= 0 && currentIdx + 1 < sortedStoreys.length
      ? sortedStoreys[currentIdx + 1]
      : undefined;

  const stairs: PlanStairSymbol[] = [];

  // Own stair: the going-up stair starting at this storey. Show as lower half (UP).
  if (currentStorey?.stair && upperStorey) {
    const climb = upperStorey.elevation - currentStorey.elevation;
    const cfg = computeStairConfig(climb, upperStorey.slabThickness, currentStorey.stair.treadDepth);
    stairs.push({
      storeyId: currentStorey.id,
      half: "lower",
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
      rotation: currentStorey.stair.rotation ?? 0,
      center: {
        x: currentStorey.stair.x + currentStorey.stair.width / 2,
        y: currentStorey.stair.y + currentStorey.stair.depth / 2,
      },
    });
  }

  // Lower neighbor's stair: it climbs up to me. Show as upper half (DN).
  if (lowerStorey?.stair && currentStorey) {
    const climb = currentStorey.elevation - lowerStorey.elevation;
    const cfg = computeStairConfig(climb, currentStorey.slabThickness, lowerStorey.stair.treadDepth);
    stairs.push({
      storeyId: lowerStorey.id,
      half: "upper",
      rect: {
        x: lowerStorey.stair.x,
        y: lowerStorey.stair.y,
        width: lowerStorey.stair.width,
        depth: lowerStorey.stair.depth,
      },
      shape: lowerStorey.stair.shape,
      bottomEdge: lowerStorey.stair.bottomEdge,
      treadDepth: lowerStorey.stair.treadDepth,
      treadCount: cfg.treadCount,
      turn: lowerStorey.stair.turn,
      rotation: lowerStorey.stair.rotation ?? 0,
      center: {
        x: lowerStorey.stair.x + lowerStorey.stair.width / 2,
        y: lowerStorey.stair.y + lowerStorey.stair.depth / 2,
      },
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
        type: opening.type,
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
