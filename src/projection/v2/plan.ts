import { resolveAnchor } from "../../domain/v2/anchors";
import type { HouseProject, Storey } from "../../domain/v2/types";
import { computeStairConfig } from "../../domain/v2/stairs";
import type {
  PlanBalconyGlyphV2,
  PlanOpeningGlyphV2,
  PlanProjectionV2,
  PlanSlabOutline,
  PlanStairSymbolV2,
  PlanWallSegmentV2,
} from "./types";

export const PLAN_CUT_HEIGHT = 1.2;
const STOREY_MATCH_EPS = 0.05;
const FALLBACK_SLAB_THICKNESS = 0.18;

function getStorey(project: HouseProject, storeyId: string): Storey | undefined {
  return project.storeys.find((s) => s.id === storeyId);
}

export function projectPlanV2(project: HouseProject, storeyId: string): PlanProjectionV2 {
  const storey = getStorey(project, storeyId);
  if (!storey) {
    return {
      viewId: `plan-${storeyId}`,
      storeyId,
      cutZ: 0,
      wallSegments: [],
      slabOutlines: [],
      openings: [],
      balconies: [],
      stairs: [],
    };
  }

  const cutZ = storey.elevation + PLAN_CUT_HEIGHT;
  const storeys = project.storeys;

  const visibleWalls = project.walls.filter((wall) => {
    const bz = resolveAnchor(wall.bottom, storeys);
    const tz = resolveAnchor(wall.top, storeys);
    return bz <= cutZ && cutZ <= tz;
  });
  const visibleWallIds = new Set(visibleWalls.map((w) => w.id));

  const wallSegments: PlanWallSegmentV2[] = visibleWalls.map((w) => ({
    wallId: w.id,
    start: { ...w.start },
    end: { ...w.end },
    thickness: w.thickness,
  }));

  const slabOutlines: PlanSlabOutline[] = [];
  for (const slab of project.slabs) {
    const top = resolveAnchor(slab.top, storeys);
    const bottom = top - slab.thickness;
    if (Math.abs(top - storey.elevation) <= STOREY_MATCH_EPS) {
      slabOutlines.push({
        slabId: slab.id,
        outline: slab.polygon.map((p) => ({ ...p })),
        holes: (slab.holes ?? []).map((hole) => hole.map((p) => ({ ...p }))),
        role: "floor",
      });
    } else if (bottom <= cutZ && cutZ <= top) {
      slabOutlines.push({
        slabId: slab.id,
        outline: slab.polygon.map((p) => ({ ...p })),
        holes: (slab.holes ?? []).map((hole) => hole.map((p) => ({ ...p }))),
        role: "intermediate",
      });
    }
  }

  const openings: PlanOpeningGlyphV2[] = project.openings
    .filter((o) => visibleWallIds.has(o.wallId))
    .map((o) => ({
      openingId: o.id,
      wallId: o.wallId,
      type: o.type,
      offset: o.offset,
      width: o.width,
    }));

  const balconies: PlanBalconyGlyphV2[] = project.balconies
    .filter((b) => Math.abs(resolveAnchor(b.slabTop, storeys) - storey.elevation) <= STOREY_MATCH_EPS)
    .map((b) => ({
      balconyId: b.id,
      wallId: b.attachedWallId,
      offset: b.offset,
      width: b.width,
      depth: b.depth,
    }));

  const stairs: PlanStairSymbolV2[] = [];
  for (const stair of project.stairs) {
    const fromZ = resolveAnchor(stair.from, storeys);
    if (Math.abs(fromZ - storey.elevation) > STOREY_MATCH_EPS) continue;
    const toZ = resolveAnchor(stair.to, storeys);
    const climb = toZ - fromZ;
    let slabThickness = FALLBACK_SLAB_THICKNESS;
    for (const slab of project.slabs) {
      if (Math.abs(resolveAnchor(slab.top, storeys) - toZ) <= STOREY_MATCH_EPS) {
        slabThickness = slab.thickness;
        break;
      }
    }
    const cfg = computeStairConfig(climb, slabThickness, stair.treadDepth);
    stairs.push({
      stairId: stair.id,
      rect: { x: stair.x, y: stair.y, width: stair.width, depth: stair.depth },
      shape: stair.shape,
      bottomEdge: stair.bottomEdge,
      treadDepth: stair.treadDepth,
      treadCount: cfg.treadCount,
      turn: stair.turn,
      rotation: stair.rotation ?? 0,
      center: {
        x: stair.x + stair.width / 2,
        y: stair.y + stair.depth / 2,
      },
    });
  }

  return {
    viewId: `plan-${storeyId}`,
    storeyId,
    cutZ,
    wallSegments,
    slabOutlines,
    openings,
    balconies,
    stairs,
  };
}
