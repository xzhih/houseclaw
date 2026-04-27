import type { Point2 } from "../domain/types";
import type { FootprintQuad } from "./wallNetwork";
import type { StairBox } from "./stairGeometry";
import type { RoofGeometry } from "./roofGeometry";
import type { SkirtGeometry } from "./skirtGeometry";

export type WallPanelRole = "full" | "left" | "right" | "between" | "below" | "above";

export type WallPanel = {
  role: WallPanelRole;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WallGeometry = {
  wallId: string;
  storeyId: string;
  start: Point2;
  end: Point2;
  thickness: number;
  height: number;
  materialId: string;
  panels: WallPanel[];
  footprint: FootprintQuad;
};

export type BalconyGeometry = {
  balconyId: string;
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

export type SlabKind = "floor";

export type SlabGeometry = {
  storeyId: string;
  kind: SlabKind;
  outline: Point2[];
  hole?: Point2[];
  topY: number;
  thickness: number;
  materialId: string;
};

export type StairRenderGeometry = {
  storeyId: string;
  materialId: string;
  treads: StairBox[];
  landings: StairBox[];
};

export type HouseGeometry = {
  walls: WallGeometry[];
  balconies: BalconyGeometry[];
  slabs: SlabGeometry[];
  stairs: StairRenderGeometry[];
  roof?: RoofGeometry;
  skirts: SkirtGeometry[];
};
