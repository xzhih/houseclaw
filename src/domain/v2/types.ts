export type Anchor =
  | { kind: "storey"; storeyId: string; offset: number }
  | { kind: "absolute"; z: number };

export type Storey = {
  id: string;
  label: string;
  elevation: number;
};

export type Point2 = { x: number; y: number };
export type Point3 = { x: number; y: number; z: number };

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
  start: Point2;
  end: Point2;
  thickness: number;
  bottom: Anchor;
  top: Anchor;
  exterior: boolean;
  materialId: string;
};

export type Slab = {
  id: string;
  polygon: Point2[];
  top: Anchor;
  thickness: number;
  materialId: string;
  edgeMaterialId?: string;
};

export type RoofEdgeKind = "eave" | "gable" | "hip";

export type Roof = {
  id: string;
  polygon: Point2[];
  base: Anchor;
  edges: RoofEdgeKind[];
  pitch: number;
  overhang: number;
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
  attachedWallId: string;
  offset: number;
  width: number;
  depth: number;
  slabTop: Anchor;
  slabThickness: number;
  railingHeight: number;
  materialId: string;
  railingMaterialId: string;
};

export type StairShape = "straight" | "l" | "u";
export type StairEdge = "+x" | "-x" | "+y" | "-y";
export type StairTurn = "left" | "right";

export type Stair = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  shape: StairShape;
  treadDepth: number;
  bottomEdge: StairEdge;
  turn?: StairTurn;
  rotation?: number;
  from: Anchor;
  to: Anchor;
  materialId: string;
};

export type HouseProject = {
  schemaVersion: 2;
  id: string;
  name: string;
  storeys: Storey[];
  walls: Wall[];
  slabs: Slab[];
  roofs: Roof[];
  openings: Opening[];
  balconies: Balcony[];
  stairs: Stair[];
  materials: Material[];
};
