import type { Point2 } from "../../domain/v2/types";

export type FootprintQuad = {
  rightStart: Point2;
  rightEnd: Point2;
  leftStart: Point2;
  leftEnd: Point2;
};

export type WallSegment = {
  start: Point2;
  end: Point2;
  thickness: number;
};

export type WallPanelRole = "full" | "left" | "right" | "between" | "below" | "above";

export type WallPanel = {
  role: WallPanelRole;
  /** Horizontal offset along the wall, meters from wall.start. */
  x: number;
  /** Vertical offset, meters from wall bottom (bottomZ). */
  y: number;
  width: number;
  height: number;
};

export type WallGeometryV2 = {
  wallId: string;
  start: Point2;
  end: Point2;
  thickness: number;
  /** Resolved world z of the wall bottom (resolveAnchor(wall.bottom, storeys)). */
  bottomZ: number;
  /** Resolved world z of the wall top. */
  topZ: number;
  materialId: string;
  panels: WallPanel[];
  footprint: FootprintQuad;
};
