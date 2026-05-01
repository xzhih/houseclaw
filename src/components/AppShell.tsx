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
  const is3D = project.mode === "3d";

  return (
    <div className="app-root">
      <header className="chrome-header">
        <span className="chrome-header-logo">HouseClaw</span>
        <span className="chrome-header-divider" aria-hidden />
        <span className="chrome-header-project">{project.name || "未命名项目"}</span>
        <span className="chrome-header-spacer" />
        <div className="chrome-header-mode" role="group" aria-label="模式">
          <button
            type="button"
            className="chrome-header-mode-pill"
            aria-pressed={!is3D}
            onClick={() => dispatch({ type: "set-mode", mode: "2d" })}
          >
            2D
          </button>
          <button
            type="button"
            className="chrome-header-mode-pill"
            aria-pressed={is3D}
            onClick={() => dispatch({ type: "set-mode", mode: "3d" })}
          >
            3D
          </button>
        </div>
      </header>

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

      <main className="chrome-main">
        <ToolPalette
          project={project}
          activeTool={project.activeTool}
          onChange={(toolId) => dispatch({ type: "set-tool", toolId })}
          dispatch={dispatch}
        />
        <div className="chrome-main-canvas-wrap" aria-label="canvas">
          {is3D ? (
            <Preview3D project={project} />
          ) : (
            <DrawingSurface2D
              project={project}
              onSelect={(selection) => dispatch({ type: "select", selection })}
              dispatch={dispatch}
            />
          )}
        </div>
        <div className="chrome-main-panel">
          <PropertyPanel project={project} dispatch={dispatch} />
        </div>
      </main>
    </div>
  );
}
