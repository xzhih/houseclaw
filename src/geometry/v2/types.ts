import type { Point2, Point3 } from "../../domain/v2/types";

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

export type SlabGeometryV2 = {
  slabId: string;
  /** Outer boundary polygon, CCW. Caller-validated by validateProject. */
  outline: Point2[];
  /** Inner holes; each polygon CW. Empty array when none. */
  holes: Point2[][];
  /** Resolved world z of the slab top face (resolveAnchor(slab.top, storeys)). */
  topZ: number;
  thickness: number;
  materialId: string;
  edgeMaterialId?: string;
};

/** Sloped roof panel, 3 or 4 Point3 vertices, CCW from outside. */
export type RoofPanel = {
  vertices: Point3[];
  materialId: string;
};

/** Vertical triangular extension above the wall top. CCW from outside.
 *  v2 drops the wallId binding (per design decision Q1=A) — gables use the
 *  parent roof's materialId. */
export type RoofGable = {
  vertices: Point3[];
  materialId: string;
};

export type RoofGeometryV2 = {
  roofId: string;
  panels: RoofPanel[];
  gables: RoofGable[];
};
