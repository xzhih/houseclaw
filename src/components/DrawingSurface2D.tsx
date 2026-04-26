import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import type { ObjectSelection } from "../domain/selection";
import { isSelected } from "../domain/selection";
import { addWall } from "../domain/mutations";
import type { HouseProject, ToolId, ViewId } from "../domain/types";
import { createWallDraft } from "../domain/walls";
import { snapPlanPoint } from "../geometry/snapping";
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
) {
  const commonProps = {
    role: "button",
    tabIndex: 0,
    "aria-label": `选择阳台 ${balconyId}`,
    "aria-pressed": selected,
    className: selected ? `${props.className} is-selected` : props.className,
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
) {
  const { project: projectPoint } = createPointMapping(planBounds(projection));
  const wallsById = new Map(projection.wallSegments.map((wall) => [wall.wallId, wall]));

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
            onClick={(event) => {
              if (activeTool === "wall") {
                event.stopPropagation();
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
            )}
          </g>
        );
      })}
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

export function DrawingSurface2D({ project, onSelect, onProjectChange }: DrawingSurface2DProps) {
  const storeyId = PLAN_STOREY_BY_VIEW[project.activeView];
  const elevationSide = ELEVATION_SIDE_BY_VIEW[project.activeView];
  const wallToolActive = project.activeTool === "wall" && storeyId !== undefined;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [pendingStart, setPendingStart] = useState<Point2D | undefined>(undefined);
  const [wallError, setWallError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setPendingStart(undefined);
    setWallError(undefined);
  }, [project.id, project.activeView, project.activeTool]);

  const planSegments = storeyId
    ? project.walls
        .filter((wall) => wall.storeyId === storeyId)
        .map((wall) => ({ start: wall.start, end: wall.end }))
    : [];

  const planMapping = storeyId
    ? createPointMapping(planBounds(projectPlanView(project, storeyId)))
    : undefined;

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
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

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (pendingStart) {
      setPendingStart(undefined);
      return;
    }
    onSelect(undefined);
  };

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
        viewBox={`0 0 ${SURFACE_WIDTH} ${SURFACE_HEIGHT}`}
        role="group"
        aria-label="当前 2D 结构视图"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
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
          ? renderPlan(projectPlanView(project, storeyId), project.selection, onSelect, project.activeTool)
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
    </section>
  );
}
