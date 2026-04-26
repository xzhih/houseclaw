import { type ChangeEvent, useEffect, useReducer, useState } from "react";
import { exportProjectJson, importProjectJson } from "../app/persistence";
import { projectReducer, type ProjectAction } from "../app/projectReducer";
import {
  createBalconyDraft,
  createOpeningDraft,
  findBalconyInsertionCenter,
  findOpeningInsertionCenter,
} from "../domain/drafts";
import {
  addBalcony,
  addOpening,
  addWall,
  removeBalcony,
  removeOpening,
  removeStorey,
  removeWall,
} from "../domain/mutations";
import { createSampleProject } from "../domain/sampleProject";
import type { ObjectSelection } from "../domain/selection";
import type { HouseProject, Mode, OpeningType, ToolId, ViewId, Wall } from "../domain/types";
import { createWallDraft } from "../domain/walls";
import { downloadTextFile } from "../export/exporters";
import { projectElevationView } from "../projection/elevation";
import type { ElevationSide } from "../projection/types";
import { DrawingSurface2D } from "./DrawingSurface2D";
import { Preview3D } from "./Preview3D";
import { PropertyPanel } from "./PropertyPanel";
import { StoreyHeightStrip } from "./StoreyHeightStrip";
import { ElevationSideTabs } from "./ElevationSideTabs";
import { ToolPalette } from "./ToolPalette";
import { ViewTabs, primaryFromView, type PrimaryView } from "./ViewTabs";

const MODE_TABS: { id: Mode; label: string }[] = [
  { id: "2d", label: "2D" },
  { id: "3d", label: "3D" },
];

const PLAN_STOREY_BY_VIEW: Partial<Record<ViewId, string>> = {
  "plan-1f": "1f",
  "plan-2f": "2f",
  "plan-3f": "3f",
};

const ELEVATION_SIDE_BY_VIEW: Partial<Record<ViewId, ElevationSide>> = {
  "elevation-front": "front",
  "elevation-back": "back",
  "elevation-left": "left",
  "elevation-right": "right",
};

const UI_ONLY_ACTIONS: ReadonlySet<ProjectAction["type"]> = new Set([
  "set-mode",
  "set-view",
  "set-tool",
  "select",
]);

const HISTORY_LIMIT = 50;

type HistoryState = {
  past: HouseProject[];
  present: HouseProject;
  future: HouseProject[];
};

type HistoryAction = ProjectAction | { type: "undo" } | { type: "redo" };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "undo") {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future].slice(0, HISTORY_LIMIT),
    };
  }
  if (action.type === "redo") {
    if (state.future.length === 0) return state;
    const [next, ...rest] = state.future;
    return {
      past: [...state.past, state.present].slice(-HISTORY_LIMIT),
      present: next,
      future: rest,
    };
  }
  const nextPresent = projectReducer(state.present, action);
  if (nextPresent === state.present) return state;
  if (UI_ONLY_ACTIONS.has(action.type)) {
    return { ...state, present: nextPresent };
  }
  return {
    past: [...state.past, state.present].slice(-HISTORY_LIMIT),
    present: nextPresent,
    future: [],
  };
}

const roundToMm = (value: number) => Math.round(value * 1000) / 1000;

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

function pickTargetWall(
  project: HouseProject,
  storeyId: string,
  elevationSide?: ElevationSide,
): Wall | undefined {
  if (project.selection?.kind === "wall") {
    const sel = project.walls.find((wall) => wall.id === project.selection!.id);
    if (sel && sel.storeyId === storeyId) return sel;
  }
  if (elevationSide) {
    const projection = projectElevationView(project, elevationSide);
    const band = projection.wallBands.find((entry) => entry.storeyId === storeyId);
    if (band) {
      const wall = project.walls.find((candidate) => candidate.id === band.wallId);
      if (wall) return wall;
    }
  }
  return project.walls.find((wall) => wall.storeyId === storeyId);
}

