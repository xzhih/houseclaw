import { describe, expect, it } from "vitest";
import { wallLength } from "../domain/measurements";
import { createSampleProject } from "../domain/sampleProject";

describe("house domain model", () => {
  it("creates a three-storey sample project with deterministic elevations", () => {
    const project = createSampleProject();

    expect(project.storeys.map((storey) => storey.id)).toEqual(["1f", "2f", "3f"]);
    expect(project.storeys.map((storey) => storey.elevation)).toEqual([0, 3.2, 6.4]);
    expect(project.storeys.every((storey) => storey.height === 3.2)).toBe(true);
  });

  it("keeps walls as structured objects with measurable length", () => {
    const project = createSampleProject();
    const frontWall = project.walls.find((wall) => wall.id === "wall-front-1f");

    expect(frontWall).toBeDefined();
    expect(wallLength(frontWall!)).toBe(10);
    expect(frontWall!.thickness).toBe(0.24);
    expect(frontWall!.storeyId).toBe("1f");
  });
});
