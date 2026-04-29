import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ObjectSelection } from "../domain/selection";
import type { HouseProject } from "../domain/types";
import { planStoreyIdFromView } from "../domain/views";
import type { GuideMatch } from "../geometry/smartGuides";
import { buildWallNetwork, type WallFootprint } from "../geometry/wallNetwork";
import { projectElevationView } from "../projection/elevation";
import { projectPlanView } from "../projection/plan";
import { GridOverlay } from "./canvas/GridOverlay";
import { ScaleRuler } from "./canvas/ScaleRuler";
import { SmartGuides } from "./canvas/SmartGuides";
import { StatusReadout } from "./canvas/StatusReadout";
import { ZoomControls } from "./canvas/ZoomControls";
import type { DragReadout, Point2D } from "./canvas/types";
import type { DragState } from "./canvas/dragState";
import {
  DRAG_MOVE_THRESHOLD_WORLD,
  applyDrag,
  selectionOnClick,
} from "./canvas/dragMachine";
import {
  ELEVATION_SIDE_BY_VIEW,
  SURFACE_HEIGHT,
  SURFACE_WIDTH,
  createPointMapping,
  elevationBounds,
  planBounds,
  unionBounds,
} from "./canvas/renderUtils";
import { renderPlan } from "./canvas/renderPlan";
import { renderElevation } from "./canvas/renderElevation";
import { renderRoofView } from "./canvas/renderRoofView";
import { DEFAULT_VIEWPORT, useViewport } from "./canvas/useViewport";
import { eventToWorldWith, useDragHandlers } from "./canvas/useDragHandlers";

type DrawingSurface2DProps = {
  project: HouseProject;
  onSelect: (selection: ObjectSelection | undefined) => void;
  onProjectChange: (project: HouseProject) => void;
};

export function DrawingSurface2D({
  project,
  onSelect,
  onProjectChange,
}: DrawingSurface2DProps) {
  const storeyId = planStoreyIdFromView(project.activeView, project.storeys);
  const elevationSide = ELEVATION_SIDE_BY_VIEW[project.activeView];

  const svgRef = useRef<SVGSVGElement | null>(null);
  const { viewport, setViewport, isPanning, panHandlers } = useViewport(
    svgRef,
    `${project.id}|${project.activeView}`,
  );
  const [dragState, setDragState] = useState<DragState | undefined>(undefined);
  const [activeSnap, setActiveSnap] = useState<Point2D | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);
  const [gridVisible, setGridVisible] = useState(true);
  const [dragReadout, setDragReadout] = useState<DragReadout | null>(null);
  const [guideMatches, setGuideMatches] = useState<GuideMatch[]>([]);

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
    panHandlers.onPointerDown(event);
  };

  const { planHandlers, elevationHandlers } = useDragHandlers({
    project,
    storeyId,
    elevationSide,
    planMapping,
    elevationMapping,
    svgRef,
    setDragState,
  });

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (dragState && event.pointerId === dragState.pointerId) {
      const currentWorld = eventToWorldWith(svgRef.current, event, dragState.mapping);
      if (!currentWorld) return;
      setCursorWorld(currentWorld);
      const dx = currentWorld.x - dragState.startWorld.x;
      const dy = currentWorld.y - dragState.startWorld.y;
      if (!dragState.moved && Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD_WORLD) return;
      if (!dragState.moved) {
        setDragState({ ...dragState, moved: true });
      }
      const otherWallSegmentsExclude = (excludeWallId?: string) =>
        storeyId === undefined
          ? []
          : project.walls
              .filter((w) => w.storeyId === storeyId && w.id !== excludeWallId)
              .map((w) => ({ start: w.start, end: w.end }));
      const outcome = applyDrag(
        dragState,
        currentWorld,
        { project, planProjection, otherWallSegmentsExclude },
      );
      if (!outcome) return;
      onProjectChange(outcome.project);
      setActiveSnap(outcome.activeSnap);
      setGuideMatches(outcome.guideMatches);
      setDragReadout(outcome.dragReadout);
      return;
    }

    panHandlers.onPointerMove(event);
    if (isPanning) return;

    // hover: 更新 cursorWorld（plan 或 elevation 视图）
    const activeMapping = planMapping ?? elevationMapping;
    if (!activeMapping) {
      setCursorWorld(null);
      return;
    }
    const world = eventToWorldWith(svgRef.current, event, activeMapping);
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
        const sel = selectionOnClick(finished);
        if (sel) onSelect(sel);
      }
      return;
    }

    panHandlers.onPointerUp(event);
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
              planHandlers,
              ghostProjection,
            )
          : elevationProjection
            ? renderElevation(
                elevationProjection,
                project.selection,
                onSelect,
                project.activeTool,
                elevationHandlers,
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
