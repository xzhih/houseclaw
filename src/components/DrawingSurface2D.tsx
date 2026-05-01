import { useRef, useState } from "react";
import type { ProjectStateV2, SelectionV2 } from "../app/v2/projectReducer";
import type { ProjectActionV2 } from "../app/v2/projectReducer";
import { projectElevationV2 } from "../projection/v2/elevation";
import { projectPlanV2 } from "../projection/v2/plan";
import { projectRoofViewV2 } from "../projection/v2/roofView";
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
import { useDragHandlersV2, eventToWorldWith } from "./canvas/useDragHandlersV2";
import {
  applyDragV2,
  DRAG_MOVE_THRESHOLD_WORLD,
  selectionOnClickV2,
  type WallSegment,
} from "./canvas/dragMachineV2";
import type { DragStateV2 } from "./canvas/dragStateV2";
import { ContextChip, ContextChipAction } from "./chrome/ContextChip";
import { DragReadoutChip } from "./chrome/DragReadoutChip";
import { buildDefaultRoof } from "./chrome/buildDefaultRoof";

type DrawingSurface2DProps = {
  project: ProjectStateV2;
  onSelect: (selection: SelectionV2) => void;
  dispatch: (action: ProjectActionV2) => void;
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
  const [dragState, setDragState] = useState<DragStateV2 | null>(null);
  const [readout, setReadout] = useState<DragReadout | null>(null);
  const [readoutVisible, setReadoutVisible] = useState(false);
  const readoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const planStoreyId = planStoreyIdFromView(project.activeView, project.storeys);
  const elevationSide =
    ELEVATION_SIDE_BY_VIEW[project.activeView as keyof typeof ELEVATION_SIDE_BY_VIEW];
  const isRoofView = project.activeView === "roof";

  let body: React.ReactElement;
  let activeMapping = undefined as ReturnType<typeof createPointMapping> | undefined;
  let planProjection: ReturnType<typeof projectPlanV2> | undefined;

  if (planStoreyId) {
    const projection = projectPlanV2(project, planStoreyId);
    planProjection = projection;
    const mapping = createPointMapping(planBounds(projection));
    activeMapping = mapping;
    body = renderPlan({
      projection,
      mapping,
      selection: project.selection,
      onSelect,
      handlers: undefined, // assigned below after hook init
    });
  } else if (elevationSide) {
    const projection = projectElevationV2(project, elevationSide);
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
    const projection = projectRoofViewV2(project);
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

  const { planHandlers, elevationHandlers } = useDragHandlersV2({
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
      handlers: planHandlers,
    });
  } else if (elevationSide && activeMapping) {
    const projection = projectElevationV2(project, elevationSide);
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

          if (dragState && svgRef.current) {
            const world = eventToWorldWith(svgRef.current, event, dragState.mapping);
            if (world) {
              const dist = Math.hypot(
                world.x - dragState.startWorld.x,
                world.y - dragState.startWorld.y,
              );
              if (dist >= DRAG_MOVE_THRESHOLD_WORLD || dragState.moved) {
                if (!dragState.moved) {
                  setDragState({ ...dragState, moved: true } as DragStateV2);
                }
                const outcome = applyDragV2(dragState, world, {
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
          if (dragState) {
            if (svgRef.current?.hasPointerCapture(dragState.pointerId)) {
              svgRef.current.releasePointerCapture(dragState.pointerId);
            }
            if (!dragState.moved) {
              const sel = selectionOnClickV2(dragState);
              if (sel) onSelect(sel);
            }
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
          if (dragState) {
            if (svgRef.current?.hasPointerCapture(dragState.pointerId)) {
              svgRef.current.releasePointerCapture(dragState.pointerId);
            }
            setDragState(null);
          }
          panHandlers.onPointerUp(event);
        }}
        onClick={(event) => {
          // Skip click handling if we just finished a drag (pointerup already handled selection)
          if (dragState) return;

          const target = event.target as SVGElement;
          const hitKind = target.getAttribute("data-kind");
          const hitId = target.getAttribute("data-id");
          let hit: SelectionV2 = undefined;
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
