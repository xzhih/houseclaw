import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportProjectJson,
  importProjectJson,
  loadProjectFromLocalStorage,
  saveProjectToLocalStorage,
} from "../app/persistence";
import { createSampleProject } from "../domain/sampleProject";

describe("project persistence", () => {
  beforeEach(() => {
    const entries = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return entries.size;
      },
      clear: () => entries.clear(),
      getItem: (key) => entries.get(key) ?? null,
      key: (index) => Array.from(entries.keys())[index] ?? null,
      removeItem: (key) => entries.delete(key),
      setItem: (key, value) => entries.set(key, value),
    };

    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips project JSON", () => {
    const project = createSampleProject();
    const json = exportProjectJson(project);
    const restored = importProjectJson(json);

    expect(restored.id).toBe(project.id);
    expect(restored.walls).toHaveLength(project.walls.length);
    expect(restored.openings[0].id).toBe("window-front-1f");
  });

  it("rejects invalid top-level enum values", () => {
    const json = exportProjectJson({ ...createSampleProject(), mode: "bad" as never });

    expect(() => importProjectJson(json)).toThrow(/^Invalid project JSON:/);
  });

  it("rejects null and missing project shapes", () => {
    expect(() => importProjectJson("null")).toThrow(/^Invalid project JSON:/);
    expect(() => importProjectJson("{}")).toThrow(/^Invalid project JSON:/);
  });

  it("saves and loads project JSON from localStorage", () => {
    const project = createSampleProject();

    saveProjectToLocalStorage(project, "test.project");

    expect(loadProjectFromLocalStorage("test.project")?.id).toBe(project.id);
  });

  it("returns undefined when localStorage has no saved project", () => {
    expect(loadProjectFromLocalStorage("missing.project")).toBeUndefined();
  });
});
