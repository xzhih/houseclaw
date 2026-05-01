import type { HouseProject } from "../../domain/v2/types";

const STORAGE_KEY = "houseclaw.v2.project";
const SCHEMA_VERSION = 2;

export function exportProjectJson(project: HouseProject): string {
  return JSON.stringify(project, null, 2);
}

export function importProjectJson(json: string): HouseProject {
  const raw = JSON.parse(json);
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid project JSON: expected object");
  }
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Unsupported schema version ${raw.schemaVersion} (expected ${SCHEMA_VERSION})`,
    );
  }
  const requiredArrays = [
    "storeys",
    "walls",
    "slabs",
    "roofs",
    "openings",
    "balconies",
    "stairs",
    "materials",
  ] as const;
  for (const key of requiredArrays) {
    if (!Array.isArray(raw[key])) {
      throw new Error(`Invalid project JSON: missing array '${key}'`);
    }
  }
  if (typeof raw.id !== "string" || typeof raw.name !== "string") {
    throw new Error("Invalid project JSON: missing id/name");
  }
  return raw as HouseProject;
}

export function saveProjectToLocalStorage(project: HouseProject): void {
  try {
    localStorage.setItem(STORAGE_KEY, exportProjectJson(project));
  } catch {
    // Quota exceeded / private mode — silent. Not critical for a personal tool.
  }
}

export function loadProjectFromLocalStorage(): HouseProject | undefined {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return undefined;
    return importProjectJson(json);
  } catch {
    // Corrupted localStorage — let caller fall back to sample.
    return undefined;
  }
}

export function clearProjectFromLocalStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Trigger a browser download of the JSON. Returns a filename hint. */
export function downloadProjectJson(project: HouseProject): string {
  const json = exportProjectJson(project);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const safe = project.name.replace(/[^\w一-龥-]+/g, "_") || "project";
  const filename = `${safe}-${new Date().toISOString().slice(0, 10)}.json`;
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return filename;
}
