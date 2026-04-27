import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ObjectSelection } from "../domain/selection";
import { isSelected } from "../domain/selection";
import { wallLength } from "../domain/measurements";
import { addRoof, moveWall, translateStorey, updateBalcony, updateOpening, updateStair } from "../domain/mutations";
import { rotatePoint } from "../domain/stairs";
import type { HouseProject, Point2, ToolId, ViewId } from "../domain/types";
import { canBuildRoof, planStoreyIdFromView } from "../domain/views";
import { snapPlanPoint, snapToEndpoint } from "../geometry/snapping";
import { collectPlanAnchors, findAxisAlignedGuides, type GuideMatch } from "../geometry/smartGuides";
import { buildWallNetwork, slicePanelFootprint, type WallFootprint } from "../geometry/wallNetwork";
import { elevationOffsetSign, projectElevationView } from "../projection/elevation";
import { projectPlanView } from "../projection/plan";
import type {
  ElevationBalconyRect,
  ElevationProjection,
  ElevationSide,
  PlanBalconyGlyph,
  PlanOpeningGlyph,
  PlanProjection,
  PlanStairSymbol,
  PlanWallSegment,
} from "../projection/types";
import { GridOverlay } from "./canvas/GridOverlay";
import { ScaleRuler } from "./canvas/ScaleRuler";
import { SmartGuides } from "./canvas/SmartGuides";
import { StatusReadout } from "./canvas/StatusReadout";
import { ZoomControls } from "./canvas/ZoomControls";
import type { Bounds, DragReadout, Point2D, PointMapping, Viewport } from "./canvas/types";

const SURFACE_WIDTH = 720;
const SURFACE_HEIGHT = 520;
const SURFACE_PADDING = 48;

const PLAN_GRID_SIZE = 0.1;
const PLAN_ENDPOINT_THRESHOLD = 0.2;
const DRAG_MOVE_THRESHOLD_WORLD = 0.04;
const ENDPOINT_HANDLE_RADIUS = 7;

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
      kind: "plan-opening-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      edge: "l" | "r";
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      origWidth: number;
      wallLen: number;
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
      kind: "plan-balcony-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      edge: "l" | "r";
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      origWidth: number;
      wallLen: number;
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
      projSign: 1 | -1;
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
      projSign: 1 | -1;
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
      projSign: 1 | -1;
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
      projSign: 1 | -1;
    }
  | {
      kind: "stair-translate";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      storeyId: string;
      origX: number;
      origY: number;
    }
  | {
      kind: "stair-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      storeyId: string;
      corner: "bl" | "br" | "tr" | "tl";
      worldAnchor: Point2D;
      origRotation: number;
    }
  | {
      kind: "stair-rotate";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      storeyId: string;
      center: Point2D;
      initialMouseAngle: number;
      origRotation: number;
    }
  | {
      kind: "elev-storey-translate";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      storeyId: string;
      side: ElevationSide;
      origProject: HouseProject;
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
  onOpeningEdgePointerDown: (
    event: PointerEvent<SVGElement>,
    openingId: string,
    edge: "l" | "r",
  ) => void;
  onBalconyEdgePointerDown: (
    event: PointerEvent<SVGElement>,
    balconyId: string,
    edge: "l" | "r",
  ) => void;
  onStairBodyPointerDown: (
    event: PointerEvent<SVGElement>,
    storeyId: string,
  ) => void;
  onStairCornerPointerDown: (
    event: PointerEvent<SVGElement>,
    storeyId: string,
    corner: "bl" | "br" | "tr" | "tl",
  ) => void;
  onStairRotatePointerDown: (
    event: PointerEvent<SVGElement>,
    storeyId: string,
  ) => void;
};

