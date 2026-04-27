import type { OpeningType, Point2, StairEdge, StairShape, StairTurn } from "../domain/types";

export type PlanViewId = `plan-${string}`;

export type PlanWallSegment = {
  wallId: string;
  start: Point2;
  end: Point2;
  thickness: number;
};

export type PlanOpeningGlyph = {
  openingId: string;
  wallId: string;
  type: OpeningType;
  offset: number;
  width: number;
};

export type PlanBalconyGlyph = {
  balconyId: string;
  wallId: string;
  offset: number;
  width: number;
  depth: number;
};

export type PlanStairSymbol = {
  storeyId: string;
  half: "upper" | "lower";
  rect: { x: number; y: number; width: number; depth: number };
  shape: StairShape;
  bottomEdge: StairEdge;
  treadDepth: number;
  treadCount: number;
  turn?: StairTurn;
  /** Rotation in radians (CCW-positive, plan space). Default 0 for unrotated stairs. */
  rotation: number;
  /** Plan-space center of the bounding rectangle (rotation pivot). */
  center: { x: number; y: number };
};

export type PlanProjection = {
  viewId: PlanViewId;
  wallSegments: PlanWallSegment[];
  openings: PlanOpeningGlyph[];
  balconies: PlanBalconyGlyph[];
  stairs: PlanStairSymbol[];
};

export type ElevationSide = "front" | "back" | "left" | "right";
export type ElevationViewId = `elevation-${ElevationSide}`;

export type ElevationWallBand = {
  wallId: string;
  storeyId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ElevationOpeningRect = {
  openingId: string;
  wallId: string;
  type: OpeningType;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ElevationBalconyRect = {
  balconyId: string;
  wallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ElevationRoofPolygon = {
  /** Roof piece projected onto the elevation plane (x = side-axis, y = world Z). */
  vertices: Point2[];
  kind: "panel" | "gable";
};

export type ElevationProjection = {
  viewId: ElevationViewId;
  side: ElevationSide;
  wallBands: ElevationWallBand[];
  openings: ElevationOpeningRect[];
  balconies: ElevationBalconyRect[];
  roof?: ElevationRoofPolygon[];
};
