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
