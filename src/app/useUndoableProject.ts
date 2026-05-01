import { useCallback, useReducer } from "react";
import {
  projectReducer,
  type ProjectAction,
  type ProjectState,
} from "./projectReducer";

// Actions that affect view/mode/tool/selection — UI navigation, not project
// edits. Excluded from history so Cmd+Z doesn't undo "I clicked a tab".
const NON_HISTORIC_ACTIONS = new Set<ProjectAction["type"]>([
  "set-mode",
  "set-view",
  "set-tool",
  "select",
]);

const HISTORY_LIMIT = 200;

type UndoableState = {
  past: ProjectState[];
  current: ProjectState;
  future: ProjectState[];
};

type UndoableAction =
  | { type: "do"; action: ProjectAction }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; project: ProjectState };

function undoableReducer(state: UndoableState, action: UndoableAction): UndoableState {
  switch (action.type) {
    case "reset":
      return { past: [], current: action.project, future: [] };
    case "do": {
      const next = projectReducer(state.current, action.action);
      if (next === state.current) return state;
      // UI-only actions (view/mode/tool/selection): forward state but DON'T
      // touch the history stack — and don't clear future, so a Cmd+Z still
      // works after navigation.
      if (NON_HISTORIC_ACTIONS.has(action.action.type)) {
        return { ...state, current: next };
      }
      const nextPast = [...state.past, state.current].slice(-HISTORY_LIMIT);
      return { past: nextPast, current: next, future: [] };
    }
    case "undo": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      // Preserve current view/mode/tool/selection on undo — only restore
      // the project portion. Otherwise undo would teleport you between tabs.
      const restored: ProjectState = {
        ...previous,
        mode: state.current.mode,
        activeView: state.current.activeView,
        activeTool: state.current.activeTool,
        selection: state.current.selection,
      };
      return { past: newPast, current: restored, future: [state.current, ...state.future] };
    }
    case "redo": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const restored: ProjectState = {
        ...next,
        mode: state.current.mode,
        activeView: state.current.activeView,
        activeTool: state.current.activeTool,
        selection: state.current.selection,
      };
      return {
        past: [...state.past, state.current],
        current: restored,
        future: state.future.slice(1),
      };
    }
  }
}

export type UndoableProject = {
  project: ProjectState;
  dispatch: (action: ProjectAction) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Replace the entire project state without polluting undo history.
   *  Use when switching to a different project — the old project's history
   *  shouldn't apply to the new one. */
  reset: (project: ProjectState) => void;
};

export function useUndoableProject(init: () => ProjectState): UndoableProject {
  const [state, raw] = useReducer(undoableReducer, undefined, () => ({
    past: [],
    current: init(),
    future: [],
  }));

  const dispatch = useCallback(
    (action: ProjectAction) => raw({ type: "do", action }),
    [],
  );
  const undo = useCallback(() => raw({ type: "undo" }), []);
  const redo = useCallback(() => raw({ type: "redo" }), []);
  const reset = useCallback(
    (project: ProjectState) => raw({ type: "reset", project }),
    [],
  );

  return {
    project: state.current,
    dispatch,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
