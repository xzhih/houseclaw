import type { Point2, ViewId } from "../domain/types";

export type PlanWallSegment = {
  wallId: string;
  start: Point2;
  end: Point2;
  thickness: number;
};

export type PlanOpeningGlyph = {
  openingId: string;
  wallId: string;
  offset: number;
  width: number;
};

export type PlanProjection = {
  viewId: ViewId;
  wallSegments: PlanWallSegment[];
  openings: PlanOpeningGlyph[];
};

export type ElevationSide = "front" | "back" | "left" | "right";

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
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ElevationProjection = {
  viewId: ViewId;
  side: ElevationSide;
  wallBands: ElevationWallBand[];
  openings: ElevationOpeningRect[];
};
