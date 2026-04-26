import { describe, expect, it } from "vitest";
import { validateProject } from "../domain/constraints";
import { addOpening, updateBalcony, updateStorey, updateWall } from "../domain/mutations";
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

  it("rejects overlapping openings on the same wall", () => {
    const project = createSampleProject();
    const seed = project.openings.find((opening) => opening.id === "window-front-1f")!;
    const overlapping = {
      ...seed,
      id: "overlap-window",
      offset: seed.offset + 0.5,
      width: 1.0,
    };

    expect(() => addOpening(project, overlapping)).toThrow(
      "Opening overlap-window overlaps with opening window-front-1f on wall wall-front-1f.",
    );
  });

  it("allows openings that touch end-to-end without gap", () => {
    const project = createSampleProject();
    const seed = project.openings.find((opening) => opening.id === "window-front-1f")!;
    const adjacent = {
      ...seed,
      id: "adjacent-window",
      offset: seed.offset + seed.width,
      width: 1.0,
    };

    expect(() => addOpening(project, adjacent)).not.toThrow();
  });

  it("keeps storey elevations normalized after changing a floor height", () => {
    const project = updateStorey(createSampleProject(), "1f", { height: 3.6 });

    expect(project.storeys.map((storey) => storey.elevation)).toEqual([0, 3.6, 6.8]);
    expect(project.storeys[0].height).toBe(3.6);
    expect(project.walls.find((wall) => wall.id === "wall-front-1f")!.height).toBe(3.6);
  });

  it("updates a wall thickness through updateWall", () => {
    const project = updateWall(createSampleProject(), "wall-front-1f", { thickness: 0.3 });
    expect(project.walls.find((wall) => wall.id === "wall-front-1f")!.thickness).toBe(0.3);
  });

  it("rejects updateWall when the new thickness is non-positive", () => {
    expect(() => updateWall(createSampleProject(), "wall-front-1f", { thickness: 0 })).toThrow(
      /thickness/,
    );
  });

  it("updates a balcony depth through updateBalcony", () => {
    const project = updateBalcony(createSampleProject(), "balcony-front-2f", { depth: 1.5 });
    expect(project.balconies.find((balcony) => balcony.id === "balcony-front-2f")!.depth).toBe(1.5);
  });

  it("updates a storey label through updateStorey without touching height", () => {
    const project = updateStorey(createSampleProject(), "1f", { label: "一层" });
    const storey = project.storeys.find((candidate) => candidate.id === "1f")!;
    expect(storey.label).toBe("一层");
    expect(storey.height).toBe(3.2);
    expect(project.storeys.map((s) => s.elevation)).toEqual([0, 3.2, 6.4]);
  });

  it("propagates a height change in updateStorey through wall heights and elevations", () => {
    const project = updateStorey(createSampleProject(), "1f", { height: 3.5 });

    expect(project.storeys.map((storey) => ({ id: storey.id, elevation: storey.elevation, height: storey.height }))).toEqual([
      { id: "1f", elevation: 0, height: 3.5 },
      { id: "2f", elevation: 3.5, height: 3.2 },
      { id: "3f", elevation: 6.7, height: 3.2 },
    ]);
    expect(project.walls.find((wall) => wall.id === "wall-front-1f")!.height).toBe(3.5);
  });
});

describe("stair opening validation", () => {
  it("rejects a stair opening on the 1F slab", () => {
    const project = createSampleProject();
    const oneF = project.storeys.find((s) => s.id === "1f")!;
    oneF.stair = { x: 1, y: 1, width: 1, depth: 1 };

    const errors = validateProject(project);
    expect(errors).toContain(
      "Storey 1f cannot have a stair (no storey below).",
    );
  });

  it("rejects zero or negative size", () => {
    const project = createSampleProject();
    const twoF = project.storeys.find((s) => s.id === "2f")!;
    twoF.stair = { x: 1, y: 1, width: 0, depth: 1 };

    const errors = validateProject(project);
    expect(errors).toContain(
      "Storey 2f stair width must be positive.",
    );
  });

  it("rejects an opening that falls outside the storey's exterior ring", () => {
    const project = createSampleProject();
    const twoF = project.storeys.find((s) => s.id === "2f")!;
    // Sample is a 10×8 rectangle; this opening hangs off the back wall.
    twoF.stair = { x: 0.6, y: 7.5, width: 1.2, depth: 2.5 };

    const errors = validateProject(project);
    expect(errors).toContain(
      "Storey 2f stair must be fully inside the exterior ring.",
    );
  });

  it("accepts a well-placed opening on 2F", () => {
    const project = createSampleProject();
    const twoF = project.storeys.find((s) => s.id === "2f")!;
    twoF.stair = { x: 0.6, y: 5.0, width: 1.2, depth: 2.5 };

    const errors = validateProject(project);
    expect(errors).toEqual([]);
  });
});
