import { describe, expect, it } from "vitest";
import { assertValidProject } from "../../domain/v2/validate";
import { createV2SampleProject } from "../../domain/v2/sampleProject";

describe("createV2SampleProject", () => {
  it("returns a project that passes assertValidProject", () => {
    const project = createV2SampleProject();
    expect(() => assertValidProject(project)).not.toThrow();
  });

  it("has 3 storeys (1F, 2F, roof)", () => {
    const project = createV2SampleProject();
    expect(project.storeys).toHaveLength(3);
    expect(project.storeys.map((s) => s.id)).toEqual(["1f", "2f", "roof"]);
  });

  it("has 4 exterior walls forming a rectangle", () => {
    const project = createV2SampleProject();
    const exterior = project.walls.filter((w) => w.exterior);
    expect(exterior).toHaveLength(4);
  });

  it("has 2 slabs (one per inhabited storey)", () => {
    const project = createV2SampleProject();
    expect(project.slabs).toHaveLength(2);
  });

  it("has 1 roof", () => {
    const project = createV2SampleProject();
    expect(project.roofs).toHaveLength(1);
  });

  it("has at least one stair", () => {
    const project = createV2SampleProject();
    expect(project.stairs.length).toBeGreaterThanOrEqual(1);
  });

  it("has multiple openings (door + windows)", () => {
    const project = createV2SampleProject();
    expect(project.openings.length).toBeGreaterThanOrEqual(3);
    const types = new Set(project.openings.map((o) => o.type));
    expect(types.has("door")).toBe(true);
    expect(types.has("window")).toBe(true);
  });
});
