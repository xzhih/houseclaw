import type { ProjectActionV2, ProjectStateV2 } from "../../app/v2/projectReducer";
import { collectPlanAnchorsV2, findAxisAlignedGuides, type GuideMatch } from "../../geometry/v2/smartGuides";
import { snapPlanPoint, snapToEndpoint } from "../../geometry/snapping";
import type { PlanProjectionV2 } from "../../projection/v2/types";
import type { DragStateV2 } from "./dragStateV2";
import type { DragReadout, Point2D } from "./types";

const PLAN_GRID_SIZE = 0.1;
const PLAN_ENDPOINT_THRESHOLD = 0.2;
export const DRAG_MOVE_THRESHOLD_WORLD = 0.04;

export type WallSegment = { start: Point2D; end: Point2D };

export type DragContextV2 = {
  project: ProjectStateV2;
  planProjection?: PlanProjectionV2;
  otherWallSegmentsExclude: (excludeWallId?: string) => WallSegment[];
};

export type DragOutcomeV2 = {
  actions: ProjectActionV2[];
  activeSnap: Point2D | null;
  guideMatches: GuideMatch[];
  dragReadout: DragReadout | null;
};

const snapToGrid = (value: number) => Math.round(value / PLAN_GRID_SIZE) * PLAN_GRID_SIZE;
const roundToMm = (value: number) => Math.round(value * 1000) / 1000;
const roundPointToMm = (point: Point2D): Point2D => ({
  x: roundToMm(point.x),
  y: roundToMm(point.y),
});
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Pure function: compute drag outcome (action list + readout/snap) for a given drag state.
 *  Returns null when the drag should be silently rejected (degenerate / under min size). */
