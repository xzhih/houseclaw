import {
  addStair,
  applyWallMaterial,
  removeStair,
  updateBalcony,
  updateOpening,
  updateStorey,
  updateWall,
  updateStair,
  type BalconyPatch,
  type OpeningPatch,
  type StairPatch,
  type StoreyPatch,
  type WallPatch,
} from "../domain/mutations";
import type { ObjectSelection } from "../domain/selection";
import type { HouseProject, Mode, Stair, ToolId, ViewId } from "../domain/types";

export type ProjectAction =
  | { type: "set-mode"; mode: Mode }
  | { type: "set-view"; viewId: ViewId }
  | { type: "set-tool"; toolId: ToolId }
  | { type: "select"; selection: ObjectSelection | undefined }
  | { type: "update-opening"; openingId: string; patch: OpeningPatch }
  | { type: "update-wall"; wallId: string; patch: WallPatch }
  | { type: "update-balcony"; balconyId: string; patch: BalconyPatch }
  | { type: "update-storey"; storeyId: string; patch: StoreyPatch }
  | { type: "add-stair"; storeyId: string; stair: Stair }
  | { type: "update-stair"; storeyId: string; patch: StairPatch }
  | { type: "remove-stair"; storeyId: string }
  | { type: "apply-wall-material"; wallId: string; materialId: string }
  | { type: "replace-project"; project: HouseProject };

export function projectReducer(project: HouseProject, action: ProjectAction): HouseProject {
  switch (action.type) {
    case "set-mode":
      return { ...project, mode: action.mode };
    case "set-view":
      return { ...project, activeView: action.viewId };
    case "set-tool":
      return { ...project, activeTool: action.toolId };
    case "select":
      return { ...project, selection: action.selection };
    case "update-opening":
      return updateOpening(project, action.openingId, action.patch);
    case "update-wall":
      return updateWall(project, action.wallId, action.patch);
    case "update-balcony":
      return updateBalcony(project, action.balconyId, action.patch);
    case "update-storey":
      return updateStorey(project, action.storeyId, action.patch);
    case "add-stair":
      return addStair(project, action.storeyId, action.stair);
    case "update-stair":
      return updateStair(project, action.storeyId, action.patch);
    case "remove-stair":
      return removeStair(project, action.storeyId);
    case "apply-wall-material":
      return applyWallMaterial(project, action.wallId, action.materialId);
    case "replace-project":
      return action.project;
  }
}
