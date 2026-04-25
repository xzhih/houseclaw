import { useReducer } from "react";
import { projectReducer } from "../app/projectReducer";
import { createSampleProject } from "../domain/sampleProject";
import type { Mode, ToolId, ViewId } from "../domain/types";
import { DrawingSurface2D } from "./DrawingSurface2D";
import { ModeSwitch } from "./ModeSwitch";
import { Preview3D } from "./Preview3D";
import { PropertyPanel } from "./PropertyPanel";
import { ToolPalette } from "./ToolPalette";
import { ViewTabs } from "./ViewTabs";

export function AppShell() {
  const [project, dispatch] = useReducer(projectReducer, undefined, createSampleProject);

  const setMode = (mode: Mode) => dispatch({ type: "set-mode", mode });
  const setView = (viewId: ViewId) => dispatch({ type: "set-view", viewId });
  const setTool = (toolId: ToolId) => dispatch({ type: "set-tool", toolId });
  const selectObject = (objectId: string | undefined) => dispatch({ type: "select-object", objectId });

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>HouseClaw</h1>
          <p>轻量住宅建模与外观沟通工具</p>
        </div>
        <ModeSwitch mode={project.mode} onModeChange={setMode} />
        {project.mode === "2d" ? (
          <ViewTabs activeView={project.activeView} onViewChange={setView} />
        ) : null}
      </header>

      {project.mode === "2d" ? (
        <section className="workspace workspace-2d" aria-label="2D workspace">
          <ToolPalette activeTool={project.activeTool} onToolChange={setTool} />
          <DrawingSurface2D project={project} onSelectObject={selectObject} />
          <PropertyPanel project={project} />
        </section>
      ) : (
        <section className="workspace workspace-3d" aria-label="3D workspace">
          <Preview3D project={project} />
        </section>
      )}
    </main>
  );
}
