import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ObjectSelection } from "../domain/selection";
import { wallLength } from "../domain/measurements";
import { moveWall, translateStorey, updateBalcony, updateOpening, updateStair } from "../domain/mutations";
import { rotatePoint } from "../domain/stairs";
import type { HouseProject, ToolId, ViewId } from "../domain/types";
import { planStoreyIdFromView } from "../domain/views";
import { snapPlanPoint, snapToEndpoint } from "../geometry/snapping";
import { collectPlanAnchors, findAxisAlignedGuides, type GuideMatch } from "../geometry/smartGuides";
import { buildWallNetwork, type WallFootprint } from "../geometry/wallNetwork";
import { elevationOffsetSign, projectElevationView } from "../projection/elevation";
import { projectPlanView } from "../projection/plan";
import { GridOverlay } from "./canvas/GridOverlay";
import { ScaleRuler } from "./canvas/ScaleRuler";
import { SmartGuides } from "./canvas/SmartGuides";
import { StatusReadout } from "./canvas/StatusReadout";
import { ZoomControls } from "./canvas/ZoomControls";
import type { Bounds, DragReadout, Point2D, PointMapping, Viewport } from "./canvas/types";
import type {
  DragState,
  ElevationDragHandlers,
  PlanDragHandlers,
} from "./canvas/dragState";
import {
  ELEVATION_SIDE_BY_VIEW,
  SURFACE_HEIGHT,
  SURFACE_PADDING,
  SURFACE_WIDTH,
  createPointMapping,
  elevationAxisToWorld,
  elevationBounds,
  eventToViewBoxPoint,
  planBounds,
  unionBounds,
} from "./canvas/renderUtils";
import { renderPlan } from "./canvas/renderPlan";
import { renderElevation } from "./canvas/renderElevation";
import { renderRoofView } from "./canvas/renderRoofView";

const PLAN_GRID_SIZE = 0.1;
const PLAN_ENDPOINT_THRESHOLD = 0.2;
const DRAG_MOVE_THRESHOLD_WORLD = 0.04;

type DrawingSurface2DProps = {
  project: HouseProject;
  onSelect: (selection: ObjectSelection | undefined) => void;
  onProjectChange: (project: HouseProject) => void;
};

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
