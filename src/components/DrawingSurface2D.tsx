import { useCallback, useRef, useState } from "react";
import type { ProjectState, Selection } from "../app/projectReducer";
import type { ProjectAction } from "../app/projectReducer";
import { projectElevation } from "../projection/elevation";
import { projectPlan } from "../projection/plan";
import { projectRoofView } from "../projection/roofView";
import { GridOverlay } from "./canvas/GridOverlay";
import { ScaleRuler } from "./canvas/ScaleRuler";
import { ZoomControls } from "./canvas/ZoomControls";
import {
  ELEVATION_SIDE_BY_VIEW,
  SURFACE_HEIGHT,
  SURFACE_WIDTH,
  createPointMapping,
  elevationBounds,
  planBounds,
  roofViewBounds,
} from "./canvas/renderUtils";
import { renderElevation } from "./canvas/renderElevation";
import { renderPlan } from "./canvas/renderPlan";
import { renderRoofView } from "./canvas/renderRoofView";
import { DEFAULT_VIEWPORT, useViewport } from "./canvas/useViewport";
import { useCreateHandlers } from "./canvas/useCreateHandlers";
import { CreatePreview } from "./canvas/createPreview";
import type { Point2D, DragReadout } from "./canvas/types";
import { useDragHandlers, eventToWorldWith } from "./canvas/useDragHandlers";
import {
  applyDrag,
  DRAG_MOVE_THRESHOLD_PX,
  selectionOnClick,
  type WallSegment,
} from "./canvas/dragMachine";
import type { DragState } from "./canvas/dragState";
import { ContextChip, ContextChipAction } from "./chrome/ContextChip";
import { DragReadoutChip } from "./chrome/DragReadoutChip";
import { buildDefaultRoof } from "./chrome/buildDefaultRoof";
import { buildWallNetwork } from "../geometry/wallNetwork";

type DrawingSurface2DProps = {
  project: ProjectState;
  onSelect: (selection: Selection) => void;
  dispatch: (action: ProjectAction) => void;
};

function planStoreyIdFromView(viewId: string, storeys: { id: string }[]): string | undefined {
  if (!viewId.startsWith("plan-")) return undefined;
  const id = viewId.slice("plan-".length);
  return storeys.find((s) => s.id === id)?.id;
}

