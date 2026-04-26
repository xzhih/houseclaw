import type { Point2, Storey, Wall } from "../domain/types";
import { buildExteriorRing } from "./footprintRing";
import type { SlabGeometry } from "./types";
import type { FootprintQuad } from "./wallNetwork";

const ROOF_PLACEHOLDER_THICKNESS = 0.2;

const COORD_PRECISION = 1e6;

function roundCoord(v: number): number {
  return Math.round(v * COORD_PRECISION) / COORD_PRECISION;
}

function holeFromOpening(opening: { x: number; y: number; width: number; depth: number }): Point2[] {
  const x1 = opening.x;
  const y1 = opening.y;
  const x2 = roundCoord(opening.x + opening.width);
  const y2 = roundCoord(opening.y + opening.depth);
  return [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
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
