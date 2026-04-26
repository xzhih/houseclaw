import {
  applyWallMaterial,
  updateBalcony,
  updateOpening,
  updateStorey,
  updateWall,
  type BalconyPatch,
  type OpeningPatch,
  type StoreyPatch,
  type WallPatch,
} from "../domain/mutations";
import type { ObjectSelection } from "../domain/selection";
import type { HouseProject, Mode, ToolId, ViewId } from "../domain/types";

export type ProjectAction =
  | { type: "set-mode"; mode: Mode }
  | { type: "set-view"; viewId: ViewId }
  | { type: "set-tool"; toolId: ToolId }
  | { type: "select"; selection: ObjectSelection | undefined }
  | { type: "update-opening"; openingId: string; patch: OpeningPatch }
  | { type: "update-wall"; wallId: string; patch: WallPatch }
  | { type: "update-balcony"; balconyId: string; patch: BalconyPatch }
  | { type: "update-storey"; storeyId: string; patch: StoreyPatch }
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
    case "apply-wall-material":
      return applyWallMaterial(project, action.wallId, action.materialId);
    case "replace-project":
      return action.project;
  }
}
