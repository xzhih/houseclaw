import { useEffect } from "react";
import { withSessionDefaults, type ProjectActionV2, type ProjectStateV2, type SelectionV2 } from "../app/v2/projectReducer";
import { useUndoableProject } from "../app/v2/useUndoableProject";
import {
  loadProjectFromLocalStorage,
  saveProjectToLocalStorage,
} from "../app/v2/persistenceV2";
import { createV2SampleProject } from "../domain/v2/sampleProject";
import { Preview3D } from "./Preview3D";
import { DrawingSurface2D } from "./DrawingSurface2D";
import { ToolPalette } from "./ToolPalette";
import { ViewTabs } from "./ViewTabs";
import { ElevationSideTabs } from "./ElevationSideTabs";
import { PropertyPanel } from "./PropertyPanel";

function init(): ProjectStateV2 {
  // Prefer the user's last saved project from localStorage; fall back to the
  // sample on first run or if storage is empty / corrupted.
  const saved = loadProjectFromLocalStorage();
  return withSessionDefaults(saved ?? createV2SampleProject());
}

/** Convert the current selection to a remove-* action. Called when the user
 *  presses Delete/Backspace with something selected. Storey selections are
 *  intentionally NOT mapped — those have their own removal UI in StoreysEditor. */
function removeActionForSelection(sel: SelectionV2): ProjectActionV2 | undefined {
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

export function AppShell() {
  const { project, dispatch, undo, redo } = useUndoableProject(init);
  const isElevation = project.activeView.startsWith("elevation-");
  const is3D = project.mode === "3d";

  // Auto-save to localStorage on any project change. session-only fields
  // (mode/activeView/activeTool/selection) ride along but they're harmless
  // — the saved JSON simply has them, and init() resets them via
  // withSessionDefaults on next load.
  useEffect(() => {
    saveProjectToLocalStorage(project);
  }, [project]);

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
