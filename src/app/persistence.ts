import { assertValidProject } from "../domain/constraints";
import type { HouseProject, ToolId, ViewId } from "../domain/types";

const VALID_TOOL_IDS = ["select", "wall", "door", "window", "opening", "material"] as const satisfies readonly ToolId[];
const VALID_VIEW_IDS = [
  "plan-1f",
  "plan-2f",
  "plan-3f",
  "elevation-front",
  "elevation-back",
  "elevation-left",
  "elevation-right",
  "roof",
] as const satisfies readonly ViewId[];

type ProjectJsonObject = Record<string, unknown>;

function invalidProjectJson(message: string): never {
  throw new Error(`Invalid project JSON: ${message}`);
}

function assertProjectJsonObject(value: unknown): asserts value is ProjectJsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidProjectJson("expected a project object.");
  }
}

function assertArrayField(value: ProjectJsonObject, field: string): void {
  if (!Array.isArray(value[field])) {
    invalidProjectJson(`${field} must be an array.`);
  }
}

function assertStringField(value: ProjectJsonObject, field: string): void {
  if (typeof value[field] !== "string") {
    invalidProjectJson(`${field} must be a string.`);
  }
}

function assertNumberField(value: ProjectJsonObject, field: string): void {
  if (typeof value[field] !== "number") {
    invalidProjectJson(`${field} must be a number.`);
  }
}

function assertImportedProjectShape(value: unknown): asserts value is HouseProject {
  assertProjectJsonObject(value);

  for (const field of ["storeys", "materials", "walls", "openings"]) {
    assertArrayField(value, field);
  }

  for (const field of ["id", "name", "unitSystem", "mode", "activeView", "activeTool"]) {
    assertStringField(value, field);
  }

  for (const field of ["defaultWallThickness", "defaultStoreyHeight"]) {
    assertNumberField(value, field);
  }

  if (value.unitSystem !== "metric") {
    invalidProjectJson("unitSystem must be metric.");
  }

  if (value.mode !== "2d" && value.mode !== "3d") {
    invalidProjectJson("mode must be 2d or 3d.");
  }

  if (!VALID_TOOL_IDS.includes(value.activeTool as ToolId)) {
    invalidProjectJson("activeTool is not supported.");
  }

  if (!VALID_VIEW_IDS.includes(value.activeView as ViewId)) {
    invalidProjectJson("activeView is not supported.");
  }
}

export function exportProjectJson(project: HouseProject): string {
  return JSON.stringify(project, null, 2);
}

export function importProjectJson(json: string): HouseProject {
  const parsed = JSON.parse(json) as unknown;
  assertImportedProjectShape(parsed);
  return assertValidProject(parsed);
}

export function saveProjectToLocalStorage(project: HouseProject, key = "houseclaw.project"): void {
  localStorage.setItem(key, exportProjectJson(project));
}

export function loadProjectFromLocalStorage(key = "houseclaw.project"): HouseProject | undefined {
  const json = localStorage.getItem(key);
  return json ? importProjectJson(json) : undefined;
}
