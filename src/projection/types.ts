import type { OpeningType, Point2 } from "../domain/types";

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

export type PlanProjection = {
  viewId: PlanViewId;
  wallSegments: PlanWallSegment[];
  openings: PlanOpeningGlyph[];
  balconies: PlanBalconyGlyph[];
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

export type ElevationProjection = {
  viewId: ElevationViewId;
  side: ElevationSide;
  wallBands: ElevationWallBand[];
  openings: ElevationOpeningRect[];
  balconies: ElevationBalconyRect[];
};
