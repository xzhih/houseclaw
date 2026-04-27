import type { ObjectSelection } from "./selection";

export type UnitSystem = "metric";

export type Mode = "2d" | "3d";

export type ViewId =
  | "plan-1f"
  | "plan-2f"
  | "plan-3f"
  | "elevation-front"
  | "elevation-back"
  | "elevation-left"
  | "elevation-right"
  | "roof";

export type ToolId =
  | "select"
  | "wall"
  | "door"
  | "window"
  | "opening"
  | "balcony"
  | "stair"
  | "material";

export type Point2 = {
  x: number;
  y: number;
};

export type Point3 = {
  x: number;
  y: number;
  z: number;
};

export type StairShape = "straight" | "l" | "u";
export type StairEdge = "+x" | "-x" | "+y" | "-y";
export type StairTurn = "left" | "right";

export type Stair = {
  x: number;
  y: number;
  width: number;
  depth: number;
  shape: StairShape;
  treadDepth: number;
  bottomEdge: StairEdge;
  turn?: StairTurn;
  materialId: string;
  /** Rotation in radians around the rectangle's center. Positive = CCW in plan view (standard math). */
  rotation?: number;
};

export type Storey = {
  id: string;
  label: string;
  elevation: number;
  height: number;
  slabThickness: number;
  /** Stair going up from this storey to the next one above. The top storey
   *  must always have stair === undefined. */
  stair?: Stair;
};

export type RoofEdgeKind = "eave" | "gable";

export type Roof = {
  /** wallId → role for that top-storey wall. Missing or stale keys default
   *  to "gable" at render/validation time (see edge-resolution rule). */
  edges: Record<string, RoofEdgeKind>;
  /** Radians. Shared by all eaves. Valid range [π/36, π/3]. */
  pitch: number;
  /** Meters. Outward expansion of all 4 outline edges. Range [0, 2]. */
  overhang: number;
  materialId: string;
};

export type MaterialKind = "wall" | "roof" | "frame" | "railing" | "decor";

export type Material = {
  id: string;
  name: string;
  kind: MaterialKind;
  color: string;
  textureUrl?: string;
  repeat?: { x: number; y: number };
};

export type Wall = {
  id: string;
  storeyId: string;
  start: Point2;
  end: Point2;
  thickness: number;
  height: number;
  exterior: boolean;
  materialId: string;
};

export type OpeningType = "door" | "window" | "void";

export type Opening = {
  id: string;
  wallId: string;
  type: OpeningType;
  offset: number;
  sillHeight: number;
  width: number;
  height: number;
  frameMaterialId: string;
};

export type Balcony = {
  id: string;
  storeyId: string;
  attachedWallId: string;
  offset: number;
  width: number;
  depth: number;
  slabThickness: number;
  railingHeight: number;
  materialId: string;
  railingMaterialId: string;
};

export type HouseProject = {
  id: string;
  name: string;
  unitSystem: UnitSystem;
  defaultWallThickness: number;
  defaultStoreyHeight: number;
  mode: Mode;
  activeView: ViewId;
  activeTool: ToolId;
  selection?: ObjectSelection;
  storeys: Storey[];
  materials: Material[];
  walls: Wall[];
  openings: Opening[];
  balconies: Balcony[];
  roof?: Roof;
};
