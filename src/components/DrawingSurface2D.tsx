import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ObjectSelection } from "../domain/selection";
import { isSelected } from "../domain/selection";
import { wallLength } from "../domain/measurements";
import { moveWall, updateBalcony, updateOpening } from "../domain/mutations";
import type { HouseProject, Point2, ToolId, ViewId } from "../domain/types";
import { snapPlanPoint, snapToEndpoint } from "../geometry/snapping";
import { buildWallNetwork, slicePanelFootprint, type WallFootprint } from "../geometry/wallNetwork";
import { projectElevationView } from "../projection/elevation";
import { projectPlanView } from "../projection/plan";
import type {
  ElevationBalconyRect,
  ElevationProjection,
  ElevationSide,
  PlanBalconyGlyph,
  PlanOpeningGlyph,
  PlanProjection,
  PlanWallSegment,
} from "../projection/types";

const SURFACE_WIDTH = 720;
const SURFACE_HEIGHT = 520;
const SURFACE_PADDING = 48;

const PLAN_GRID_SIZE = 0.1;
const PLAN_ENDPOINT_THRESHOLD = 0.2;
const DRAG_MOVE_THRESHOLD_WORLD = 0.04;
const ENDPOINT_HANDLE_RADIUS = 7;

const PLAN_STOREY_BY_VIEW: Partial<Record<ViewId, string>> = {
  "plan-1f": "1f",
  "plan-2f": "2f",
  "plan-3f": "3f",
};

const ELEVATION_SIDE_BY_VIEW: Partial<Record<ViewId, ElevationSide>> = {
  "elevation-front": "front",
  "elevation-back": "back",
  "elevation-left": "left",
  "elevation-right": "right",
};

type DrawingSurface2DProps = {
  project: HouseProject;
  onSelect: (selection: ObjectSelection | undefined) => void;
  onProjectChange: (project: HouseProject) => void;
};

type DragState =
  | {
      kind: "wall-translate";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      wallId: string;
      origStart: Point2D;
      origEnd: Point2D;
    }
  | {
      kind: "wall-endpoint";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      wallId: string;
      endpoint: "start" | "end";
      origPoint: Point2D;
      fixedPoint: Point2D;
    }
  | {
      kind: "opening";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      openingWidth: number;
    }
  | {
      kind: "balcony";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      balconyWidth: number;
    }
  | {
      kind: "elev-opening-move";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      origOffset: number;
      origSill: number;
      width: number;
      height: number;
      wallLen: number;
      storeyHeight: number;
    }
  | {
      kind: "elev-opening-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      corner: "tl" | "tr" | "bl" | "br";
      origOffset: number;
      origSill: number;
      origWidth: number;
      origHeight: number;
      wallLen: number;
      storeyHeight: number;
    }
  | {
      kind: "elev-balcony-move";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      origOffset: number;
      width: number;
      wallLen: number;
    }
  | {
      kind: "elev-balcony-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      edge: "l" | "r";
      origOffset: number;
      origWidth: number;
      wallLen: number;
    };

type PlanDragHandlers = {
  onWallPointerDown: (event: PointerEvent<SVGElement>, wallId: string) => void;
  onOpeningPointerDown: (event: PointerEvent<SVGElement>, openingId: string) => void;
  onBalconyPointerDown: (event: PointerEvent<SVGElement>, balconyId: string) => void;
  onWallEndpointPointerDown: (
    event: PointerEvent<SVGElement>,
    wallId: string,
    endpoint: "start" | "end",
  ) => void;
};

