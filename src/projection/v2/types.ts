import type { OpeningType, Point2 } from "../../domain/v2/types";

// ──────────────────── Plan view ────────────────────

export type PlanViewId = `plan-${string}`;

export type PlanWallSegmentV2 = {
  wallId: string;
  start: Point2;
  end: Point2;
  thickness: number;
};

export type PlanSlabOutline = {
  slabId: string;
  /** Outer polygon, CCW. */
  outline: Point2[];
  /** Inner holes (CW each), if any. */
  holes: Point2[][];
  /** "floor" = the slab the user is standing on for this storey;
   *  "intermediate" = a slab that's neither floor nor ceiling but the cutZ
   *  passes through its thickness — rare but possible. */
  role: "floor" | "intermediate";
};

export type PlanOpeningGlyphV2 = {
  openingId: string;
  wallId: string;
  type: OpeningType;
  offset: number;
  width: number;
};

export type PlanBalconyGlyphV2 = {
  balconyId: string;
  wallId: string;
  offset: number;
  width: number;
  depth: number;
};

export type PlanStairSymbolV2 = {
  stairId: string;
  rect: { x: number; y: number; width: number; depth: number };
  shape: "straight" | "l" | "u";
  bottomEdge: "+x" | "-x" | "+y" | "-y";
  treadDepth: number;
  /** Total tread count derived from climb / riser-target. */
  treadCount: number;
  turn?: "left" | "right";
  rotation: number;
  center: { x: number; y: number };
};

export type PlanProjectionV2 = {
  viewId: PlanViewId;
  storeyId: string;
  /** Horizontal cut-plane elevation = storey.elevation + PLAN_CUT_HEIGHT. */
  cutZ: number;
  wallSegments: PlanWallSegmentV2[];
  slabOutlines: PlanSlabOutline[];
  openings: PlanOpeningGlyphV2[];
  balconies: PlanBalconyGlyphV2[];
  stairs: PlanStairSymbolV2[];
};

// ──────────────────── Elevation view ────────────────────

export type ElevationSide = "front" | "back" | "left" | "right";
export type ElevationViewId = `elevation-${ElevationSide}`;

export type ElevationWallBandV2 = {
  wallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Perpendicular distance along the view axis. Lower = closer to viewer.
   *  Renderer paints in descending depth (back-to-front) for occlusion. */
  depth: number;
};

export type ElevationOpeningRectV2 = {
  openingId: string;
  wallId: string;
  type: OpeningType;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
};

export type ElevationBalconyRectV2 = {
  balconyId: string;
  wallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
};

export type ElevationSlabLine = {
  slabId: string;
  /** Horizontal segment at the slab top in (x, z). */
  start: Point2;
  end: Point2;
  thickness: number;
  depth: number;
};

export type ElevationRoofPolygonV2 = {
  roofId: string;
  vertices: Point2[];
  kind: "panel" | "gable";
  depth: number;
};

export type ElevationProjectionV2 = {
  viewId: ElevationViewId;
  side: ElevationSide;
  wallBands: ElevationWallBandV2[];
  slabLines: ElevationSlabLine[];
  openings: ElevationOpeningRectV2[];
  balconies: ElevationBalconyRectV2[];
  roofPolygons: ElevationRoofPolygonV2[];
};

// ──────────────────── Roof view ────────────────────

export type RoofViewEdgeKind = "eave" | "gable" | "hip";

export type RoofViewEdgeStroke = {
  from: Point2;
  to: Point2;
  kind: RoofViewEdgeKind;
};

export type RoofViewRidgeLine = {
  from: Point2;
  to: Point2;
};

export type RoofViewPolygon = {
  roofId: string;
  vertices: Point2[];
  edges: RoofViewEdgeStroke[];
  ridgeLines: RoofViewRidgeLine[];
};

export type RoofViewProjectionV2 = {
  viewId: "roof";
  polygons: RoofViewPolygon[];
};
