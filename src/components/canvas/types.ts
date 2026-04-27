export type Point2D = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type Viewport = { zoom: number; panX: number; panY: number };
export type PointMapping = {
  project: (point: Point2D) => Point2D;
  unproject: (point: Point2D) => Point2D;
  scale: number;
};