type ElevationDragHandlers = {
  onOpeningPointerDown: (event: PointerEvent<SVGElement>, openingId: string) => void;
  onOpeningCornerPointerDown: (
    event: PointerEvent<SVGElement>,
    openingId: string,
    corner: "tl" | "tr" | "bl" | "br",
  ) => void;
  onBalconyPointerDown: (event: PointerEvent<SVGElement>, balconyId: string) => void;
  onBalconyEdgePointerDown: (
    event: PointerEvent<SVGElement>,
    balconyId: string,
    edge: "l" | "r",
  ) => void;
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type Point2D = { x: number; y: number };

type PointMapping = {
  project: (point: Point2D) => Point2D;
  unproject: (point: Point2D) => Point2D;
  scale: number;
};

function createPointMapping(bounds: Bounds): PointMapping {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(
    (SURFACE_WIDTH - SURFACE_PADDING * 2) / width,
    (SURFACE_HEIGHT - SURFACE_PADDING * 2) / height,
  );
  const contentWidth = width * scale;
  const contentHeight = height * scale;
  const offsetX = (SURFACE_WIDTH - contentWidth) / 2;
  const offsetY = (SURFACE_HEIGHT - contentHeight) / 2;

  return {
    project: (point) => ({
      x: offsetX + (point.x - bounds.minX) * scale,
      y: SURFACE_HEIGHT - offsetY - (point.y - bounds.minY) * scale,
    }),
    unproject: (point) => ({
      x: bounds.minX + (point.x - offsetX) / scale,
      y: bounds.minY + (SURFACE_HEIGHT - point.y - offsetY) / scale,
    }),
    scale,
  };
}

function eventToViewBoxPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point2D {
  const ctm = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
  if (ctm) {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return {
      x: ((clientX - rect.left) * SURFACE_WIDTH) / rect.width,
      y: ((clientY - rect.top) * SURFACE_HEIGHT) / rect.height,
    };
  }
  return { x: clientX, y: clientY };
}

function computeSolidPanels(
  wallLen: number,
  openings: readonly { offset: number; width: number }[],
): Array<{ x: number; width: number }> {
  if (wallLen <= 0) return [];
  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  const panels: Array<{ x: number; width: number }> = [];
  let cursor = 0;
  for (const opening of sorted) {
    if (opening.offset > cursor) {
      panels.push({ x: cursor, width: opening.offset - cursor });
    }
    cursor = Math.max(cursor, opening.offset + opening.width);
  }
  if (cursor < wallLen) {
    panels.push({ x: cursor, width: wallLen - cursor });
  }
  return panels.filter((panel) => panel.width > 1e-4);
}

function planBounds(projection: PlanProjection): Bounds {
  const wallsById = new Map(projection.wallSegments.map((wall) => [wall.wallId, wall]));
  const points = [
    ...projection.wallSegments.flatMap((wall) => [wall.start, wall.end]),
    ...projection.balconies.flatMap((balcony) => {
      const wall = wallsById.get(balcony.wallId);
      return wall ? balconyPolygon(balcony, wall) : [];
    }),
  ];

  if (points.length === 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }

  return {
    minX: Math.min(...points.map((point) => point.x)),
    maxX: Math.max(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function elevationBounds(projection: ElevationProjection): Bounds {
  const xValues = projection.wallBands.flatMap((band) => [band.x, band.x + band.width]);
  const yValues = projection.wallBands.flatMap((band) => [band.y, band.y + band.height]);
  for (const opening of projection.openings) {
    xValues.push(opening.x, opening.x + opening.width);
    yValues.push(opening.y, opening.y + opening.height);
  }
  for (const balcony of projection.balconies) {
    xValues.push(balcony.x, balcony.x + balcony.width);
    yValues.push(balcony.y, balcony.y + balcony.height);
  }

  if (xValues.length === 0 || yValues.length === 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }

  return {
    minX: Math.min(...xValues),
    maxX: Math.max(...xValues),
    minY: Math.min(...yValues),
    maxY: Math.max(...yValues),
  };
}

function openingLine(
  opening: PlanOpeningGlyph,
  segment: PlanWallSegment,
): { start: { x: number; y: number }; end: { x: number; y: number } } | undefined {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return undefined;

  const unitX = dx / length;
  const unitY = dy / length;
  const start = {
    x: segment.start.x + unitX * opening.offset,
    y: segment.start.y + unitY * opening.offset,
  };

  return {
    start,
    end: {
      x: start.x + unitX * opening.width,
      y: start.y + unitY * opening.width,
    },
  };
}

function balconyPolygon(balcony: PlanBalconyGlyph, segment: PlanWallSegment) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [];

  const unitX = dx / length;
  const unitY = dy / length;
  const normalX = unitY;
  const normalY = -unitX;
  const innerStart = {
    x: segment.start.x + unitX * balcony.offset,
    y: segment.start.y + unitY * balcony.offset,
  };
  const innerEnd = {
    x: segment.start.x + unitX * (balcony.offset + balcony.width),
    y: segment.start.y + unitY * (balcony.offset + balcony.width),
  };

  return [
    innerStart,
    innerEnd,
    {
      x: innerEnd.x + normalX * balcony.depth,
      y: innerEnd.y + normalY * balcony.depth,
    },
    {
      x: innerStart.x + normalX * balcony.depth,
      y: innerStart.y + normalY * balcony.depth,
    },
  ];
}

function renderSelectableBalcony(
  balconyId: string,
  selected: boolean,
  onSelect: DrawingSurface2DProps["onSelect"],
  activeTool: ToolId,
  props: { className: string; points?: string; x?: number; y?: number; width?: number; height?: number },
  onPointerDown?: (event: PointerEvent<SVGElement>) => void,
) {
  const commonProps = {
    role: "button",
    tabIndex: 0,
    "aria-label": `选择阳台 ${balconyId}`,
    "aria-pressed": selected,
    className: selected ? `${props.className} is-selected` : props.className,
    onPointerDown,
    onClick: () => {
      onSelect({ kind: "balcony", id: balconyId });
    },
    onKeyDown: (event: KeyboardEvent<SVGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect({ kind: "balcony", id: balconyId });
      }
    },
  };

  if (props.points) {
    return <polygon {...commonProps} points={props.points} />;
  }

  return <rect {...commonProps} x={props.x} y={props.y} width={props.width} height={props.height} />;
}

function renderPlan(
  projection: PlanProjection,
  selection: ObjectSelection | undefined,
  onSelect: DrawingSurface2DProps["onSelect"],
  activeTool: ToolId,
  footprints: Map<string, WallFootprint>,
  snapHit: Point2D | null,
  handlers?: PlanDragHandlers,
) {
  const { project: projectPoint } = createPointMapping(planBounds(projection));
  const wallsById = new Map(projection.wallSegments.map((wall) => [wall.wallId, wall]));
  const selectedWall =
    selection?.kind === "wall"
      ? projection.wallSegments.find((wall) => wall.wallId === selection.id)
      : undefined;

  return (
    <>
      {projection.wallSegments.map((wall) => {
        const footprint = footprints.get(wall.wallId);
        if (!footprint) return null;
        const selected = isSelected(selection, "wall", wall.wallId);
        const className = selected ? "plan-wall is-selected" : "plan-wall";
        const wallLen = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
        const wallOpenings = projection.openings.filter((opening) => opening.wallId === wall.wallId);
        const segment = { start: wall.start, end: wall.end, thickness: wall.thickness };
        const solidPanels = computeSolidPanels(wallLen, wallOpenings);

        return (
          <g
            key={wall.wallId}
            role="button"
            tabIndex={0}
            aria-label={`选择墙 ${wall.wallId}`}
            aria-pressed={selected}
            className={className}
            onPointerDown={(event) => handlers?.onWallPointerDown(event, wall.wallId)}
            onClick={() => onSelect({ kind: "wall", id: wall.wallId })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect({ kind: "wall", id: wall.wallId });
              }
            }}
          >
            {solidPanels.map((panel, index) => {
              const sliced = slicePanelFootprint(footprint, segment, panel);
              const corners = [
                projectPoint(sliced.rightStart),
                projectPoint(sliced.leftStart),
                projectPoint(sliced.leftEnd),
                projectPoint(sliced.rightEnd),
              ];
              const points = corners.map((c) => `${c.x},${c.y}`).join(" ");
              return <polygon key={index} className="plan-wall-panel" points={points} />;
            })}
          </g>
        );
      })}
      {projection.openings.map((opening) => {
        const wall = wallsById.get(opening.wallId);
        if (!wall) return null;

        const line = openingLine(opening, wall);
        if (!line) return null;

        const start = projectPoint(line.start);
        const end = projectPoint(line.end);
        const selected = isSelected(selection, "opening", opening.openingId);

        return (
          <g key={opening.openingId} className="opening-glyph">
            <line
              role="button"
              tabIndex={0}
              aria-label={`选择开孔 ${opening.openingId}`}
              aria-pressed={selected}
              className={selected ? "plan-opening is-selected" : "plan-opening"}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              onPointerDown={(event) => handlers?.onOpeningPointerDown(event, opening.openingId)}
              onClick={() => onSelect({ kind: "opening", id: opening.openingId })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect({ kind: "opening", id: opening.openingId });
                }
              }}
            />
          </g>
        );
      })}
      {projection.balconies.map((balcony) => {
        const wall = wallsById.get(balcony.wallId);
        if (!wall) return null;

        const points = balconyPolygon(balcony, wall).map(projectPoint);
        if (points.length === 0) return null;

        return (
          <g key={balcony.balconyId}>
            {renderSelectableBalcony(
              balcony.balconyId,
              isSelected(selection, "balcony", balcony.balconyId),
              onSelect,
              activeTool,
              {
                className: "plan-balcony",
                points: points.map((point) => `${point.x},${point.y}`).join(" "),
              },
              (event) => handlers?.onBalconyPointerDown(event, balcony.balconyId),
            )}
          </g>
        );
      })}
      {selectedWall && handlers ? (
        <>
          <circle
            className="wall-endpoint-handle"
            cx={projectPoint(selectedWall.start).x}
            cy={projectPoint(selectedWall.start).y}
            r={ENDPOINT_HANDLE_RADIUS}
            aria-label={`拉伸墙 ${selectedWall.wallId} 起点`}
            onPointerDown={(event) =>
              handlers.onWallEndpointPointerDown(event, selectedWall.wallId, "start")
            }
          />
          <circle
            className="wall-endpoint-handle"
            cx={projectPoint(selectedWall.end).x}
            cy={projectPoint(selectedWall.end).y}
            r={ENDPOINT_HANDLE_RADIUS}
            aria-label={`拉伸墙 ${selectedWall.wallId} 终点`}
            onPointerDown={(event) =>
              handlers.onWallEndpointPointerDown(event, selectedWall.wallId, "end")
            }
          />
        </>
      ) : null}
      {snapHit ? (
        <circle
          className="snap-indicator"
          cx={projectPoint(snapHit).x}
          cy={projectPoint(snapHit).y}
          r={9}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}

function renderElevation(
  projection: ElevationProjection,
  selection: ObjectSelection | undefined,
  onSelect: DrawingSurface2DProps["onSelect"],
  activeTool: ToolId,
  handlers?: ElevationDragHandlers,
) {
  const { project: projectPoint } = createPointMapping(elevationBounds(projection));
  const selectedOpening =
    selection?.kind === "opening"
      ? projection.openings.find((opening) => opening.openingId === selection.id)
      : undefined;
  const selectedBalcony =
    selection?.kind === "balcony"
      ? projection.balconies.find((balcony) => balcony.balconyId === selection.id)
      : undefined;

  return (
    <>
      {projection.wallBands.map((band) => {
        const topLeft = projectPoint({ x: band.x, y: band.y + band.height });
        const bottomRight = projectPoint({ x: band.x + band.width, y: band.y });

        return (
          <rect
            key={`${band.storeyId}-${band.wallId}`}
            className="elevation-wall"
            x={topLeft.x}
            y={topLeft.y}
            width={bottomRight.x - topLeft.x}
            height={bottomRight.y - topLeft.y}
          />
        );
      })}
      {projection.openings.map((opening) => {
        const topLeft = projectPoint({ x: opening.x, y: opening.y + opening.height });
        const bottomRight = projectPoint({ x: opening.x + opening.width, y: opening.y });
        const selected = isSelected(selection, "opening", opening.openingId);

        return (
          <rect
            key={opening.openingId}
            role="button"
            tabIndex={0}
            aria-label={`选择开孔 ${opening.openingId}`}
            aria-pressed={selected}
            className={selected ? "elevation-opening is-selected" : "elevation-opening"}
            x={topLeft.x}
            y={topLeft.y}
            width={bottomRight.x - topLeft.x}
            height={bottomRight.y - topLeft.y}
            onPointerDown={(event) => handlers?.onOpeningPointerDown(event, opening.openingId)}
            onClick={() => onSelect({ kind: "opening", id: opening.openingId })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect({ kind: "opening", id: opening.openingId });
              }
            }}
          />
        );
      })}
      {projection.balconies.map((balcony: ElevationBalconyRect) => {
        const topLeft = projectPoint({ x: balcony.x, y: balcony.y + balcony.height });
        const bottomRight = projectPoint({ x: balcony.x + balcony.width, y: balcony.y });

        return (
          <g key={balcony.balconyId}>
            {renderSelectableBalcony(
              balcony.balconyId,
              isSelected(selection, "balcony", balcony.balconyId),
              onSelect,
              activeTool,
              {
                className: "elevation-balcony",
                x: topLeft.x,
                y: topLeft.y,
                width: bottomRight.x - topLeft.x,
                height: bottomRight.y - topLeft.y,
              },
              (event) => handlers?.onBalconyPointerDown(event, balcony.balconyId),
            )}
          </g>
        );
      })}
      {selectedOpening && handlers
        ? (["tl", "tr", "bl", "br"] as const).map((corner) => {
            const isLeft = corner === "tl" || corner === "bl";
            const isBottom = corner === "bl" || corner === "br";
            const wx = selectedOpening.x + (isLeft ? 0 : selectedOpening.width);
            const wy = selectedOpening.y + (isBottom ? 0 : selectedOpening.height);
            const p = projectPoint({ x: wx, y: wy });
            return (
              <circle
                key={corner}
                className="resize-handle"
                cx={p.x}
                cy={p.y}
                r={ENDPOINT_HANDLE_RADIUS}
                aria-label={`调整开孔 ${selectedOpening.openingId} ${corner}`}
                onPointerDown={(event) =>
                  handlers.onOpeningCornerPointerDown(event, selectedOpening.openingId, corner)
                }
              />
            );
          })
        : null}
      {selectedBalcony && handlers
        ? (["l", "r"] as const).map((edge) => {
            const wx = selectedBalcony.x + (edge === "l" ? 0 : selectedBalcony.width);
            const wy = selectedBalcony.y + selectedBalcony.height / 2;
            const p = projectPoint({ x: wx, y: wy });
            return (
              <circle
                key={edge}
                className="resize-handle"
                cx={p.x}
                cy={p.y}
                r={ENDPOINT_HANDLE_RADIUS}
                aria-label={`调整阳台 ${selectedBalcony.balconyId} ${edge}`}
                onPointerDown={(event) =>
                  handlers.onBalconyEdgePointerDown(event, selectedBalcony.balconyId, edge)
                }
              />
            );
          })
        : null}
    </>
  );
}

