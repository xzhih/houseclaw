import { type ChangeEvent, useEffect, useReducer, useState } from "react";
import { exportProjectJson, importProjectJson } from "../app/persistence";
import { projectReducer } from "../app/projectReducer";
import { createBalconyDraft, createOpeningDraft } from "../domain/drafts";
import { wallLength } from "../domain/measurements";
import {
  addBalcony,
  addOpening,
  addWall,
  removeBalcony,
  removeOpening,
  removeWall,
} from "../domain/mutations";
import { createSampleProject } from "../domain/sampleProject";
import type { ObjectSelection } from "../domain/selection";
import type { HouseProject, Mode, OpeningType, ToolId, ViewId, Wall } from "../domain/types";
import { createWallDraft } from "../domain/walls";
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

const PLAN_STOREY_BY_VIEW: Partial<Record<ViewId, string>> = {
  "plan-1f": "1f",
  "plan-2f": "2f",
  "plan-3f": "3f",
};

const ELEVATION_VIEWS: ReadonlySet<ViewId> = new Set([
  "elevation-front",
  "elevation-back",
  "elevation-left",
  "elevation-right",
]);

const roundToMm = (value: number) => Math.round(value * 1000) / 1000;

function activeStoreyId(project: HouseProject): string | undefined {
  const planStorey = PLAN_STOREY_BY_VIEW[project.activeView];
  if (planStorey) return planStorey;
  if (project.selection?.kind === "storey") return project.selection.id;
  if (ELEVATION_VIEWS.has(project.activeView)) return project.storeys[0]?.id;
  return undefined;
}

function defaultWallEndpoints(project: HouseProject, storeyId: string): { start: { x: number; y: number }; end: { x: number; y: number } } {
  const wallsInStorey = project.walls.filter((wall) => wall.storeyId === storeyId);
  if (wallsInStorey.length === 0) {
    return { start: { x: -1.5, y: 0 }, end: { x: 1.5, y: 0 } };
  }
  const xs = wallsInStorey.flatMap((wall) => [wall.start.x, wall.end.x]);
  const ys = wallsInStorey.flatMap((wall) => [wall.start.y, wall.end.y]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const top = Math.max(...ys) + 1.5;
  return {
    start: { x: roundToMm(cx - 1.5), y: roundToMm(top) },
    end: { x: roundToMm(cx + 1.5), y: roundToMm(top) },
  };
}

function pickTargetWall(project: HouseProject, storeyId: string): Wall | undefined {
  if (project.selection?.kind === "wall") {
    const sel = project.walls.find((wall) => wall.id === project.selection!.id);
    if (sel && sel.storeyId === storeyId) return sel;
  }
  return project.walls.find((wall) => wall.storeyId === storeyId);
}

export function AppShell() {
  const [project, dispatch] = useReducer(projectReducer, undefined, createSampleProject);
  const [importError, setImportError] = useState<string | undefined>();
  const [addError, setAddError] = useState<string | undefined>();

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

  const handleAddComponent = (toolId: ToolId) => {
    setAddError(undefined);
    const storeyId = activeStoreyId(project);
    if (!storeyId) {
      setAddError("请先选择一个楼层视图后再添加组件。");
      return;
    }

    try {
      if (toolId === "wall") {
        const { start, end } = defaultWallEndpoints(project, storeyId);
        const draft = createWallDraft(project, storeyId, start, end);
        const next = addWall(project, draft);
        dispatch({ type: "replace-project", project: next });
        dispatch({ type: "select", selection: { kind: "wall", id: draft.id } });
        if (PLAN_STOREY_BY_VIEW[project.activeView] === undefined) {
          dispatch({ type: "set-view", viewId: `plan-${storeyId}` as ViewId });
        }
        return;
      }

      const wall = pickTargetWall(project, storeyId);
      if (!wall) {
        setAddError("当前楼层没有墙,先添加一面墙再放门窗/阳台。");
        return;
      }
      const center = wallLength(wall) / 2;

      if (toolId === "balcony") {
        const draft = createBalconyDraft(project, wall, center);
        const next = addBalcony(project, draft);
        dispatch({ type: "replace-project", project: next });
        dispatch({ type: "select", selection: { kind: "balcony", id: draft.id } });
        return;
      }

      const openingType: OpeningType = toolId === "door" ? "door" : toolId === "window" ? "window" : "void";
      const draft = createOpeningDraft(project, wall, openingType, center);
      const next = addOpening(project, draft);
      dispatch({ type: "replace-project", project: next });
      dispatch({ type: "select", selection: { kind: "opening", id: draft.id } });
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "无法添加该组件。");
    }
  };

  const handleToolButtonClick = (toolId: ToolId) => {
    if (toolId === "select") {
      setTool("select");
      setAddError(undefined);
      return;
    }
    handleAddComponent(toolId);
  };

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
          <ToolPalette activeTool={project.activeTool} onToolButtonClick={handleToolButtonClick} />

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
          />
        </>
      ) : null}

      {addError ? (
        <p className="add-error" role="alert">
          {addError}
        </p>
      ) : null}

      {importError ? (
        <p className="import-error" role="alert">
          {importError}
        </p>
      ) : null}
    </main>
  );
}
