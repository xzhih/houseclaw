import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import type { ObjectSelection } from "../domain/selection";
import { isSelected } from "../domain/selection";
import {
  addBalcony,
  addOpening,
  addWall,
  applyWallMaterial,
  moveWall,
  updateBalcony,
  updateOpening,
} from "../domain/mutations";
import { createBalconyDraft, createOpeningDraft } from "../domain/drafts";
import type { HouseProject, Point2, ToolId, ViewId } from "../domain/types";
import { createWallDraft } from "../domain/walls";
import { snapPlanPoint, snapToEndpoint } from "../geometry/snapping";
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
const PENDING_DEDUPE_EPSILON = 1e-6;
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
  activeMaterialId: string;
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
  onWallActivate: (event: MouseEvent<SVGElement>, wallId: string) => void;
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
    onClick: (event: MouseEvent<SVGElement>) => {
      if (activeTool === "wall") {
        event.stopPropagation();
        return;
      }
      onSelect({ kind: "balcony", id: balconyId });
    },
    onKeyDown: (event: KeyboardEvent<SVGElement>) => {
      if (activeTool === "wall") return;
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
        const start = projectPoint(wall.start);
        const end = projectPoint(wall.end);
        const selected = isSelected(selection, "wall", wall.wallId);
        const className = selected ? "plan-wall is-selected" : "plan-wall";

        return (
          <line
            key={wall.wallId}
            role="button"
            tabIndex={0}
            aria-label={`选择墙 ${wall.wallId}`}
            aria-pressed={selected}
            className={className}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            strokeWidth={Math.max(wall.thickness * 20, 6)}
            onPointerDown={(event) => handlers?.onWallPointerDown(event, wall.wallId)}
            onClick={(event) => {
              if (activeTool === "wall") {
                event.stopPropagation();
                return;
              }
              if (activeTool !== "select" && handlers?.onWallActivate) {
                handlers.onWallActivate(event, wall.wallId);
                return;
              }
              onSelect({ kind: "wall", id: wall.wallId });
            }}
            onKeyDown={(event) => {
              if (activeTool === "wall") return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect({ kind: "wall", id: wall.wallId });
              }
            }}
          />
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
              className="plan-opening-gap"
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
            />
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
              onClick={(event) => {
                if (activeTool === "wall") {
                  event.stopPropagation();
                  return;
                }
                onSelect({ kind: "opening", id: opening.openingId });
              }}
              onKeyDown={(event) => {
                if (activeTool === "wall") return;
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
    </>
  );
}

function renderElevation(
  projection: ElevationProjection,
  selection: ObjectSelection | undefined,
  onSelect: DrawingSurface2DProps["onSelect"],
  activeTool: ToolId,
) {
  const { project: projectPoint } = createPointMapping(elevationBounds(projection));

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
            onClick={(event) => {
              if (activeTool === "wall") {
                event.stopPropagation();
                return;
              }
              onSelect({ kind: "opening", id: opening.openingId });
            }}
            onKeyDown={(event) => {
              if (activeTool === "wall") return;
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
            )}
          </g>
        );
      })}
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
  activeMaterialId,
}: DrawingSurface2DProps) {
  const storeyId = PLAN_STOREY_BY_VIEW[project.activeView];
  const elevationSide = ELEVATION_SIDE_BY_VIEW[project.activeView];
  const wallToolActive = project.activeTool === "wall" && storeyId !== undefined;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [pendingStart, setPendingStart] = useState<Point2D | undefined>(undefined);
  const [wallError, setWallError] = useState<string | undefined>(undefined);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const panLastPos = useRef({ x: 0, y: 0 });
  const panPointerId = useRef<number | null>(null);
  const [dragState, setDragState] = useState<DragState | undefined>(undefined);

  useEffect(() => {
    setPendingStart(undefined);
    setWallError(undefined);
  }, [project.id, project.activeView, project.activeTool]);

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

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button === 1 && svgRef.current) {
      event.preventDefault();
      event.stopPropagation();
      setIsPanning(true);
      panLastPos.current = { x: event.clientX, y: event.clientY };
      panPointerId.current = event.pointerId;
      svgRef.current.setPointerCapture(event.pointerId);
      return;
    }

    if (!wallToolActive || !storeyId || !svgRef.current || !planMapping) return;

    event.preventDefault();
    event.stopPropagation();

    const viewBoxPoint = eventToViewBoxPoint(svgRef.current, event.clientX, event.clientY);
    const worldRaw = planMapping.unproject(viewBoxPoint);
    const snapped = snapPlanPoint(worldRaw, planSegments, {
      gridSize: PLAN_GRID_SIZE,
      endpointThreshold: PLAN_ENDPOINT_THRESHOLD,
    });

    if (!pendingStart) {
      setPendingStart(snapped);
      return;
    }

    if (Math.hypot(snapped.x - pendingStart.x, snapped.y - pendingStart.y) < PENDING_DEDUPE_EPSILON) {
      // Two near-identical clicks would create a zero-length wall — ignore the second.
      return;
    }

    try {
      const next = addWall(project, createWallDraft(project, storeyId, pendingStart, snapped));
      onProjectChange(next);
      setWallError(undefined);
    } catch (error) {
      setWallError(error instanceof Error ? error.message : "无法创建墙：未知错误。");
    } finally {
      setPendingStart(undefined);
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

  const beginElementDrag = (
    event: PointerEvent<SVGElement>,
    factory: (
      pointerId: number,
      startWorld: Point2D,
      mapping: PointMapping,
    ) => DragState | undefined,
  ) => {
    if (project.activeTool !== "select") return;
    if (event.button !== 0) return;
    if (!svgRef.current || !planMapping) return;

    const startWorld = eventToWorldWith(event, planMapping);
    if (!startWorld) return;
    const next = factory(event.pointerId, startWorld, planMapping);
    if (!next) return;

    event.stopPropagation();
    svgRef.current.setPointerCapture(event.pointerId);
    setDragState(next);
  };

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

  const onWallActivate: PlanDragHandlers["onWallActivate"] = (event, wallId) => {
    if (storeyId === undefined || !planMapping) return;
    const wall = project.walls.find((candidate) => candidate.id === wallId);
    if (!wall) return;
    const tool = project.activeTool;
    if (tool !== "door" && tool !== "window" && tool !== "opening" && tool !== "balcony" && tool !== "material") {
      return;
    }
    event.stopPropagation();
    const worldPoint = eventToWorldWith(event, planMapping);
    if (!worldPoint) return;

    const wx = wall.end.x - wall.start.x;
    const wy = wall.end.y - wall.start.y;
    const len = Math.hypot(wx, wy);
    if (len === 0) return;
    const ux = wx / len;
    const uy = wy / len;
    const t = (worldPoint.x - wall.start.x) * ux + (worldPoint.y - wall.start.y) * uy;

    try {
      if (tool === "material") {
        if (!activeMaterialId) return;
        onProjectChange(applyWallMaterial(project, wall.id, activeMaterialId));
        return;
      }
      if (tool === "balcony") {
        const draft = createBalconyDraft(project, wall, t);
        onProjectChange(addBalcony(project, draft));
        onSelect({ kind: "balcony", id: draft.id });
        return;
      }
      const openingType = tool === "door" ? "door" : tool === "window" ? "window" : "void";
      const draft = createOpeningDraft(project, wall, openingType, t);
      onProjectChange(addOpening(project, draft));
      onSelect({ kind: "opening", id: draft.id });
    } catch {
      // assertValidProject rejected; keep last valid state
    }
  };

  const planDragHandlers: PlanDragHandlers = {
    onWallPointerDown: onWallElementPointerDown,
    onOpeningPointerDown: onOpeningElementPointerDown,
    onBalconyPointerDown: onBalconyElementPointerDown,
    onWallEndpointPointerDown: onWallEndpointHandlePointerDown,
    onWallActivate,
  };

  const otherWallSegments = (excludeWallId?: string) =>
    storeyId === undefined
      ? []
      : project.walls
          .filter((wall) => wall.storeyId === storeyId && wall.id !== excludeWallId)
          .map((wall) => ({ start: wall.start, end: wall.end }));

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
          if (snapStart && distStart <= distEnd) {
            finalDx = snapStart.x - state.origStart.x;
            finalDy = snapStart.y - state.origStart.y;
          } else if (snapEnd) {
            finalDx = snapEnd.x - state.origEnd.x;
            finalDy = snapEnd.y - state.origEnd.y;
          } else {
            finalDx = snapToGrid(dx);
            finalDy = snapToGrid(dy);
          }

          const newStart = roundPointToMm({ x: state.origStart.x + finalDx, y: state.origStart.y + finalDy });
          const newEnd = roundPointToMm({ x: state.origEnd.x + finalDx, y: state.origEnd.y + finalDy });
          onProjectChange(moveWall(project, state.wallId, newStart, newEnd));
          break;
        }
        case "wall-endpoint": {
          const others = otherWallSegments(state.wallId);
          const candidate = { x: state.origPoint.x + dx, y: state.origPoint.y + dy };
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
      if (svgRef.current?.hasPointerCapture(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }
      if (!wasMoved) {
        switch (finished.kind) {
          case "wall-translate":
            onSelect({ kind: "wall", id: finished.wallId });
            break;
          case "opening":
            onSelect({ kind: "opening", id: finished.openingId });
            break;
          case "balcony":
            onSelect({ kind: "balcony", id: finished.balconyId });
            break;
          // wall-endpoint: clicking handle without dragging — keep selection
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

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (pendingStart) {
      setPendingStart(undefined);
      return;
    }
    onSelect(undefined);
  };

  const resetViewport = () => setViewport(DEFAULT_VIEWPORT);
  const isViewportTransformed =
    viewport.zoom !== 1 || viewport.panX !== 0 || viewport.panY !== 0;

  const pendingMarker = pendingStart && planMapping ? planMapping.project(pendingStart) : undefined;

  return (
    <section className="drawing-surface" aria-label="2D drawing surface">
      {wallToolActive ? (
        <p className="surface-banner" role="status">
          墙工具：点击两点画墙；按 Esc 取消
        </p>
      ) : null}
      {wallError ? (
        <p className="surface-error" role="alert">
          {wallError}
        </p>
      ) : null}
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
          onClick={() => {
            if (wallToolActive) return;
            onSelect(undefined);
          }}
        />
        {storeyId
          ? renderPlan(
              projectPlanView(project, storeyId),
              project.selection,
              onSelect,
              project.activeTool,
              planDragHandlers,
            )
          : elevationSide
            ? renderElevation(
                projectElevationView(project, elevationSide),
                project.selection,
                onSelect,
                project.activeTool,
              )
            : renderRoofPlaceholder()}
        {pendingMarker ? (
          <circle
            className="wall-pending-marker"
            cx={pendingMarker.x}
            cy={pendingMarker.y}
            r={6}
          />
        ) : null}
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
