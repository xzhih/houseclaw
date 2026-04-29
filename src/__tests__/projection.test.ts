import { describe, expect, it } from "vitest";
import type { HouseProject, Wall } from "../domain/types";
import { addSkirt } from "../domain/mutations";
import { projectElevationView } from "../projection/elevation";
import { projectPlanView } from "../projection/plan";
import { createBasicProject } from "../domain/sampleProject";

function createSetbackSecondFloorProject(): HouseProject {
  const project = createBasicProject();
  const secondFloorWalls = new Map<string, Wall>(
    [
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
    ].map((wall) => [wall.id, wall]),
  );

  return {
    ...project,
    walls: project.walls.map((wall) => secondFloorWalls.get(wall.id) ?? wall),
    balconies: project.balconies.map((balcony) =>
      balcony.attachedWallId === "wall-front-2f" ? { ...balcony, offset: 1.4, width: 2.8 } : balcony,
    ),
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
    const projection = projectPlanView(createBasicProject(), "1f");

    expect(projection.viewId).toBe("plan-1f");
    expect(projection.wallSegments).toHaveLength(4);
    expect(projection.wallSegments[0]).toMatchObject({
      wallId: "wall-front-1f",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
    });
  });

  it("projects front elevation openings from the same wall model", () => {
    const projection = projectElevationView(createBasicProject(), "front");

    expect(projection.viewId).toBe("elevation-front");
    expect(projection.wallBands.map((band) => band.wallId)).toEqual([
      "wall-front-1f",
      "wall-front-2f",
      "wall-front-3f",
    ]);
    expect(projection.openings[0]).toMatchObject({
      openingId: "window-front-1f",
      wallId: "wall-front-1f",
      x: 3,
      y: 0.9,
      width: 1.6,
      height: 1.3,
    });
    expect(projection.openings.find((opening) => opening.openingId === "window-front-2f")?.y).toBeCloseTo(4.1);
    expect(projection.openings.find((opening) => opening.openingId === "window-front-3f")?.y).toBeCloseTo(7.3);
  });

  it("projects balconies into plan and elevation space", () => {
    const project = createBasicProject();
    const plan = projectPlanView(project, "2f");
    const elevation = projectElevationView(project, "front");

    expect(plan.balconies).toEqual([
      expect.objectContaining({
        balconyId: "balcony-front-2f",
        wallId: "wall-front-2f",
        offset: 3.1,
        width: 3.2,
        depth: 1.25,
      }),
    ]);
    expect(elevation.balconies).toEqual([
      expect.objectContaining({
        balconyId: "balcony-front-2f",
        wallId: "wall-front-2f",
        x: 3.1,
        y: 3.2,
        width: 3.2,
        height: 1.29,
      }),
    ]);
  });

  it("clones projected plan points away from the source project", () => {
    const project = createBasicProject();
    const projection = projectPlanView(project, "1f");

    projection.wallSegments[0].start.x = 99;

    expect(project.walls[0].start.x).toBe(0);
  });

  it("selects elevation side walls using each storey's local footprint", () => {
    const projection = projectElevationView(createSetbackSecondFloorProject(), "front");

    expect(projection.wallBands.map((band) => band.wallId)).toEqual([
      "wall-front-1f",
      "wall-front-2f",
      "wall-front-3f",
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

  it("mirrors the back elevation so an opening near world-east lands near the view's left edge", () => {
    const projection = projectElevationView(createSetbackSecondFloorProject(), "back");

    // wall-back-2f goes (8,7) → (2,7); offset=1 sits 1m along that wall from start,
    // i.e. world x = 7 — close to the world's east edge of the 2f footprint.
    // Looking at the back from outside, world east is on the viewer's *left*, so
    // the opening (world x in [5.8, 7]) should appear close to the left of the wall's view-band.
    const opening = projection.openings.find((o) => o.openingId === "window-back-2f");
    const band = projection.wallBands.find((b) => b.wallId === "wall-back-2f");
    expect(opening).toBeDefined();
    expect(band).toBeDefined();

    expect(opening!.x - band!.x).toBeCloseTo(1); // 1m gap from view's left edge of the band
    expect(band!.x + band!.width - (opening!.x + opening!.width)).toBeCloseTo(3.8); // 3.8m gap on the right
    expect(opening!.width).toBeCloseTo(1.2);
  });

  it("includes roof silhouette polygons in elevation projection", () => {
    const project = createBasicProject();
    const front = projectElevationView(project, "front");
    const left = projectElevationView(project, "left");

    expect(front.roof).toBeDefined();
    expect(front.roof!.length).toBeGreaterThan(0);
    expect(left.roof).toBeDefined();
    expect(left.roof!.length).toBeGreaterThan(0);

    // For sample (eaves front+back, gables left+right, pitch 30°, overhang 0.6m,
    // top storey wallTop = 6.4 + 3.2 = 9.6). Outer footprint depth includes wall
    // half-thickness on each side (8 + 2*0.12) plus overhang (2*0.6) = 9.44; the
    // ridge sits halfDepth*tan above wallTop. Left view's gable-apex vertex is
    // the highest projected point.
    const halfDepth = (8 + 2 * 0.12 + 2 * 0.6) / 2;
    const ridgeZ = 9.6 + halfDepth * Math.tan(Math.PI / 6);
    const leftMaxY = Math.max(...left.roof!.flatMap((poly) => poly.vertices.map((v) => v.y)));
    expect(leftMaxY).toBeCloseTo(ridgeZ, 2);
  });

  it("emits only this storey's own up-stair (no DN echo from below)", () => {
    // 1F has a stair (1F→2F), 2F has a stair (2F→3F), 3F has none (top).
    // Each plan view shows ONLY the storey's own up-stair — the DN hole
    // from the lower neighbor is intentionally not projected.
    const project = createBasicProject();

    const planFor1F = projectPlanView(project, "1f");
    expect(planFor1F.stairs).toHaveLength(1);
    expect(planFor1F.stairs[0].storeyId).toBe("1f");

    const planFor2F = projectPlanView(project, "2f");
    expect(planFor2F.stairs).toHaveLength(1);
    expect(planFor2F.stairs[0].storeyId).toBe("2f");

    const planFor3F = projectPlanView(project, "3f");
    expect(planFor3F.stairs).toHaveLength(0);
  });

  it("populates rotation and center on PlanStairSymbol", () => {
    // stair on 2F is the 2F→3F stair; appears as 2F's own up-stair on 2F's plan
    const project = createBasicProject();
    const planFor2F = projectPlanView(project, "2f");
    const symbol = planFor2F.stairs.find((s) => s.storeyId === "2f");
    expect(symbol).toBeDefined();
    expect(symbol!.rotation).toBe(0);
    expect(symbol!.center).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    });
    const twoF = project.storeys.find((s) => s.id === "2f")!;
    const stair = twoF.stair!;
    expect(symbol!.center.x).toBeCloseTo(stair.x + stair.width / 2, 6);
    expect(symbol!.center.y).toBeCloseTo(stair.y + stair.depth / 2, 6);
  });

  it("propagates a non-zero rotation from the Stair data model into PlanStairSymbol", () => {
    const project = createBasicProject();
    const twoF = project.storeys.find((s) => s.id === "2f")!;
    const stairWithRot = { ...twoF.stair!, rotation: Math.PI / 6 };
    const modifiedProject = {
      ...project,
      storeys: project.storeys.map((s) =>
        s.id === "2f" ? { ...s, stair: stairWithRot } : s,
      ),
    };
    const planFor2F = projectPlanView(modifiedProject, "2f");
    const symbol = planFor2F.stairs.find((s) => s.storeyId === "2f");
    expect(symbol!.rotation).toBeCloseTo(Math.PI / 6, 6);
  });

  describe("elevation — skirts", () => {
    it("includes skirt polygons in front elevation when skirt is on a front wall", () => {
      let project = createBasicProject();
      project = addSkirt(project, "wall-front-2f");
      const front = projectElevationView(project, "front");
      expect(front.skirts).toBeDefined();
      expect(front.skirts!.length).toBeGreaterThan(0);
    });
  });

  describe("plan view — skirts", () => {
    it("includes skirts for the queried storey only", () => {
      let project = createBasicProject();
      project = addSkirt(project, "wall-front-2f");
      const plan2f = projectPlanView(project, "2f");
      expect(plan2f.skirts).toHaveLength(1);
      expect(plan2f.skirts[0].hostWallId).toBe("wall-front-2f");
      const plan1f = projectPlanView(project, "1f");
      expect(plan1f.skirts).toHaveLength(0);
    });
  });

  it("flips the back elevation horizontally relative to the front", () => {
    // Front and back of the same symmetric box; place identical-shape openings on both walls
    // at offsets that place them at the same *world* x. From outside, the back view should
    // show the opening on the opposite side of the view from the front view.
    const project = createBasicProject();
    const projectWithBack: HouseProject = {
      ...project,
      openings: [
        ...project.openings,
        {
          id: "window-back-1f",
          // wall-back-1f goes (10,8) → (0,8); offset=5.4 puts the opening's near-edge
          // at world x = 10 - 5.4 = 4.6 and far-edge at world x = 10 - 7 = 3, i.e. the
          // *same* world span [3, 4.6] as window-front-1f.
          wallId: "wall-back-1f",
          type: "window",
          offset: 5.4,
          sillHeight: 0.9,
          width: 1.6,
          height: 1.3,
          frameMaterialId: "mat-dark-frame",
        },
      ],
    };

    const front = projectElevationView(projectWithBack, "front");
    const back = projectElevationView(projectWithBack, "back");

    const frontWindow = front.openings.find((o) => o.openingId === "window-front-1f")!;
    const frontBand = front.wallBands.find((b) => b.wallId === "wall-front-1f")!;
    const backWindow = back.openings.find((o) => o.openingId === "window-back-1f")!;
    const backBand = back.wallBands.find((b) => b.wallId === "wall-back-1f")!;

    // Both openings are at world x=3..4.6.
    // Front view: 3m from view's left edge of the 10m band.
    expect(frontWindow.x - frontBand.x).toBeCloseTo(3);
    // Back view (mirrored): same world position should be 5.4m from the view's left edge
    // (10 - 4.6), i.e. on the *opposite* side compared to the front view.
    expect(backWindow.x - backBand.x).toBeCloseTo(5.4);
  });
});
