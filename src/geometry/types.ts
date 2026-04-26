import type { Point2 } from "../domain/types";
import type { FootprintQuad } from "./wallNetwork";

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

export type HouseGeometry = {
  walls: WallGeometry[];
  balconies: BalconyGeometry[];
};
