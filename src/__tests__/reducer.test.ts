import { describe, expect, it } from "vitest";
import { projectReducer } from "../app/projectReducer";
import { createSampleProject } from "../domain/sampleProject";

describe("project reducer", () => {
  it("switches between 2d and 3d modes", () => {
    const project = projectReducer(createSampleProject(), { type: "set-mode", mode: "3d" });

    expect(project.mode).toBe("3d");
  });

  it("edits the front window sill height through a reducer action", () => {
    const project = projectReducer(createSampleProject(), {
      type: "update-opening",
      openingId: "window-front-1f",
      patch: { sillHeight: 1.1 },
    });

    expect(project.openings.find((opening) => opening.id === "window-front-1f")!.sillHeight).toBe(1.1);
  });

  it("propagates domain validation errors from opening edits", () => {
    expect(() =>
      projectReducer(createSampleProject(), {
        type: "update-opening",
        openingId: "window-front-1f",
        patch: { sillHeight: 3 },
      }),
    ).toThrow("Opening window-front-1f exceeds wall wall-front-1f height.");
  });

  it("stores selection through the select action", () => {
    const project = projectReducer(createSampleProject(), {
      type: "select",
      selection: { kind: "wall", id: "wall-front-1f" },
    });

    expect(project.selection).toEqual({ kind: "wall", id: "wall-front-1f" });
  });

  it("updates a wall thickness through update-wall", () => {
    const project = projectReducer(createSampleProject(), {
      type: "update-wall",
      wallId: "wall-front-1f",
      patch: { thickness: 0.3 },
    });

    expect(project.walls.find((wall) => wall.id === "wall-front-1f")!.thickness).toBe(0.3);
  });

  it("updates a balcony depth through update-balcony", () => {
    const project = projectReducer(createSampleProject(), {
      type: "update-balcony",
      balconyId: "balcony-front-2f",
      patch: { depth: 1.5 },
    });

    expect(project.balconies.find((balcony) => balcony.id === "balcony-front-2f")!.depth).toBe(1.5);
  });

  it("updates a storey height through update-storey and renormalizes elevations", () => {
    const project = projectReducer(createSampleProject(), {
      type: "update-storey",
      storeyId: "1f",
      patch: { height: 3.5 },
    });

    expect(project.storeys.map((storey) => storey.elevation)).toEqual([0, 3.5, 6.7]);
  });
});
