import { useRef, useState } from "react";
import type { ProjectStateV2, SelectionV2 } from "../app/v2/projectReducer";
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

type DrawingSurface2DProps = {
  project: ProjectStateV2;
  onSelect: (selection: SelectionV2) => void;
};

function planStoreyIdFromView(viewId: string, storeys: { id: string }[]): string | undefined {
  if (!viewId.startsWith("plan-")) return undefined;
  const id = viewId.slice("plan-".length);
  return storeys.find((s) => s.id === id)?.id;
}

export function DrawingSurface2D({ project, onSelect }: DrawingSurface2DProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { viewport, setViewport, isPanning, panHandlers } = useViewport(
    svgRef,
    `${project.id}|${project.activeView}`,
  );
  const [gridVisible, setGridVisible] = useState(true);

  const planStoreyId = planStoreyIdFromView(project.activeView, project.storeys);
  const elevationSide =
    ELEVATION_SIDE_BY_VIEW[project.activeView as keyof typeof ELEVATION_SIDE_BY_VIEW];
  const isRoofView = project.activeView === "roof";

  let body: React.ReactElement;
  let activeMapping = undefined as ReturnType<typeof createPointMapping> | undefined;

  if (planStoreyId) {
    const projection = projectPlanV2(project, planStoreyId);
    const mapping = createPointMapping(planBounds(projection));
    activeMapping = mapping;
    body = renderPlan({
      projection,
      mapping,
      selection: project.selection,
      onSelect,
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

  return (
    <div className="drawing-surface" aria-label="2D drawing surface">
      <svg
        ref={svgRef}
        width={SURFACE_WIDTH}
        height={SURFACE_HEIGHT}
        viewBox={`${viewport.panX} ${viewport.panY} ${SURFACE_WIDTH / viewport.zoom} ${SURFACE_HEIGHT / viewport.zoom}`}
        onPointerDown={panHandlers.onPointerDown}
        onPointerMove={panHandlers.onPointerMove}
        onPointerUp={panHandlers.onPointerUp}
        onClick={(event) => {
          if (event.target === event.currentTarget) onSelect(undefined);
        }}
        style={{ cursor: isPanning ? "grabbing" : "grab", background: "#fafafa" }}
      >
        {activeMapping ? (
          <GridOverlay mapping={activeMapping} viewport={viewport} visible={gridVisible} />
        ) : null}
        {body}
      </svg>
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
