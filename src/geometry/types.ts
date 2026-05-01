import type { Point2, Point3 } from "../domain/types";

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

export type WallGeometry = {
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

export type SlabGeometry = {
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

export type RoofGeometry = {
  roofId: string;
  panels: RoofPanel[];
  gables: RoofGable[];
};

/** A single rectangular frame strip ready for three.js BoxGeometry. */
export type FrameStrip = {
  role: "top" | "bottom" | "left" | "right";
  /** Center point. center.x and center.y are plan-space coordinates;
   *  center.z is world height. Renderer converts plan-y → scene-z. */
  center: { x: number; y: number; z: number };
  /** Box dimensions in three local axes after rotation. */
  size: { alongWall: number; height: number; depth: number };
  /** Rotation around scene Y axis to align the box with the wall. */
  rotationY: number;
  materialId: string;
};

/** Per-stair a tread or landing box. World-space center + dimensions. */
export type StairBox = {
  cx: number; cy: number; cz: number;
  sx: number; sy: number; sz: number;
  /** Rotation around world Y at the box's own center (radians). */
  rotationY?: number;
};

export type StairGeometry = {
  stairId: string;
  treads: StairBox[];
  landings: StairBox[];
  materialId: string;
};

export type BalconyGeometry = {
  balconyId: string;
  attachedWallId: string;
  offset: number;
  width: number;
  depth: number;
  slabThickness: number;
  /** Resolved world z of the balcony slab top. */
  slabTopZ: number;
  railingHeight: number;
  materialId: string;
  railingMaterialId: string;
};

export type HouseGeometry = {
  walls: WallGeometry[];
  slabs: SlabGeometry[];
  roofs: RoofGeometry[];
  stairs: StairGeometry[];
  balconies: BalconyGeometry[];
  /** Per-opening frame strips, flattened. */
  openingFrames: FrameStrip[];
};
