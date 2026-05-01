import { useCallback, useEffect, useState } from "react";
import { withSessionDefaults, type ProjectAction, type ProjectState, type Selection } from "../app/projectReducer";
import { useUndoableProject } from "../app/useUndoableProject";
import {
  initializeWorkspace,
  saveCatalog,
  saveProjectById,
  switchToProject as wsSwitch,
  addNewProject as wsAdd,
  removeProject as wsRemove,
  type WorkspaceCatalog,
} from "../app/workspace";
import type { HouseProject } from "../domain/types";
import { Preview3D } from "./Preview3D";
import { DrawingSurface2D } from "./DrawingSurface2D";
import { ToolPalette } from "./ToolPalette";
import { ViewTabs } from "./ViewTabs";
import { ElevationSideTabs } from "./ElevationSideTabs";
import { PropertyPanel } from "./PropertyPanel";

// Boot the workspace once at module init. Subsequent operations go through
// the workspace API (switch / add / remove) and update both localStorage
// and the AppShell's `catalog` state.
const BOOT_SNAPSHOT = initializeWorkspace();
function init(): ProjectState {
  return withSessionDefaults(BOOT_SNAPSHOT.project);
}

/** Convert the current selection to a remove-* action. Called when the user
 *  presses Delete/Backspace with something selected. Storey selections are
 *  intentionally NOT mapped — those have their own removal UI in StoreysEditor. */
function removeActionForSelection(sel: Selection): ProjectAction | undefined {
  if (!sel) return undefined;
  switch (sel.kind) {
    case "wall":
      return { type: "remove-wall", wallId: sel.wallId };
    case "opening":
      return { type: "remove-opening", openingId: sel.openingId };
    case "balcony":
      return { type: "remove-balcony", balconyId: sel.balconyId };
    case "slab":
      return { type: "remove-slab", slabId: sel.slabId };
    case "roof":
      return { type: "remove-roof", roofId: sel.roofId };
    case "stair":
      return { type: "remove-stair", stairId: sel.stairId };
    default:
      return undefined;
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

const STOREY_DATUMS_KEY = "houseclaw.ui.showStoreyDatums";

function loadShowStoreyDatums(): boolean {
  try {
    const raw = localStorage.getItem(STOREY_DATUMS_KEY);
    if (raw === null) return true;
    return raw === "true";
  } catch {
    return true;
  }
}

export function AppShell() {
  const { project, dispatch, undo, redo, reset } = useUndoableProject(init);
  const [catalog, setCatalog] = useState<WorkspaceCatalog>(BOOT_SNAPSHOT.catalog);
  const [showStoreyDatums, setShowStoreyDatumsState] = useState<boolean>(loadShowStoreyDatums);
  const setShowStoreyDatums = useCallback((v: boolean) => {
    setShowStoreyDatumsState(v);
    try {
      localStorage.setItem(STOREY_DATUMS_KEY, String(v));
    } catch {
      // localStorage may be unavailable (private mode); the toggle still works in-session.
    }
  }, []);
  const isElevation = project.activeView.startsWith("elevation-");
  const is3D = project.mode === "3d";

  // Auto-save the active project to its workspace slot on every change.
  // The catalog itself rarely changes (only on add/remove/rename) and is
  // saved by the workspace API directly.
  useEffect(() => {
    saveProjectById(catalog.activeId, project);
  }, [project, catalog.activeId]);

  // Keep the catalog entry's `name` in sync with the project's actual name
  // — user can rename via the project-section button which dispatches
  // replace-project. Without this sync the catalog list shows stale names.
  useEffect(() => {
    const entry = catalog.projects.find((p) => p.id === catalog.activeId);
    if (entry && entry.name !== project.name) {
      const next: WorkspaceCatalog = {
        ...catalog,
        projects: catalog.projects.map((p) =>
          p.id === catalog.activeId ? { ...p, name: project.name } : p,
        ),
      };
      saveCatalog(next);
      setCatalog(next);
    }
  }, [project.name, catalog]);

  const switchProject = useCallback(
    (id: string) => {
      if (id === catalog.activeId) return;
      // Persist current edits before switching — auto-save runs on next render
      // but we want the just-typed value to land before navigating away.
      saveProjectById(catalog.activeId, project);
      const result = wsSwitch(catalog, id);
      if (!result) return;
      setCatalog(result.catalog);
      reset(withSessionDefaults(result.project));
    },
    [catalog, project, reset],
  );

  const addProject = useCallback(
    (draft: HouseProject) => {
      saveProjectById(catalog.activeId, project);
      const result = wsAdd(catalog, draft);
      setCatalog(result.catalog);
      reset(withSessionDefaults(result.project));
    },
    [catalog, project, reset],
  );

  const removeProjectAction = useCallback(
    (id: string) => {
      const result = wsRemove(catalog, id);
      if (!result) return; // last project — refuse
      setCatalog(result.catalog);
      // If removing the active one, load the new active.
      if (id === catalog.activeId) {
        reset(withSessionDefaults(result.project));
      }
    },
    [catalog, reset],
  );

  // Global keyboard: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z (or Cmd+Y) = redo,
  // Delete/Backspace = remove current selection. All gated on no editable
  // input being focused (so typing in NumberField doesn't trigger).
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (!meta && (event.key === "Delete" || event.key === "Backspace")) {
        const action = removeActionForSelection(project.selection);
        if (action) {
          event.preventDefault();
          dispatch(action);
          dispatch({ type: "select", selection: undefined });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [project.selection, dispatch, undo, redo]);

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
        // "3d" is a mode sentinel emitted by the 3D tab; non-3D tabs imply 2D mode,
        // so we dispatch set-mode + set-view together. Returning to 3D preserves activeView.
        onChange={(viewId) => {
          if (viewId === "3d") {
            dispatch({ type: "set-mode", mode: "3d" });
          } else {
            dispatch({ type: "set-mode", mode: "2d" });
            dispatch({ type: "set-view", viewId });
          }
        }}
      />
      {isElevation ? (
        <ElevationSideTabs
          activeView={project.activeView}
          onChange={(viewId) => dispatch({ type: "set-view", viewId })}
        />
      ) : null}

      <main className="chrome-main">
        {is3D ? null : (
          <ToolPalette
            project={project}
            activeTool={project.activeTool}
            onChange={(toolId) => dispatch({ type: "set-tool", toolId })}
            dispatch={dispatch}
          />
        )}
        <div className="chrome-main-canvas-wrap" aria-label="canvas">
          {is3D ? (
            <Preview3D project={project} showStoreyDatums={showStoreyDatums} />
          ) : (
            <DrawingSurface2D
              project={project}
              onSelect={(selection) => dispatch({ type: "select", selection })}
              dispatch={dispatch}
              showStoreyDatums={showStoreyDatums}
            />
          )}
        </div>
        <div className="chrome-main-panel">
          <PropertyPanel
            project={project}
            dispatch={dispatch}
            catalog={catalog}
            onSwitchProject={switchProject}
            onAddProject={addProject}
            onRemoveProject={removeProjectAction}
            showStoreyDatums={showStoreyDatums}
            onSetShowStoreyDatums={setShowStoreyDatums}
          />
        </div>
      </main>
    </div>
  );
}
