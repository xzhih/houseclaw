import { describe, expect, it } from "vitest";
import { canBuildRoof, planStoreyIdFromView } from "../domain/views";
import { createBasicProject } from "../domain/sampleProject";

describe("planStoreyIdFromView", () => {
  it("returns the encoded storey id when it matches", () => {
    const project = createBasicProject();
    expect(planStoreyIdFromView("plan-2f", project.storeys)).toBe("2f");
  });
  it("returns undefined for non-plan views", () => {
    const project = createBasicProject();
    expect(planStoreyIdFromView("roof", project.storeys)).toBeUndefined();
  });
});

describe("canBuildRoof", () => {
  it("returns true for the rectangular sample top storey", () => {
    const project = createBasicProject();
    expect(canBuildRoof(project)).toBe(true);
  });

  it("returns false when the top storey has fewer than 4 exterior walls", () => {
    const project = createBasicProject();
    const top = project.storeys[project.storeys.length - 1];
    const walls = project.walls.filter(
      (wall) => !(wall.storeyId === top.id && wall.id === `wall-front-${top.id}`),
    );
    expect(canBuildRoof({ ...project, walls })).toBe(false);
  });

  it("returns false when the top storey is not axis-aligned", () => {
    const project = createBasicProject();
    const top = project.storeys[project.storeys.length - 1];
    const walls = project.walls.map((wall) => {
      if (wall.storeyId !== top.id) return wall;
      // Skew the front-right corner by 0.5m in y so the rectangle becomes a quadrilateral.
      if (wall.id === `wall-front-${top.id}`) return { ...wall, end: { x: 10, y: 0.5 } };
      if (wall.id === `wall-right-${top.id}`) return { ...wall, start: { x: 10, y: 0.5 } };
      return wall;
    });
    expect(canBuildRoof({ ...project, walls })).toBe(false);
  });

  it("returns false for a project with no storeys", () => {
    const project = createBasicProject();
    expect(canBuildRoof({ ...project, storeys: [], walls: [] })).toBe(false);
  });
});
