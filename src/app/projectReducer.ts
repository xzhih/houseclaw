import type { HouseProject } from "../domain/types";
import type { Wall, Opening, Balcony, Slab, Roof, Stair } from "../domain/types";
import {
  setStoreyLabel,
  setStoreyElevation,
  setStoreyHeight,
  addStorey,
  removeStorey,
  updateWall,
  removeWall,
  addWall,
  updateOpening,
  removeOpening,
  addOpening,
  updateBalcony,
  removeBalcony,
  addBalcony,
  updateSlab,
  removeSlab,
  addSlab,
  updateRoof,
  removeRoof,
  addRoof,
  updateStair,
  removeStair,
  addStair,
  type WallPatch,
  type OpeningPatch,
  type BalconyPatch,
  type SlabPatch,
  type RoofPatch,
  type StairPatch,
} from "../domain/mutations";

export type Mode = "2d" | "3d";
export type ViewId = string;
export type ToolId =
  | "select"
  | "wall"
  | "door"
  | "window"
  | "opening"
  | "balcony"
  | "stair"
  | "slab"
  | "roof"
  | "material";
export type Selection =
  | { kind: "wall"; wallId: string }
  | { kind: "opening"; openingId: string }
  | { kind: "balcony"; balconyId: string }
  | { kind: "slab"; slabId: string }
  | { kind: "roof"; roofId: string }
  | { kind: "stair"; stairId: string }
  | { kind: "storey"; storeyId: string }
  | undefined;

export type SessionState = {
  mode: Mode;
  activeView: ViewId;
  activeTool: ToolId;
  selection: Selection;
};

export type ProjectState = HouseProject & SessionState;

export type ProjectAction =
  | { type: "set-mode"; mode: Mode }
  | { type: "set-view"; viewId: ViewId }
  | { type: "set-tool"; toolId: ToolId }
  | { type: "select"; selection: Selection }
  | { type: "replace-project"; project: ProjectState }
  // Storey mutations
  | { type: "set-storey-label"; storeyId: string; label: string }
  | { type: "set-storey-elevation"; storeyId: string; elevation: number }
  | { type: "set-storey-height"; storeyId: string; height: number }
  | { type: "add-storey" }
  | { type: "remove-storey"; storeyId: string }
  // Wall mutations
  | { type: "add-wall"; wall: Wall }
  | { type: "update-wall"; wallId: string; patch: WallPatch }
  | { type: "remove-wall"; wallId: string }
  // Opening mutations
  | { type: "add-opening"; opening: Opening }
  | { type: "update-opening"; openingId: string; patch: OpeningPatch }
  | { type: "remove-opening"; openingId: string }
  // Balcony mutations
  | { type: "add-balcony"; balcony: Balcony }
  | { type: "update-balcony"; balconyId: string; patch: BalconyPatch }
  | { type: "remove-balcony"; balconyId: string }
  // Slab mutations
  | { type: "add-slab"; slab: Slab }
  | { type: "update-slab"; slabId: string; patch: SlabPatch }
  | { type: "remove-slab"; slabId: string }
  // Roof mutations
  | { type: "add-roof"; roof: Roof }
  | { type: "update-roof"; roofId: string; patch: RoofPatch }
  | { type: "remove-roof"; roofId: string }
  // Stair mutations
  | { type: "add-stair"; stair: Stair }
  | { type: "update-stair"; stairId: string; patch: StairPatch }
  | { type: "remove-stair"; stairId: string };

function mergeProject(state: ProjectState, updated: HouseProject): ProjectState {
  return {
    ...updated,
    mode: state.mode,
    activeView: state.activeView,
    activeTool: state.activeTool,
    selection: state.selection,
  };
}

export function projectReducer(
  state: ProjectState,
  action: ProjectAction,
): ProjectState {
  switch (action.type) {
    case "set-mode":
      return { ...state, mode: action.mode };
    case "set-view":
      return { ...state, activeView: action.viewId };
    case "set-tool":
      return { ...state, activeTool: action.toolId };
    case "select":
      return { ...state, selection: action.selection };
    case "replace-project":
      return action.project;

    // Storey mutations
    case "set-storey-label":
      return mergeProject(state, setStoreyLabel(state, action.storeyId, action.label));
    case "set-storey-elevation":
      return mergeProject(state, setStoreyElevation(state, action.storeyId, action.elevation));
    case "set-storey-height":
      return mergeProject(state, setStoreyHeight(state, action.storeyId, action.height));
    case "add-storey":
      return mergeProject(state, addStorey(state));
    case "remove-storey":
      return mergeProject(state, removeStorey(state, action.storeyId));

    // Wall mutations
    case "add-wall":
      return mergeProject(state, addWall(state, action.wall));
    case "update-wall":
      return mergeProject(state, updateWall(state, action.wallId, action.patch));
    case "remove-wall":
      return mergeProject(state, removeWall(state, action.wallId));

    // Opening mutations
    case "add-opening":
      return mergeProject(state, addOpening(state, action.opening));
    case "update-opening":
      return mergeProject(state, updateOpening(state, action.openingId, action.patch));
    case "remove-opening":
      return mergeProject(state, removeOpening(state, action.openingId));

    // Balcony mutations
    case "add-balcony":
      return mergeProject(state, addBalcony(state, action.balcony));
    case "update-balcony":
      return mergeProject(state, updateBalcony(state, action.balconyId, action.patch));
    case "remove-balcony":
      return mergeProject(state, removeBalcony(state, action.balconyId));

    // Slab mutations
    case "add-slab":
      return mergeProject(state, addSlab(state, action.slab));
    case "update-slab":
      return mergeProject(state, updateSlab(state, action.slabId, action.patch));
    case "remove-slab":
      return mergeProject(state, removeSlab(state, action.slabId));

    // Roof mutations
    case "add-roof":
      return mergeProject(state, addRoof(state, action.roof));
    case "update-roof":
      return mergeProject(state, updateRoof(state, action.roofId, action.patch));
    case "remove-roof":
      return mergeProject(state, removeRoof(state, action.roofId));

    // Stair mutations
    case "add-stair":
      return mergeProject(state, addStair(state, action.stair));
    case "update-stair":
      return mergeProject(state, updateStair(state, action.stairId, action.patch));
    case "remove-stair":
      return mergeProject(state, removeStair(state, action.stairId));
  }
}

export function withSessionDefaults(project: HouseProject): ProjectState {
  return {
    ...project,
    mode: "3d",
    activeView: "plan-1f",
    activeTool: "select",
    selection: undefined,
  };
}
