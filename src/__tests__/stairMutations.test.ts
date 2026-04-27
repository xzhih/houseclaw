import { describe, expect, it } from "vitest";
import { createSampleProject } from "../domain/sampleProject";
import { addStair, removeStair, updateStair } from "../domain/mutations";
import type { Stair } from "../domain/types";

const FULL_STAIR: Stair = {
  x: 1.0,
  y: 5.0,
  width: 1.2,
  depth: 2.5,
  shape: "straight",
  treadDepth: 0.27,
  bottomEdge: "+y",
  materialId: "mat-dark-frame",
};

describe("stair mutations", () => {
  it("addStair attaches stair to a non-top storey", () => {
    const project = createSampleProject();
    // sample now has stairs on 1f / 2f; clear 1f then re-add
    const cleared = removeStair(project, "1f");
    const next = addStair(cleared, "1f", FULL_STAIR);
    const oneF = next.storeys.find((s) => s.id === "1f");
    expect(oneF?.stair).toEqual(FULL_STAIR);
  });

  it("addStair on the top storey throws via constraints", () => {
    const project = createSampleProject();
    expect(() => addStair(project, "3f", FULL_STAIR)).toThrow(/cannot have a stair/);
  });

  it("removeStair clears the field", () => {
    const project = createSampleProject();
    const next = removeStair(project, "1f");
    expect(next.storeys.find((s) => s.id === "1f")?.stair).toBeUndefined();
  });

  it("updateStair patches selected fields and validates", () => {
    const project = createSampleProject();
    const next = updateStair(project, "1f", { shape: "u", treadDepth: 0.3 });
    const oneF = next.storeys.find((s) => s.id === "1f");
    expect(oneF?.stair?.shape).toBe("u");
    expect(oneF?.stair?.treadDepth).toBe(0.3);
    expect(oneF?.stair?.bottomEdge).toBe("+y");
  });
});
