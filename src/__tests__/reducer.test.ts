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
});
