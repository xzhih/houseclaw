import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exportProjectJson,
  importProjectJson,
  loadProjectFromLocalStorage,
  saveProjectToLocalStorage,
} from "../app/persistence";
import { addSkirt } from "../domain/mutations";
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
    const { balconies: _balconies, schemaVersion: _v, ...legacyProject } = project;
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

describe("skirts persistence", () => {
  it("round-trips skirts through export → import", () => {
    let project = createSampleProject();
    project = addSkirt(project, "wall-front-2f");
    const json = exportProjectJson(project);
    const restored = importProjectJson(json);
    expect(restored.skirts).toHaveLength(1);
    expect(restored.skirts[0].hostWallId).toBe("wall-front-2f");
  });

  it("defaults skirts to [] when missing in legacy projects", () => {
    const project = createSampleProject();
    const json = exportProjectJson(project);
    const parsed = JSON.parse(json);
    delete parsed.skirts;
    const restored = importProjectJson(JSON.stringify(parsed));
    expect(restored.skirts).toEqual([]);
  });

  it("drops skirts pointing at non-existent walls", () => {
    let project = createSampleProject();
    project = addSkirt(project, "wall-front-2f");
    const json = exportProjectJson(project);
    const parsed = JSON.parse(json);
    parsed.skirts[0].hostWallId = "wall-bogus";
    const restored = importProjectJson(JSON.stringify(parsed));
    expect(restored.skirts).toEqual([]);
  });
});

describe("roof persistence", () => {
  it("round-trips the roof field through JSON", () => {
    const project = createSampleProject();
    const reloaded = importProjectJson(exportProjectJson(project));
    expect(reloaded.roof).toEqual(project.roof);
  });

  it("drops the roof when pitch is out of range, but keeps loading the project", () => {
    const project = createSampleProject();
    const json = exportProjectJson({
      ...project,
      roof: { ...project.roof!, pitch: Math.PI }, // 180° — invalid
    });
    const reloaded = importProjectJson(json);
    expect(reloaded.roof).toBeUndefined();
    expect(reloaded.id).toBe(project.id);
  });
});

const V0_FIXTURE = {
  id: "p1",
  name: "v0 sample",
  unitSystem: "metric",
  mode: "2d",
  activeView: "plan-1f",
  activeTool: "select",
  defaultWallThickness: 0.2,
  defaultStoreyHeight: 3,
  storeys: [{ id: "1f", label: "1F", elevation: 0, height: 3, slabThickness: 0.2 }],
  materials: [{ id: "m-wall", name: "墙", color: "#fff", kind: "wall" }],
  walls: [],
  openings: [],
  // 缺 balconies / skirts / roof / schemaVersion
  selection: { kind: "wall", id: "abc" }, // transient
};

describe("schema migration", () => {
  it("migrates v0 (no schemaVersion) → v1: backfills arrays, drops transient", () => {
    const restored = importProjectJson(JSON.stringify(V0_FIXTURE));
    expect(restored.schemaVersion).toBe(1);
    expect(restored.balconies).toEqual([]);
    expect(restored.skirts).toEqual([]);
    expect(restored.roof).toBeUndefined();
    expect(restored.selection).toBeUndefined();
  });

  it("migrates v0 with invalid roof: drops roof silently", () => {
    const v0 = {
      ...V0_FIXTURE,
      roof: { pitch: 999, overhang: 99, materialId: "x", edges: {} },
    };
    const restored = importProjectJson(JSON.stringify(v0));
    expect(restored.roof).toBeUndefined();
  });

  it("rejects schemaVersion newer than supported", () => {
    const v999 = { ...V0_FIXTURE, schemaVersion: 999, balconies: [], skirts: [] };
    expect(() => importProjectJson(JSON.stringify(v999))).toThrow(/newer than supported/);
  });

  it("v1 round-trip preserves schemaVersion", () => {
    const project = createSampleProject();
    const json = exportProjectJson(project);
    expect(JSON.parse(json).schemaVersion).toBe(1);
    const restored = importProjectJson(json);
    expect(restored.schemaVersion).toBe(1);
  });

  it("export always writes schemaVersion: 1 even if memory copy differs", () => {
    const project = { ...createSampleProject(), schemaVersion: 0 as unknown as 1 };
    const json = exportProjectJson(project);
    expect(JSON.parse(json).schemaVersion).toBe(1);
  });
});