export function AppShell() {
  const [history, dispatchHistory] = useReducer(
    historyReducer,
    undefined,
    (): HistoryState => ({ past: [], present: createSampleProject(), future: [] }),
  );
  const project = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const [importError, setImportError] = useState<string | undefined>();
  const [addError, setAddError] = useState<string | undefined>();
  const [lastPlanStorey, setLastPlanStorey] = useState<string>(
    () => PLAN_STOREY_BY_VIEW[project.activeView] ?? project.storeys[0]?.id ?? "1f",
  );
  const [lastElevationSide, setLastElevationSide] = useState<ElevationSide>(
    () => ELEVATION_SIDE_BY_VIEW[project.activeView] ?? "front",
  );

  useEffect(() => {
    const planStorey = PLAN_STOREY_BY_VIEW[project.activeView];
    if (planStorey) setLastPlanStorey(planStorey);
    const side = ELEVATION_SIDE_BY_VIEW[project.activeView];
    if (side) setLastElevationSide(side);
  }, [project.activeView]);

  const dispatch = (action: ProjectAction) => dispatchHistory(action);
  const undo = () => dispatchHistory({ type: "undo" });
  const redo = () => dispatchHistory({ type: "redo" });

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
        case "storey":
          if (project.storeys.length <= 1) return;
          next = removeStorey(project, sel.id);
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
      const target = event.target;
      const editingField =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

      const isUndo =
        (event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z";
      const isRedo =
        (event.metaKey || event.ctrlKey) &&
        ((event.shiftKey && event.key.toLowerCase() === "z") || event.key.toLowerCase() === "y");

      if (isRedo) {
        if (editingField) return;
        event.preventDefault();
        redo();
        return;
      }
      if (isUndo) {
        if (editingField) return;
        event.preventDefault();
        undo();
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (editingField) return;
      const sel = project.selection;
      if (!sel) return;
      const isStorey = sel.kind === "storey" && project.storeys.length > 1;
      const isOther = sel.kind === "wall" || sel.kind === "opening" || sel.kind === "balcony";
      if (!isStorey && !isOther) return;
      event.preventDefault();
      handleDeleteSelection();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, canUndo, canRedo]);

  const handleAddComponent = (toolId: ToolId, storeyId: string) => {
    setAddError(undefined);
    if (!project.storeys.some((storey) => storey.id === storeyId)) {
      setAddError("找不到目标楼层。");
      return;
    }
    const elevationSide = ELEVATION_SIDE_BY_VIEW[project.activeView];

    try {
      if (toolId === "wall") {
        const { start, end } = defaultWallEndpoints(project, storeyId);
        const draft = createWallDraft(project, storeyId, start, end);
        const next = addWall(project, draft);
        dispatch({ type: "replace-project", project: next });
        dispatch({ type: "select", selection: { kind: "wall", id: draft.id } });
        if (PLAN_STOREY_BY_VIEW[project.activeView] !== storeyId) {
          dispatch({ type: "set-view", viewId: `plan-${storeyId}` as ViewId });
        }
        return;
      }

      const wall = pickTargetWall(project, storeyId, elevationSide);
      if (!wall) {
        setAddError("当前楼层没有可附着的墙,先添加一面墙。");
        return;
      }

      if (toolId === "balcony") {
        const center = findBalconyInsertionCenter(wall, project.balconies);
        if (center === undefined) {
          setAddError("当前墙上没有空位放阳台,先调整或删除其他阳台。");
          return;
        }
        const draft = createBalconyDraft(project, wall, center);
        const next = addBalcony(project, draft);
        dispatch({ type: "replace-project", project: next });
        dispatch({ type: "select", selection: { kind: "balcony", id: draft.id } });
        return;
      }

      const openingType: OpeningType = toolId === "door" ? "door" : toolId === "window" ? "window" : "void";
      const center = findOpeningInsertionCenter(wall, openingType, project.openings);
      if (center === undefined) {
        setAddError("当前墙上没有空位放该开孔,先调整或删除其他开孔。");
        return;
      }
      const draft = createOpeningDraft(project, wall, openingType, center);
      const next = addOpening(project, draft);
      dispatch({ type: "replace-project", project: next });
      dispatch({ type: "select", selection: { kind: "opening", id: draft.id } });
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "无法添加该组件。");
    }
  };

  const handleSelectMode = () => {
    setTool("select");
    setAddError(undefined);
  };

  const handlePrimaryChange = (primary: PrimaryView) => {
    if (primary === "plan") {
      setView(`plan-${lastPlanStorey}` as ViewId);
    } else {
      setView(`elevation-${lastElevationSide}` as ViewId);
    }
  };

  const handleSideChange = (side: ElevationSide) => {
    setLastElevationSide(side);
    setView(`elevation-${side}` as ViewId);
  };

  const handleStoreyClick = (storeyId: string) => {
    setLastPlanStorey(storeyId);
    if (PLAN_STOREY_BY_VIEW[project.activeView]) {
      setView(`plan-${storeyId}` as ViewId);
    }
    select({ kind: "storey", id: storeyId });
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
        <button
          className="action-button icon-action"
          type="button"
          onClick={undo}
          disabled={!canUndo}
          aria-label="撤销"
          title="撤销 (Ctrl/Cmd+Z)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H9" />
          </svg>
        </button>
        <button
          className="action-button icon-action"
          type="button"
          onClick={redo}
          disabled={!canRedo}
          aria-label="重做"
          title="重做 (Ctrl/Cmd+Shift+Z)"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 14l5-5-5-5" />
            <path d="M20 9H9a5 5 0 0 0-5 5v0a5 5 0 0 0 5 5h6" />
          </svg>
        </button>
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
          <ToolPalette
            activeTool={project.activeTool}
            storeys={project.storeys.map((storey) => ({ id: storey.id, label: storey.label }))}
            onSelectMode={handleSelectMode}
            onAddComponent={handleAddComponent}
            allowWallAdd={PLAN_STOREY_BY_VIEW[project.activeView] !== undefined}
          />

          <div className="bottom-overlay">
            <ViewTabs activeView={project.activeView} onPrimaryChange={handlePrimaryChange} />
            {primaryFromView(project.activeView) === "plan" ? (
              <StoreyHeightStrip
                storeys={project.storeys}
                activeView={project.activeView}
                onSelectStorey={handleStoreyClick}
              />
            ) : (
              <ElevationSideTabs activeView={project.activeView} onSideChange={handleSideChange} />
            )}
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
