import { describe, expect, it } from "vitest";
import type { Balcony, Storey } from "../../domain/types";
import { buildBalconyGeometry } from "../../geometry/balconyBuilder";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

function makeBalcony(overrides?: Partial<Balcony>): Balcony {
  return {
    id: "b1",
    attachedWallId: "w-front",
    offset: 1,
    width: 2,
    depth: 1,
    slabTop: { kind: "storey", storeyId: "2f", offset: 0 },
    slabThickness: 0.15,
    railingHeight: 1.1,
    materialId: "mat-wall",
    railingMaterialId: "mat-frame",
    ...overrides,
  };
}

describe("buildBalconyGeometry v2", () => {
  it("resolves slabTopZ from storey anchor", () => {
    const geo = buildBalconyGeometry(makeBalcony(), STOREYS);
    expect(geo.balconyId).toBe("b1");
    expect(geo.slabTopZ).toBe(3.2);
    expect(geo.attachedWallId).toBe("w-front");
  });

  it("propagates all dimensional fields", () => {
    const geo = buildBalconyGeometry(
      makeBalcony({ width: 3.5, depth: 1.2, slabThickness: 0.18, railingHeight: 1.0 }),
      STOREYS,
    );
    expect(geo.width).toBe(3.5);
    expect(geo.depth).toBe(1.2);
    expect(geo.slabThickness).toBe(0.18);
    expect(geo.railingHeight).toBe(1.0);
  });

  it("propagates both materialIds", () => {
    const geo = buildBalconyGeometry(
      makeBalcony({ materialId: "mat-deck", railingMaterialId: "mat-iron" }),
      STOREYS,
    );
    expect(geo.materialId).toBe("mat-deck");
    expect(geo.railingMaterialId).toBe("mat-iron");
  });

  it("supports absolute anchor", () => {
    const geo = buildBalconyGeometry(
      makeBalcony({ slabTop: { kind: "absolute", z: 4.5 } }),
      STOREYS,
    );
    expect(geo.slabTopZ).toBe(4.5);
  });
});
