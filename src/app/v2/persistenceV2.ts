import type { HouseProject } from "../../domain/v2/types";

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
