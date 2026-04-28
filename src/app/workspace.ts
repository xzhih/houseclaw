import { createSampleProject } from "../domain/sampleProject";
import type { HouseProject } from "../domain/types";
import { exportProjectJson, importProjectJson } from "./persistence";

const CATALOG_KEY = "houseclaw.workspace";
const LEGACY_PROJECT_KEY = "houseclaw.project";
const PROJECT_PREFIX = "houseclaw.project.";

export type WorkspaceCatalog = {
  activeId: string;
  ids: string[];
};

export type WorkspaceSnapshot = {
  catalog: WorkspaceCatalog;
  project: HouseProject;
};

function projectKey(id: string): string {
  return `${PROJECT_PREFIX}${id}`;
}

function safeGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* private mode / quota — silently skip */
  }
}

function safeRemove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

function tryReadProject(id: string): HouseProject | undefined {
  const raw = safeGet(projectKey(id));
  if (!raw) return undefined;
  try {
    return importProjectJson(raw);
  } catch {
    return undefined;
  }
}

function tryReadCatalog(): WorkspaceCatalog | undefined {
  const raw = safeGet(CATALOG_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceCatalog>;
    if (
      parsed &&
      typeof parsed.activeId === "string" &&
      Array.isArray(parsed.ids) &&
      parsed.ids.every((id) => typeof id === "string") &&
      parsed.ids.includes(parsed.activeId)
    ) {
      return { activeId: parsed.activeId, ids: parsed.ids };
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

export function generateProjectId(): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `proj-${Date.now().toString(36)}-${random}`;
}

export function nextProjectName(existing: readonly string[]): string {
  const used = new Set(existing.map((name) => name.trim()));
  let n = 1;
  while (used.has(`新项目 ${n}`)) n += 1;
  return `新项目 ${n}`;
}

export function saveCatalog(catalog: WorkspaceCatalog): void {
  safeSet(CATALOG_KEY, JSON.stringify(catalog));
}

export function saveProjectById(id: string, project: HouseProject): void {
  safeSet(projectKey(id), exportProjectJson(project));
}

export function loadProjectById(id: string): HouseProject | undefined {
  return tryReadProject(id);
}

export function deleteProjectStorage(id: string): void {
  safeRemove(projectKey(id));
}

/**
 * Load workspace state, migrating from the legacy single-key layout if needed
 * and seeding a fresh sample project if no usable storage exists.
 */
export function initializeWorkspace(): WorkspaceSnapshot {
  const catalog = tryReadCatalog();
  if (catalog) {
    const active = tryReadProject(catalog.activeId);
    if (active) {
      return { catalog, project: active };
    }
    // Catalog points at a missing/corrupt project — find any survivor.
    for (const id of catalog.ids) {
      const candidate = tryReadProject(id);
      if (candidate) {
        const fixed = { ...catalog, activeId: id };
        saveCatalog(fixed);
        return { catalog: fixed, project: candidate };
      }
    }
    // No survivors — fall through to seed.
  }

  // Migrate legacy single-project key.
  const legacy = safeGet(LEGACY_PROJECT_KEY);
  if (legacy) {
    try {
      const migrated = importProjectJson(legacy);
      const id = migrated.id || generateProjectId();
      const fresh: WorkspaceCatalog = { activeId: id, ids: [id] };
      saveProjectById(id, migrated);
      saveCatalog(fresh);
      safeRemove(LEGACY_PROJECT_KEY);
      return { catalog: fresh, project: migrated };
    } catch {
      /* legacy unparseable — fall through to seed */
    }
  }

  const seed = createSampleProject();
  const seedId = seed.id || generateProjectId();
  const seedCatalog: WorkspaceCatalog = { activeId: seedId, ids: [seedId] };
  saveProjectById(seedId, seed);
  saveCatalog(seedCatalog);
  return { catalog: seedCatalog, project: seed };
}
