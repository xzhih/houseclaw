import { describe, expect, it } from "vitest";
import { validateProject } from "../domain/constraints";
import { addOpening, setStoreyHeight } from "../domain/mutations";
import { createSampleProject } from "../domain/sampleProject";

describe("house constraints", () => {
  it("rejects an opening that is not attached to an existing wall", () => {
    const project = createSampleProject();
    const invalid = {
      ...project,
      openings: [
        ...project.openings,
        {
          id: "floating-window",
          wallId: "missing-wall",
          type: "window" as const,
          offset: 1,
          sillHeight: 0.8,
          width: 1.2,
          height: 1.2,
          frameMaterialId: "mat-dark-frame",
        },
      ],
    };

    expect(validateProject(invalid)).toContain("Opening floating-window references missing wall missing-wall.");
  });

  it("rejects an opening that exceeds wall length", () => {
    const project = createSampleProject();

    expect(() =>
      addOpening(project, {
        id: "too-wide-window",
        wallId: "wall-front-1f",
        type: "window",
        offset: 9.4,
        sillHeight: 0.8,
        width: 1,
        height: 1.2,
        frameMaterialId: "mat-dark-frame",
      }),
    ).toThrow("Opening too-wide-window exceeds wall wall-front-1f length.");
  });

  it("keeps storey elevations normalized after changing a floor height", () => {
    const project = setStoreyHeight(createSampleProject(), "1f", 3.6);

    expect(project.storeys.map((storey) => storey.elevation)).toEqual([0, 3.6, 6.8]);
    expect(project.storeys[0].height).toBe(3.6);
    expect(project.walls.find((wall) => wall.id === "wall-front-1f")!.height).toBe(3.6);
  });
});
