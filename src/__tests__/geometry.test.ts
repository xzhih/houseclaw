import { describe, expect, it } from "vitest";
import { createSampleProject } from "../domain/sampleProject";
import type { Opening } from "../domain/types";
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

  it("returns one full panel when a wall has no openings", () => {
    const project = createSampleProject();
    const wall = project.walls.find((candidate) => candidate.id === "wall-right-1f")!;

    expect(buildWallPanels(wall, [])).toEqual([
      {
        role: "full",
        x: 0,
        y: 0,
        width: 8,
        height: 3.2,
      },
    ]);
  });

  it("filters zero-width side panels for a boundary opening", () => {
    const project = createSampleProject();
    const wall = project.walls.find((candidate) => candidate.id === "wall-front-1f")!;
    const opening = project.openings.find(
      (candidate) => candidate.id === "window-front-1f",
    )!;

    const panels = buildWallPanels(wall, [{ ...opening, offset: 0 }]);

    expect(panels.map((panel) => panel.role)).toEqual(["right", "below", "above"]);
    expect(panels.find((panel) => panel.role === "right")).toMatchObject({
      x: 1.6,
      y: 0,
      width: 8.4,
      height: 3.2,
    });
    expect(panels.find((panel) => panel.role === "below")).toMatchObject({
      x: 0,
      y: 0,
      width: 1.6,
      height: 0.9,
    });
  });

  it("uses only the first opening for the initial panel split prototype", () => {
    const project = createSampleProject();
    const wall = project.walls.find((candidate) => candidate.id === "wall-front-1f")!;
    const firstOpening = project.openings.find(
      (candidate) => candidate.id === "window-front-1f",
    )!;
    const ignoredOpening: Opening = {
      ...firstOpening,
      id: "ignored-window-front-1f",
      offset: 0,
      sillHeight: 0,
      width: 10,
      height: 3.2,
    };

    const panels = buildWallPanels(wall, [firstOpening, ignoredOpening]);

    expect(panels.map((panel) => panel.role)).toEqual(["left", "right", "below", "above"]);
    expect(panels.find((panel) => panel.role === "left")).toMatchObject({
      x: 0,
      width: 3,
    });
    expect(panels.find((panel) => panel.role === "right")).toMatchObject({
      x: 4.6,
      width: 5.4,
    });
  });

  it("filters non-finite and rounded-zero panel descriptors", () => {
    const project = createSampleProject();
    const wall = project.walls.find((candidate) => candidate.id === "wall-front-1f")!;
    const opening = project.openings.find(
      (candidate) => candidate.id === "window-front-1f",
    )!;

    const panels = buildWallPanels(wall, [
      {
        ...opening,
        offset: Number.NaN,
        sillHeight: Number.POSITIVE_INFINITY,
        width: 0.00001,
      },
    ]);

    expect(panels).toHaveLength(0);
    expect(
      panels.every((panel) =>
        [panel.x, panel.y, panel.width, panel.height].every(Number.isFinite) &&
        panel.width > 0 &&
        panel.height > 0,
      ),
    ).toBe(true);
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
