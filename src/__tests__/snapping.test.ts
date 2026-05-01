import { describe, expect, it } from "vitest";
import { snapPlanPoint, snapToEndpoint, snapToGrid } from "../geometry/v2/snapping";

describe("snapToGrid", () => {
  it("rounds both coordinates to the nearest grid cell", () => {
    expect(snapToGrid({ x: 1.234, y: 5.6789 }, 0.1)).toEqual({ x: 1.2, y: 5.7 });
  });

  it("snaps to integer cells when grid is 1", () => {
    expect(snapToGrid({ x: 0.6, y: -1.1 }, 1)).toEqual({ x: 1, y: -1 });
  });

  it("returns the input unchanged when grid size is 0 or negative", () => {
    expect(snapToGrid({ x: 1.234, y: 5.6789 }, 0)).toEqual({ x: 1.234, y: 5.6789 });
    expect(snapToGrid({ x: 1.234, y: 5.6789 }, -0.5)).toEqual({ x: 1.234, y: 5.6789 });
  });
});

describe("snapToEndpoint", () => {
  const walls = [
    { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    { start: { x: 10, y: 0 }, end: { x: 10, y: 8 } },
  ];

  it("returns the nearest endpoint when within threshold", () => {
    expect(snapToEndpoint({ x: 9.95, y: 0.05 }, walls, 0.2)).toEqual({ x: 10, y: 0 });
  });

  it("returns undefined when no endpoint is within threshold", () => {
    expect(snapToEndpoint({ x: 5, y: 5 }, walls, 0.2)).toBeUndefined();
  });

  it("returns undefined for an empty wall list", () => {
    expect(snapToEndpoint({ x: 0, y: 0 }, [], 0.2)).toBeUndefined();
  });
});

describe("snapPlanPoint", () => {
  const walls = [{ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }];

  it("prefers an endpoint snap over a grid snap when both are available", () => {
    expect(snapPlanPoint({ x: 9.93, y: 0.04 }, walls, { gridSize: 0.1, endpointThreshold: 0.2 })).toEqual({
      x: 10,
      y: 0,
    });
  });

  it("falls back to grid snap when no endpoint is in range", () => {
    expect(snapPlanPoint({ x: 4.236, y: 5.612 }, walls, { gridSize: 0.1, endpointThreshold: 0.2 })).toEqual({
      x: 4.2,
      y: 5.6,
    });
  });

  it("returns the input unchanged when both snaps are disabled", () => {
    expect(snapPlanPoint({ x: 4.236, y: 5.612 }, walls, { gridSize: 0, endpointThreshold: 0 })).toEqual({
      x: 4.236,
      y: 5.612,
    });
  });
});
