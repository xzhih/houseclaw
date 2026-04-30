import { useReducer } from "react";
import { withSessionDefaults, projectReducerV2, type ProjectStateV2 } from "../app/v2/projectReducer";
import { createV2SampleProject } from "../domain/v2/sampleProject";
import { Preview3D } from "./Preview3D";
import { DrawingSurface2D } from "./DrawingSurface2D";
import { ToolPalette } from "./ToolPalette";
import { ViewTabs } from "./ViewTabs";
import { ElevationSideTabs } from "./ElevationSideTabs";
import { PropertyPanel } from "./PropertyPanel";

function init(): ProjectStateV2 {
  return withSessionDefaults(createV2SampleProject());
}

export function AppShell() {
  const [project, dispatch] = useReducer(projectReducerV2, undefined, init);
  const isElevation = project.activeView.startsWith("elevation-");

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">HouseClaw</h1>
        <div className="mode-toggle" role="group" aria-label="模式">
          <button
            type="button"
            aria-pressed={project.mode === "2d"}
            onClick={() => dispatch({ type: "set-mode", mode: "2d" })}
          >
            2D
          </button>
          <button
            type="button"
            aria-pressed={project.mode === "3d"}
            onClick={() => dispatch({ type: "set-mode", mode: "3d" })}
          >
            3D
          </button>
        </div>
      </header>

      <main className="app-main">
        {project.mode === "3d" ? (
          <Preview3D project={project} />
        ) : (
          <div className="editor-2d">
            <ViewTabs
              project={project}
              onChange={(viewId) => dispatch({ type: "set-view", viewId })}
            />
            {isElevation ? (
              <ElevationSideTabs
                activeView={project.activeView}
                onChange={(viewId) => dispatch({ type: "set-view", viewId })}
              />
            ) : null}
            <div className="editor-2d-body">
              <DrawingSurface2D
                project={project}
                onSelect={(selection) => dispatch({ type: "select", selection })}
                dispatch={dispatch}
              />
              <ToolPalette
                project={project}
                activeTool={project.activeTool}
                onChange={(toolId) => dispatch({ type: "set-tool", toolId })}
                dispatch={dispatch}
              />
              <PropertyPanel project={project} dispatch={dispatch} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
