import type { Point2, Storey, Wall } from "../domain/types";
import { buildExteriorRing } from "./footprintRing";
import type { SlabGeometry } from "./types";
import type { FootprintQuad } from "./wallNetwork";

const ROOF_PLACEHOLDER_THICKNESS = 0.2;

function holeFromOpening(opening: { x: number; y: number; width: number; depth: number }): Point2[] {
  return [
    { x: opening.x, y: opening.y },
    { x: opening.x + opening.width, y: opening.y },
    { x: opening.x + opening.width, y: opening.y + opening.depth },
    { x: opening.x, y: opening.y + opening.depth },
  ];
}

export function buildSlabGeometry(
  storey: Storey,
  walls: Wall[],
  footprintIndex: Map<string, FootprintQuad>,
  materialId: string,
): SlabGeometry | undefined {
  const storeyWalls = walls.filter((wall) => wall.storeyId === storey.id);
  const outline = buildExteriorRing(storeyWalls, footprintIndex);
  if (!outline) return undefined;

  return {
    storeyId: storey.id,
    kind: "floor",
    outline,
    hole: storey.stairOpening ? holeFromOpening(storey.stairOpening) : undefined,
    topY: storey.elevation,
    thickness: storey.slabThickness,
    materialId,
  };
}

export function buildRoofPlaceholder(
  topStorey: Storey,
  walls: Wall[],
  footprintIndex: Map<string, FootprintQuad>,
  materialId: string,
): SlabGeometry | undefined {
  const storeyWalls = walls.filter((wall) => wall.storeyId === topStorey.id);
  const outline = buildExteriorRing(storeyWalls, footprintIndex);
  if (!outline) return undefined;

  return {
    storeyId: topStorey.id,
    kind: "roof",
    outline,
    topY: topStorey.elevation + topStorey.height + ROOF_PLACEHOLDER_THICKNESS,
    thickness: ROOF_PLACEHOLDER_THICKNESS,
    materialId,
  };
}
