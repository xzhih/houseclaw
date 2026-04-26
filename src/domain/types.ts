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
  | "material";

export type Point2 = {
  x: number;
  y: number;
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
};

export type Storey = {
  id: string;
  label: string;
  elevation: number;
  height: number;
  slabThickness: number;
  stair?: Stair;
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
};
