import { describe, expect, it } from "vitest";
import { createValidProject } from "../../domain/fixtures";

describe("createValidProject", () => {
  it("returns a project with schemaVersion 2", () => {
    const project = createValidProject();
    expect(project.schemaVersion).toBe(2);
  });

  it("has at least one storey, wall, slab, roof, opening, material", () => {
    const project = createValidProject();
    expect(project.storeys.length).toBeGreaterThan(0);
    expect(project.walls.length).toBeGreaterThan(0);
    expect(project.slabs.length).toBeGreaterThan(0);
    expect(project.roofs.length).toBeGreaterThan(0);
    expect(project.openings.length).toBeGreaterThan(0);
    expect(project.materials.length).toBeGreaterThan(0);
  });

  it("walls reference existing storeys via anchors", () => {
    const project = createValidProject();
    const storeyIds = new Set(project.storeys.map((s) => s.id));
    for (const w of project.walls) {
      if (w.bottom.kind === "storey") expect(storeyIds.has(w.bottom.storeyId)).toBe(true);
      if (w.top.kind === "storey") expect(storeyIds.has(w.top.storeyId)).toBe(true);
    }
  });
});
