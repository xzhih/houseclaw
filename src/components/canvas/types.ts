export type Point2D = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type Viewport = { zoom: number; panX: number; panY: number };
export type PointMapping = {
  project: (point: Point2D) => Point2D;
  unproject: (point: Point2D) => Point2D;
  scale: number;
};

export type DragReadout =
  | { kind: "wall-translate"; dx: number; dy: number }
  | { kind: "wall-endpoint"; length: number }
  | { kind: "opening"; offset: number }
  | { kind: "plan-opening-resize"; width: number }
  | { kind: "balcony"; offset: number }
  | { kind: "plan-balcony-resize"; width: number }
  | { kind: "elev-opening-move"; offset: number; sill: number }
  | { kind: "elev-opening-resize"; width: number; height: number }
  | { kind: "elev-balcony-move"; offset: number }
  | { kind: "elev-balcony-resize"; width: number }
  | { kind: "stair-resize"; width: number; depth: number }
  | { kind: "stair-rotate"; angleDeg: number }
  | { kind: "elev-storey-translate"; dy: number };
