import type { Point2 } from "../../domain/v2/types";

type WallSegment = { start: Point2; end: Point2 };

export function snapToGrid(point: Point2, gridSize: number): Point2 {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return point;
  return {
    x: Number((Math.round(point.x / gridSize) * gridSize).toFixed(6)),
    y: Number((Math.round(point.y / gridSize) * gridSize).toFixed(6)),
  };
}

export function snapToEndpoint(
  point: Point2,
  walls: readonly WallSegment[],
  threshold: number,
): Point2 | undefined {
  if (walls.length === 0 || !Number.isFinite(threshold) || threshold <= 0) return undefined;

  let best: { point: Point2; distance: number } | undefined;
  for (const wall of walls) {
    for (const endpoint of [wall.start, wall.end]) {
      const dx = point.x - endpoint.x;
      const dy = point.y - endpoint.y;
      const distance = Math.hypot(dx, dy);
      if (distance > threshold) continue;
      if (!best || distance < best.distance) best = { point: endpoint, distance };
    }
  }

  return best?.point;
}

export type SnapOptions = {
  gridSize: number;
  endpointThreshold: number;
};

export function snapPlanPoint(
  point: Point2,
  walls: readonly WallSegment[],
  options: SnapOptions,
): Point2 {
  const endpoint = snapToEndpoint(point, walls, options.endpointThreshold);
  if (endpoint) return endpoint;
  return snapToGrid(point, options.gridSize);
}
