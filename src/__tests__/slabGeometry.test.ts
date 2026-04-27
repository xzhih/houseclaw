import { describe, expect, it } from "vitest";
import type { Storey, Wall } from "../domain/types";
import { buildSlabGeometry } from "../geometry/slabGeometry";
import { buildWallNetwork, type FootprintQuad } from "../geometry/wallNetwork";

function makeRectangleWalls(storeyId: string): Wall[] {
  const base = {
    storeyId,
    thickness: 0.24,
    height: 3,
    exterior: true,
    materialId: "mat-white-render",
  } as const;
  return [
    { id: `${storeyId}-front`, start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, ...base },
    { id: `${storeyId}-right`, start: { x: 10, y: 0 }, end: { x: 10, y: 8 }, ...base },
    { id: `${storeyId}-back`, start: { x: 10, y: 8 }, end: { x: 0, y: 8 }, ...base },
    { id: `${storeyId}-left`, start: { x: 0, y: 8 }, end: { x: 0, y: 0 }, ...base },
  ];
}

function indexFootprints(walls: Wall[]): Map<string, FootprintQuad> {
  const index = new Map<string, FootprintQuad>();
  for (const fp of buildWallNetwork(walls)) {
    const { wallId, ...quad } = fp;
    index.set(wallId, quad);
  }
  return index;
}

const DEFAULT_SLAB_MATERIAL = "mat-gray-stone";

describe("buildSlabGeometry", () => {
  it("returns the exterior outline with no hole when storey has no opening", () => {
    const walls = makeRectangleWalls("1f");
    const storey: Storey = {
      id: "1f",
      label: "1F",
      elevation: 0,
      height: 3.2,
      slabThickness: 0.18,
    };

    const slab = buildSlabGeometry(storey, walls, indexFootprints(walls), DEFAULT_SLAB_MATERIAL);

    expect(slab).toBeDefined();
    expect(slab!.kind).toBe("floor");
    expect(slab!.outline).toHaveLength(4);
    expect(slab!.hole).toBeUndefined();
    expect(slab!.topY).toBeCloseTo(0, 4);
    expect(slab!.thickness).toBeCloseTo(0.18, 4);
    expect(slab!.materialId).toBe(DEFAULT_SLAB_MATERIAL);
  });

  it("includes the stair as a rectangular hole when present", () => {
    const walls = makeRectangleWalls("2f");
    const storey: Storey = {
      id: "2f",
      label: "2F",
      elevation: 3.2,
      height: 3.2,
      slabThickness: 0.18,
      stair: {
        x: 0.6,
        y: 5.0,
        width: 1.2,
        depth: 2.5,
        shape: "straight",
        treadDepth: 0.27,
        bottomEdge: "+y",
        materialId: "mat-dark-frame",
      },
    };

    const slab = buildSlabGeometry(storey, walls, indexFootprints(walls), DEFAULT_SLAB_MATERIAL);

    expect(slab).toBeDefined();
    expect(slab!.hole).toBeDefined();
    expect(slab!.hole).toHaveLength(4);
    const expected = [
      { x: 0.6, y: 5.0 },
      { x: 1.8, y: 5.0 },
      { x: 1.8, y: 7.5 },
      { x: 0.6, y: 7.5 },
    ];
    expected.forEach((point, i) => {
      expect(slab!.hole![i].x).toBeCloseTo(point.x, 4);
      expect(slab!.hole![i].y).toBeCloseTo(point.y, 4);
    });
    expect(slab!.topY).toBeCloseTo(3.2, 4);
  });

  it("returns undefined when the exterior ring cannot be built", () => {
    const walls: Wall[] = [
      {
        id: "lone",
        storeyId: "x",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        thickness: 0.24,
        height: 3,
        exterior: true,
        materialId: "mat-white-render",
      },
    ];
    const storey: Storey = {
      id: "x",
      label: "X",
      elevation: 0,
      height: 3,
      slabThickness: 0.18,
    };

    const slab = buildSlabGeometry(storey, walls, indexFootprints(walls), DEFAULT_SLAB_MATERIAL);
    expect(slab).toBeUndefined();
  });
});

describe("buildSlabGeometry — terrace via outline override", () => {
  it("uses overrideOutlineWalls when provided (storey N>0 sees N-1's footprint)", () => {
    const lowerWalls: Wall[] = [
      { id: "lw-1", storeyId: "1f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "lw-2", storeyId: "1f", start: { x: 10, y: 0 }, end: { x: 10, y: 8 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "lw-3", storeyId: "1f", start: { x: 10, y: 8 }, end: { x: 0, y: 8 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "lw-4", storeyId: "1f", start: { x: 0, y: 8 }, end: { x: 0, y: 0 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
    ];
    const upperWalls: Wall[] = [
      { id: "uw-1", storeyId: "2f", start: { x: 2, y: 2 }, end: { x: 8, y: 2 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "uw-2", storeyId: "2f", start: { x: 8, y: 2 }, end: { x: 8, y: 6 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "uw-3", storeyId: "2f", start: { x: 8, y: 6 }, end: { x: 2, y: 6 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "uw-4", storeyId: "2f", start: { x: 2, y: 6 }, end: { x: 2, y: 2 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
    ];

    const upperStorey: Storey = { id: "2f", label: "2F", elevation: 3, height: 3, slabThickness: 0.18 };

    const allWalls = [...lowerWalls, ...upperWalls];
    const footprints = new Map();
    for (const fp of buildWallNetwork(lowerWalls)) footprints.set(fp.wallId, fp);
    for (const fp of buildWallNetwork(upperWalls)) footprints.set(fp.wallId, fp);

    const slab = buildSlabGeometry(upperStorey, allWalls, footprints, "mat-gray-stone", undefined, lowerWalls);
    expect(slab).toBeDefined();
    // Outline should be the lower (10x8) ring, not the upper (6x4) ring.
    const xs = slab!.outline.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(8);
  });
});

