import { describe, expect, it } from "vitest";
import { isPolygonCCW, isPolygonSimple, signedArea } from "../../domain/polygon";
import type { Point2 } from "../../domain/types";

const SQUARE_CCW: Point2[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

const SQUARE_CW: Point2[] = [...SQUARE_CCW].reverse();

describe("signedArea", () => {
  it("is positive for CCW polygons", () => {
    expect(signedArea(SQUARE_CCW)).toBeCloseTo(16);
  });

  it("is negative for CW polygons", () => {
    expect(signedArea(SQUARE_CW)).toBeCloseTo(-16);
  });
});

describe("isPolygonCCW", () => {
  it("returns true for CCW square", () => {
    expect(isPolygonCCW(SQUARE_CCW)).toBe(true);
  });

  it("returns false for CW square", () => {
    expect(isPolygonCCW(SQUARE_CW)).toBe(false);
  });
});

describe("isPolygonSimple", () => {
  it("returns true for a non-self-intersecting square", () => {
    expect(isPolygonSimple(SQUARE_CCW)).toBe(true);
  });

  it("returns true for an L-shape", () => {
    const L: Point2[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(isPolygonSimple(L)).toBe(true);
  });

  it("returns false for a self-intersecting bowtie", () => {
    const BOWTIE: Point2[] = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ];
    expect(isPolygonSimple(BOWTIE)).toBe(false);
  });

  it("returns false for a polygon with fewer than 3 vertices", () => {
    expect(isPolygonSimple([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(false);
  });
});