function renderRoofPlaceholder() {
  return (
    <g className="surface-placeholder">
      <rect x="250" y="190" width="220" height="140" rx="4" />
      <path d="M250 190L360 130L470 190" />
      <text x="360" y="380" textAnchor="middle">
        屋顶视图待建模
      </text>
    </g>
  );
}

type Viewport = { zoom: number; panX: number; panY: number };
const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 8;

export function DrawingSurface2D({
  project,
  onSelect,
  onProjectChange,
}: DrawingSurface2DProps) {
  const storeyId = PLAN_STOREY_BY_VIEW[project.activeView];
  const elevationSide = ELEVATION_SIDE_BY_VIEW[project.activeView];

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const panLastPos = useRef({ x: 0, y: 0 });
  const panPointerId = useRef<number | null>(null);
  const [dragState, setDragState] = useState<DragState | undefined>(undefined);
  const [activeSnap, setActiveSnap] = useState<Point2D | null>(null);

  useEffect(() => {
    setViewport(DEFAULT_VIEWPORT);
  }, [project.id, project.activeView]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratioX = (event.clientX - rect.left) / rect.width;
      const ratioY = (event.clientY - rect.top) / rect.height;

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.005);
        setViewport((current) => {
          const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current.zoom * factor));
          const oldVbW = SURFACE_WIDTH / current.zoom;
          const oldVbH = SURFACE_HEIGHT / current.zoom;
          const cursorVbX = current.panX + ratioX * oldVbW;
          const cursorVbY = current.panY + ratioY * oldVbH;
          const newVbW = SURFACE_WIDTH / newZoom;
          const newVbH = SURFACE_HEIGHT / newZoom;
          return {
            zoom: newZoom,
            panX: cursorVbX - ratioX * newVbW,
            panY: cursorVbY - ratioY * newVbH,
          };
        });
        return;
      }

      setViewport((current) => ({
        zoom: current.zoom,
        panX: current.panX + event.deltaX / current.zoom,
        panY: current.panY + event.deltaY / current.zoom,
      }));
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, []);

  const planSegments = storeyId
    ? project.walls
        .filter((wall) => wall.storeyId === storeyId)
        .map((wall) => ({ start: wall.start, end: wall.end }))
    : [];

  const planMapping = storeyId
    ? createPointMapping(planBounds(projectPlanView(project, storeyId)))
    : undefined;

  const planFootprints = (() => {
    if (storeyId === undefined) return new Map<string, WallFootprint>();
    const wallsInStorey = project.walls.filter((wall) => wall.storeyId === storeyId);
    const map = new Map<string, WallFootprint>();
    for (const footprint of buildWallNetwork(wallsInStorey)) {
      map.set(footprint.wallId, footprint);
    }
    return map;
  })();

  const elevationProjection = elevationSide ? projectElevationView(project, elevationSide) : undefined;
  const elevationMapping = elevationProjection
    ? createPointMapping(elevationBounds(elevationProjection))
    : undefined;

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button === 1 && svgRef.current) {
      event.preventDefault();
      event.stopPropagation();
      setIsPanning(true);
      panLastPos.current = { x: event.clientX, y: event.clientY };
      panPointerId.current = event.pointerId;
      svgRef.current.setPointerCapture(event.pointerId);
    }
  };

  const eventToWorldWith = (
    event: { clientX: number; clientY: number },
    mapping: PointMapping,
  ): Point2D | undefined => {
    if (!svgRef.current) return undefined;
    const vb = eventToViewBoxPoint(svgRef.current, event.clientX, event.clientY);
    return mapping.unproject(vb);
  };

  const snapToGrid = (value: number) => Math.round(value / PLAN_GRID_SIZE) * PLAN_GRID_SIZE;
  const roundToMm = (value: number) => Math.round(value * 1000) / 1000;
  const roundPointToMm = (point: Point2D): Point2D => ({
    x: roundToMm(point.x),
    y: roundToMm(point.y),
  });

  const beginDragWith = (
    event: PointerEvent<SVGElement>,
    mapping: PointMapping | undefined,
    factory: (
      pointerId: number,
      startWorld: Point2D,
      mapping: PointMapping,
    ) => DragState | undefined,
  ) => {
    if (project.activeTool !== "select") return;
    if (event.button !== 0) return;
    if (!svgRef.current || !mapping) return;

    const startWorld = eventToWorldWith(event, mapping);
    if (!startWorld) return;
    const next = factory(event.pointerId, startWorld, mapping);
    if (!next) return;

    event.stopPropagation();
    svgRef.current.setPointerCapture(event.pointerId);
    setDragState(next);
  };

  const beginElementDrag = (
    event: PointerEvent<SVGElement>,
    factory: (
      pointerId: number,
      startWorld: Point2D,
      mapping: PointMapping,
    ) => DragState | undefined,
  ) => beginDragWith(event, planMapping, factory);

  const onWallElementPointerDown: PlanDragHandlers["onWallPointerDown"] = (event, wallId) => {
    if (storeyId === undefined) return;
    const wall = project.walls.find((candidate) => candidate.id === wallId);
    if (!wall) return;
    beginElementDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "wall-translate",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      wallId,
      origStart: wall.start,
      origEnd: wall.end,
    }));
  };

  const onOpeningElementPointerDown: PlanDragHandlers["onOpeningPointerDown"] = (event, openingId) => {
    if (storeyId === undefined) return;
    const opening = project.openings.find((candidate) => candidate.id === openingId);
    if (!opening) return;
    const wall = project.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return;
    beginElementDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "opening",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      openingId,
      wallStart: wall.start,
      wallEnd: wall.end,
      origOffset: opening.offset,
      openingWidth: opening.width,
    }));
  };

  const onBalconyElementPointerDown: PlanDragHandlers["onBalconyPointerDown"] = (event, balconyId) => {
    if (storeyId === undefined) return;
    const balcony = project.balconies.find((candidate) => candidate.id === balconyId);
    if (!balcony) return;
    const wall = project.walls.find((candidate) => candidate.id === balcony.attachedWallId);
    if (!wall) return;
    beginElementDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "balcony",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      balconyId,
      wallStart: wall.start,
      wallEnd: wall.end,
      origOffset: balcony.offset,
      balconyWidth: balcony.width,
    }));
  };

  const onWallEndpointHandlePointerDown: PlanDragHandlers["onWallEndpointPointerDown"] = (
    event,
    wallId,
    endpoint,
  ) => {
    if (storeyId === undefined) return;
    const wall = project.walls.find((candidate) => candidate.id === wallId);
    if (!wall) return;
    const origPoint = endpoint === "start" ? wall.start : wall.end;
    const fixedPoint = endpoint === "start" ? wall.end : wall.start;
    beginElementDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "wall-endpoint",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      wallId,
      endpoint,
      origPoint,
      fixedPoint,
    }));
  };

  const planDragHandlers: PlanDragHandlers = {
    onWallPointerDown: onWallElementPointerDown,
    onOpeningPointerDown: onOpeningElementPointerDown,
    onBalconyPointerDown: onBalconyElementPointerDown,
    onWallEndpointPointerDown: onWallEndpointHandlePointerDown,
  };

  const onElevationOpeningPointerDown: ElevationDragHandlers["onOpeningPointerDown"] = (event, openingId) => {
    const opening = project.openings.find((candidate) => candidate.id === openingId);
    if (!opening) return;
    const wall = project.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return;
    const storey = project.storeys.find((candidate) => candidate.id === wall.storeyId);
    const wallLen = wallLength(wall);
    beginDragWith(event, elevationMapping, (pointerId, startWorld, mapping) => ({
      kind: "elev-opening-move",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      openingId,
      origOffset: opening.offset,
      origSill: opening.sillHeight,
      width: opening.width,
      height: opening.height,
      wallLen,
      storeyHeight: storey?.height ?? wall.height,
    }));
  };

  const onElevationOpeningCornerPointerDown: ElevationDragHandlers["onOpeningCornerPointerDown"] = (
    event,
    openingId,
    corner,
  ) => {
    const opening = project.openings.find((candidate) => candidate.id === openingId);
    if (!opening) return;
    const wall = project.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return;
    const storey = project.storeys.find((candidate) => candidate.id === wall.storeyId);
    const wallLen = wallLength(wall);
    beginDragWith(event, elevationMapping, (pointerId, startWorld, mapping) => ({
      kind: "elev-opening-resize",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      openingId,
      corner,
      origOffset: opening.offset,
      origSill: opening.sillHeight,
      origWidth: opening.width,
      origHeight: opening.height,
      wallLen,
      storeyHeight: storey?.height ?? wall.height,
    }));
  };

  const onElevationBalconyPointerDown: ElevationDragHandlers["onBalconyPointerDown"] = (event, balconyId) => {
    const balcony = project.balconies.find((candidate) => candidate.id === balconyId);
    if (!balcony) return;
    const wall = project.walls.find((candidate) => candidate.id === balcony.attachedWallId);
    if (!wall) return;
    const wallLen = wallLength(wall);
    beginDragWith(event, elevationMapping, (pointerId, startWorld, mapping) => ({
      kind: "elev-balcony-move",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      balconyId,
      origOffset: balcony.offset,
      width: balcony.width,
      wallLen,
    }));
  };

  const onElevationBalconyEdgePointerDown: ElevationDragHandlers["onBalconyEdgePointerDown"] = (
    event,
    balconyId,
    edge,
  ) => {
    const balcony = project.balconies.find((candidate) => candidate.id === balconyId);
    if (!balcony) return;
    const wall = project.walls.find((candidate) => candidate.id === balcony.attachedWallId);
    if (!wall) return;
    const wallLen = wallLength(wall);
    beginDragWith(event, elevationMapping, (pointerId, startWorld, mapping) => ({
      kind: "elev-balcony-resize",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      balconyId,
      edge,
      origOffset: balcony.offset,
      origWidth: balcony.width,
      wallLen,
    }));
  };

  const elevationDragHandlers: ElevationDragHandlers = {
    onOpeningPointerDown: onElevationOpeningPointerDown,
    onOpeningCornerPointerDown: onElevationOpeningCornerPointerDown,
    onBalconyPointerDown: onElevationBalconyPointerDown,
    onBalconyEdgePointerDown: onElevationBalconyEdgePointerDown,
  };

  const otherWallSegments = (excludeWallId?: string) =>
    storeyId === undefined
      ? []
      : project.walls
          .filter((wall) => wall.storeyId === storeyId && wall.id !== excludeWallId)
          .map((wall) => ({ start: wall.start, end: wall.end }));

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const applyDrag = (state: DragState, currentWorld: Point2D) => {
    const dx = currentWorld.x - state.startWorld.x;
    const dy = currentWorld.y - state.startWorld.y;

    try {
      switch (state.kind) {
        case "wall-translate": {
          const others = otherWallSegments(state.wallId);
          const candStart = { x: state.origStart.x + dx, y: state.origStart.y + dy };
          const candEnd = { x: state.origEnd.x + dx, y: state.origEnd.y + dy };
          const snapStart = snapToEndpoint(candStart, others, PLAN_ENDPOINT_THRESHOLD);
          const snapEnd = snapToEndpoint(candEnd, others, PLAN_ENDPOINT_THRESHOLD);

          const distStart = snapStart ? Math.hypot(snapStart.x - candStart.x, snapStart.y - candStart.y) : Infinity;
          const distEnd = snapEnd ? Math.hypot(snapEnd.x - candEnd.x, snapEnd.y - candEnd.y) : Infinity;

          let finalDx: number;
          let finalDy: number;
          let snapHit: Point2D | null = null;
          if (snapStart && distStart <= distEnd) {
            finalDx = snapStart.x - state.origStart.x;
            finalDy = snapStart.y - state.origStart.y;
            snapHit = snapStart;
          } else if (snapEnd) {
            finalDx = snapEnd.x - state.origEnd.x;
            finalDy = snapEnd.y - state.origEnd.y;
            snapHit = snapEnd;
          } else {
            finalDx = snapToGrid(dx);
            finalDy = snapToGrid(dy);
          }
          setActiveSnap(snapHit);

          const newStart = roundPointToMm({ x: state.origStart.x + finalDx, y: state.origStart.y + finalDy });
          const newEnd = roundPointToMm({ x: state.origEnd.x + finalDx, y: state.origEnd.y + finalDy });
          onProjectChange(moveWall(project, state.wallId, newStart, newEnd));
          break;
        }
        case "wall-endpoint": {
          const others = otherWallSegments(state.wallId);
          const candidate = { x: state.origPoint.x + dx, y: state.origPoint.y + dy };
          const endpointSnap = snapToEndpoint(candidate, others, PLAN_ENDPOINT_THRESHOLD);
          setActiveSnap(endpointSnap ?? null);
          const newPt = roundPointToMm(
            snapPlanPoint(candidate, others, {
              gridSize: PLAN_GRID_SIZE,
              endpointThreshold: PLAN_ENDPOINT_THRESHOLD,
            }),
          );
          const newStart = state.endpoint === "start" ? newPt : roundPointToMm(state.fixedPoint);
          const newEnd = state.endpoint === "end" ? newPt : roundPointToMm(state.fixedPoint);
          onProjectChange(moveWall(project, state.wallId, newStart, newEnd));
          break;
        }
        case "opening":
        case "balcony": {
          const wx = state.wallEnd.x - state.wallStart.x;
          const wy = state.wallEnd.y - state.wallStart.y;
          const len = Math.hypot(wx, wy);
          if (len === 0) return;
          const ux = wx / len;
          const uy = wy / len;
          const offsetDelta = dx * ux + dy * uy;
          const width = state.kind === "opening" ? state.openingWidth : state.balconyWidth;
          const raw = state.origOffset + offsetDelta;
          const clamped = Math.max(0, Math.min(Math.max(0, len - width), raw));
          const snapped = roundToMm(snapToGrid(clamped));
          if (state.kind === "opening") {
            onProjectChange(updateOpening(project, state.openingId, { offset: snapped }));
          } else {
            onProjectChange(updateBalcony(project, state.balconyId, { offset: snapped }));
          }
          break;
        }
        case "elev-opening-move": {
          const newOffset = clamp(state.origOffset + dx, 0, Math.max(0, state.wallLen - state.width));
          const maxSill = Math.max(0, state.storeyHeight - state.height);
          const newSill = clamp(state.origSill + dy, 0, maxSill);
          onProjectChange(
            updateOpening(project, state.openingId, {
              offset: roundToMm(snapToGrid(newOffset)),
              sillHeight: roundToMm(snapToGrid(newSill)),
            }),
          );
          break;
        }
        case "elev-opening-resize": {
          const minSize = 0.05;
          let newOffset = state.origOffset;
          let newSill = state.origSill;
          let newWidth = state.origWidth;
          let newHeight = state.origHeight;

          if (state.corner === "tl" || state.corner === "bl") {
            const limited = Math.min(dx, state.origWidth - minSize);
            newOffset = state.origOffset + limited;
            newWidth = state.origWidth - limited;
          } else {
            newWidth = Math.max(minSize, state.origWidth + dx);
          }

          if (state.corner === "bl" || state.corner === "br") {
            const limited = Math.min(dy, state.origHeight - minSize);
            newSill = state.origSill + limited;
            newHeight = state.origHeight - limited;
          } else {
            newHeight = Math.max(minSize, state.origHeight + dy);
          }

          if (newOffset < 0) {
            newWidth += newOffset;
            newOffset = 0;
          }
          if (newSill < 0) {
            newHeight += newSill;
            newSill = 0;
          }
          if (newOffset + newWidth > state.wallLen) {
            newWidth = state.wallLen - newOffset;
          }
          if (newSill + newHeight > state.storeyHeight) {
            newHeight = state.storeyHeight - newSill;
          }
          if (newWidth < minSize || newHeight < minSize) return;

          onProjectChange(
            updateOpening(project, state.openingId, {
              offset: roundToMm(snapToGrid(newOffset)),
              sillHeight: roundToMm(snapToGrid(newSill)),
              width: roundToMm(snapToGrid(newWidth)),
              height: roundToMm(snapToGrid(newHeight)),
            }),
          );
          break;
        }
        case "elev-balcony-move": {
          const newOffset = clamp(state.origOffset + dx, 0, Math.max(0, state.wallLen - state.width));
          onProjectChange(
            updateBalcony(project, state.balconyId, {
              offset: roundToMm(snapToGrid(newOffset)),
            }),
          );
          break;
        }
        case "elev-balcony-resize": {
          const minSize = 0.3;
          let newOffset = state.origOffset;
          let newWidth = state.origWidth;
          if (state.edge === "l") {
            const limited = Math.min(dx, state.origWidth - minSize);
            newOffset = state.origOffset + limited;
            newWidth = state.origWidth - limited;
          } else {
            newWidth = Math.max(minSize, state.origWidth + dx);
          }
          if (newOffset < 0) {
            newWidth += newOffset;
            newOffset = 0;
          }
          if (newOffset + newWidth > state.wallLen) {
            newWidth = state.wallLen - newOffset;
          }
          if (newWidth < minSize) return;
          onProjectChange(
            updateBalcony(project, state.balconyId, {
              offset: roundToMm(snapToGrid(newOffset)),
              width: roundToMm(snapToGrid(newWidth)),
            }),
          );
          break;
        }
      }
    } catch {
      // invalid move — keep last valid state
    }
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (dragState && event.pointerId === dragState.pointerId) {
      const currentWorld = eventToWorldWith(event, dragState.mapping);
      if (!currentWorld) return;
      const dx = currentWorld.x - dragState.startWorld.x;
      const dy = currentWorld.y - dragState.startWorld.y;
      if (!dragState.moved && Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD_WORLD) return;
      if (!dragState.moved) {
        setDragState({ ...dragState, moved: true });
      }
      applyDrag(dragState, currentWorld);
      return;
    }

    if (!isPanning || event.pointerId !== panPointerId.current || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dx = ((event.clientX - panLastPos.current.x) * SURFACE_WIDTH) / (rect.width * viewport.zoom);
    const dy = ((event.clientY - panLastPos.current.y) * SURFACE_HEIGHT) / (rect.height * viewport.zoom);
    panLastPos.current = { x: event.clientX, y: event.clientY };
    setViewport((current) => ({ ...current, panX: current.panX - dx, panY: current.panY - dy }));
  };

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (dragState && event.pointerId === dragState.pointerId) {
      const wasMoved = dragState.moved;
      const finished = dragState;
      setDragState(undefined);
      setActiveSnap(null);
      if (svgRef.current?.hasPointerCapture(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }
      if (!wasMoved) {
        switch (finished.kind) {
          case "wall-translate":
            onSelect({ kind: "wall", id: finished.wallId });
            break;
          case "opening":
          case "elev-opening-move":
            onSelect({ kind: "opening", id: finished.openingId });
            break;
          case "balcony":
          case "elev-balcony-move":
            onSelect({ kind: "balcony", id: finished.balconyId });
            break;
          // resize/endpoint handles: keep selection
        }
      }
      return;
    }

    if (event.pointerId !== panPointerId.current) return;
    setIsPanning(false);
    panPointerId.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const ambientSelect = () => {
    if (storeyId) {
      onSelect({ kind: "storey", id: storeyId });
    } else {
      onSelect(undefined);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    ambientSelect();
  };

  const resetViewport = () => setViewport(DEFAULT_VIEWPORT);
  const isViewportTransformed =
    viewport.zoom !== 1 || viewport.panX !== 0 || viewport.panY !== 0;

  return (
    <section className="drawing-surface" aria-label="2D drawing surface">
      <svg
        ref={svgRef}
        viewBox={`${viewport.panX} ${viewport.panY} ${SURFACE_WIDTH / viewport.zoom} ${SURFACE_HEIGHT / viewport.zoom}`}
        role="group"
        aria-label="当前 2D 结构视图"
        tabIndex={-1}
        style={{ cursor: isPanning ? "grabbing" : undefined }}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <rect
          className="surface-grid"
          x="0"
          y="0"
          width={SURFACE_WIDTH}
          height={SURFACE_HEIGHT}
          onClick={ambientSelect}
        />
        {storeyId
          ? renderPlan(
              projectPlanView(project, storeyId),
              project.selection,
              onSelect,
              project.activeTool,
              planFootprints,
              activeSnap,
              planDragHandlers,
            )
          : elevationProjection
            ? renderElevation(
                elevationProjection,
                project.selection,
                onSelect,
                project.activeTool,
                elevationDragHandlers,
              )
            : renderRoofPlaceholder()}
      </svg>
      {isViewportTransformed ? (
        <button
          type="button"
          className="zoom-reset"
          onClick={resetViewport}
          title="重置缩放"
          aria-label="重置缩放"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>
      ) : null}
    </section>
  );
}
