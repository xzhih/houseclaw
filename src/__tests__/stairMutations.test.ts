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
  it("addStair attaches stair to a storey above the lowest", () => {
    const project = createSampleProject();
    // sample already has stairs on 2f / 3f; clear 2f first
    const cleared = removeStair(project, "2f");
    const next = addStair(cleared, "2f", FULL_STAIR);
    const twoF = next.storeys.find((s) => s.id === "2f");
    expect(twoF?.stair).toEqual(FULL_STAIR);
  });

  it("addStair on the lowest storey throws via constraints", () => {
    const project = createSampleProject();
    expect(() => addStair(project, "1f", FULL_STAIR)).toThrow(/cannot have a stair/);
  });

  it("updateStair patches selected fields and validates", () => {
    const project = createSampleProject();
    const next = updateStair(project, "2f", { shape: "u", treadDepth: 0.3 });
    const twoF = next.storeys.find((s) => s.id === "2f");
    expect(twoF?.stair?.shape).toBe("u");
    expect(twoF?.stair?.treadDepth).toBe(0.3);
    // other fields unchanged
    expect(twoF?.stair?.bottomEdge).toBe("+y");
  });

  it("removeStair clears the field", () => {
    const project = createSampleProject();
    const next = removeStair(project, "2f");
    expect(next.storeys.find((s) => s.id === "2f")?.stair).toBeUndefined();
  });
});
