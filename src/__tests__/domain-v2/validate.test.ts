import { describe, expect, it } from "vitest";
import { createValidV2Project } from "../../domain/v2/fixtures";
import { MIN_WALL_HEIGHT, validateProject } from "../../domain/v2/validate";

describe("validateProject — base case", () => {
  it("returns no errors for a valid project", () => {
    expect(validateProject(createValidV2Project())).toEqual([]);
  });
});

describe("validateProject — anchor references", () => {
  it("flags a wall whose bottom anchor references a missing storey", () => {
    const p = createValidV2Project();
    p.walls[0].bottom = { kind: "storey", storeyId: "ghost", offset: 0 };
    const errors = validateProject(p);
    expect(errors).toContain("Wall w-front bottom anchor references missing storey: ghost");
  });

  it("flags a wall whose top anchor references a missing storey", () => {
    const p = createValidV2Project();
    p.walls[0].top = { kind: "storey", storeyId: "ghost", offset: 0 };
    const errors = validateProject(p);
    expect(errors).toContain("Wall w-front top anchor references missing storey: ghost");
  });

  it("does not flag absolute anchors", () => {
    const p = createValidV2Project();
    p.walls[0].bottom = { kind: "absolute", z: -0.15 };
    p.walls[0].top = { kind: "absolute", z: 3.0 };
    expect(validateProject(p)).toEqual([]);
  });
});

describe("validateProject — wall height", () => {
  it(`flags a wall shorter than ${MIN_WALL_HEIGHT}m`, () => {
    const p = createValidV2Project();
    p.walls[0].top = { kind: "absolute", z: 0.3 };
    p.walls[0].bottom = { kind: "absolute", z: 0 };
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Wall w-front height") && e.includes("< 0.5"))).toBe(true);
  });

  it("flags a wall whose top resolves below its bottom", () => {
    const p = createValidV2Project();
    p.walls[0].bottom = { kind: "absolute", z: 3.0 };
    p.walls[0].top = { kind: "absolute", z: 0 };
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Wall w-front") && e.includes("top below bottom"))).toBe(true);
  });
});

describe("validateProject — slab", () => {
  it("flags a slab polygon with fewer than 3 vertices", () => {
    const p = createValidV2Project();
    p.slabs[0].polygon = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Slab slab-1f") && e.includes("polygon"))).toBe(true);
  });

  it("flags a self-intersecting slab polygon", () => {
    const p = createValidV2Project();
    p.slabs[0].polygon = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ];
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Slab slab-1f") && e.includes("self-intersecting"))).toBe(true);
  });

  it("flags a CW (non-CCW) slab polygon", () => {
    const p = createValidV2Project();
    p.slabs[0].polygon = [...p.slabs[0].polygon].reverse();
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Slab slab-1f") && e.includes("CCW"))).toBe(true);
  });

  it("flags a slab with non-positive thickness", () => {
    const p = createValidV2Project();
    p.slabs[0].thickness = 0;
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Slab slab-1f") && e.includes("thickness"))).toBe(true);
  });
});

describe("validateProject — roof", () => {
  it("flags a roof whose edges length differs from polygon length", () => {
    const p = createValidV2Project();
    p.roofs[0].edges = ["eave", "gable", "eave"]; // length 3 vs polygon 4
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Roof roof-main") && e.includes("edges length"))).toBe(true);
  });

  it("flags a roof with pitch outside [π/36, π/3]", () => {
    const p = createValidV2Project();
    p.roofs[0].pitch = Math.PI / 100;
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Roof roof-main") && e.includes("pitch"))).toBe(true);
  });

  it("flags a roof with overhang outside [0, 2]", () => {
    const p = createValidV2Project();
    p.roofs[0].overhang = 2.5;
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Roof roof-main") && e.includes("overhang"))).toBe(true);
  });

  it("flags a roof whose base anchor references a missing storey", () => {
    const p = createValidV2Project();
    p.roofs[0].base = { kind: "storey", storeyId: "ghost", offset: 0 };
    const errors = validateProject(p);
    expect(errors).toContain("Roof roof-main base anchor references missing storey: ghost");
  });
});
