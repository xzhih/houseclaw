import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportProjectJson,
  importProjectJson,
  loadProjectFromLocalStorage,
  saveProjectToLocalStorage,
} from "../app/persistence";
import { createSampleProject } from "../domain/sampleProject";

function expectInvalidProjectJson(value: unknown): void {
  expect(() => importProjectJson(JSON.stringify(value))).toThrow(/^Invalid project JSON:/);
}

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
    expect(restored.balconies).toHaveLength(project.balconies.length);
    expect(restored.openings[0].id).toBe("window-front-1f");
  });

  it("imports older project JSON without balcony data", () => {
    const project = createSampleProject();
    const { balconies: _balconies, ...legacyProject } = project;
    const restored = importProjectJson(JSON.stringify(legacyProject));

    expect(restored.balconies).toEqual([]);
  });

  it("rejects invalid top-level enum values", () => {
    const json = exportProjectJson({ ...createSampleProject(), mode: "bad" as never });

    expect(() => importProjectJson(json)).toThrow(/^Invalid project JSON:/);
  });

  it("rejects null and missing project shapes", () => {
    expect(() => importProjectJson("null")).toThrow(/^Invalid project JSON:/);
    expect(() => importProjectJson("{}")).toThrow(/^Invalid project JSON:/);
  });

  it("ignores legacy selectedObjectId fields on import", () => {
    const json = JSON.stringify({ ...createSampleProject(), selectedObjectId: "legacy" });
    const restored = importProjectJson(json);

    expect("selectedObjectId" in restored).toBe(false);
    expect(restored.selection).toBeUndefined();
  });

  it("strips runtime selection from exported JSON", () => {
    const project = { ...createSampleProject(), selection: { kind: "wall" as const, id: "wall-front-1f" } };
    const json = exportProjectJson(project);

    expect(JSON.parse(json).selection).toBeUndefined();
  });

  it("rejects invalid nested wall items", () => {
    expectInvalidProjectJson({ ...createSampleProject(), walls: [null] });
  });

  it("rejects invalid nested balcony items", () => {
    expectInvalidProjectJson({ ...createSampleProject(), balconies: [null] });
  });

  it("rejects invalid material kinds", () => {
    const project = createSampleProject();

    expectInvalidProjectJson({
      ...project,
      materials: project.materials.map((material, index) =>
        index === 0 ? { ...material, kind: "paint" } : material,
      ),
    });
  });

  it("rejects invalid opening types", () => {
    const project = createSampleProject();

    expectInvalidProjectJson({ ...project, openings: [{ ...project.openings[0], type: "skylight" }] });
  });

  it("rejects non-positive top-level dimensions", () => {
    expectInvalidProjectJson({ ...createSampleProject(), defaultWallThickness: -0.1 });
  });

  it("rejects non-positive storey heights", () => {
    const project = createSampleProject();

    expectInvalidProjectJson({
      ...project,
      storeys: project.storeys.map((storey, index) => (index === 0 ? { ...storey, height: -1 } : storey)),
    });
  });

  it("rejects invalid wall exterior values", () => {
    const project = createSampleProject();

    expectInvalidProjectJson({ ...project, walls: [{ ...project.walls[0], exterior: "yes" }] });
  });

  it("wraps domain invariant errors from imported JSON", () => {
    const project = createSampleProject();
    const json = exportProjectJson({
      ...project,
      openings: [{ ...project.openings[0], wallId: "missing-wall" }],
    });

    expect(() => importProjectJson(json)).toThrow(
      /Invalid project JSON:[\s\S]*Opening window-front-1f references missing wall missing-wall\./,
    );
  });

  it("wraps balcony invariant errors from imported JSON", () => {
    const project = createSampleProject();
    const json = exportProjectJson({
      ...project,
      balconies: [{ ...project.balconies[0], attachedWallId: "missing-wall" }],
    });

    expect(() => importProjectJson(json)).toThrow(
      /Invalid project JSON:[\s\S]*Balcony balcony-front-2f references missing wall missing-wall\./,
    );
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