export function applyDragV2(
  state: DragStateV2,
  currentWorld: Point2D,
  ctx: DragContextV2,
): DragOutcomeV2 | null {
  const { planProjection, otherWallSegmentsExclude } = ctx;
  const dx = currentWorld.x - state.startWorld.x;
  const dy = currentWorld.y - state.startWorld.y;

  const actions: ProjectActionV2[] = [];
  let activeSnap: Point2D | null = null;
  let guideMatches: GuideMatch[] = [];
  let dragReadout: DragReadout | null = null;

  try {
    switch (state.kind) {
      case "wall-translate": {
        const others = otherWallSegmentsExclude(state.wallId);
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
        activeSnap = snapHit;

        const newStart = roundPointToMm({ x: state.origStart.x + finalDx, y: state.origStart.y + finalDy });
        const newEnd = roundPointToMm({ x: state.origEnd.x + finalDx, y: state.origEnd.y + finalDy });
        actions.push({ type: "update-wall", wallId: state.wallId, patch: { start: newStart, end: newEnd } });
        dragReadout = { kind: "wall-translate", dx: roundToMm(finalDx), dy: roundToMm(finalDy) };
        break;
      }
      case "wall-endpoint": {
        const others = otherWallSegmentsExclude(state.wallId);
        const candidate = { x: state.origPoint.x + dx, y: state.origPoint.y + dy };
        const endpointSnap = snapToEndpoint(candidate, others, PLAN_ENDPOINT_THRESHOLD);
        activeSnap = endpointSnap ?? null;

        let resolved: Point2D;
        if (endpointSnap) {
          resolved = endpointSnap;
          guideMatches = [];
        } else if (planProjection) {
          const anchors = collectPlanAnchorsV2(
            planProjection,
            new Set([`wall:${state.wallId}`]),
          );
          const matches = findAxisAlignedGuides(candidate, anchors, PLAN_ENDPOINT_THRESHOLD);
          guideMatches = matches;
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
          guideMatches = [];
          resolved = snapPlanPoint(candidate, others, {
            gridSize: PLAN_GRID_SIZE,
            endpointThreshold: PLAN_ENDPOINT_THRESHOLD,
          });
        }

        const newPt = roundPointToMm(resolved);
        const newStart = state.endpoint === "start" ? newPt : roundPointToMm(state.fixedPoint);
        const newEnd = state.endpoint === "end" ? newPt : roundPointToMm(state.fixedPoint);
        actions.push({ type: "update-wall", wallId: state.wallId, patch: { start: newStart, end: newEnd } });

        const endpointLen = Math.hypot(newPt.x - state.fixedPoint.x, newPt.y - state.fixedPoint.y);
        dragReadout = { kind: "wall-endpoint", length: roundToMm(endpointLen) };
        break;
      }
      case "opening":
      case "balcony": {
        const wx = state.wallEnd.x - state.wallStart.x;
        const wy = state.wallEnd.y - state.wallStart.y;
        const len = Math.hypot(wx, wy);
        if (len === 0) return null;
        const ux = wx / len;
        const uy = wy / len;
        const offsetDelta = dx * ux + dy * uy;
        const width = state.kind === "opening" ? state.openingWidth : state.balconyWidth;
        const raw = state.origOffset + offsetDelta;
        const clamped = Math.max(0, Math.min(Math.max(0, len - width), raw));
        const snapped = roundToMm(snapToGrid(clamped));
        if (state.kind === "opening") {
          actions.push({ type: "update-opening", openingId: state.openingId, patch: { offset: snapped } });
          dragReadout = { kind: "opening", offset: snapped };
        } else {
          actions.push({ type: "update-balcony", balconyId: state.balconyId, patch: { offset: snapped } });
          dragReadout = { kind: "balcony", offset: snapped };
        }
        break;
      }
      case "plan-opening-resize":
      case "plan-balcony-resize": {
        const wx = state.wallEnd.x - state.wallStart.x;
        const wy = state.wallEnd.y - state.wallStart.y;
        const len = Math.hypot(wx, wy);
        if (len === 0) return null;
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
        if (newWidth < minSize) return null;

        const snappedOffset = roundToMm(snapToGrid(newOffset));
        const snappedWidth = roundToMm(snapToGrid(newWidth));
        if (state.kind === "plan-opening-resize") {
          actions.push({
            type: "update-opening",
            openingId: state.openingId,
            patch: { offset: snappedOffset, width: snappedWidth },
          });
          dragReadout = { kind: "plan-opening-resize", width: snappedWidth };
        } else {
          actions.push({
            type: "update-balcony",
            balconyId: state.balconyId,
            patch: { offset: snappedOffset, width: snappedWidth },
          });
          dragReadout = { kind: "plan-balcony-resize", width: snappedWidth };
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
        actions.push({
          type: "update-opening",
          openingId: state.openingId,
          patch: { offset, sillHeight: sill },
        });
        dragReadout = { kind: "elev-opening-move", offset, sill };
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
        if (newWidth < minSize || newHeight < minSize) return null;

        const offset = roundToMm(snapToGrid(newOffset));
        const sill = roundToMm(snapToGrid(newSill));
        const width = roundToMm(snapToGrid(newWidth));
        const height = roundToMm(snapToGrid(newHeight));
        actions.push({
          type: "update-opening",
          openingId: state.openingId,
          patch: { offset, sillHeight: sill, width, height },
        });
        dragReadout = { kind: "elev-opening-resize", width, height };
        break;
      }
      case "elev-balcony-move": {
        const dxOffset = dx * state.projSign;
        const newOffset = clamp(state.origOffset + dxOffset, 0, Math.max(0, state.wallLen - state.width));
        const offset = roundToMm(snapToGrid(newOffset));
        actions.push({ type: "update-balcony", balconyId: state.balconyId, patch: { offset } });
        dragReadout = { kind: "elev-balcony-move", offset };
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
        if (newWidth < minSize) return null;
        const offset = roundToMm(snapToGrid(newOffset));
        const width = roundToMm(snapToGrid(newWidth));
        actions.push({
          type: "update-balcony",
          balconyId: state.balconyId,
          patch: { offset, width },
        });
        dragReadout = { kind: "elev-balcony-resize", width };
        break;
      }
      case "stair-translate": {
        const newX = roundToMm(snapToGrid(state.origX + dx));
        const newY = roundToMm(snapToGrid(state.origY + dy));
        actions.push({ type: "update-stair", stairId: state.stairId, patch: { x: newX, y: newY } });
        break;
      }
      case "stair-resize": {
        const minSize = 0.6;
        let adjusted: Point2D = currentWorld;
        if (planProjection) {
          const anchors = collectPlanAnchorsV2(
            planProjection,
            new Set([`stair:${state.stairId}`]),
          );
          const matches = findAxisAlignedGuides(currentWorld, anchors, PLAN_ENDPOINT_THRESHOLD);
          guideMatches = matches;
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
          guideMatches = [];
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
        actions.push({
          type: "update-stair",
          stairId: state.stairId,
          patch: { x: newX, y: newY, width: w, depth: d },
        });
        dragReadout = { kind: "stair-resize", width: w, depth: d };
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
        actions.push({ type: "update-stair", stairId: state.stairId, patch: { rotation: newRotation } });
        dragReadout = { kind: "stair-rotate", angleDeg: (newRotation * 180) / Math.PI };
        break;
      }
    }
  } catch {
    return null;
  }

  return { actions, activeSnap, guideMatches, dragReadout };
}

export type ObjectSelectionV2 =
  | { kind: "wall"; wallId: string }
  | { kind: "opening"; openingId: string }
  | { kind: "balcony"; balconyId: string }
  | { kind: "stair"; stairId: string };

/** Returns the selection that should be applied on a click that did not exceed the
 *  movement threshold (i.e. user clicked on a draggable element without dragging). */
export function selectionOnClickV2(state: DragStateV2): ObjectSelectionV2 | undefined {
  switch (state.kind) {
    case "wall-translate":
      return { kind: "wall", wallId: state.wallId };
    case "opening":
    case "elev-opening-move":
      return { kind: "opening", openingId: state.openingId };
    case "balcony":
    case "elev-balcony-move":
      return { kind: "balcony", balconyId: state.balconyId };
    case "stair-translate":
      return { kind: "stair", stairId: state.stairId };
    default:
      return undefined;
  }
}
