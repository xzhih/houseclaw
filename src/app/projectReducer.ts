import { applyWallMaterial, updateOpening } from "../domain/mutations";
import type { HouseProject, Mode, Opening, ToolId, ViewId } from "../domain/types";

export type ProjectAction =
  | { type: "set-mode"; mode: Mode }
  | { type: "set-view"; viewId: ViewId }
  | { type: "set-tool"; toolId: ToolId }
  | { type: "select-object"; objectId: string | undefined }
  | { type: "update-opening"; openingId: string; patch: Partial<Omit<Opening, "id" | "wallId">> }
  | { type: "apply-wall-material"; wallId: string; materialId: string }
  | { type: "replace-project"; project: HouseProject };

export function projectReducer(project: HouseProject, action: ProjectAction): HouseProject {
  if (action.type === "set-mode") {
    return { ...project, mode: action.mode };
  }

  if (action.type === "set-view") {
    return { ...project, activeView: action.viewId };
  }

  if (action.type === "set-tool") {
    return { ...project, activeTool: action.toolId };
  }

  if (action.type === "select-object") {
    return { ...project, selectedObjectId: action.objectId };
  }

  if (action.type === "update-opening") {
    return updateOpening(project, action.openingId, action.patch);
  }

  if (action.type === "apply-wall-material") {
    return applyWallMaterial(project, action.wallId, action.materialId);
  }

  return action.project;
}
