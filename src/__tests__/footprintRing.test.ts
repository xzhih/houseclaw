import { describe, expect, it } from "vitest";
import type { Point2, Wall } from "../domain/types";
import { buildExteriorRing } from "../geometry/footprintRing";
import { buildWallNetwork, type FootprintQuad } from "../geometry/wallNetwork";

const DEFAULT_THICKNESS = 0.24;
const DEFAULT_HEIGHT = 3;

function makeWall(overrides: Partial<Wall> & Pick<Wall, "id" | "start" | "end">): Wall {
  return {
    storeyId: "1f",
    thickness: DEFAULT_THICKNESS,
    height: DEFAULT_HEIGHT,
    exterior: true,
    materialId: "mat-white-render",
    ...overrides,
  };
}

function indexFootprints(walls: Wall[]): Map<string, FootprintQuad> {
  const index = new Map<string, FootprintQuad>();
  for (const fp of buildWallNetwork(walls)) {
    const { wallId, ...quad } = fp;
    index.set(wallId, quad);
  }
  return index;
}

function expectClosePolygon(actual: Point2[], expected: Point2[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((point, i) => {
    expect(actual[i].x).toBeCloseTo(point.x, 4);
    expect(actual[i].y).toBeCloseTo(point.y, 4);
  });
}

describe("buildExteriorRing", () => {
  it("traces a closed rectangle CCW from exterior corners", () => {
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 8 } }),
      makeWall({ id: "b", start: { x: 10, y: 8 }, end: { x: 0, y: 8 } }),
      makeWall({ id: "l", start: { x: 0, y: 8 }, end: { x: 0, y: 0 } }),
    ];

    const ring = buildExteriorRing(walls, indexFootprints(walls));

    expect(ring).toBeDefined();
    expectClosePolygon(ring!, [
      { x: -0.12, y: -0.12 },
      { x: 10.12, y: -0.12 },
      { x: 10.12, y: 8.12 },
      { x: -0.12, y: 8.12 },
    ]);
  });

  it("traces an L-shape with six exterior corners", () => {
    // L-footprint:  (0,0)→(8,0)→(8,4)→(4,4)→(4,8)→(0,8)→(0,0)
    const walls: Wall[] = [
      makeWall({ id: "a", start: { x: 0, y: 0 }, end: { x: 8, y: 0 } }),
      makeWall({ id: "b", start: { x: 8, y: 0 }, end: { x: 8, y: 4 } }),
      makeWall({ id: "c", start: { x: 8, y: 4 }, end: { x: 4, y: 4 } }),
      makeWall({ id: "d", start: { x: 4, y: 4 }, end: { x: 4, y: 8 } }),
      makeWall({ id: "e", start: { x: 4, y: 8 }, end: { x: 0, y: 8 } }),
      makeWall({ id: "f", start: { x: 0, y: 8 }, end: { x: 0, y: 0 } }),
    ];

    const ring = buildExteriorRing(walls, indexFootprints(walls));

    expect(ring).toBeDefined();
    expect(ring!).toHaveLength(6);
  });

  it("ignores interior walls", () => {
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 8 } }),
      makeWall({ id: "b", start: { x: 10, y: 8 }, end: { x: 0, y: 8 } }),
      makeWall({ id: "l", start: { x: 0, y: 8 }, end: { x: 0, y: 0 } }),
      makeWall({
        id: "interior",
        start: { x: 5, y: 0 },
        end: { x: 5, y: 8 },
        exterior: false,
      }),
    ];

    const ring = buildExteriorRing(walls, indexFootprints(walls));
    expect(ring).toBeDefined();
    expect(ring!).toHaveLength(4);
  });

  it("returns undefined when the exterior walls do not form a closed ring", () => {
    const walls: Wall[] = [
      makeWall({ id: "a", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "b", start: { x: 10, y: 0 }, end: { x: 10, y: 8 } }),
      // missing back and left walls
    ];

    expect(buildExteriorRing(walls, indexFootprints(walls))).toBeUndefined();
  });
});
