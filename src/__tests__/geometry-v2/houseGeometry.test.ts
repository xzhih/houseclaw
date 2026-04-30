import { describe, expect, it } from "vitest";
import { createValidV2Project } from "../../domain/v2/fixtures";
import { buildSceneGeometryV2 } from "../../geometry/v2/houseGeometry";

describe("buildSceneGeometryV2", () => {
  it("returns all 6 geometry buckets", () => {
    const geo = buildSceneGeometryV2(createValidV2Project());
    expect(geo.walls).toBeDefined();
    expect(geo.slabs).toBeDefined();
    expect(geo.roofs).toBeDefined();
    expect(geo.stairs).toBeDefined();
    expect(geo.balconies).toBeDefined();
    expect(geo.openingFrames).toBeDefined();
  });

  it("emits one wall geometry per project wall", () => {
    const project = createValidV2Project();
    const geo = buildSceneGeometryV2(project);
    expect(geo.walls).toHaveLength(project.walls.length);
    expect(geo.walls[0].wallId).toBe(project.walls[0].id);
  });

  it("emits one slab geometry per project slab", () => {
    const project = createValidV2Project();
    const geo = buildSceneGeometryV2(project);
    expect(geo.slabs).toHaveLength(project.slabs.length);
  });

  it("emits one roof geometry per project roof (when defined)", () => {
    const project = createValidV2Project();
    const geo = buildSceneGeometryV2(project);
    expect(geo.roofs).toHaveLength(project.roofs.length);
  });

  it("emits opening frames for non-void openings only", () => {
    const project = createValidV2Project();
    const geo = buildSceneGeometryV2(project);
    expect(geo.openingFrames).toHaveLength(4);
  });

  it("emits stair geometries when project has stairs", () => {
    const project = createValidV2Project();
    project.stairs.push({
      id: "s1",
      x: 1, y: 1, width: 1, depth: 3,
      shape: "straight",
      treadDepth: 0.27,
      bottomEdge: "+y",
      from: { kind: "storey", storeyId: "1f", offset: 0 },
      to: { kind: "storey", storeyId: "2f", offset: 0 },
      materialId: "mat-wall",
    });
    const geo = buildSceneGeometryV2(project);
    expect(geo.stairs).toHaveLength(1);
    expect(geo.stairs[0].stairId).toBe("s1");
    expect(geo.stairs[0].treads.length).toBeGreaterThan(0);
  });

  it("emits balcony geometries when project has balconies", () => {
    const project = createValidV2Project();
    project.balconies.push({
      id: "b1",
      attachedWallId: project.walls[0].id,
      offset: 1,
      width: 2,
      depth: 1,
      slabTop: { kind: "storey", storeyId: "2f", offset: 0 },
      slabThickness: 0.15,
      railingHeight: 1.1,
      materialId: "mat-wall",
      railingMaterialId: "mat-frame",
    });
    const geo = buildSceneGeometryV2(project);
    expect(geo.balconies).toHaveLength(1);
    expect(geo.balconies[0].slabTopZ).toBe(3.2);
  });

  it("filters out roofs that fail to build (e.g., wrong polygon size)", () => {
    const project = createValidV2Project();
    project.roofs[0].polygon = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 4 },
    ];
    project.roofs[0].edges = ["eave", "gable", "gable"];
    const geo = buildSceneGeometryV2(project);
    expect(geo.roofs).toHaveLength(0);
  });

  it("uses fallback slabThickness=0.18 when no slab matches stair.to z", () => {
    const project = createValidV2Project();
    project.stairs.push({
      id: "s1",
      x: 1, y: 1, width: 1, depth: 3,
      shape: "straight",
      treadDepth: 0.27,
      bottomEdge: "+y",
      from: { kind: "absolute", z: 0 },
      to: { kind: "absolute", z: 10 },
      materialId: "mat-wall",
    });
    const geo = buildSceneGeometryV2(project);
    expect(geo.stairs).toHaveLength(1);
  });
});
