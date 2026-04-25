import { describe, expect, it } from "vitest";
import { createSampleProject } from "../domain/sampleProject";
import { buildHouseGeometry } from "../geometry/houseGeometry";
import { buildWallPanels } from "../geometry/wallPanels";

describe("house geometry descriptors", () => {
  it("splits a wall face around a single opening", () => {
    const project = createSampleProject();
    const wall = project.walls.find((candidate) => candidate.id === "wall-front-1f")!;
    const opening = project.openings.find(
      (candidate) => candidate.id === "window-front-1f",
    )!;

    const panels = buildWallPanels(wall, [opening]);

    expect(panels.map((panel) => panel.role)).toEqual(["left", "right", "below", "above"]);
    expect(panels.find((panel) => panel.role === "left")).toMatchObject({
      x: 0,
      y: 0,
      width: 3,
      height: 3.2,
    });
    expect(panels.find((panel) => panel.role === "below")).toMatchObject({
      x: 3,
      y: 0,
      width: 1.6,
      height: 0.9,
    });
  });

  it("builds house geometry from the authoritative project", () => {
    const geometry = buildHouseGeometry(createSampleProject());

    expect(geometry.walls).toHaveLength(4);
    expect(geometry.walls[0].panels.length).toBeGreaterThan(0);
    expect(geometry.walls[0].materialId).toBe("mat-white-render");
  });

  it("clones geometry points away from the source project", () => {
    const project = createSampleProject();
    const geometry = buildHouseGeometry(project);

    geometry.walls[0].start.x = 99;
    geometry.walls[0].end.x = 99;

    expect(project.walls[0].start.x).toBe(0);
    expect(project.walls[0].end.x).toBe(10);
  });
});
