import type { Point2, Wall } from "./types";

export function distance(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function wallLength(wall: Wall): number {
  return Number(distance(wall.start, wall.end).toFixed(4));
}

export function storeyTop(elevation: number, height: number): number {
  return Number((elevation + height).toFixed(4));
}
