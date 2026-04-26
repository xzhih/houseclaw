import type { HouseProject, Point2, Wall } from "../domain/types";
import type { HouseGeometry } from "./types";
import { buildWallNetwork, type FootprintQuad } from "./wallNetwork";
import { buildWallPanels } from "./wallPanels";

function clonePoint(point: Point2): Point2 {
  return { x: point.x, y: point.y };
}

function cloneFootprint(quad: FootprintQuad): FootprintQuad {
  return {
    rightStart: clonePoint(quad.rightStart),
    rightEnd: clonePoint(quad.rightEnd),
    leftStart: clonePoint(quad.leftStart),
    leftEnd: clonePoint(quad.leftEnd),
  };
}

function fallbackFootprint(wall: Wall): FootprintQuad {
  // Zero-length wall: collapse to a degenerate quad so downstream rendering
  // produces zero-volume geometry instead of crashing on a missing footprint.
  return {
    rightStart: clonePoint(wall.start),
    rightEnd: clonePoint(wall.end),
    leftStart: clonePoint(wall.start),
    leftEnd: clonePoint(wall.end),
  };
}

function buildFootprintIndex(walls: Wall[]): Map<string, FootprintQuad> {
  const wallsByStorey = new Map<string, Wall[]>();
  for (const wall of walls) {
    const list = wallsByStorey.get(wall.storeyId);
    if (list) {
      list.push(wall);
    } else {
      wallsByStorey.set(wall.storeyId, [wall]);
    }
  }

  const index = new Map<string, FootprintQuad>();
  for (const storeyWalls of wallsByStorey.values()) {
    for (const footprint of buildWallNetwork(storeyWalls)) {
      const { wallId, ...quad } = footprint;
      index.set(wallId, quad);
    }
  }
  return index;
}

export function buildHouseGeometry(project: HouseProject): HouseGeometry {
  const footprints = buildFootprintIndex(project.walls);

  return {
    walls: project.walls.map((wall) => ({
      wallId: wall.id,
      storeyId: wall.storeyId,
      start: clonePoint(wall.start),
      end: clonePoint(wall.end),
      thickness: wall.thickness,
      height: wall.height,
      materialId: wall.materialId,
      panels: buildWallPanels(
        wall,
        project.openings.filter((opening) => opening.wallId === wall.id),
      ),
      footprint: cloneFootprint(footprints.get(wall.id) ?? fallbackFootprint(wall)),
    })),
    balconies: project.balconies.map((balcony) => ({
      balconyId: balcony.id,
      storeyId: balcony.storeyId,
      attachedWallId: balcony.attachedWallId,
      offset: balcony.offset,
      width: balcony.width,
      depth: balcony.depth,
      slabThickness: balcony.slabThickness,
      railingHeight: balcony.railingHeight,
      materialId: balcony.materialId,
      railingMaterialId: balcony.railingMaterialId,
    })),
  };
}
