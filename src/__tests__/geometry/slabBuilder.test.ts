import { describe, expect, it } from "vitest";
import type { Slab, Storey } from "../../domain/types";
import { buildSlabGeometry } from "../../geometry/slabBuilder";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

function makeSlab(overrides?: Partial<Slab>): Slab {
  return {
    id: "slab-1",
    polygon: [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 0, y: 4 },
    ],
    top: { kind: "storey", storeyId: "1f", offset: 0 },
    thickness: 0.15,
    materialId: "mat-slab",
    ...overrides,
  };
}

describe("buildSlabGeometry v2", () => {
  it("resolves topZ from anchor and copies polygon as outline", () => {
    const geo = buildSlabGeometry(makeSlab(), STOREYS);
    expect(geo.slabId).toBe("slab-1");
    expect(geo.topZ).toBe(0);
    expect(geo.thickness).toBe(0.15);
    expect(geo.outline).toEqual([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 0, y: 4 },
    ]);
    expect(geo.holes).toEqual([]);
  });

  it("resolves storey-anchored top to elevation + offset", () => {
    const geo = buildSlabGeometry(
      makeSlab({ top: { kind: "storey", storeyId: "2f", offset: 0.05 } }),
      STOREYS,
    );
    expect(geo.topZ).toBeCloseTo(3.25);
  });

  it("supports absolute anchor", () => {
    const geo = buildSlabGeometry(
      makeSlab({ top: { kind: "absolute", z: 1.5 } }),
      STOREYS,
    );
    expect(geo.topZ).toBe(1.5);
  });

  it("copies holes when present (each as its own array)", () => {
    const slab = makeSlab({
      holes: [
        [
          { x: 1, y: 1 },
          { x: 1, y: 2 },
          { x: 2, y: 2 },
          { x: 2, y: 1 },
        ],
      ],
    });
    const geo = buildSlabGeometry(slab, STOREYS);
    expect(geo.holes).toHaveLength(1);
    expect(geo.holes[0]).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
    ]);
  });

  it("clones polygon points so mutating output does not affect input", () => {
    const slab = makeSlab();
    const geo = buildSlabGeometry(slab, STOREYS);
    geo.outline[0].x = 999;
    expect(slab.polygon[0].x).toBe(0);
  });

  it("propagates edgeMaterialId when present", () => {
    const slab = makeSlab({ edgeMaterialId: "mat-edge" });
    const geo = buildSlabGeometry(slab, STOREYS);
    expect(geo.edgeMaterialId).toBe("mat-edge");
  });
});
