import type { HouseProject, Point2, Wall } from "../domain/types";
import { buildRoofPlaceholder, buildSlabGeometry } from "./slabGeometry";
import type { HouseGeometry, SlabGeometry, StairRenderGeometry } from "./types";
import { buildWallNetwork, type FootprintQuad } from "./wallNetwork";
import { buildWallPanels } from "./wallPanels";
import { buildStairGeometry, stairFootprintPolygon } from "./stairGeometry";

const SLAB_MATERIAL_ID = "mat-gray-stone";

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

function pickTopStorey(project: HouseProject) {
  return [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
}

export function buildHouseGeometry(project: HouseProject): HouseGeometry {
  const footprints = buildFootprintIndex(project.walls);

  const sortedStoreys = [...project.storeys].sort((a, b) => a.elevation - b.elevation);

  // Compute a tight slab-hole polygon per storey based on the actual stair footprint
  // (union of flights + landings), not the bbox. Without this the U/L flights leave
  // empty hole space the walker can fall through when stepping from stair to slab.
  const slabHoleByStorey = new Map<string, Point2[]>();
  for (let i = 1; i < sortedStoreys.length; i += 1) {
    const storey = sortedStoreys[i];
    if (!storey.stair) continue;
    const climb = storey.elevation - sortedStoreys[i - 1].elevation;
    slabHoleByStorey.set(storey.id, stairFootprintPolygon(storey.stair, climb));
  }

  const slabs: SlabGeometry[] = [];
  for (const storey of project.storeys) {
    const slab = buildSlabGeometry(
      storey,
      project.walls,
      footprints,
      SLAB_MATERIAL_ID,
      slabHoleByStorey.get(storey.id),
    );
    if (slab) slabs.push(slab);
  }
  const topStorey = pickTopStorey(project);
  if (topStorey) {
    const roof = buildRoofPlaceholder(topStorey, project.walls, footprints, SLAB_MATERIAL_ID);
    if (roof) slabs.push(roof);
  }

  const stairs: StairRenderGeometry[] = [];
  for (let i = 0; i < sortedStoreys.length; i += 1) {
    const storey = sortedStoreys[i];
    if (!storey.stair) continue;
    if (i === 0) continue; // 最底层 storey 不应有 stair（防御）—— 由 constraints 阻止；这里加一道保险
    const lowerStoreyTopY = sortedStoreys[i - 1].elevation;
    const geom = buildStairGeometry(storey.stair, storey, lowerStoreyTopY);
    stairs.push({
      storeyId: storey.id,
      materialId: storey.stair.materialId,
      treads: geom.treads,
      landings: geom.landings,
    });
  }

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
    slabs,
    stairs,
  };
}
