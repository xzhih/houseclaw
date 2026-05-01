import { resolveAnchor } from "../domain/anchors";
import type { Opening, Point2, Storey, Wall } from "../domain/types";
import { buildWallPanels } from "./wallPanels";
import type { FootprintQuad, WallGeometry } from "./types";

function clonePoint(p: Point2): Point2 {
  return { x: p.x, y: p.y };
}

function cloneFootprint(fp: FootprintQuad): FootprintQuad {
  return {
    rightStart: clonePoint(fp.rightStart),
    rightEnd: clonePoint(fp.rightEnd),
    leftStart: clonePoint(fp.leftStart),
    leftEnd: clonePoint(fp.leftEnd),
  };
}

function fallbackFootprint(wall: Wall): FootprintQuad {
  // Zero-length / missing-network wall: collapse to a degenerate quad so
  // downstream rendering produces zero-volume geometry instead of crashing.
  return {
    rightStart: clonePoint(wall.start),
    rightEnd: clonePoint(wall.end),
    leftStart: clonePoint(wall.start),
    leftEnd: clonePoint(wall.end),
  };
}

export function buildWallGeometry(
  wall: Wall,
  openings: Opening[],
  storeys: Storey[],
  footprintIndex: Map<string, FootprintQuad>,
): WallGeometry {
  const bottomZ = resolveAnchor(wall.bottom, storeys);
  const topZ = resolveAnchor(wall.top, storeys);
  const wallHeight = topZ - bottomZ;
  const ownOpenings = openings.filter((o) => o.wallId === wall.id);
  const panels = buildWallPanels(wall, ownOpenings, wallHeight);
  const footprint = footprintIndex.get(wall.id);
  return {
    wallId: wall.id,
    start: clonePoint(wall.start),
    end: clonePoint(wall.end),
    thickness: wall.thickness,
    bottomZ,
    topZ,
    materialId: wall.materialId,
    panels,
    footprint: footprint ? cloneFootprint(footprint) : fallbackFootprint(wall),
  };
}
