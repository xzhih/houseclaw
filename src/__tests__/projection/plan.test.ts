import { describe, expect, it } from "vitest";
import type { HouseProject, Wall } from "../../domain/types";
import { createValidProject } from "../../domain/fixtures";
import { PLAN_CUT_HEIGHT, projectPlan } from "../../projection/plan";

describe("projectPlan", () => {
  it("returns viewId, storeyId, cutZ", () => {
    const project = createValidProject();
    const view = projectPlan(project, "1f");
    expect(view.viewId).toBe("plan-1f");
    expect(view.storeyId).toBe("1f");
    expect(view.cutZ).toBeCloseTo(1.2);
  });

  it("includes walls whose [bottomZ, topZ] interval contains cutZ", () => {
    const project = createValidProject();
    const view = projectPlan(project, "1f");
    expect(view.wallSegments).toHaveLength(4);
  });

  it("excludes walls whose vertical extent does not include cutZ", () => {
    const project = createValidProject();
    project.walls[0].bottom = { kind: "absolute", z: 2 };
    project.walls[0].top = { kind: "absolute", z: 2.5 };
    const view = projectPlan(project, "1f");
    expect(view.wallSegments).toHaveLength(3);
    expect(view.wallSegments.find((w) => w.wallId === project.walls[0].id)).toBeUndefined();
  });

  it("includes a slab as 'floor' role when its top resolves to storey elevation", () => {
    const project = createValidProject();
    const view = projectPlan(project, "1f");
    expect(view.slabOutlines).toHaveLength(1);
    expect(view.slabOutlines[0].role).toBe("floor");
    expect(view.slabOutlines[0].outline).toHaveLength(4);
  });

  it("propagates slab holes into the projection", () => {
    const project = createValidProject();
    project.slabs[0].holes = [
      [
        { x: 1, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 1 },
      ],
    ];
    const view = projectPlan(project, "1f");
    expect(view.slabOutlines[0].holes).toHaveLength(1);
  });

  it("includes openings whose parent wall is in the cut", () => {
    const project = createValidProject();
    const view = projectPlan(project, "1f");
    expect(view.openings).toHaveLength(1);
    expect(view.openings[0].openingId).toBe("opening-front-window");
  });

  it("excludes openings whose parent wall is filtered out", () => {
    const project = createValidProject();
    const target = project.walls.find((w) => w.id === "w-front")!;
    target.bottom = { kind: "absolute", z: 2 };
    target.top = { kind: "absolute", z: 2.5 };
    const view = projectPlan(project, "1f");
    expect(view.openings).toHaveLength(0);
  });

  it("includes balconies whose slabTop resolves to this storey's elevation", () => {
    const project = createValidProject();
    project.balconies.push({
      id: "b1",
      attachedWallId: project.walls[0].id,
      offset: 1,
      width: 2,
      depth: 1,
      slabTop: { kind: "storey", storeyId: "1f", offset: 0 },
      slabThickness: 0.15,
      railingHeight: 1.1,
      materialId: "mat-wall",
      railingMaterialId: "mat-frame",
    });
    const view = projectPlan(project, "1f");
    expect(view.balconies).toHaveLength(1);
  });

  it("excludes balconies whose slabTop resolves to a different storey", () => {
    const project = createValidProject();
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
    const view1F = projectPlan(project, "1f");
    const view2F = projectPlan(project, "2f");
    expect(view1F.balconies).toHaveLength(0);
    expect(view2F.balconies).toHaveLength(1);
  });

  it("includes stairs whose 'from' resolves to this storey", () => {
    const project = createValidProject();
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
    const view = projectPlan(project, "1f");
    expect(view.stairs).toHaveLength(1);
    expect(view.stairs[0].stairId).toBe("s1");
  });

  it("excludes stairs not starting at this storey", () => {
    const project = createValidProject();
    project.stairs.push({
      id: "s1",
      x: 1, y: 1, width: 1, depth: 3,
      shape: "straight",
      treadDepth: 0.27,
      bottomEdge: "+y",
      from: { kind: "storey", storeyId: "2f", offset: 0 },
      to: { kind: "absolute", z: 6.4 },
      materialId: "mat-wall",
    });
    const view = projectPlan(project, "1f");
    expect(view.stairs).toHaveLength(0);
  });

  it("returns empty arrays gracefully when project storey doesn't exist", () => {
    const project = createValidProject();
    const view = projectPlan(project, "ghost");
    expect(view.wallSegments).toHaveLength(0);
    expect(view.slabOutlines).toHaveLength(0);
    expect(view.cutZ).toBe(0);
  });
});
