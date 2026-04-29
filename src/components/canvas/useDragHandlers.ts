import type { PointerEvent, RefObject } from "react";
import { wallLength } from "../../domain/measurements";
import { rotatePoint } from "../../domain/stairs";
import type { HouseProject } from "../../domain/types";
import { elevationOffsetSign } from "../../projection/elevation";
import type { ElevationSide } from "../../projection/types";
import type {
  DragState,
  ElevationDragHandlers,
  PlanDragHandlers,
} from "./dragState";
import type { Point2D, PointMapping } from "./types";
import { eventToViewBoxPoint } from "./renderUtils";

/** Stand-alone helper: also used by main file's handlePointerMove for hover/drag move. */
export function eventToWorldWith(
  svg: SVGSVGElement | null,
  event: { clientX: number; clientY: number },
  mapping: PointMapping,
): Point2D | undefined {
  if (!svg) return undefined;
  const vb = eventToViewBoxPoint(svg, event.clientX, event.clientY);
  return mapping.unproject(vb);
}

type Args = {
  project: HouseProject;
  storeyId: string | undefined;
  elevationSide: ElevationSide | undefined;
  planMapping: PointMapping | undefined;
  elevationMapping: PointMapping | undefined;
  svgRef: RefObject<SVGSVGElement | null>;
  setDragState: (state: DragState) => void;
};

export function useDragHandlers(args: Args): {
  planHandlers: PlanDragHandlers;
  elevationHandlers: ElevationDragHandlers;
} {
  const {
    project,
    storeyId,
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
    ) => DragState | undefined,
  ) => {
    if (project.activeTool !== "select") return;
    if (event.button !== 0) return;
    if (!svgRef.current || !mapping) return;

    const startWorld = eventToWorldWith(svgRef.current, event, mapping);
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

  // === plan handlers ===

  const onWallPointerDown: PlanDragHandlers["onWallPointerDown"] = (event, wallId) => {
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

  const onOpeningPointerDown: PlanDragHandlers["onOpeningPointerDown"] = (event, openingId) => {
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

  const onBalconyPointerDown: PlanDragHandlers["onBalconyPointerDown"] = (event, balconyId) => {
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

  const onWallEndpointPointerDown: PlanDragHandlers["onWallEndpointPointerDown"] = (
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

  const onOpeningEdgePointerDown: PlanDragHandlers["onOpeningEdgePointerDown"] = (
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

  const onBalconyEdgePointerDown: PlanDragHandlers["onBalconyEdgePointerDown"] = (
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

  const onStairBodyPointerDown: PlanDragHandlers["onStairBodyPointerDown"] = (
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

  const onStairCornerPointerDown: PlanDragHandlers["onStairCornerPointerDown"] = (
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

  const onStairRotatePointerDown: PlanDragHandlers["onStairRotatePointerDown"] = (
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

  const planHandlers: PlanDragHandlers = {
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

  const onStoreyPointerDown: ElevationDragHandlers["onStoreyPointerDown"] = (
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

  const onElevOpeningPointerDown: ElevationDragHandlers["onOpeningPointerDown"] = (event, openingId) => {
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

  const onOpeningCornerPointerDown: ElevationDragHandlers["onOpeningCornerPointerDown"] = (
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

  const onElevBalconyPointerDown: ElevationDragHandlers["onBalconyPointerDown"] = (event, balconyId) => {
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

  const onElevBalconyEdgePointerDown: ElevationDragHandlers["onBalconyEdgePointerDown"] = (
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

  const elevationHandlers: ElevationDragHandlers = {
    onStoreyPointerDown,
    onOpeningPointerDown: onElevOpeningPointerDown,
    onOpeningCornerPointerDown,
    onBalconyPointerDown: onElevBalconyPointerDown,
    onBalconyEdgePointerDown: onElevBalconyEdgePointerDown,
  };

  return { planHandlers, elevationHandlers };
}
