import type { HouseProject } from "../../domain/v2/types";
import { createV2SampleProject } from "../../domain/v2/sampleProject";
import {
  exportProjectJson,
  importProjectJson,
} from "./persistenceV2";

const CATALOG_KEY = "houseclaw.v2.catalog";
const PROJECT_PREFIX = "houseclaw.v2.project.";
/** Legacy single-slot key from before multi-project support landed. We only
 *  read it during migration, then delete it. */
const LEGACY_SINGLE_SLOT_KEY = "houseclaw.v2.project";

export type WorkspaceEntry = {
  id: string;
  name: string;
};

export type WorkspaceCatalog = {
  activeId: string;
  projects: WorkspaceEntry[];
};

export type WorkspaceSnapshot = {
  catalog: WorkspaceCatalog;
  project: HouseProject;
};

const projectKey = (id: string) => `${PROJECT_PREFIX}${id}`;

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota exceeded / private mode — silent.
  }
}
function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function generateProjectId(): string {
  return `proj-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function nextProjectName(existing: readonly string[]): string {
  const base = "未命名项目";
  if (!existing.includes(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const cand = `${base} ${i}`;
    if (!existing.includes(cand)) return cand;
  }
  return `${base} ${Date.now().toString(36)}`;
}

export function loadCatalog(): WorkspaceCatalog | undefined {
  const json = safeRead(CATALOG_KEY);
  if (!json) return undefined;
  try {
    const raw = JSON.parse(json);
    if (!raw || typeof raw !== "object") return undefined;
    if (typeof raw.activeId !== "string") return undefined;
    if (!Array.isArray(raw.projects)) return undefined;
    const projects: WorkspaceEntry[] = [];
    for (const p of raw.projects) {
      if (p && typeof p.id === "string" && typeof p.name === "string") {
        projects.push({ id: p.id, name: p.name });
      }
    }
    if (projects.length === 0) return undefined;
    if (!projects.some((p) => p.id === raw.activeId)) return undefined;
    return { activeId: raw.activeId, projects };
  } catch {
    return undefined;
  }
}

export function saveCatalog(catalog: WorkspaceCatalog): void {
  safeWrite(CATALOG_KEY, JSON.stringify(catalog));
}

export function loadProjectById(id: string): HouseProject | undefined {
  const json = safeRead(projectKey(id));
  if (!json) return undefined;
  try {
    return importProjectJson(json);
  } catch {
    return undefined;
  }
}

export function saveProjectById(id: string, project: HouseProject): void {
  safeWrite(projectKey(id), exportProjectJson(project));
}

export function deleteProjectStorage(id: string): void {
  safeRemove(projectKey(id));
}

/** Read + delete the legacy `houseclaw.v2.project` single-slot key, returning
 *  the project if it was present and parseable. The key was used briefly
 *  before multi-project support landed; once migrated into a catalog entry
 *  it's no longer needed and we remove it to keep localStorage tidy. */
function consumeLegacySingleSlot(): HouseProject | undefined {
  const json = safeRead(LEGACY_SINGLE_SLOT_KEY);
  if (!json) return undefined;
  let migrated: HouseProject | undefined;
  try {
    migrated = importProjectJson(json);
  } catch {
    // Unrecoverable; drop it.
  }
  safeRemove(LEGACY_SINGLE_SLOT_KEY);
  return migrated;
}

/** Initialize the workspace on app boot. Returns the catalog + the project to
 *  load. Falls back to a fresh sample project if no catalog exists or the
 *  active project is corrupted. Migrates legacy single-slot data on first
 *  run after the multi-project upgrade. */
export function initializeWorkspace(): WorkspaceSnapshot {
  const existing = loadCatalog();
  if (existing) {
    // Catalog exists — discard any stray legacy single-slot data
    // (the user has already used multi-project, so the legacy slot is moot).
    safeRemove(LEGACY_SINGLE_SLOT_KEY);
    const active = loadProjectById(existing.activeId);
    if (active) {
      return { catalog: existing, project: active };
    }
    // Active slot corrupted — try any other project.
    for (const entry of existing.projects) {
      const p = loadProjectById(entry.id);
      if (p) {
        return {
          catalog: { ...existing, activeId: entry.id },
          project: p,
        };
      }
    }
    // All slots corrupted — drop catalog and start fresh.
  }
  // No catalog yet. If the user has data from the legacy single-slot era,
  // migrate it; otherwise seed with the sample project.
  const project = consumeLegacySingleSlot() ?? createV2SampleProject();
  const catalog: WorkspaceCatalog = {
    activeId: project.id,
    projects: [{ id: project.id, name: project.name }],
  };
  saveCatalog(catalog);
  saveProjectById(project.id, project);
  return { catalog, project };
}

/** Add a new project to the catalog and switch to it. Returns the new project
 *  and updated catalog. */
export function addNewProject(
  catalog: WorkspaceCatalog,
  draft: HouseProject,
): { catalog: WorkspaceCatalog; project: HouseProject } {
  const entry: WorkspaceEntry = { id: draft.id, name: draft.name };
  const next: WorkspaceCatalog = {
    activeId: draft.id,
    projects: [...catalog.projects.filter((p) => p.id !== draft.id), entry],
  };
  saveCatalog(next);
  saveProjectById(draft.id, draft);
  return { catalog: next, project: draft };
}

export function switchToProject(
  catalog: WorkspaceCatalog,
  id: string,
): { catalog: WorkspaceCatalog; project: HouseProject } | undefined {
  const project = loadProjectById(id);
  if (!project) return undefined;
  if (!catalog.projects.some((p) => p.id === id)) return undefined;
  const next = { ...catalog, activeId: id };
  saveCatalog(next);
  return { catalog: next, project };
}

export function removeProject(
  catalog: WorkspaceCatalog,
  id: string,
): { catalog: WorkspaceCatalog; project: HouseProject } | undefined {
  if (catalog.projects.length <= 1) return undefined; // never delete the last project
  deleteProjectStorage(id);
  const remaining = catalog.projects.filter((p) => p.id !== id);
  const newActiveId =
    catalog.activeId === id ? remaining[0].id : catalog.activeId;
  const project = loadProjectById(newActiveId);
  if (!project) return undefined;
  const next: WorkspaceCatalog = { activeId: newActiveId, projects: remaining };
  saveCatalog(next);
  return { catalog: next, project };
}

/** Rename a project entry in the catalog (the project's own .name is updated
 *  separately by the reducer; this just keeps the catalog in sync). */
export function renameProjectEntry(
  catalog: WorkspaceCatalog,
  id: string,
  name: string,
): WorkspaceCatalog {
  const next: WorkspaceCatalog = {
    ...catalog,
    projects: catalog.projects.map((p) => (p.id === id ? { ...p, name } : p)),
  };
  saveCatalog(next);
  return next;
}
