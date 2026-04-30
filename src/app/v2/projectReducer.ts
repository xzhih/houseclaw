import type { HouseProject } from "../../domain/v2/types";

export type ModeV2 = "2d" | "3d";
export type ViewIdV2 = string;
export type ToolIdV2 = string;
export type SelectionV2 =
  | { kind: "wall"; wallId: string }
  | { kind: "opening"; openingId: string }
  | { kind: "balcony"; balconyId: string }
  | { kind: "slab"; slabId: string }
  | { kind: "roof"; roofId: string }
  | { kind: "stair"; stairId: string }
  | { kind: "storey"; storeyId: string }
  | undefined;

export type SessionStateV2 = {
  mode: ModeV2;
  activeView: ViewIdV2;
  activeTool: ToolIdV2;
  selection: SelectionV2;
};

export type ProjectStateV2 = HouseProject & SessionStateV2;

export type ProjectActionV2 =
  | { type: "set-mode"; mode: ModeV2 }
  | { type: "set-view"; viewId: ViewIdV2 }
  | { type: "set-tool"; toolId: ToolIdV2 }
  | { type: "select"; selection: SelectionV2 }
  | { type: "replace-project"; project: ProjectStateV2 };

export function projectReducerV2(
  state: ProjectStateV2,
  action: ProjectActionV2,
): ProjectStateV2 {
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
  }
}

export function withSessionDefaults(project: HouseProject): ProjectStateV2 {
  return {
    ...project,
    mode: "3d",
    activeView: "plan-1f",
    activeTool: "select",
    selection: undefined,
  };
}
