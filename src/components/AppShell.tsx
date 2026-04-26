import { type ChangeEvent, useEffect, useReducer, useState } from "react";
import { exportProjectJson, importProjectJson } from "../app/persistence";
import { projectReducer } from "../app/projectReducer";
import { removeBalcony, removeOpening, removeWall } from "../domain/mutations";
import { createSampleProject } from "../domain/sampleProject";
import type { ObjectSelection } from "../domain/selection";
import type { HouseProject, Mode, ToolId, ViewId } from "../domain/types";
import { downloadTextFile } from "../export/exporters";
import { DrawingSurface2D } from "./DrawingSurface2D";
import { Preview3D } from "./Preview3D";
import { PropertyPanel } from "./PropertyPanel";
import { StoreyHeightStrip } from "./StoreyHeightStrip";
import { ToolPalette } from "./ToolPalette";
import { ViewTabs } from "./ViewTabs";

const MODE_TABS: { id: Mode; label: string }[] = [
  { id: "2d", label: "2D" },
  { id: "3d", label: "3D" },
];

function pickInitialMaterialId(materials: { id: string; kind: string }[]): string {
  return (
    materials.find((material) => material.kind === "wall")?.id ?? materials[0]?.id ?? ""
  );
}

export function AppShell() {
  const [project, dispatch] = useReducer(projectReducer, undefined, createSampleProject);
  const [importError, setImportError] = useState<string | undefined>();
  const [activeMaterialId, setActiveMaterialId] = useState<string>(() =>
    pickInitialMaterialId(project.materials),
  );

  const setMode = (mode: Mode) => dispatch({ type: "set-mode", mode });
  const setView = (viewId: ViewId) => dispatch({ type: "set-view", viewId });
  const setTool = (toolId: ToolId) => dispatch({ type: "set-tool", toolId });
  const select = (selection: ObjectSelection | undefined) => dispatch({ type: "select", selection });
  const applyWallMaterial = (wallId: string, materialId: string) =>
    dispatch({ type: "apply-wall-material", wallId, materialId });

  const handleDeleteSelection = () => {
    const sel = project.selection;
    if (!sel) return;
    let next: HouseProject;
    try {
      switch (sel.kind) {
        case "wall":
          next = removeWall(project, sel.id);
          break;
        case "opening":
          next = removeOpening(project, sel.id);
          break;
        case "balcony":
          next = removeBalcony(project, sel.id);
          break;
        default:
          return;
      }
    } catch {
      return;
    }
    dispatch({ type: "replace-project", project: next });
    dispatch({ type: "select", selection: undefined });
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const sel = project.selection;
      if (!sel || (sel.kind !== "wall" && sel.kind !== "opening" && sel.kind !== "balcony")) return;
      event.preventDefault();
      handleDeleteSelection();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);
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

  const isPlanMode = project.mode === "2d";

  return (
    <main className={`app-shell mode-${project.mode}`}>
      <div className="app-canvas">
        {isPlanMode ? (
          <DrawingSurface2D
            project={project}
            onSelect={select}
            onProjectChange={(next) => dispatch({ type: "replace-project", project: next })}
            activeMaterialId={activeMaterialId}
          />
        ) : (
          <Preview3D project={project} />
        )}
      </div>

      <div className="brand-overlay" aria-label="HouseClaw">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">HouseClaw</span>
      </div>

      <div className="mode-tabs" aria-label="工作模式">
        {MODE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="mode-tab"
            aria-pressed={project.mode === tab.id}
            onClick={() => setMode(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="top-actions">
        <button className="action-button" type="button" onClick={handleExport}>
          导出 JSON
        </button>
        <label className="action-button file-button">
          导入 JSON
          <input aria-label="导入 JSON" type="file" accept="application/json" onChange={handleImport} />
        </label>
      </div>

      {isPlanMode ? (
        <>
          <ToolPalette activeTool={project.activeTool} onToolChange={setTool} />

          <div className="bottom-overlay">
            <StoreyHeightStrip
              storeys={project.storeys}
              selection={project.selection}
              onSelectStorey={(storeyId) => {
                setView(`plan-${storeyId}` as ViewId);
                select({ kind: "storey", id: storeyId });
              }}
            />
            <ViewTabs activeView={project.activeView} onViewChange={setView} />
          </div>

          <PropertyPanel
            project={project}
            onApplyWallMaterial={applyWallMaterial}
            onProjectChange={(next) => dispatch({ type: "replace-project", project: next })}
            onDeleteSelection={handleDeleteSelection}
            activeMaterialId={activeMaterialId}
            onActiveMaterialChange={setActiveMaterialId}
          />
        </>
      ) : null}

      {importError ? (
        <p className="import-error" role="alert">
          {importError}
        </p>
      ) : null}
    </main>
  );
}
