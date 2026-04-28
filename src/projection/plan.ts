import { computeStairConfig } from "../domain/stairs";
import { buildSkirtGeometry } from "../geometry/skirtGeometry";
import type { HouseProject } from "../domain/types";
import type { PlanProjection, PlanSkirtRect, PlanStairSymbol } from "./types";

function planSkirtRectsForStorey(project: HouseProject, storeyId: string): PlanSkirtRect[] {
  return project.skirts.flatMap((skirt) => {
    const wall = project.walls.find((w) => w.id === skirt.hostWallId);
    if (!wall || wall.storeyId !== storeyId) return [];
    const geom = buildSkirtGeometry(skirt, wall);
    // Drop z; use panel's 4 vertices in plan (x,y) space.
    const verts = geom.panel.vertices.map((v) => ({ x: v.x, y: v.y }));
    return [{ skirtId: skirt.id, hostWallId: skirt.hostWallId, vertices: verts }];
  });
}

export function projectPlanView(project: HouseProject, storeyId: string): PlanProjection {
  const walls = project.walls.filter((wall) => wall.storeyId === storeyId);
  const wallIds = new Set(walls.map((wall) => wall.id));

  const sortedStoreys = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const currentIdx = sortedStoreys.findIndex((s) => s.id === storeyId);
  const currentStorey = currentIdx >= 0 ? sortedStoreys[currentIdx] : undefined;
  const upperStorey =
    currentIdx >= 0 && currentIdx + 1 < sortedStoreys.length
      ? sortedStoreys[currentIdx + 1]
      : undefined;

  const stairs: PlanStairSymbol[] = [];

  // Each plan view shows ONLY this storey's own up-stair. We deliberately do
  // not project the lower neighbor's stair as a DN hole on this floor — the
  // designer can mentally reconcile, and hiding it lets each storey place its
  // own stair without visual clash from below.
  if (currentStorey?.stair && upperStorey) {
    const climb = upperStorey.elevation - currentStorey.elevation;
    const cfg = computeStairConfig(climb, upperStorey.slabThickness, currentStorey.stair.treadDepth);
    stairs.push({
      storeyId: currentStorey.id,
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
    skirts: planSkirtRectsForStorey(project, storeyId),
  };
}
