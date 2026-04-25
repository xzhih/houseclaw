import { describe, expect, it } from "vitest";
import { projectElevationView } from "../projection/elevation";
import { projectPlanView } from "../projection/plan";
import { createSampleProject } from "../domain/sampleProject";

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
});
