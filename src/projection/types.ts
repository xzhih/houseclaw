import type { OpeningType, Point2 } from "../domain/types";

// ──────────────────── Plan view ────────────────────

export type PlanViewId = `plan-${string}`;

export type PlanWallSegment = {
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

export type PlanProjection = {
  viewId: PlanViewId;
  storeyId: string;
  /** Horizontal cut-plane elevation = storey.elevation + PLAN_CUT_HEIGHT. */
  cutZ: number;
  wallSegments: PlanWallSegment[];
  slabOutlines: PlanSlabOutline[];
  openings: PlanOpeningGlyph[];
  balconies: PlanBalconyGlyph[];
  stairs: PlanStairSymbol[];
};

// ──────────────────── Elevation view ────────────────────

export type ElevationSide = "front" | "back" | "left" | "right";
export type ElevationViewId = `elevation-${ElevationSide}`;

export type ElevationWallBand = {
  wallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Perpendicular distance along the view axis. Lower = closer to viewer.
   *  Renderer paints in descending depth (back-to-front) for occlusion. */
  depth: number;
};

export type ElevationOpeningRect = {
  openingId: string;
  wallId: string;
  type: OpeningType;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
};

export type ElevationBalconyRect = {
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

export type ElevationRoofPolygon = {
  roofId: string;
  vertices: Point2[];
  kind: "panel" | "gable";
  depth: number;
};

/** Horizontal datum drawn at each storey elevation — the architectural
 *  level marker (e.g. "1F ±0.000") so empty storeys are still visible. */
export type ElevationStoreyLine = {
  storeyId: string;
  label: string;
  elevation: number;
};

export type ElevationProjection = {
  viewId: ElevationViewId;
  side: ElevationSide;
  wallBands: ElevationWallBand[];
  slabLines: ElevationSlabLine[];
  openings: ElevationOpeningRect[];
  balconies: ElevationBalconyRect[];
  roofPolygons: ElevationRoofPolygon[];
  storeyLines: ElevationStoreyLine[];
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

export type RoofViewProjection = {
  viewId: "roof";
  polygons: RoofViewPolygon[];
};