export function DrawingSurface2D({ project, onSelect, dispatch }: DrawingSurface2DProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { viewport, setViewport, isPanning, panHandlers } = useViewport(
    svgRef,
    `${project.id}|${project.activeView}`,
  );
  const [gridVisible, setGridVisible] = useState(true);
  const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);
  // dragState lives in BOTH a ref (for synchronous read in pointermove) and
  // useState (for React re-render of overlay UI like cursor / drag handles).
  // pointerdown → pointermove can fire before React commits the next render,
  // so the handler must read the ref to see the just-set state, otherwise the
  // first move event drops on the floor (intermittent "highlight but no drag"
  // behavior — symptoms vary with mouse speed).
  const dragStateRef = useRef<DragState | null>(null);
  const dragStartPixelRef = useRef<{ x: number; y: number } | null>(null);
  // Timestamp of the last pointerup that ended a drag/click on a real object.
  // The SVG-level onClick uses this to skip "clear selection on background
  // click" when the click event is actually fallout from a child's pointer
  // sequence — Chrome retargets click to the captor (the SVG) when
  // setPointerCapture was set on it, which would otherwise immediately
  // clear the selection that pointerup just set.
  const lastObjectInteractionRef = useRef(0);
  const [dragState, setDragStateInner] = useState<DragState | null>(null);
  // Two call shapes:
  //   setDragState(next, startPixel) — from pointerdown (records pixel start)
  //   setDragState(null)             — from pointerup/cancel (clears)
  //   setDragState({ ...ds, moved: true }) — from pointermove (updates ds only)
  const setDragState = useCallback(
    (next: DragState | null, startPixel?: { x: number; y: number }) => {
      dragStateRef.current = next;
      setDragStateInner(next);
      if (next === null) {
        dragStartPixelRef.current = null;
      } else if (startPixel) {
        dragStartPixelRef.current = startPixel;
      }
    },
    [],
  );
  const [readout, setReadout] = useState<DragReadout | null>(null);
  const [readoutVisible, setReadoutVisible] = useState(false);
  const readoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const planStoreyId = planStoreyIdFromView(project.activeView, project.storeys);
  const elevationSide =
    ELEVATION_SIDE_BY_VIEW[project.activeView as keyof typeof ELEVATION_SIDE_BY_VIEW];
  const isRoofView = project.activeView === "roof";

  let body: React.ReactElement;
  let activeMapping = undefined as ReturnType<typeof createPointMapping> | undefined;
  let planProjection: ReturnType<typeof projectPlan> | undefined;

  let planFootprints: Map<string, ReturnType<typeof buildWallNetwork>[number]> | undefined;
  if (planStoreyId) {
    const projection = projectPlan(project, planStoreyId);
    planProjection = projection;
    const mapping = createPointMapping(planBounds(projection));
    activeMapping = mapping;
    // Compute footprints only for walls visible on this plan storey, so wall
    // junctions don't cross-contaminate between floors.
    const visibleIds = new Set(projection.wallSegments.map((w) => w.wallId));
    const visibleWalls = project.walls.filter((w) => visibleIds.has(w.id));
    const list = buildWallNetwork(visibleWalls, project.storeys);
    planFootprints = new Map(list.map((f) => [f.wallId, f]));
    body = renderPlan({
      projection,
      mapping,
      selection: project.selection,
      onSelect,
      footprints: planFootprints,
      handlers: undefined, // assigned below after hook init
    });
  } else if (elevationSide) {
    const projection = projectElevation(project, elevationSide);
    const mapping = createPointMapping(elevationBounds(projection));
    activeMapping = mapping;
    body = renderElevation({
      projection,
      mapping,
      selection: project.selection,
      onSelect,
      handlers: undefined, // assigned below after hook init
    });
  } else if (isRoofView) {
    const projection = projectRoofView(project);
    const mapping = createPointMapping(roofViewBounds(projection));
    activeMapping = mapping;
    body = renderRoofView({
      projection,
      mapping,
      selectedRoofId:
        project.selection?.kind === "roof" ? project.selection.roofId : undefined,
      onSelectRoof: (roofId) => onSelect({ kind: "roof", roofId }),
    });
  } else {
    body = (
      <text x={SURFACE_WIDTH / 2} y={SURFACE_HEIGHT / 2} textAnchor="middle" fill="#888">
        无视图
      </text>
    );
  }

  const { planHandlers, elevationHandlers } = useDragHandlers({
    project,
    planStoreyId,
    elevationSide,
    planMapping: planStoreyId ? activeMapping : undefined,
    elevationMapping: elevationSide ? activeMapping : undefined,
    svgRef,
    setDragState,
  });

  // Re-render body with handlers wired in
  if (planStoreyId && planProjection && activeMapping) {
    body = renderPlan({
      projection: planProjection,
      mapping: activeMapping,
      selection: project.selection,
      onSelect,
      footprints: planFootprints,
      handlers: planHandlers,
    });
  } else if (elevationSide && activeMapping) {
    const projection = projectElevation(project, elevationSide);
    body = renderElevation({
      projection,
      mapping: activeMapping,
      selection: project.selection,
      onSelect,
      handlers: elevationHandlers,
    });
  }

  const createHandlers = useCreateHandlers({
    project,
    storeyId: planStoreyId,
    dispatch,
  });

  const otherWallSegmentsExclude = (excludeWallId?: string): WallSegment[] =>
    project.walls
      .filter((w) => w.id !== excludeWallId)
      .map((w) => ({ start: w.start, end: w.end }));

  return (
    <div className="drawing-surface" aria-label="2D drawing surface">
      <svg
        ref={svgRef}
        width={SURFACE_WIDTH}
        height={SURFACE_HEIGHT}
        viewBox={`${viewport.panX} ${viewport.panY} ${SURFACE_WIDTH / viewport.zoom} ${SURFACE_HEIGHT / viewport.zoom}`}
        tabIndex={0}
        onPointerDown={panHandlers.onPointerDown}
        onPointerMove={(event) => {
          panHandlers.onPointerMove(event);

          // Read latest dragState from ref — it may have been set in this same
          // tick by a child element's pointerdown before React re-rendered, in
          // which case the closed-over `dragState` is still null.
          const ds = dragStateRef.current;
          if (ds && svgRef.current) {
            // dragStartPixelRef was set by setDragState() at pointerdown (via
            // useDragHandlers). Pixel-based threshold is zoom-independent —
            // a normal click with 1-2px jitter no longer triggers a drag.
            const startPx = dragStartPixelRef.current;
            const pxDist = startPx
              ? Math.hypot(event.clientX - startPx.x, event.clientY - startPx.y)
              : 0;
            if (pxDist >= DRAG_MOVE_THRESHOLD_PX || ds.moved) {
              const world = eventToWorldWith(svgRef.current, event, ds.mapping);
              if (world) {
                if (!ds.moved) {
                  setDragState({ ...ds, moved: true } as DragState);
                }
                const outcome = applyDrag(ds, world, {
                  project,
                  planProjection,
                  otherWallSegmentsExclude,
                });
                if (outcome) {
                  for (const action of outcome.actions) {
                    dispatch(action);
                  }
                  if (outcome.dragReadout) {
                    if (readoutTimerRef.current) {
                      clearTimeout(readoutTimerRef.current);
                      readoutTimerRef.current = null;
                    }
                    setReadout(outcome.dragReadout);
                    setReadoutVisible(true);
                  }
                }
              }
            }
          } else if (activeMapping && svgRef.current && planStoreyId) {
            const world = eventToWorldWith(svgRef.current, event, activeMapping);
            if (world) setCursorWorld(world);
          }
        }}
        onPointerUp={(event) => {
          panHandlers.onPointerUp(event);
          const ds = dragStateRef.current;
          if (ds) {
            if (svgRef.current?.hasPointerCapture(ds.pointerId)) {
              svgRef.current.releasePointerCapture(ds.pointerId);
            }
            if (!ds.moved) {
              const sel = selectionOnClick(ds);
              if (sel) onSelect(sel);
            }
            // Mark that we just ended an interaction on a real object —
            // the upcoming click event must NOT be treated as "clicked
            // background to deselect" (Chrome retargets click to the
            // captor SVG, which would otherwise wipe the just-set selection).
            lastObjectInteractionRef.current = Date.now();
            setReadoutVisible(false);
            if (readoutTimerRef.current) clearTimeout(readoutTimerRef.current);
            readoutTimerRef.current = setTimeout(() => {
              setReadout(null);
              readoutTimerRef.current = null;
            }, 400);
            setDragState(null);
          }
        }}
        onPointerCancel={(event) => {
          const ds = dragStateRef.current;
          if (ds) {
            if (svgRef.current?.hasPointerCapture(ds.pointerId)) {
              svgRef.current.releasePointerCapture(ds.pointerId);
            }
            setDragState(null);
          }
          panHandlers.onPointerUp(event);
        }}
        onClick={(event) => {
          // Skip click handling if we just finished a drag (pointerup already handled selection)
          if (dragStateRef.current) return;

          // Skip if we JUST ended an object-level pointer interaction —
          // Chrome retargets click to the captor SVG when setPointerCapture
          // was set, and event.target ends up === event.currentTarget even
          // though the user clicked a child rect. Without this guard the
          // background-click branch would wipe the selection that pointerup
          // just set.
          if (Date.now() - lastObjectInteractionRef.current < 300) return;

          const target = event.target as SVGElement;
          const hitKind = target.getAttribute("data-kind");
          const hitId = target.getAttribute("data-id");
          let hit: Selection = undefined;
          if (hitKind === "wall" && hitId) hit = { kind: "wall", wallId: hitId };

          let world: { x: number; y: number } | null = null;
          if (activeMapping && svgRef.current) {
            const w = eventToWorldWith(svgRef.current, event, activeMapping);
            if (w) world = w;
          }

          if (world) {
            const handled = createHandlers.handleCanvasClick(world, hit);
            if (handled) return;
          }

          if (event.target === event.currentTarget) onSelect(undefined);
        }}
        onKeyDown={(event) => {
          createHandlers.handleKeyDown(event.key);
        }}
        style={{ cursor: isPanning ? "grabbing" : "grab", background: "#fafafa" }}
      >
        {activeMapping ? (
          <GridOverlay mapping={activeMapping} viewport={viewport} visible={gridVisible} />
        ) : null}
        {body}
        {activeMapping && planStoreyId ? (
          <CreatePreview
            state={createHandlers.state}
            mapping={activeMapping}
            cursorWorld={cursorWorld ?? undefined}
          />
        ) : null}
      </svg>
      <DragReadoutChip readout={readout} visible={readoutVisible} />
      {project.activeTool === "roof" && planStoreyId ? (
        <ContextChip>
          PRESS ENTER · CREATE ROOF
          <ContextChipAction
            onClick={() => {
              const roof = buildDefaultRoof(project);
              if (!roof) return;
              try {
                dispatch({ type: "add-roof", roof });
              } catch (e) {
                console.warn("Failed to add roof:", e);
              }
            }}
          >
            CREATE
          </ContextChipAction>
        </ContextChip>
      ) : null}
      {activeMapping ? <ScaleRuler mapping={activeMapping} viewport={viewport} /> : null}
      <ZoomControls
        viewport={viewport}
        defaultViewport={DEFAULT_VIEWPORT}
        onViewportChange={setViewport}
        gridVisible={gridVisible}
        onGridToggle={() => setGridVisible((v) => !v)}
      />
    </div>
  );
}
