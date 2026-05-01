import { describe, expect, it } from "vitest";
import type { Point2, Wall } from "../../domain/types";
import { buildExteriorRing } from "../../geometry/footprintRing";
import { buildWallNetwork } from "../../geometry/wallNetwork";
import type { FootprintQuad } from "../../geometry/types";

const DEFAULT_THICKNESS = 0.24;
const STOREYS = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

function makeWall(overrides: Partial<Wall> & Pick<Wall, "id" | "start" | "end">): Wall {
  return {
    thickness: DEFAULT_THICKNESS,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "2f", offset: 0 },
    exterior: true,
    materialId: "mat-wall",
    ...overrides,
  };
}

function indexFootprints(walls: Wall[]): Map<string, FootprintQuad> {
  const index = new Map<string, FootprintQuad>();
  for (const fp of buildWallNetwork(walls, STOREYS)) {
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

describe("buildExteriorRing v2", () => {
  it("traces a closed rectangle CCW from exterior corners", () => {
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 6 } }),
      makeWall({ id: "b", start: { x: 10, y: 6 }, end: { x: 0, y: 6 } }),
      makeWall({ id: "l", start: { x: 0, y: 6 }, end: { x: 0, y: 0 } }),
    ];
    const ring = buildExteriorRing(walls, indexFootprints(walls));
    const half = DEFAULT_THICKNESS / 2;
    expect(ring).toBeDefined();
    expectClosePolygon(ring!, [
      { x: -half, y: -half },
      { x: 10 + half, y: -half },
      { x: 10 + half, y: 6 + half },
      { x: -half, y: 6 + half },
    ]);
  });

  it("returns undefined for fewer than 3 exterior walls", () => {
    const walls: Wall[] = [
      makeWall({ id: "a", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } }),
      makeWall({ id: "b", start: { x: 5, y: 0 }, end: { x: 5, y: 5 } }),
    ];
    expect(buildExteriorRing(walls, indexFootprints(walls))).toBeUndefined();
  });

  it("ignores interior walls", () => {
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 6 } }),
      makeWall({ id: "b", start: { x: 10, y: 6 }, end: { x: 0, y: 6 } }),
      makeWall({ id: "l", start: { x: 0, y: 6 }, end: { x: 0, y: 0 } }),
      makeWall({ id: "interior", start: { x: 5, y: 0 }, end: { x: 5, y: 6 }, exterior: false }),
    ];
    const ring = buildExteriorRing(walls, indexFootprints(walls));
    expect(ring).toBeDefined();
    expect(ring!).toHaveLength(4);
  });
});
