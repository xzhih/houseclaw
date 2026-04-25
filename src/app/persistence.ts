import { assertValidProject } from "../domain/constraints";
import type { HouseProject } from "../domain/types";

export function exportProjectJson(project: HouseProject): string {
  return JSON.stringify(project, null, 2);
}

export function importProjectJson(json: string): HouseProject {
  const parsed = JSON.parse(json) as HouseProject;
  return assertValidProject(parsed);
}

export function saveProjectToLocalStorage(project: HouseProject, key = "houseclaw.project"): void {
  localStorage.setItem(key, exportProjectJson(project));
}

export function loadProjectFromLocalStorage(key = "houseclaw.project"): HouseProject | undefined {
  const json = localStorage.getItem(key);
  return json ? importProjectJson(json) : undefined;
}
