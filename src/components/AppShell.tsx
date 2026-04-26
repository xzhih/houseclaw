import { type ChangeEvent, useReducer, useState } from "react";
import { exportProjectJson, importProjectJson } from "../app/persistence";
import { projectReducer } from "../app/projectReducer";
import { createSampleProject } from "../domain/sampleProject";
import type { ObjectSelection } from "../domain/selection";
import type { Mode, ToolId, ViewId } from "../domain/types";
import { downloadTextFile } from "../export/exporters";
import { DrawingSurface2D } from "./DrawingSurface2D";
import { ModeSwitch } from "./ModeSwitch";
import { Preview3D } from "./Preview3D";
import { PropertyPanel } from "./PropertyPanel";
import { ToolPalette } from "./ToolPalette";
import { ViewTabs } from "./ViewTabs";

export function AppShell() {
  const [project, dispatch] = useReducer(projectReducer, undefined, createSampleProject);
  const [importError, setImportError] = useState<string | undefined>();

  const setMode = (mode: Mode) => dispatch({ type: "set-mode", mode });
  const setView = (viewId: ViewId) => dispatch({ type: "set-view", viewId });
  const setTool = (toolId: ToolId) => dispatch({ type: "set-tool", toolId });
  const select = (selection: ObjectSelection | undefined) => dispatch({ type: "select", selection });
  const applyWallMaterial = (wallId: string, materialId: string) =>
    dispatch({ type: "apply-wall-material", wallId, materialId });
  const handleExport = () => {
    setImportError(undefined);
    downloadTextFile("houseclaw-project.json", exportProjectJson(project));
  };
  const handleImport = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    void file
      .text()
      .then((json) => {
        dispatch({ type: "replace-project", project: importProjectJson(json) });
        setImportError(undefined);
      })
      .catch((error: unknown) => {
        setImportError(error instanceof Error ? error.message : "无法导入 JSON，请检查文件格式。");
      })
      .finally(() => {
        input.value = "";
      });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <h1>HouseClaw</h1>
          <p>轻量住宅建模与外观沟通工具</p>
        </div>
        <div className="top-actions">
          <button className="top-action-button" type="button" onClick={handleExport}>
            导出 JSON
          </button>
          <label className="file-button">
            导入 JSON
            <input aria-label="导入 JSON" type="file" accept="application/json" onChange={handleImport} />
          </label>
          <ModeSwitch mode={project.mode} onModeChange={setMode} />
          {importError ? (
            <p className="import-error" role="alert">
              {importError}
            </p>
          ) : null}
        </div>
        {project.mode === "2d" ? (
          <ViewTabs activeView={project.activeView} onViewChange={setView} />
        ) : null}
      </header>

      {project.mode === "2d" ? (
        <section className="workspace workspace-2d" aria-label="2D workspace">
          <ToolPalette activeTool={project.activeTool} onToolChange={setTool} />
          <DrawingSurface2D project={project} onSelect={select} />
          <PropertyPanel project={project} onApplyWallMaterial={applyWallMaterial} />
        </section>
      ) : (
        <section className="workspace workspace-3d" aria-label="3D workspace">
          <Preview3D project={project} />
        </section>
      )}
    </main>
  );
}
