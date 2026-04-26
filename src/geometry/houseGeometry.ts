import type { HouseProject, Point2 } from "../domain/types";
import type { HouseGeometry } from "./types";
import { buildWallPanels } from "./wallPanels";

function clonePoint(point: Point2): Point2 {
  return { x: point.x, y: point.y };
}

export function buildHouseGeometry(project: HouseProject): HouseGeometry {
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
