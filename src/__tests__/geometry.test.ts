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

  it("splits a wall around multiple non-overlapping openings", () => {
    const project = createSampleProject();
    const wall = project.walls.find((candidate) => candidate.id === "wall-front-1f")!;
    const firstOpening = project.openings.find(
      (candidate) => candidate.id === "window-front-1f",
    )!;
    const secondOpening: Opening = {
      ...firstOpening,
      id: "window-front-1f-extra",
      offset: 6,
      sillHeight: 1.0,
      width: 1.2,
      height: 1.4,
    };

    const panels = buildWallPanels(wall, [secondOpening, firstOpening]);

    expect(panels.map((panel) => panel.role)).toEqual([
      "left",
      "between",
      "right",
      "below",
      "above",
      "below",
      "above",
    ]);
    expect(panels.find((panel) => panel.role === "left")).toMatchObject({
      x: 0,
      width: 3,
      height: 3.2,
    });
    expect(panels.find((panel) => panel.role === "between")).toMatchObject({
      x: 4.6,
      width: 1.4,
      height: 3.2,
    });
    expect(panels.find((panel) => panel.role === "right")).toMatchObject({
      x: 7.2,
      width: 2.8,
      height: 3.2,
    });
    const belowPanels = panels.filter((panel) => panel.role === "below");
    expect(belowPanels.map((panel) => ({ x: panel.x, width: panel.width, height: panel.height }))).toEqual([
      { x: 3, width: 1.6, height: 0.9 },
      { x: 6, width: 1.2, height: 1.0 },
    ]);
    const abovePanels = panels.filter((panel) => panel.role === "above");
    expect(abovePanels.map((panel) => ({ x: panel.x, width: panel.width, height: panel.height }))).toEqual([
      { x: 3, width: 1.6, height: 1.0 },
      { x: 6, width: 1.2, height: 0.8 },
    ]);
  });

  it("treats touching openings as a single between-gap collapse", () => {
    const project = createSampleProject();
    const wall = project.walls.find((candidate) => candidate.id === "wall-front-1f")!;
    const firstOpening = project.openings.find(
      (candidate) => candidate.id === "window-front-1f",
    )!;
    const adjacent: Opening = {
      ...firstOpening,
      id: "window-front-1f-adjacent",
      offset: 4.6,
      sillHeight: 0.9,
      width: 1.2,
      height: 1.3,
    };

    const panels = buildWallPanels(wall, [firstOpening, adjacent]);

    expect(panels.filter((panel) => panel.role === "between")).toEqual([]);
    expect(panels.filter((panel) => panel.role === "below")).toHaveLength(2);
    expect(panels.find((panel) => panel.role === "right")).toMatchObject({
      x: 5.8,
      width: 4.2,
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

    expect(geometry.walls).toHaveLength(12);
    expect(geometry.balconies).toEqual([
      expect.objectContaining({
        balconyId: "balcony-front-2f",
        storeyId: "2f",
        attachedWallId: "wall-front-2f",
        materialId: "mat-gray-stone",
        railingMaterialId: "mat-dark-frame",
      }),
    ]);
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