type ElevationDragHandlers = {
  onStoreyPointerDown: (event: PointerEvent<SVGElement>, storeyId: string) => void;
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

function unionBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minY: Math.min(a.minY, b.minY),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function elevationAxisToWorld(side: ElevationSide, dxAxis: number): { dx: number; dy: number } {
  switch (side) {
    case "front":
      return { dx: dxAxis, dy: 0 };
    case "back":
      return { dx: -dxAxis, dy: 0 };
    case "left":
      return { dx: 0, dy: -dxAxis };
    case "right":
      return { dx: 0, dy: dxAxis };
  }
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

function polyPoints(points: Point2D[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(" ");
}

type StairSymbolGeometry = {
  outline: Point2D[];
  flights: Point2D[][];
  landings: Point2D[][];
  treadLines: Array<{ from: Point2D; to: Point2D }>;
  cutLine: Point2D[]; // zig-zag polyline; empty array = no cut drawn
  labelPos: Point2D;
};

function buildStairSymbolGeometry(
  stair: PlanStairSymbol,
  projectPoint: (point: Point2) => Point2D,
): StairSymbolGeometry {
  const { rect, bottomEdge, treadDepth, treadCount, shape } = stair;

  // Rotate a world-space plan point around the stair's center before projecting.
  const rotateAndProject = (p: Point2): Point2D =>
    projectPoint(stair.rotation !== 0 ? rotatePoint(p, stair.center, stair.rotation) : p);

  // Map (run, cross) — local coords where run=0 is bottomEdge — to world (x, y).
  const worldFromRunCross = (run: number, cross: number): Point2 => {
    switch (bottomEdge) {
      case "+y": return { x: rect.x + cross, y: rect.y + rect.depth - run };
      case "-y": return { x: rect.x + cross, y: rect.y + run };
      case "+x": return { x: rect.x + rect.width - run, y: rect.y + cross };
      case "-x": return { x: rect.x + run, y: rect.y + cross };
    }
  };
  const runLength = bottomEdge === "+y" || bottomEdge === "-y" ? rect.depth : rect.width;
  const crossLength = bottomEdge === "+y" || bottomEdge === "-y" ? rect.width : rect.depth;
  const proj = (run: number, cross: number) => rotateAndProject(worldFromRunCross(run, cross));

  const rectAt = (r0: number, c0: number, r1: number, c1: number): Point2D[] => [
    proj(r0, c0), proj(r0, c1), proj(r1, c1), proj(r1, c0),
  ];

  const outline: Point2D[] = [
    rotateAndProject({ x: rect.x, y: rect.y }),
    rotateAndProject({ x: rect.x + rect.width, y: rect.y }),
    rotateAndProject({ x: rect.x + rect.width, y: rect.y + rect.depth }),
    rotateAndProject({ x: rect.x, y: rect.y + rect.depth }),
  ];

  const flights: Point2D[][] = [];
  const landings: Point2D[][] = [];
  const treadLines: Array<{ from: Point2D; to: Point2D }> = [];

  if (shape === "straight") {
    flights.push(rectAt(0, 0, treadCount * treadDepth, crossLength));
    for (let i = 1; i < treadCount; i += 1) {
      treadLines.push({ from: proj(i * treadDepth, 0), to: proj(i * treadDepth, crossLength) });
    }
  } else if (shape === "l") {
    const lw = Math.min(rect.width, rect.depth) / 2;
    const nLow = Math.floor(treadCount / 2);
    const nUp = treadCount - nLow - 1;
    const turn = stair.turn ?? "right";
    const lowerCrossStart = turn === "right" ? 0 : crossLength - lw;
    const lowerCrossEnd = lowerCrossStart + lw;
    flights.push(rectAt(0, lowerCrossStart, nLow * treadDepth, lowerCrossEnd));
    for (let i = 1; i < nLow; i += 1) {
      treadLines.push({
        from: proj(i * treadDepth, lowerCrossStart),
        to: proj(i * treadDepth, lowerCrossEnd),
      });
    }
    landings.push(rectAt(nLow * treadDepth, lowerCrossStart, nLow * treadDepth + lw, lowerCrossEnd));
    const upperCrossStart = turn === "right" ? lw : 0;
    const upperCrossEnd = upperCrossStart + nUp * treadDepth;
    flights.push(rectAt(nLow * treadDepth, upperCrossStart, nLow * treadDepth + lw, upperCrossEnd));
    for (let j = 1; j < nUp; j += 1) {
      const cs = upperCrossStart + j * treadDepth;
      treadLines.push({
        from: proj(nLow * treadDepth, cs),
        to: proj(nLow * treadDepth + lw, cs),
      });
    }
  } else {
    // U
    const GAP = 0.05;
    const flightWidth = (crossLength - GAP) / 2;
    const nLow = Math.floor(treadCount / 2);
    const nUp = treadCount - nLow - 1;
    flights.push(rectAt(0, 0, nLow * treadDepth, flightWidth));
    for (let i = 1; i < nLow; i += 1) {
      treadLines.push({ from: proj(i * treadDepth, 0), to: proj(i * treadDepth, flightWidth) });
    }
    // Upper flight is right-justified to the lower flight's far edge, so the landing
    // sits BEYOND both flights as a clean U-turn rectangle.
    const upperRunEnd = nLow * treadDepth;
    const upperRunStart = upperRunEnd - nUp * treadDepth;
    flights.push(rectAt(upperRunStart, crossLength - flightWidth, upperRunEnd, crossLength));
    for (let j = 1; j < nUp; j += 1) {
      const r = upperRunEnd - j * treadDepth;
      treadLines.push({
        from: proj(r, crossLength - flightWidth),
        to: proj(r, crossLength),
      });
    }
    // Landing: ideally one flight deep, but never beyond the stair bbox.
    const landingNearRun = nLow * treadDepth;
    const landingDepth = Math.max(0, Math.min(flightWidth, runLength - landingNearRun));
    if (landingDepth > 0) {
      landings.push(rectAt(landingNearRun, 0, landingNearRun + landingDepth, crossLength));
    }
  }

  // Label centered on the half being shown:
  // - lower half = run [0, runLength/2] (near bottomEdge, UP arrow on lower flight for U)
  // - upper half = run [runLength/2, runLength]            (DN arrow on upper flight for U)
  const labelRunCenter = stair.half === "lower" ? runLength * 0.25 : runLength * 0.75;
  let labelCross = crossLength / 2;
  if (shape === "u") {
    const GAP = 0.05;
    const flightWidth = (crossLength - GAP) / 2;
    labelCross = stair.half === "lower" ? flightWidth / 2 : crossLength - flightWidth / 2;
  }
  const labelPos = proj(labelRunCenter, labelCross);

  // CAD cut line: zig-zag across the run at midpoint, marking where the upper
  // floor's slab severs the staircase. Drawn on both halves at the same run
  // position (run = runLength / 2).
  const cutRun = runLength / 2;
  const cutOffset = Math.min(0.12, runLength * 0.08); // stagger half-depth
  const cutLine: Point2D[] = [
    proj(cutRun - cutOffset, 0),
    proj(cutRun + cutOffset, crossLength * 0.5),
    proj(cutRun - cutOffset, crossLength),
  ];

  return { outline, flights, landings, treadLines, cutLine, labelPos };
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
  ghost?: PlanProjection,
) {
  const mainBounds = planBounds(projection);
  const bounds = ghost ? unionBounds(mainBounds, planBounds(ghost)) : mainBounds;
  const { project: projectPoint } = createPointMapping(bounds);
  const wallsById = new Map(projection.wallSegments.map((wall) => [wall.wallId, wall]));
  const selectedWall =
    selection?.kind === "wall"
      ? projection.wallSegments.find((wall) => wall.wallId === selection.id)
      : undefined;
  const selectedOpening =
    selection?.kind === "opening"
      ? projection.openings.find((opening) => opening.openingId === selection.id)
      : undefined;
  const selectedBalcony =
    selection?.kind === "balcony"
      ? projection.balconies.find((balcony) => balcony.balconyId === selection.id)
      : undefined;
  const selectedStairSymbol =
    selection?.kind === "stair"
      ? projection.stairs.find((s) => s.storeyId === selection.id)
      : undefined;

  return (
    <>
      {ghost
        ? ghost.wallSegments.map((wall) => {
            const start = projectPoint(wall.start);
            const end = projectPoint(wall.end);
            return (
              <line
                key={`ghost-${wall.wallId}`}
                className="plan-wall-ghost"
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                aria-hidden="true"
              />
            );
          })
        : null}
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
        const typeClass = `plan-opening--${opening.type}`;

        return (
          <g key={opening.openingId} className="opening-glyph">
            <line
              role="button"
              tabIndex={0}
              aria-label={`选择开孔 ${opening.openingId}`}
              aria-pressed={selected}
              className={`plan-opening ${typeClass}${selected ? " is-selected" : ""}`}
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
      {projection.stairs.map((stair) => {
        const selected = isSelected(selection, "stair", stair.storeyId);
        const symbol = buildStairSymbolGeometry(stair, projectPoint);
        const label = stair.half === "lower" ? "UP" : "DN";

        return (
          <g
            key={`${stair.storeyId}-${stair.half}`}
            role="button"
            tabIndex={0}
            aria-label={`选择楼梯 ${stair.storeyId}`}
            aria-pressed={selected}
            className={selected ? "plan-stair is-selected" : "plan-stair"}
            onPointerDown={(event) => handlers?.onStairBodyPointerDown(event, stair.storeyId)}
            onClick={() => onSelect({ kind: "stair", id: stair.storeyId })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect({ kind: "stair", id: stair.storeyId });
              }
            }}
          >
            <polygon className="plan-stair-outline" points={polyPoints(symbol.outline)} />
            {symbol.flights.map((flight, i) => (
              <polygon key={`f${i}`} className="plan-stair-flight" points={polyPoints(flight)} />
            ))}
            {symbol.landings.map((landing, i) => (
              <polygon key={`l${i}`} className="plan-stair-landing" points={polyPoints(landing)} />
            ))}
            {symbol.treadLines.map((line, i) => (
              <line
                key={`t${i}`}
                className="plan-stair-tread"
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
              />
            ))}
            {symbol.cutLine.length > 0 ? (
              <polyline
                className="plan-stair-cut"
                points={polyPoints(symbol.cutLine)}
                fill="none"
              />
            ) : null}
            <text
              x={symbol.labelPos.x}
              y={symbol.labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="plan-stair-label"
            >
              {label}
            </text>
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
      {selectedOpening && handlers
        ? (() => {
            const wall = wallsById.get(selectedOpening.wallId);
            if (!wall) return null;
            const line = openingLine(selectedOpening, wall);
            if (!line) return null;
            const start = projectPoint(line.start);
            const end = projectPoint(line.end);
            return (
              <>
                <circle
                  className="resize-handle"
                  cx={start.x}
                  cy={start.y}
                  r={ENDPOINT_HANDLE_RADIUS}
                  aria-label={`调整开孔 ${selectedOpening.openingId} 起点`}
                  onPointerDown={(event) =>
                    handlers.onOpeningEdgePointerDown(event, selectedOpening.openingId, "l")
                  }
                />
                <circle
                  className="resize-handle"
                  cx={end.x}
                  cy={end.y}
                  r={ENDPOINT_HANDLE_RADIUS}
                  aria-label={`调整开孔 ${selectedOpening.openingId} 终点`}
                  onPointerDown={(event) =>
                    handlers.onOpeningEdgePointerDown(event, selectedOpening.openingId, "r")
                  }
                />
              </>
            );
          })()
        : null}
      {selectedBalcony && handlers
        ? (() => {
            const wall = wallsById.get(selectedBalcony.wallId);
            if (!wall) return null;
            const dx = wall.end.x - wall.start.x;
            const dy = wall.end.y - wall.start.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) return null;
            const ux = dx / len;
            const uy = dy / len;
            const innerStart = {
              x: wall.start.x + ux * selectedBalcony.offset,
              y: wall.start.y + uy * selectedBalcony.offset,
            };
            const innerEnd = {
              x: wall.start.x + ux * (selectedBalcony.offset + selectedBalcony.width),
              y: wall.start.y + uy * (selectedBalcony.offset + selectedBalcony.width),
            };
            const start = projectPoint(innerStart);
            const end = projectPoint(innerEnd);
            return (
              <>
                <circle
                  className="resize-handle"
                  cx={start.x}
                  cy={start.y}
                  r={ENDPOINT_HANDLE_RADIUS}
                  aria-label={`调整阳台 ${selectedBalcony.balconyId} 起点`}
                  onPointerDown={(event) =>
                    handlers.onBalconyEdgePointerDown(event, selectedBalcony.balconyId, "l")
                  }
                />
                <circle
                  className="resize-handle"
                  cx={end.x}
                  cy={end.y}
                  r={ENDPOINT_HANDLE_RADIUS}
                  aria-label={`调整阳台 ${selectedBalcony.balconyId} 终点`}
                  onPointerDown={(event) =>
                    handlers.onBalconyEdgePointerDown(event, selectedBalcony.balconyId, "r")
                  }
                />
              </>
            );
          })()
        : null}
      {selectedStairSymbol && handlers
        ? (() => {
            const stair = selectedStairSymbol;
            const rotation = stair.rotation;
            const center = stair.center;
            const { rect } = stair;
            const cornersLocal: Array<{ name: "bl" | "br" | "tr" | "tl"; local: Point2D }> = [
              { name: "bl", local: { x: rect.x, y: rect.y } },
              { name: "br", local: { x: rect.x + rect.width, y: rect.y } },
              { name: "tr", local: { x: rect.x + rect.width, y: rect.y + rect.depth } },
              { name: "tl", local: { x: rect.x, y: rect.y + rect.depth } },
            ];
            const cornersWorld = cornersLocal.map((c) => ({
              name: c.name,
              pos: projectPoint(rotatePoint(c.local, center, rotation)),
            }));
            const HANDLE_OFFSET = 0.5;
            const topMidLocal: Point2D = { x: center.x, y: rect.y + rect.depth };
            const handleLocal: Point2D = { x: center.x, y: rect.y + rect.depth + HANDLE_OFFSET };
            const topMidWorld = projectPoint(rotatePoint(topMidLocal, center, rotation));
            const handleWorld = projectPoint(rotatePoint(handleLocal, center, rotation));
            return (
              <>
                <line
                  className="stair-rotate-stem"
                  x1={topMidWorld.x}
                  y1={topMidWorld.y}
                  x2={handleWorld.x}
                  y2={handleWorld.y}
                />
                <circle
                  className="stair-rotate-handle"
                  cx={handleWorld.x}
                  cy={handleWorld.y}
                  r={ENDPOINT_HANDLE_RADIUS}
                  aria-label={`旋转楼梯 ${stair.storeyId}`}
                  onPointerDown={(event) =>
                    handlers.onStairRotatePointerDown(event, stair.storeyId)
                  }
                />
                {cornersWorld.map((c) => (
                  <circle
                    key={c.name}
                    className="resize-handle"
                    cx={c.pos.x}
                    cy={c.pos.y}
                    r={ENDPOINT_HANDLE_RADIUS}
                    aria-label={`楼梯 ${c.name} 角点`}
                    onPointerDown={(event) =>
                      handlers.onStairCornerPointerDown(event, stair.storeyId, c.name)
                    }
                  />
                ))}
              </>
            );
          })()
        : null}
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
        const selected = isSelected(selection, "storey", band.storeyId);

        return (
          <rect
            key={`${band.storeyId}-${band.wallId}`}
            className={selected ? "elevation-wall is-selected" : "elevation-wall"}
            x={topLeft.x}
            y={topLeft.y}
            width={bottomRight.x - topLeft.x}
            height={bottomRight.y - topLeft.y}
            onPointerDown={(event) => handlers?.onStoreyPointerDown(event, band.storeyId)}
            onClick={() => onSelect({ kind: "storey", id: band.storeyId })}
          />
        );
      })}
      {projection.openings.map((opening) => {
        const topLeft = projectPoint({ x: opening.x, y: opening.y + opening.height });
        const bottomRight = projectPoint({ x: opening.x + opening.width, y: opening.y });
        const selected = isSelected(selection, "opening", opening.openingId);
        const typeClass = `elevation-opening--${opening.type}`;

        return (
          <rect
            key={opening.openingId}
            role="button"
            tabIndex={0}
            aria-label={`选择开孔 ${opening.openingId}`}
            aria-pressed={selected}
            className={`elevation-opening ${typeClass}${selected ? " is-selected" : ""}`}
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

function renderRoofView(
  project: HouseProject,
  onSelect: (sel: ObjectSelection | undefined) => void,
  onProjectChange: (project: HouseProject) => void,
) {
  if (!canBuildRoof(project)) {
    return (
      <g className="surface-placeholder">
        <text x={SURFACE_WIDTH / 2} y={SURFACE_HEIGHT / 2} textAnchor="middle">
          屋顶建模需要顶层为 4 面轴对齐外墙
        </text>
      </g>
    );
  }

  const top = [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
  const walls = project.walls.filter((w) => w.storeyId === top.id && w.exterior);

  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const scale = Math.min(
    (SURFACE_WIDTH - SURFACE_PADDING * 2) / Math.max(width, 0.001),
    (SURFACE_HEIGHT - SURFACE_PADDING * 2) / Math.max(height, 0.001),
  );
  const offsetX = (SURFACE_WIDTH - width * scale) / 2 - minX * scale;
  const offsetY = (SURFACE_HEIGHT - height * scale) / 2 - minY * scale;
  const project2D = (p: { x: number; y: number }) => ({
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY,
  });

  if (!project.roof) {
    return (
      <g className="roof-add-prompt">
        {walls.map((w) => {
          const a = project2D(w.start);
          const b = project2D(w.end);
          return (
            <line
              key={w.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="roof-edge roof-edge--gable"
            />
          );
        })}
        <foreignObject
          x={SURFACE_WIDTH / 2 - 70}
          y={SURFACE_HEIGHT / 2 - 18}
          width={140}
          height={36}
        >
          <button
            type="button"
            onClick={() => onProjectChange(addRoof(project))}
          >
            + 添加屋顶
          </button>
        </foreignObject>
      </g>
    );
  }

  const roof = project.roof;

  return (
    <g>
      <rect
        x={SURFACE_PADDING}
        y={SURFACE_PADDING}
        width={SURFACE_WIDTH - SURFACE_PADDING * 2}
        height={SURFACE_HEIGHT - SURFACE_PADDING * 2}
        fill="transparent"
        data-testid="roof-body"
        onClick={() => onSelect({ kind: "roof" })}
      />
      {walls.map((w) => {
        const a = project2D(w.start);
        const b = project2D(w.end);
        const kind = roof.edges[w.id] === "eave" ? "eave" : "gable";
        const isSelected =
          project.selection?.kind === "roof-edge" && project.selection.wallId === w.id;
        return (
          <line
            key={w.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className={`roof-edge roof-edge--${kind}${isSelected ? " is-selected" : ""}`}
            data-testid={`roof-edge-${w.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ kind: "roof-edge", wallId: w.id });
            }}
          />
        );
      })}
    </g>
  );
}

const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 8;

export function DrawingSurface2D({
  project,
  onSelect,
  onProjectChange,
}: DrawingSurface2DProps) {
  const storeyId = planStoreyIdFromView(project.activeView, project.storeys);
  const elevationSide = ELEVATION_SIDE_BY_VIEW[project.activeView];

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const panLastPos = useRef({ x: 0, y: 0 });
  const panPointerId = useRef<number | null>(null);
  const [dragState, setDragState] = useState<DragState | undefined>(undefined);
  const [activeSnap, setActiveSnap] = useState<Point2D | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);
  const [gridVisible, setGridVisible] = useState(true);
  const [dragReadout, setDragReadout] = useState<DragReadout | null>(null);
  const [guideMatches, setGuideMatches] = useState<GuideMatch[]>([]);

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

  const planProjection = storeyId ? projectPlanView(project, storeyId) : undefined;
  const ghostProjection = (() => {
    if (!storeyId) return undefined;
    const index = project.storeys.findIndex((storey) => storey.id === storeyId);
    if (index <= 0) return undefined;
    const belowId = project.storeys[index - 1].id;
    const ghost = projectPlanView(project, belowId);
    return ghost.wallSegments.length > 0 ? ghost : undefined;
  })();

  const planMapping = planProjection
    ? createPointMapping(
        ghostProjection
          ? unionBounds(planBounds(planProjection), planBounds(ghostProjection))
          : planBounds(planProjection),
      )
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

  const onPlanOpeningEdgePointerDown: PlanDragHandlers["onOpeningEdgePointerDown"] = (
    event,
    openingId,
    edge,
  ) => {
    if (storeyId === undefined) return;
    const opening = project.openings.find((candidate) => candidate.id === openingId);
    if (!opening) return;
    const wall = project.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return;
    const wallLen = wallLength(wall);
    beginElementDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "plan-opening-resize",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      openingId,
      edge,
      wallStart: wall.start,
      wallEnd: wall.end,
      origOffset: opening.offset,
      origWidth: opening.width,
      wallLen,
    }));
  };

  const onPlanBalconyEdgePointerDown: PlanDragHandlers["onBalconyEdgePointerDown"] = (
    event,
    balconyId,
    edge,
  ) => {
    if (storeyId === undefined) return;
    const balcony = project.balconies.find((candidate) => candidate.id === balconyId);
    if (!balcony) return;
    const wall = project.walls.find((candidate) => candidate.id === balcony.attachedWallId);
    if (!wall) return;
    const wallLen = wallLength(wall);
    beginElementDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "plan-balcony-resize",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      balconyId,
      edge,
      wallStart: wall.start,
      wallEnd: wall.end,
      origOffset: balcony.offset,
      origWidth: balcony.width,
      wallLen,
    }));
  };

  const onStairBodyHandlePointerDown: PlanDragHandlers["onStairBodyPointerDown"] = (
    event,
    storeyId,
  ) => {
    const storey = project.storeys.find((s) => s.id === storeyId);
    const stair = storey?.stair;
    if (!stair) return;
    beginElementDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "stair-translate",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      storeyId,
      origX: stair.x,
      origY: stair.y,
    }));
  };

  const onStairCornerHandlePointerDown: PlanDragHandlers["onStairCornerPointerDown"] = (
    event,
    storeyId,
    corner,
  ) => {
    const storey = project.storeys.find((s) => s.id === storeyId);
    const stair = storey?.stair;
    if (!stair) return;
    const rotation = stair.rotation ?? 0;
    const center: Point2D = { x: stair.x + stair.width / 2, y: stair.y + stair.depth / 2 };
    const oppositeLocal: Point2D =
      corner === "bl"
        ? { x: stair.x + stair.width, y: stair.y + stair.depth }
        : corner === "br"
          ? { x: stair.x, y: stair.y + stair.depth }
          : corner === "tr"
            ? { x: stair.x, y: stair.y }
            : /* "tl" */ { x: stair.x + stair.width, y: stair.y };
    const worldAnchor = rotatePoint(oppositeLocal, center, rotation);
    beginElementDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "stair-resize",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      storeyId,
      corner,
      worldAnchor,
      origRotation: rotation,
    }));
  };

  const onStairRotateHandlePointerDown: PlanDragHandlers["onStairRotatePointerDown"] = (
    event,
    storeyId,
  ) => {
    const storey = project.storeys.find((s) => s.id === storeyId);
    const stair = storey?.stair;
    if (!stair) return;
    const center: Point2D = { x: stair.x + stair.width / 2, y: stair.y + stair.depth / 2 };
    beginElementDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "stair-rotate",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      storeyId,
      center,
      initialMouseAngle: Math.atan2(startWorld.y - center.y, startWorld.x - center.x),
      origRotation: stair.rotation ?? 0,
    }));
  };

  const planDragHandlers: PlanDragHandlers = {
    onWallPointerDown: onWallElementPointerDown,
    onOpeningPointerDown: onOpeningElementPointerDown,
    onBalconyPointerDown: onBalconyElementPointerDown,
    onWallEndpointPointerDown: onWallEndpointHandlePointerDown,
    onOpeningEdgePointerDown: onPlanOpeningEdgePointerDown,
    onBalconyEdgePointerDown: onPlanBalconyEdgePointerDown,
    onStairBodyPointerDown: onStairBodyHandlePointerDown,
    onStairCornerPointerDown: onStairCornerHandlePointerDown,
    onStairRotatePointerDown: onStairRotateHandlePointerDown,
  };

  const onElevationOpeningPointerDown: ElevationDragHandlers["onOpeningPointerDown"] = (event, openingId) => {
    const opening = project.openings.find((candidate) => candidate.id === openingId);
    if (!opening) return;
    const wall = project.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall || !elevationSide) return;
    const storey = project.storeys.find((candidate) => candidate.id === wall.storeyId);
    const wallLen = wallLength(wall);
    const projSign = elevationOffsetSign(wall, elevationSide);
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
      projSign,
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
    if (!wall || !elevationSide) return;
    const storey = project.storeys.find((candidate) => candidate.id === wall.storeyId);
    const wallLen = wallLength(wall);
    const projSign = elevationOffsetSign(wall, elevationSide);
    // For mirrored sides (back/left) on a non-canonical wall direction, the visually
    // left/right corners correspond to the opposite ends of the opening on the wall.
    // Swap so the resize math (written in wall-direction terms) acts on the edge the
    // user actually grabbed.
    const effectiveCorner: typeof corner =
      projSign < 0
        ? corner === "tl"
          ? "tr"
          : corner === "tr"
            ? "tl"
            : corner === "bl"
              ? "br"
              : "bl"
        : corner;
    beginDragWith(event, elevationMapping, (pointerId, startWorld, mapping) => ({
      kind: "elev-opening-resize",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      openingId,
      corner: effectiveCorner,
      origOffset: opening.offset,
      origSill: opening.sillHeight,
      origWidth: opening.width,
      origHeight: opening.height,
      wallLen,
      storeyHeight: storey?.height ?? wall.height,
      projSign,
    }));
  };

  const onElevationBalconyPointerDown: ElevationDragHandlers["onBalconyPointerDown"] = (event, balconyId) => {
    const balcony = project.balconies.find((candidate) => candidate.id === balconyId);
    if (!balcony) return;
    const wall = project.walls.find((candidate) => candidate.id === balcony.attachedWallId);
    if (!wall || !elevationSide) return;
    const wallLen = wallLength(wall);
    const projSign = elevationOffsetSign(wall, elevationSide);
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
      projSign,
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
    if (!wall || !elevationSide) return;
    const wallLen = wallLength(wall);
    const projSign = elevationOffsetSign(wall, elevationSide);
    const effectiveEdge: typeof edge = projSign < 0 ? (edge === "l" ? "r" : "l") : edge;
    beginDragWith(event, elevationMapping, (pointerId, startWorld, mapping) => ({
      kind: "elev-balcony-resize",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      balconyId,
      edge: effectiveEdge,
      origOffset: balcony.offset,
      origWidth: balcony.width,
      wallLen,
      projSign,
    }));
  };

  const onElevationStoreyPointerDown: ElevationDragHandlers["onStoreyPointerDown"] = (
    event,
    bandStoreyId,
  ) => {
    if (!elevationSide) return;
    if (!project.storeys.some((storey) => storey.id === bandStoreyId)) return;
    beginDragWith(event, elevationMapping, (pointerId, startWorld, mapping) => ({
      kind: "elev-storey-translate",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      storeyId: bandStoreyId,
      side: elevationSide,
      origProject: project,
    }));
  };

  const elevationDragHandlers: ElevationDragHandlers = {
    onStoreyPointerDown: onElevationStoreyPointerDown,
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

    if (state.kind !== "wall-endpoint" && state.kind !== "stair-resize") {
      setGuideMatches([]);
    }

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
          setDragReadout({ kind: "wall-translate", dx: roundToMm(finalDx), dy: roundToMm(finalDy) });
          break;
        }
        case "wall-endpoint": {
          const others = otherWallSegments(state.wallId);
          const candidate = { x: state.origPoint.x + dx, y: state.origPoint.y + dy };
          const endpointSnap = snapToEndpoint(candidate, others, PLAN_ENDPOINT_THRESHOLD);
          setActiveSnap(endpointSnap ?? null);

          let resolved: Point2D;
          if (endpointSnap) {
            resolved = endpointSnap;
            setGuideMatches([]);
          } else if (planProjection) {
            const anchors = collectPlanAnchors(
              planProjection,
              new Set([`wall:${state.wallId}`]),
            );
            const matches = findAxisAlignedGuides(candidate, anchors, PLAN_ENDPOINT_THRESHOLD);
            setGuideMatches(matches);
            if (matches.length > 0) {
              let x = candidate.x;
              let y = candidate.y;
              for (const m of matches) {
                if (m.axis === "x") x = m.pos;
                if (m.axis === "y") y = m.pos;
              }
              resolved = { x, y };
            } else {
              resolved = snapPlanPoint(candidate, others, {
                gridSize: PLAN_GRID_SIZE,
                endpointThreshold: PLAN_ENDPOINT_THRESHOLD,
              });
            }
          } else {
            setGuideMatches([]);
            resolved = snapPlanPoint(candidate, others, {
              gridSize: PLAN_GRID_SIZE,
              endpointThreshold: PLAN_ENDPOINT_THRESHOLD,
            });
          }

          const newPt = roundPointToMm(resolved);
          const newStart = state.endpoint === "start" ? newPt : roundPointToMm(state.fixedPoint);
          const newEnd = state.endpoint === "end" ? newPt : roundPointToMm(state.fixedPoint);
          onProjectChange(moveWall(project, state.wallId, newStart, newEnd));

          const endpointLen = Math.hypot(newPt.x - state.fixedPoint.x, newPt.y - state.fixedPoint.y);
          setDragReadout({ kind: "wall-endpoint", length: roundToMm(endpointLen) });
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
            setDragReadout({ kind: "opening", offset: snapped });
          } else {
            onProjectChange(updateBalcony(project, state.balconyId, { offset: snapped }));
            setDragReadout({ kind: "balcony", offset: snapped });
          }
          break;
        }
        case "plan-opening-resize":
        case "plan-balcony-resize": {
          const wx = state.wallEnd.x - state.wallStart.x;
          const wy = state.wallEnd.y - state.wallStart.y;
          const len = Math.hypot(wx, wy);
          if (len === 0) return;
          const ux = wx / len;
          const uy = wy / len;
          const along = dx * ux + dy * uy;
          const minSize = state.kind === "plan-opening-resize" ? 0.05 : 0.3;

          let newOffset = state.origOffset;
          let newWidth = state.origWidth;
          if (state.edge === "l") {
            const limited = Math.min(along, state.origWidth - minSize);
            newOffset = state.origOffset + limited;
            newWidth = state.origWidth - limited;
          } else {
            newWidth = Math.max(minSize, state.origWidth + along);
          }
          if (newOffset < 0) {
            newWidth += newOffset;
            newOffset = 0;
          }
          if (newOffset + newWidth > state.wallLen) {
            newWidth = state.wallLen - newOffset;
          }
          if (newWidth < minSize) return;

          const snappedOffset = roundToMm(snapToGrid(newOffset));
          const snappedWidth = roundToMm(snapToGrid(newWidth));
          if (state.kind === "plan-opening-resize") {
            onProjectChange(
              updateOpening(project, state.openingId, {
                offset: snappedOffset,
                width: snappedWidth,
              }),
            );
            setDragReadout({ kind: "plan-opening-resize", width: snappedWidth });
          } else {
            onProjectChange(
              updateBalcony(project, state.balconyId, {
                offset: snappedOffset,
                width: snappedWidth,
              }),
            );
            setDragReadout({ kind: "plan-balcony-resize", width: snappedWidth });
          }
          break;
        }
        case "elev-opening-move": {
          const dxOffset = dx * state.projSign;
          const newOffsetRaw = clamp(state.origOffset + dxOffset, 0, Math.max(0, state.wallLen - state.width));
          const maxSill = Math.max(0, state.storeyHeight - state.height);
          const newSillRaw = clamp(state.origSill + dy, 0, maxSill);
          const offset = roundToMm(snapToGrid(newOffsetRaw));
          const sill = roundToMm(snapToGrid(newSillRaw));
          onProjectChange(updateOpening(project, state.openingId, { offset, sillHeight: sill }));
          setDragReadout({ kind: "elev-opening-move", offset, sill });
          break;
        }
        case "elev-opening-resize": {
          const minSize = 0.05;
          const dxOffset = dx * state.projSign;
          let newOffset = state.origOffset;
          let newSill = state.origSill;
          let newWidth = state.origWidth;
          let newHeight = state.origHeight;

          if (state.corner === "tl" || state.corner === "bl") {
            const limited = Math.min(dxOffset, state.origWidth - minSize);
            newOffset = state.origOffset + limited;
            newWidth = state.origWidth - limited;
          } else {
            newWidth = Math.max(minSize, state.origWidth + dxOffset);
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

          const offset = roundToMm(snapToGrid(newOffset));
          const sill = roundToMm(snapToGrid(newSill));
          const width = roundToMm(snapToGrid(newWidth));
          const height = roundToMm(snapToGrid(newHeight));
          onProjectChange(
            updateOpening(project, state.openingId, {
              offset,
              sillHeight: sill,
              width,
              height,
            }),
          );
          setDragReadout({ kind: "elev-opening-resize", width, height });
          break;
        }
        case "elev-balcony-move": {
          const dxOffset = dx * state.projSign;
          const newOffset = clamp(state.origOffset + dxOffset, 0, Math.max(0, state.wallLen - state.width));
          const offset = roundToMm(snapToGrid(newOffset));
          onProjectChange(updateBalcony(project, state.balconyId, { offset }));
          setDragReadout({ kind: "elev-balcony-move", offset });
          break;
        }
        case "elev-balcony-resize": {
          const minSize = 0.3;
          const dxOffset = dx * state.projSign;
          let newOffset = state.origOffset;
          let newWidth = state.origWidth;
          if (state.edge === "l") {
            const limited = Math.min(dxOffset, state.origWidth - minSize);
            newOffset = state.origOffset + limited;
            newWidth = state.origWidth - limited;
          } else {
            newWidth = Math.max(minSize, state.origWidth + dxOffset);
          }
          if (newOffset < 0) {
            newWidth += newOffset;
            newOffset = 0;
          }
          if (newOffset + newWidth > state.wallLen) {
            newWidth = state.wallLen - newOffset;
          }
          if (newWidth < minSize) return;
          const offset = roundToMm(snapToGrid(newOffset));
          const width = roundToMm(snapToGrid(newWidth));
          onProjectChange(updateBalcony(project, state.balconyId, { offset, width }));
          setDragReadout({ kind: "elev-balcony-resize", width });
          break;
        }
        case "stair-translate": {
          const newX = roundToMm(snapToGrid(state.origX + dx));
          const newY = roundToMm(snapToGrid(state.origY + dy));
          onProjectChange(updateStair(project, state.storeyId, { x: newX, y: newY }));
          break;
        }
        case "stair-resize": {
          const minSize = 0.6;
          let adjusted: Point2D = currentWorld;
          if (planProjection) {
            const anchors = collectPlanAnchors(
              planProjection,
              new Set([`stair:${state.storeyId}`]),
            );
            const matches = findAxisAlignedGuides(currentWorld, anchors, PLAN_ENDPOINT_THRESHOLD);
            setGuideMatches(matches);
            if (matches.length > 0) {
              let x = currentWorld.x;
              let y = currentWorld.y;
              for (const m of matches) {
                if (m.axis === "x") x = m.pos;
                if (m.axis === "y") y = m.pos;
              }
              adjusted = { x, y };
            }
          } else {
            setGuideMatches([]);
          }
          const mouseWorld = adjusted;

          const newCenter: Point2D = {
            x: (state.worldAnchor.x + mouseWorld.x) / 2,
            y: (state.worldAnchor.y + mouseWorld.y) / 2,
          };
          const diagWorld: Point2D = {
            x: mouseWorld.x - state.worldAnchor.x,
            y: mouseWorld.y - state.worldAnchor.y,
          };
          const cosA = Math.cos(-state.origRotation);
          const sinA = Math.sin(-state.origRotation);
          const diagLocal: Point2D = {
            x: diagWorld.x * cosA - diagWorld.y * sinA,
            y: diagWorld.x * sinA + diagWorld.y * cosA,
          };
          let newWidth: number;
          let newDepth: number;
          switch (state.corner) {
            case "tr":
              newWidth = Math.max(minSize, diagLocal.x);
              newDepth = Math.max(minSize, diagLocal.y);
              break;
            case "tl":
              newWidth = Math.max(minSize, -diagLocal.x);
              newDepth = Math.max(minSize, diagLocal.y);
              break;
            case "bl":
              newWidth = Math.max(minSize, -diagLocal.x);
              newDepth = Math.max(minSize, -diagLocal.y);
              break;
            case "br":
              newWidth = Math.max(minSize, diagLocal.x);
              newDepth = Math.max(minSize, -diagLocal.y);
              break;
          }
          const newX = roundToMm(newCenter.x - newWidth / 2);
          const newY = roundToMm(newCenter.y - newDepth / 2);
          const w = roundToMm(newWidth);
          const d = roundToMm(newDepth);
          onProjectChange(updateStair(project, state.storeyId, { x: newX, y: newY, width: w, depth: d }));
          setDragReadout({ kind: "stair-resize", width: w, depth: d });
          break;
        }
        case "stair-rotate": {
          const angle = Math.atan2(
            currentWorld.y - state.center.y,
            currentWorld.x - state.center.x,
          );
          let newRotation = state.origRotation + (angle - state.initialMouseAngle);
          while (newRotation > Math.PI) newRotation -= 2 * Math.PI;
          while (newRotation <= -Math.PI) newRotation += 2 * Math.PI;
          onProjectChange(updateStair(project, state.storeyId, { rotation: newRotation }));
          setDragReadout({ kind: "stair-rotate", angleDeg: (newRotation * 180) / Math.PI });
          break;
        }
        case "elev-storey-translate": {
          const grid = snapToGrid(dx);
          const { dx: dwx, dy: dwy } = elevationAxisToWorld(state.side, grid);
          onProjectChange(
            translateStorey(state.origProject, state.storeyId, roundToMm(dwx), roundToMm(dwy)),
          );
          setDragReadout({ kind: "elev-storey-translate", dy: roundToMm(grid) });
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
      setCursorWorld(currentWorld);
      const dx = currentWorld.x - dragState.startWorld.x;
      const dy = currentWorld.y - dragState.startWorld.y;
      if (!dragState.moved && Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD_WORLD) return;
      if (!dragState.moved) {
        setDragState({ ...dragState, moved: true });
      }
      applyDrag(dragState, currentWorld);
      return;
    }

    if (isPanning && event.pointerId === panPointerId.current && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = ((event.clientX - panLastPos.current.x) * SURFACE_WIDTH) / (rect.width * viewport.zoom);
      const dy = ((event.clientY - panLastPos.current.y) * SURFACE_HEIGHT) / (rect.height * viewport.zoom);
      panLastPos.current = { x: event.clientX, y: event.clientY };
      setViewport((current) => ({ ...current, panX: current.panX - dx, panY: current.panY - dy }));
      return;
    }

    // hover: 更新 cursorWorld（plan 或 elevation 视图）
    const activeMapping = planMapping ?? elevationMapping;
    if (!activeMapping) {
      setCursorWorld(null);
      return;
    }
    const world = eventToWorldWith(event, activeMapping);
    setCursorWorld(world ?? null);
  };

  const handlePointerUp = (event: PointerEvent<SVGSVGElement>) => {
    if (dragState && event.pointerId === dragState.pointerId) {
      const wasMoved = dragState.moved;
      const finished = dragState;
      setDragState(undefined);
      setActiveSnap(null);
      setDragReadout(null);
      setGuideMatches([]);
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
          case "stair-translate":
            onSelect({ kind: "stair", id: finished.storeyId });
            break;
          case "elev-storey-translate":
            onSelect({ kind: "storey", id: finished.storeyId });
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
        onPointerLeave={() => setCursorWorld(null)}
      >
        <rect
          className="surface-grid"
          x="0"
          y="0"
          width={SURFACE_WIDTH}
          height={SURFACE_HEIGHT}
          onClick={ambientSelect}
        />
        {(() => {
          const activeMapping = planMapping ?? elevationMapping;
          if (!activeMapping) return null;
          return <GridOverlay mapping={activeMapping} viewport={viewport} visible={gridVisible} />;
        })()}
        {storeyId && planProjection
          ? renderPlan(
              planProjection,
              project.selection,
              onSelect,
              project.activeTool,
              planFootprints,
              activeSnap,
              planDragHandlers,
              ghostProjection,
            )
          : elevationProjection
            ? renderElevation(
                elevationProjection,
                project.selection,
                onSelect,
                project.activeTool,
                elevationDragHandlers,
              )
            : renderRoofView(project, onSelect, onProjectChange)}
        {storeyId && planMapping ? (
          <SmartGuides
            matches={guideMatches}
            cursorWorld={cursorWorld}
            mapping={planMapping}
            viewport={viewport}
          />
        ) : null}
      </svg>
      {(() => {
        const activeMapping = planMapping ?? elevationMapping;
        if (!activeMapping) return null;
        return <ScaleRuler mapping={activeMapping} viewport={viewport} />;
      })()}
      <ZoomControls
        viewport={viewport}
        onViewportChange={setViewport}
        defaultViewport={DEFAULT_VIEWPORT}
        gridVisible={gridVisible}
        onGridToggle={() => setGridVisible(v => !v)}
      />
      <StatusReadout cursorWorld={cursorWorld} dragReadout={dragReadout} />
    </section>
  );
}
