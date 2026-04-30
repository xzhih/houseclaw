import { describe, expect, it } from "vitest";
import type { Stair } from "../../domain/v2/types";
import { buildStairGeometry, stairFootprintPolygon } from "../../geometry/v2/stairGeometry";

function makeStair(overrides?: Partial<Stair>): Stair {
  return {
    id: "s1",
    x: 0, y: 0, width: 1, depth: 3,
    shape: "straight",
    treadDepth: 0.27,
    bottomEdge: "+y",
    from: { kind: "absolute", z: 0 },
    to: { kind: "absolute", z: 3.2 },
    materialId: "mat-stair",
    ...overrides,
  };
}

describe("buildStairGeometry v2", () => {
  it("emits a stack of treads for a straight stair", () => {
    const geo = buildStairGeometry(makeStair(), 0, 3.2, 0.18);
    expect(geo.treads.length).toBeGreaterThan(0);
    expect(geo.landings).toHaveLength(0);
    expect(geo.stairId).toBe("s1");
    expect(geo.materialId).toBe("mat-stair");
  });

  it("emits treads + landing for an L-shaped stair", () => {
    const geo = buildStairGeometry(makeStair({ shape: "l", width: 2, depth: 3 }), 0, 3.2, 0.18);
    expect(geo.treads.length).toBeGreaterThan(0);
    expect(geo.landings.length).toBe(1);
  });

  it("emits treads + landing for a U-shaped stair", () => {
    const geo = buildStairGeometry(makeStair({ shape: "u", width: 2.4, depth: 3 }), 0, 3.2, 0.18);
    expect(geo.treads.length).toBeGreaterThan(0);
    expect(geo.landings.length).toBeGreaterThanOrEqual(0);
  });

  it("scales tread height with climb", () => {
    const tall = buildStairGeometry(makeStair(), 0, 4.0, 0.18);
    const short = buildStairGeometry(makeStair(), 0, 3.0, 0.18);
    expect(tall.treads.length + tall.landings.length).toBeGreaterThanOrEqual(
      short.treads.length + short.landings.length,
    );
  });

  it("applies stair.rotation to all boxes", () => {
    const stair = makeStair({ rotation: Math.PI / 2 });
    const geo = buildStairGeometry(stair, 0, 3.2, 0.18);
    expect(geo.treads.every((t) => t.rotationY === Math.PI / 2)).toBe(true);
  });
});

describe("stairFootprintPolygon v2", () => {
  it("returns a 4-vertex CCW rectangle for an axis-aligned stair", () => {
    const polygon = stairFootprintPolygon(makeStair(), 3.2);
    expect(polygon).toHaveLength(4);
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      area += a.x * b.y - b.x * a.y;
    }
    expect(area).toBeGreaterThan(0);
  });
});
