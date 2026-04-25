import { describe, expect, it } from "vitest";
import type { HouseProject, Wall } from "../domain/types";
import { projectElevationView } from "../projection/elevation";
import { projectPlanView } from "../projection/plan";
import { createSampleProject } from "../domain/sampleProject";

function createSetbackSecondFloorProject(): HouseProject {
  const project = createSampleProject();
  const secondFloorWalls: Wall[] = [
    {
      id: "wall-front-2f",
      storeyId: "2f",
      start: { x: 2, y: 2 },
      end: { x: 8, y: 2 },
      thickness: project.defaultWallThickness,
      height: project.defaultStoreyHeight,
      exterior: true,
      materialId: "mat-white-render",
    },
    {
      id: "wall-right-2f",
      storeyId: "2f",
      start: { x: 8, y: 2 },
      end: { x: 8, y: 7 },
      thickness: project.defaultWallThickness,
      height: project.defaultStoreyHeight,
      exterior: true,
      materialId: "mat-white-render",
    },
    {
      id: "wall-back-2f",
      storeyId: "2f",
      start: { x: 8, y: 7 },
      end: { x: 2, y: 7 },
      thickness: project.defaultWallThickness,
      height: project.defaultStoreyHeight,
      exterior: true,
      materialId: "mat-white-render",
    },
    {
      id: "wall-left-2f",
      storeyId: "2f",
      start: { x: 2, y: 7 },
      end: { x: 2, y: 2 },
      thickness: project.defaultWallThickness,
      height: project.defaultStoreyHeight,
      exterior: true,
      materialId: "mat-white-render",
    },
  ];

  return {
    ...project,
    walls: [...project.walls, ...secondFloorWalls],
    openings: [
      ...project.openings,
      {
        id: "window-back-2f",
        wallId: "wall-back-2f",
        type: "window",
        offset: 1,
        sillHeight: 1,
        width: 1.2,
        height: 1,
        frameMaterialId: "mat-dark-frame",
      },
    ],
  };
}

describe("2D projections", () => {
  it("projects first-floor walls into plan space", () => {
    const projection = projectPlanView(createSampleProject(), "1f");

    expect(projection.viewId).toBe("plan-1f");
    expect(projection.wallSegments).toHaveLength(4);
    expect(projection.wallSegments[0]).toMatchObject({
      wallId: "wall-front-1f",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    });
  });

  it("projects front elevation openings from the same wall model", () => {
    const projection = projectElevationView(createSampleProject(), "front");

    expect(projection.viewId).toBe("elevation-front");
    expect(projection.wallBands).toHaveLength(1);
    expect(projection.openings[0]).toMatchObject({
      openingId: "window-front-1f",
      wallId: "wall-front-1f",
      x: 3,
      y: 0.9,
      width: 1.6,
      height: 1.3,
    });
  });

  it("clones projected plan points away from the source project", () => {
    const project = createSampleProject();
    const projection = projectPlanView(project, "1f");

    projection.wallSegments[0].start.x = 99;

    expect(project.walls[0].start.x).toBe(0);
  });

  it("selects elevation side walls using each storey's local footprint", () => {
    const projection = projectElevationView(createSetbackSecondFloorProject(), "front");

    expect(projection.wallBands.map((band) => band.wallId)).toEqual([
      "wall-front-1f",
      "wall-front-2f",
    ]);
  });

  it("projects wall bands onto the side-axis coordinate", () => {
    const projection = projectElevationView(createSetbackSecondFloorProject(), "right");

    expect(projection.wallBands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ wallId: "wall-right-1f", x: 0 }),
        expect.objectContaining({ wallId: "wall-right-2f", x: 2 }),
      ]),
    );
  });

  it("normalizes reversed-wall opening positions to the side axis", () => {
    const projection = projectElevationView(createSetbackSecondFloorProject(), "back");

    expect(projection.openings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          openingId: "window-back-2f",
          wallId: "wall-back-2f",
          x: 3,
        }),
      ]),
    );
  });
});
