import { type ChangeEvent, useEffect, useReducer, useState } from "react";
import {
  exportProjectJson,
  importProjectJson,
} from "../app/persistence";
import { projectReducer, type ProjectAction } from "../app/projectReducer";
import {
  deleteProjectStorage,
  generateProjectId,
  initializeWorkspace,
  loadProjectById,
  nextProjectName,
  saveCatalog,
  saveProjectById,
  type WorkspaceCatalog,
} from "../app/workspace";
import {
  createBalconyDraft,
  createOpeningDraft,
  findBalconyInsertionCenter,
  findOpeningInsertionCenter,
} from "../domain/drafts";
import {
  addBalcony,
  addOpening,
  addSkirt,
  addStair,
  addStorey,
  addWall,
  duplicateStorey,
} from "../domain/mutations";
import { deleteSelection, isSelectionDeletable } from "./selectionRegistry";
import { createSampleProject } from "../domain/sampleProject";
import type { ObjectSelection } from "../domain/selection";
import type { HouseProject, Mode, OpeningType, Stair, ToolId, ViewId, Wall } from "../domain/types";
import { planStoreyIdFromView } from "../domain/views";
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
import { BrandMenu } from "./BrandMenu";

const MODE_TABS: { id: Mode; label: string }[] = [
  { id: "2d", label: "2D" },
  { id: "3d", label: "3D" },
];

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

type HistoryAction =
  | ProjectAction
  | { type: "undo" }
  | { type: "redo" }
  | { type: "load-project"; project: HouseProject };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "load-project") {
    return { past: [], present: action.project, future: [] };
  }
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
    const wallSel = project.selection;
    const sel = project.walls.find((wall) => wall.id === wallSel.id);
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

function pickStairMaterialId(project: HouseProject): string {
  // 楼梯默认使用外墙涂料（与外墙一致），回退到第一个材质
  const wall = project.materials.find((m) => m.kind === "wall");
  return wall?.id ?? project.materials[0]?.id ?? "";
}

type BootState = { catalog: WorkspaceCatalog; project: HouseProject };

function bootWorkspace(): BootState {
  try {
    const snapshot = initializeWorkspace();
    return { catalog: snapshot.catalog, project: snapshot.project };
  } catch {
    // Worst case — present sample without persistence.
    const seed = createSampleProject();
    return { catalog: { activeId: seed.id, ids: [seed.id] }, project: seed };
  }
}

