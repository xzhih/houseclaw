import { describe, expect, it } from "vitest";
import { createValidProject } from "../../domain/fixtures";
import { projectRoofView } from "../../projection/roofView";

describe("projectRoofView", () => {
  it("returns viewId 'roof'", () => {
    const view = projectRoofView(createValidProject());
    expect(view.viewId).toBe("roof");
  });

  it("emits one polygon per project roof", () => {
    const project = createValidProject();
    const view = projectRoofView(project);
    expect(view.polygons).toHaveLength(project.roofs.length);
    expect(view.polygons[0].roofId).toBe("roof-main");
  });

  it("polygon vertices match roof.polygon (CCW, 4 verts for v1)", () => {
    const project = createValidProject();
    const view = projectRoofView(project);
    expect(view.polygons[0].vertices).toHaveLength(4);
  });

  it("emits one edge stroke per polygon edge with correct kind", () => {
    const project = createValidProject();
    const view = projectRoofView(project);
    expect(view.polygons[0].edges).toHaveLength(4);
    const kinds = view.polygons[0].edges.map((e) => e.kind);
    expect(kinds).toEqual(project.roofs[0].edges);
  });

  it("treats hip edges as their own kind (preserves user intent)", () => {
    const project = createValidProject();
    project.roofs[0].edges = ["eave", "hip", "gable", "hip"];
    const view = projectRoofView(project);
    const kinds = view.polygons[0].edges.map((e) => e.kind);
    expect(kinds).toContain("hip");
  });

  it("emits no ridge lines for shed (1 eave + 3 gables)", () => {
    const project = createValidProject();
    project.roofs[0].edges = ["eave", "gable", "gable", "gable"];
    const view = projectRoofView(project);
    expect(view.polygons[0].ridgeLines).toHaveLength(0);
  });

  it("emits at least one ridge line for 2-opp gable", () => {
    const project = createValidProject();
    project.roofs[0].edges = ["eave", "gable", "eave", "gable"];
    const view = projectRoofView(project);
    expect(view.polygons[0].ridgeLines.length).toBeGreaterThan(0);
  });

  it("returns empty polygons array when project has no roofs", () => {
    const project = createValidProject();
    project.roofs = [];
    const view = projectRoofView(project);
    expect(view.polygons).toHaveLength(0);
  });
});
