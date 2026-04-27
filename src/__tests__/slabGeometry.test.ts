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

  it("includes the explicit customHole as a rectangular hole when supplied", () => {
    // Under the new ownership rule, a storey's slab hole is determined by the
    // stair on the storey BELOW (the stair climbing up through this slab).
    // buildHouseGeometry computes that and passes it in as `customHole`; the
    // unit itself just trusts the explicit hole.
    const walls = makeRectangleWalls("2f");
    const storey: Storey = {
      id: "2f",
      label: "2F",
      elevation: 3.2,
      height: 3.2,
      slabThickness: 0.18,
    };
    const customHole = [
      { x: 0.6, y: 5.0 },
      { x: 1.8, y: 5.0 },
      { x: 1.8, y: 7.5 },
      { x: 0.6, y: 7.5 },
    ];

    const slab = buildSlabGeometry(
      storey,
      walls,
      indexFootprints(walls),
      DEFAULT_SLAB_MATERIAL,
      customHole,
    );

    expect(slab).toBeDefined();
    expect(slab!.hole).toBeDefined();
    expect(slab!.hole).toHaveLength(4);
    customHole.forEach((point, i) => {
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