export function AppShell() {
  const [boot] = useState(bootWorkspace);
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(boot.catalog);
  const [projectNames, setProjectNames] = useState<Record<string, string>>(() => ({
    [boot.project.id]: boot.project.name,
  }));

  const [history, dispatchHistory] = useReducer(
    historyReducer,
    undefined,
    (): HistoryState => ({ past: [], present: boot.project, future: [] }),
  );
  const project = history.present;

  // Keep the displayed catalog name for the active project in sync with edits.
  useEffect(() => {
    setProjectNames((prev) =>
      prev[project.id] === project.name ? prev : { ...prev, [project.id]: project.name },
    );
  }, [project.id, project.name]);

  // Hydrate names for non-active projects in the catalog (one-time per id).
  useEffect(() => {
    setProjectNames((prev) => {
      let next = prev;
      for (const id of catalog.ids) {
        if (next[id] !== undefined) continue;
        const loaded = loadProjectById(id);
        if (loaded) {
          if (next === prev) next = { ...prev };
          next[id] = loaded.name;
        }
      }
      return next;
    });
  }, [catalog.ids]);

  useEffect(() => {
    saveProjectById(catalog.activeId, project);
  }, [project, catalog.activeId]);

  useEffect(() => {
    saveCatalog(catalog);
  }, [catalog]);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const [importError, setImportError] = useState<string | undefined>();
  const [addError, setAddError] = useState<string | undefined>();
  const [lastPlanStorey, setLastPlanStorey] = useState<string>(
    () =>
      planStoreyIdFromView(project.activeView, project.storeys) ??
      project.storeys[0]?.id ??
      "1f",
  );
  const [lastElevationSide, setLastElevationSide] = useState<ElevationSide>(
    () => ELEVATION_SIDE_BY_VIEW[project.activeView] ?? "front",
  );

  useEffect(() => {
    const planStorey = planStoreyIdFromView(project.activeView, project.storeys);
    if (planStorey) setLastPlanStorey(planStorey);
    const side = ELEVATION_SIDE_BY_VIEW[project.activeView];
    if (side) setLastElevationSide(side);
  }, [project.activeView, project.storeys]);

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
    if (!sel || !isSelectionDeletable(sel, project)) return;
    let next: HouseProject;
    try {
      next = deleteSelection(project, sel);
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
      if (!isSelectionDeletable(project.selection, project)) return;
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
        if (planStoreyIdFromView(project.activeView, project.storeys) !== storeyId) {
          dispatch({ type: "set-view", viewId: `plan-${storeyId}` as ViewId });
        }
        return;
      }

      if (toolId === "stair") {
        // 数据模型里楼梯挂在"出发的那一层"（下层），通往 N+1。用户在 plan-N
        // 视图上点"添加楼梯"=在 N 这层建一段上去 N+1——owner 就是 N，
        // 顶层没有 N+1，禁止添加。
        const sortedStoreys = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
        const targetStoreyId = storeyId;
        const idx = sortedStoreys.findIndex((s) => s.id === targetStoreyId);
        const above = idx >= 0 ? sortedStoreys[idx + 1] : undefined;
        if (!above) {
          setAddError("当前已是最顶层,没有可向上的楼梯。");
          return;
        }
        const draftStair: Stair = {
          x: 1.0,
          y: 3.0,
          width: 1.2,
          depth: 2.5,
          shape: "straight",
          treadDepth: 0.27,
          bottomEdge: "+y",
          materialId: pickStairMaterialId(project),
        };
        const next = addStair(project, targetStoreyId, draftStair);
        dispatch({ type: "replace-project", project: next });
        dispatch({ type: "select", selection: { kind: "stair", id: targetStoreyId } });
        return;
      }

      if (toolId === "skirt") {
        const wall = pickTargetWall(project, storeyId, elevationSide);
        if (!wall) {
          setAddError("当前楼层没有可附着的外墙,先添加一面墙。");
          return;
        }
        const next = addSkirt(project, wall.id);
        const newSkirt = next.skirts[next.skirts.length - 1];
        dispatch({ type: "replace-project", project: next });
        dispatch({ type: "select", selection: { kind: "skirt", id: newSkirt.id } });
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
    } else if (primary === "elevation") {
      if (project.selection?.kind === "storey") select(undefined);
      setView(`elevation-${lastElevationSide}` as ViewId);
    } else {
      setView("roof");
    }
  };

  const handleSideChange = (side: ElevationSide) => {
    setLastElevationSide(side);
    setView(`elevation-${side}` as ViewId);
  };

  const handleStoreyClick = (storeyId: string) => {
    setLastPlanStorey(storeyId);
    if (planStoreyIdFromView(project.activeView, project.storeys)) {
      setView(`plan-${storeyId}` as ViewId);
    }
    select({ kind: "storey", id: storeyId });
  };

  const handleAddStorey = () => {
    let next: HouseProject;
    try {
      next = addStorey(project);
    } catch {
      return;
    }
    const newStorey = next.storeys[next.storeys.length - 1];
    dispatch({ type: "replace-project", project: next });
    setLastPlanStorey(newStorey.id);
    if (project.mode === "2d" && planStoreyIdFromView(project.activeView, project.storeys)) {
      setView(`plan-${newStorey.id}` as ViewId);
    }
    select({ kind: "storey", id: newStorey.id });
  };

  const handleDuplicateStorey = (storeyId: string) => {
    let next: HouseProject;
    try {
      next = duplicateStorey(project, storeyId);
    } catch {
      return;
    }
    const newStorey = next.storeys[next.storeys.length - 1];
    dispatch({ type: "replace-project", project: next });
    setLastPlanStorey(newStorey.id);
    if (project.mode === "2d" && planStoreyIdFromView(project.activeView, project.storeys)) {
      setView(`plan-${newStorey.id}` as ViewId);
    }
    select({ kind: "storey", id: newStorey.id });
  };

  const handleExport = () => {
    setImportError(undefined);
    downloadTextFile("houseclaw-project.json", exportProjectJson(project));
  };

  const switchToProject = (id: string, loaded: HouseProject) => {
    saveProjectById(catalog.activeId, project);
    saveProjectById(id, loaded);
    dispatchHistory({ type: "load-project", project: loaded });
    setCatalog((prev) => (prev.activeId === id ? prev : { ...prev, activeId: id }));
    setProjectNames((prev) => ({ ...prev, [id]: loaded.name }));
  };

  const insertProject = (incoming: HouseProject) => {
    const existingIds = new Set(catalog.ids);
    let id = incoming.id;
    while (!id || existingIds.has(id)) id = generateProjectId();
    const namesInUse = catalog.ids
      .map((existing) => projectNames[existing])
      .filter((value): value is string => typeof value === "string");
    const name =
      incoming.name && !namesInUse.includes(incoming.name)
        ? incoming.name
        : nextProjectName(namesInUse);
    const project: HouseProject = { ...incoming, id, name };
    saveProjectById(catalog.activeId, history.present);
    saveProjectById(id, project);
    dispatchHistory({ type: "load-project", project });
    setCatalog((prev) => ({ activeId: id, ids: [...prev.ids, id] }));
    setProjectNames((prev) => ({ ...prev, [id]: project.name }));
  };

  const handleSwitchProject = (id: string) => {
    if (id === catalog.activeId) return;
    const loaded = loadProjectById(id);
    if (!loaded) {
      setImportError("无法加载该项目，可能已损坏。");
      return;
    }
    setImportError(undefined);
    switchToProject(id, loaded);
  };

  const handleNewProject = () => {
    const namesInUse = catalog.ids
      .map((existing) => projectNames[existing])
      .filter((value): value is string => typeof value === "string");
    const seed = createSampleProject();
    insertProject({ ...seed, name: nextProjectName(namesInUse) });
    setImportError(undefined);
  };

  const handleDeleteProject = (id: string) => {
    if (catalog.ids.length <= 1) return;
    deleteProjectStorage(id);
    setProjectNames((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setCatalog((prev) => {
      const ids = prev.ids.filter((existing) => existing !== id);
      if (id !== prev.activeId) {
        return { activeId: prev.activeId, ids };
      }
      const fallbackId = ids[0];
      const fallback = loadProjectById(fallbackId);
      if (fallback) {
        dispatchHistory({ type: "load-project", project: fallback });
      }
      return { activeId: fallbackId, ids };
    });
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
        insertProject(importProjectJson(json));
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

      <div className="left-actions">
        <BrandMenu
          projects={catalog.ids.map((id) => ({ id, name: projectNames[id] ?? "未命名项目" }))}
          activeId={catalog.activeId}
          onSwitch={handleSwitchProject}
          onNew={handleNewProject}
          onDelete={handleDeleteProject}
          onExport={handleExport}
          onImport={handleImport}
        />
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

      {isPlanMode ? (
        <>
          <ToolPalette
            activeTool={project.activeTool}
            storeys={project.storeys.map((storey) => ({ id: storey.id, label: storey.label }))}
            defaultStoreyId={planStoreyIdFromView(project.activeView, project.storeys)}
            onSelectMode={handleSelectMode}
            onAddComponent={handleAddComponent}
            allowWallAdd={planStoreyIdFromView(project.activeView, project.storeys) !== undefined}
          />

          <div className="bottom-overlay">
            <ViewTabs activeView={project.activeView} onPrimaryChange={handlePrimaryChange} />
            {primaryFromView(project.activeView) === "plan" ? (
              <StoreyHeightStrip
                storeys={project.storeys}
                activeView={project.activeView}
                onSelectStorey={handleStoreyClick}
                onAddStorey={handleAddStorey}
              />
            ) : primaryFromView(project.activeView) === "elevation" ? (
              <ElevationSideTabs activeView={project.activeView} onSideChange={handleSideChange} />
            ) : null}
          </div>

          <PropertyPanel
            project={project}
            onApplyWallMaterial={applyWallMaterial}
            onProjectChange={(next) => dispatch({ type: "replace-project", project: next })}
            onDeleteSelection={handleDeleteSelection}
            onDuplicateStorey={handleDuplicateStorey}
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
