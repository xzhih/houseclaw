import type { HouseProject, ViewId } from "../domain/types";
import { projectElevationView } from "../projection/elevation";
import { projectPlanView } from "../projection/plan";
import type {
  ElevationProjection,
  ElevationSide,
  PlanOpeningGlyph,
  PlanProjection,
  PlanWallSegment,
} from "../projection/types";

const SURFACE_WIDTH = 720;
const SURFACE_HEIGHT = 520;
const SURFACE_PADDING = 48;

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
  onSelectObject: (objectId: string | undefined) => void;
};

type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type ProjectPoint = (point: { x: number; y: number }) => { x: number; y: number };

function createPointProjector(bounds: Bounds): ProjectPoint {
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

  return (point) => ({
    x: offsetX + (point.x - bounds.minX) * scale,
    y: SURFACE_HEIGHT - offsetY - (point.y - bounds.minY) * scale,
  });
}

function planBounds(projection: PlanProjection): Bounds {
  const points = projection.wallSegments.flatMap((wall) => [wall.start, wall.end]);
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

function renderPlan(projection: PlanProjection, selectedObjectId: string | undefined, onSelectObject: DrawingSurface2DProps["onSelectObject"]) {
  const projectPoint = createPointProjector(planBounds(projection));
  const wallsById = new Map(projection.wallSegments.map((wall) => [wall.wallId, wall]));

  return (
    <>
      {projection.wallSegments.map((wall) => {
        const start = projectPoint(wall.start);
        const end = projectPoint(wall.end);
        return (
          <line
            key={wall.wallId}
            className="plan-wall"
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            strokeWidth={Math.max(wall.thickness * 20, 6)}
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
        const selected = selectedObjectId === opening.openingId;

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
              onClick={() => onSelectObject(opening.openingId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectObject(opening.openingId);
                }
              }}
            />
          </g>
        );
      })}
    </>
  );
}

function renderElevation(
  projection: ElevationProjection,
  selectedObjectId: string | undefined,
  onSelectObject: DrawingSurface2DProps["onSelectObject"],
) {
  const projectPoint = createPointProjector(elevationBounds(projection));

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
        const selected = selectedObjectId === opening.openingId;

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
            onClick={() => onSelectObject(opening.openingId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectObject(opening.openingId);
              }
            }}
          />
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

export function DrawingSurface2D({ project, onSelectObject }: DrawingSurface2DProps) {
  const storeyId = PLAN_STOREY_BY_VIEW[project.activeView];
  const elevationSide = ELEVATION_SIDE_BY_VIEW[project.activeView];

  return (
    <section className="drawing-surface" aria-label="2D drawing surface">
      <svg viewBox={`0 0 ${SURFACE_WIDTH} ${SURFACE_HEIGHT}`} role="group" aria-label="当前 2D 结构视图">
        <rect className="surface-grid" x="0" y="0" width={SURFACE_WIDTH} height={SURFACE_HEIGHT} />
        {storeyId
          ? renderPlan(projectPlanView(project, storeyId), project.selectedObjectId, onSelectObject)
          : elevationSide
            ? renderElevation(projectElevationView(project, elevationSide), project.selectedObjectId, onSelectObject)
            : renderRoofPlaceholder()}
      </svg>
    </section>
  );
}
