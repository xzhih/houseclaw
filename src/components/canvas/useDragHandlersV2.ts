import type { PointerEvent, RefObject } from "react";
import type { ProjectStateV2 } from "../../app/v2/projectReducer";
import { resolveAnchor } from "../../domain/v2/anchors";
import type { Wall } from "../../domain/v2/types";
import { rotatePoint } from "../../domain/stairs";
import type { ElevationSide } from "../../projection/v2/types";
import type {
  DragStateV2,
  ElevationDragHandlersV2,
  PlanDragHandlersV2,
} from "./dragStateV2";
import type { Point2D, PointMapping } from "./types";
import { eventToViewBoxPoint } from "./renderUtils";

export function eventToWorldWith(
  svg: SVGSVGElement | null,
  event: { clientX: number; clientY: number },
  mapping: PointMapping,
): Point2D | undefined {
  if (!svg) return undefined;
  const vb = eventToViewBoxPoint(svg, event.clientX, event.clientY);
  return mapping.unproject(vb);
}

function wallLength(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

function projectAxis(point: { x: number; y: number }, side: ElevationSide): number {
  if (side === "front") return point.x;
  if (side === "back") return -point.x;
  if (side === "left") return -point.y;
  return point.y;
}

function elevationOffsetSign(wall: Wall, side: ElevationSide): 1 | -1 {
  return projectAxis(wall.end, side) >= projectAxis(wall.start, side) ? 1 : -1;
}

type Args = {
  project: ProjectStateV2;
  /** Plan view's storey id (undefined when not on a plan view). Drag begin functions
   *  refuse to fire when undefined for plan-only drags, so the user must be on a plan
   *  to drag walls/openings/balconies/stairs. */
  planStoreyId: string | undefined;
  elevationSide: ElevationSide | undefined;
  planMapping: PointMapping | undefined;
  elevationMapping: PointMapping | undefined;
  svgRef: RefObject<SVGSVGElement | null>;
  setDragState: (state: DragStateV2) => void;
};

export function useDragHandlersV2(args: Args): {
  planHandlers: PlanDragHandlersV2;
  elevationHandlers: ElevationDragHandlersV2;
} {
  const {
    project,
    planStoreyId,
    elevationSide,
    planMapping,
    elevationMapping,
    svgRef,
    setDragState,
  } = args;

  const beginDragWith = (
    event: PointerEvent<SVGElement>,
    mapping: PointMapping | undefined,
    factory: (
      pointerId: number,
      startWorld: Point2D,
      mapping: PointMapping,
    ) => DragStateV2 | undefined,
  ) => {
    if (project.activeTool !== "select") return;
    if (event.button !== 0) return;
    if (!svgRef.current || !mapping) return;

    const startWorld = eventToWorldWith(svgRef.current, event, mapping);
    if (!startWorld) return;
    const next = factory(event.pointerId, startWorld, mapping);
    if (!next) return;

    event.stopPropagation();
    // Set state FIRST — pointerCapture can throw on synthetic events or when
    // the pointer isn't currently active, and we don't want to lose the drag
    // state in that case. If capture fails, drag still works via normal event
    // bubbling (parent SVG receives pointermove).
    setDragState(next);
    try {
      svgRef.current.setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture is best-effort. Real-world cause: synthetic pointer
      // events from test harness, or the pointer being released between
      // pointerdown and this call.
    }
  };

  const beginPlanDrag = (
    event: PointerEvent<SVGElement>,
    factory: (
      pointerId: number,
      startWorld: Point2D,
      mapping: PointMapping,
    ) => DragStateV2 | undefined,
  ) => beginDragWith(event, planMapping, factory);

  // === plan handlers ===

  const onWallPointerDown: PlanDragHandlersV2["onWallPointerDown"] = (event, wallId) => {
    if (planStoreyId === undefined) return;
    const wall = project.walls.find((candidate) => candidate.id === wallId);
    if (!wall) return;
    beginPlanDrag(event, (pointerId, startWorld, mapping) => ({
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

  const onOpeningPointerDown: PlanDragHandlersV2["onOpeningPointerDown"] = (event, openingId) => {
    if (planStoreyId === undefined) return;
    const opening = project.openings.find((candidate) => candidate.id === openingId);
    if (!opening) return;
    const wall = project.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return;
    beginPlanDrag(event, (pointerId, startWorld, mapping) => ({
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

  const onBalconyPointerDown: PlanDragHandlersV2["onBalconyPointerDown"] = (event, balconyId) => {
    if (planStoreyId === undefined) return;
    const balcony = project.balconies.find((candidate) => candidate.id === balconyId);
    if (!balcony) return;
    const wall = project.walls.find((candidate) => candidate.id === balcony.attachedWallId);
    if (!wall) return;
    beginPlanDrag(event, (pointerId, startWorld, mapping) => ({
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

  const onWallEndpointPointerDown: PlanDragHandlersV2["onWallEndpointPointerDown"] = (
    event,
    wallId,
    endpoint,
  ) => {
    if (planStoreyId === undefined) return;
    const wall = project.walls.find((candidate) => candidate.id === wallId);
    if (!wall) return;
    const origPoint = endpoint === "start" ? wall.start : wall.end;
    const fixedPoint = endpoint === "start" ? wall.end : wall.start;
    beginPlanDrag(event, (pointerId, startWorld, mapping) => ({
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

  const onOpeningEdgePointerDown: PlanDragHandlersV2["onOpeningEdgePointerDown"] = (
    event,
    openingId,
    edge,
  ) => {
    if (planStoreyId === undefined) return;
    const opening = project.openings.find((candidate) => candidate.id === openingId);
    if (!opening) return;
    const wall = project.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) return;
    const wallLen = wallLength(wall);
    beginPlanDrag(event, (pointerId, startWorld, mapping) => ({
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

  const onBalconyEdgePointerDown: PlanDragHandlersV2["onBalconyEdgePointerDown"] = (
    event,
    balconyId,
    edge,
  ) => {
    if (planStoreyId === undefined) return;
    const balcony = project.balconies.find((candidate) => candidate.id === balconyId);
    if (!balcony) return;
    const wall = project.walls.find((candidate) => candidate.id === balcony.attachedWallId);
    if (!wall) return;
    const wallLen = wallLength(wall);
    beginPlanDrag(event, (pointerId, startWorld, mapping) => ({
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

  const onStairBodyPointerDown: PlanDragHandlersV2["onStairBodyPointerDown"] = (
    event,
    stairId,
  ) => {
    const stair = project.stairs.find((s) => s.id === stairId);
    if (!stair) return;
    beginPlanDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "stair-translate",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      stairId,
      origX: stair.x,
      origY: stair.y,
    }));
  };

  const onStairCornerPointerDown: PlanDragHandlersV2["onStairCornerPointerDown"] = (
    event,
    stairId,
    corner,
  ) => {
    const stair = project.stairs.find((s) => s.id === stairId);
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
    beginPlanDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "stair-resize",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      stairId,
      corner,
      worldAnchor,
      origRotation: rotation,
    }));
  };

  const onStairRotatePointerDown: PlanDragHandlersV2["onStairRotatePointerDown"] = (
    event,
    stairId,
  ) => {
    const stair = project.stairs.find((s) => s.id === stairId);
    if (!stair) return;
    const center: Point2D = { x: stair.x + stair.width / 2, y: stair.y + stair.depth / 2 };
    beginPlanDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "stair-rotate",
      pointerId,
      startWorld,
      mapping,
      moved: false,
      stairId,
      center,
      initialMouseAngle: Math.atan2(startWorld.y - center.y, startWorld.x - center.x),
      origRotation: stair.rotation ?? 0,
    }));
  };

  const planHandlers: PlanDragHandlersV2 = {
    onWallPointerDown,
    onOpeningPointerDown,
    onBalconyPointerDown,
    onWallEndpointPointerDown,
    onOpeningEdgePointerDown,
    onBalconyEdgePointerDown,
    onStairBodyPointerDown,
    onStairCornerPointerDown,
    onStairRotatePointerDown,
  };

  // === elevation handlers ===

  const onElevOpeningPointerDown: ElevationDragHandlersV2["onOpeningPointerDown"] = (event, openingId) => {
    const opening = project.openings.find((candidate) => candidate.id === openingId);
    if (!opening) return;
    const wall = project.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall || !elevationSide) return;
    const bottomZ = resolveAnchor(wall.bottom, project.storeys);
    const topZ = resolveAnchor(wall.top, project.storeys);
    const wallHeight = topZ - bottomZ;
    const wLen = wallLength(wall);
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
      wallLen: wLen,
      storeyHeight: wallHeight,
      projSign,
    }));
  };

  const onOpeningCornerPointerDown: ElevationDragHandlersV2["onOpeningCornerPointerDown"] = (
    event,
    openingId,
    corner,
  ) => {
    const opening = project.openings.find((candidate) => candidate.id === openingId);
    if (!opening) return;
    const wall = project.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall || !elevationSide) return;
    const bottomZ = resolveAnchor(wall.bottom, project.storeys);
    const topZ = resolveAnchor(wall.top, project.storeys);
    const wallHeight = topZ - bottomZ;
    const wLen = wallLength(wall);
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
      wallLen: wLen,
      storeyHeight: wallHeight,
      projSign,
    }));
  };

  const onElevBalconyPointerDown: ElevationDragHandlersV2["onBalconyPointerDown"] = (event, balconyId) => {
    const balcony = project.balconies.find((candidate) => candidate.id === balconyId);
    if (!balcony) return;
    const wall = project.walls.find((candidate) => candidate.id === balcony.attachedWallId);
    if (!wall || !elevationSide) return;
    const wLen = wallLength(wall);
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
      wallLen: wLen,
      projSign,
    }));
  };

  const onElevBalconyEdgePointerDown: ElevationDragHandlersV2["onBalconyEdgePointerDown"] = (
    event,
    balconyId,
    edge,
  ) => {
    const balcony = project.balconies.find((candidate) => candidate.id === balconyId);
    if (!balcony) return;
    const wall = project.walls.find((candidate) => candidate.id === balcony.attachedWallId);
    if (!wall || !elevationSide) return;
    const wLen = wallLength(wall);
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
      wallLen: wLen,
      projSign,
    }));
  };

  const elevationHandlers: ElevationDragHandlersV2 = {
    onOpeningPointerDown: onElevOpeningPointerDown,
    onOpeningCornerPointerDown,
    onBalconyPointerDown: onElevBalconyPointerDown,
    onBalconyEdgePointerDown: onElevBalconyEdgePointerDown,
  };

  return { planHandlers, elevationHandlers };
}
