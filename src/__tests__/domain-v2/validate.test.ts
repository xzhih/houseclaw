import { describe, expect, it } from "vitest";
import { createValidV2Project } from "../../domain/v2/fixtures";
import { MIN_WALL_HEIGHT, assertValidProject, validateProject } from "../../domain/v2/validate";

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

  it("accepts a slab with valid CW holes", () => {
    const p = createValidV2Project();
    p.slabs[0].holes = [
      [
        { x: 1, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 1 },
      ],
    ];
    expect(validateProject(p)).toEqual([]);
  });

  it("flags a slab hole with fewer than 3 vertices", () => {
    const p = createValidV2Project();
    p.slabs[0].holes = [[{ x: 1, y: 1 }, { x: 2, y: 1 }]];
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Slab slab-1f") && e.includes("hole[0]"))).toBe(true);
  });

  it("flags a slab hole that is CCW (must be CW inner boundary)", () => {
    const p = createValidV2Project();
    p.slabs[0].holes = [
      [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 1, y: 2 },
      ],
    ];
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Slab slab-1f hole[0]") && e.includes("CW"))).toBe(true);
  });

  it("flags a self-intersecting slab hole", () => {
    const p = createValidV2Project();
    p.slabs[0].holes = [
      [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 2, y: 1 },
        { x: 1, y: 2 },
      ],
    ];
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Slab slab-1f hole[0]") && e.includes("self-intersecting"))).toBe(true);
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

describe("validateProject — opening", () => {
  it("flags an opening that references a missing wall", () => {
    const p = createValidV2Project();
    p.openings[0].wallId = "ghost";
    const errors = validateProject(p);
    expect(errors).toContain("Opening opening-front-window references missing wall: ghost");
  });

  it("flags an opening whose sillHeight + height exceeds resolved wall height", () => {
    const p = createValidV2Project();
    p.openings[0].sillHeight = 2.5;
    p.openings[0].height = 1.5; // 4.0m total > 3.2m wall height
    const errors = validateProject(p);
    expect(
      errors.some((e) => e.includes("Opening opening-front-window") && e.includes("exceeds wall height")),
    ).toBe(true);
  });

  it("flags an opening whose offset + width exceeds wall length", () => {
    const p = createValidV2Project();
    p.openings[0].offset = 5.5;
    p.openings[0].width = 1.0; // 6.5 > 6 wall length
    const errors = validateProject(p);
    expect(
      errors.some((e) => e.includes("Opening opening-front-window") && e.includes("exceeds wall length")),
    ).toBe(true);
  });
});

describe("validateProject — stair", () => {
  it("flags a stair whose to anchor resolves not strictly above from", () => {
    const p = createValidV2Project();
    p.stairs.push({
      id: "s1",
      x: 1, y: 1, width: 1, depth: 3,
      shape: "straight",
      treadDepth: 0.27,
      bottomEdge: "+y",
      from: { kind: "absolute", z: 0 },
      to: { kind: "absolute", z: 0 },
      materialId: "mat-wall",
    });
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Stair s1") && e.includes("to must be above from"))).toBe(true);
  });

  it("flags a stair whose anchors reference missing storeys", () => {
    const p = createValidV2Project();
    p.stairs.push({
      id: "s2",
      x: 1, y: 1, width: 1, depth: 3,
      shape: "straight",
      treadDepth: 0.27,
      bottomEdge: "+y",
      from: { kind: "storey", storeyId: "ghost", offset: 0 },
      to: { kind: "storey", storeyId: "2f", offset: 0 },
      materialId: "mat-wall",
    });
    const errors = validateProject(p);
    expect(errors).toContain("Stair s2 from anchor references missing storey: ghost");
  });
});

describe("validateProject — balcony", () => {
  it("flags a balcony that references a missing wall", () => {
    const p = createValidV2Project();
    p.balconies.push({
      id: "b1",
      attachedWallId: "ghost",
      offset: 1,
      width: 2,
      depth: 1,
      slabTop: { kind: "storey", storeyId: "2f", offset: 0 },
      slabThickness: 0.15,
      railingHeight: 1.1,
      materialId: "mat-wall",
      railingMaterialId: "mat-frame",
    });
    const errors = validateProject(p);
    expect(errors).toContain("Balcony b1 references missing wall: ghost");
  });

  it("flags a balcony whose slabTop anchor references missing storey", () => {
    const p = createValidV2Project();
    p.balconies.push({
      id: "b2",
      attachedWallId: "w-front",
      offset: 1,
      width: 2,
      depth: 1,
      slabTop: { kind: "storey", storeyId: "ghost", offset: 0 },
      slabThickness: 0.15,
      railingHeight: 1.1,
      materialId: "mat-wall",
      railingMaterialId: "mat-frame",
    });
    const errors = validateProject(p);
    expect(errors).toContain("Balcony b2 slabTop anchor references missing storey: ghost");
  });
});

describe("assertValidProject", () => {
  it("returns the project unchanged when valid", () => {
    const p = createValidV2Project();
    expect(assertValidProject(p)).toBe(p);
  });

  it("throws an Error containing every collected error message", () => {
    const p = createValidV2Project();
    p.walls[0].bottom = { kind: "storey", storeyId: "ghost-a", offset: 0 };
    p.walls[1].top = { kind: "storey", storeyId: "ghost-b", offset: 0 };
    expect(() => assertValidProject(p)).toThrow(/ghost-a/);
    expect(() => assertValidProject(p)).toThrow(/ghost-b/);
    expect(() => assertValidProject(p)).toThrow(/Invalid v2 project/);
  });
});
