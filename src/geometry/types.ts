import type { Point2 } from "../domain/types";

export type WallPanelRole = "full" | "left" | "right" | "below" | "above";

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
};

export type HouseGeometry = {
  walls: WallGeometry[];
};
