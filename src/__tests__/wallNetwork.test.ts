import { describe, expect, it } from "vitest";
import type { Point2, Wall } from "../domain/types";
import {
  buildWallNetwork,
  slicePanelFootprint,
  type WallFootprint,
} from "../geometry/wallNetwork";

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

function expectPoint(actual: Point2, expected: Point2) {
  expect(actual.x).toBeCloseTo(expected.x, 4);
  expect(actual.y).toBeCloseTo(expected.y, 4);
}

function getFootprint(footprints: WallFootprint[], wallId: string): WallFootprint {
  const found = footprints.find((entry) => entry.wallId === wallId);
  if (!found) throw new Error(`No footprint produced for wall ${wallId}`);
  return found;
}

describe("buildWallNetwork", () => {
  it("caps a free-standing wall with a square end on both sides", () => {
    const wall = makeWall({ id: "solo", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });

    const [footprint] = buildWallNetwork([wall]);

    // direction (1,0); right normal (0,-1); left normal (0,1); half-thickness 0.12
    expectPoint(footprint.rightStart, { x: 0, y: -0.12 });
    expectPoint(footprint.leftStart, { x: 0, y: 0.12 });
    expectPoint(footprint.rightEnd, { x: 10, y: -0.12 });
    expectPoint(footprint.leftEnd, { x: 10, y: 0.12 });
  });

  it("miters an L-corner so adjacent walls share their corner points", () => {
    // Wall A along +x, Wall B along +y, both starting at origin
    const a = makeWall({ id: "a", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    const b = makeWall({ id: "b", start: { x: 0, y: 0 }, end: { x: 0, y: 8 } });

    const footprints = buildWallNetwork([a, b]);
    const fa = getFootprint(footprints, "a");
    const fb = getFootprint(footprints, "b");

    // Inner corner (interior of the L) is shared between a.leftStart and b.rightStart.
    expectPoint(fa.leftStart, { x: 0.12, y: 0.12 });
    expectPoint(fb.rightStart, { x: 0.12, y: 0.12 });

    // Outer corner (exterior of the L) is shared between a.rightStart and b.leftStart.
    expectPoint(fa.rightStart, { x: -0.12, y: -0.12 });
    expectPoint(fb.leftStart, { x: -0.12, y: -0.12 });

    // Far ends remain square-capped because they have no adjacent wall.
    expectPoint(fa.rightEnd, { x: 10, y: -0.12 });
    expectPoint(fa.leftEnd, { x: 10, y: 0.12 });
    expectPoint(fb.rightEnd, { x: 0.12, y: 8 });
    expectPoint(fb.leftEnd, { x: -0.12, y: 8 });
  });

  it("miters all four corners of a closed rectangle (sample-project layout)", () => {
    const front = makeWall({ id: "front", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    const right = makeWall({ id: "right", start: { x: 10, y: 0 }, end: { x: 10, y: 8 } });
    const back = makeWall({ id: "back", start: { x: 10, y: 8 }, end: { x: 0, y: 8 } });
    const left = makeWall({ id: "left", start: { x: 0, y: 8 }, end: { x: 0, y: 0 } });

    const footprints = buildWallNetwork([front, right, back, left]);
    const f = getFootprint(footprints, "front");
    const r = getFootprint(footprints, "right");
    const ba = getFootprint(footprints, "back");
    const l = getFootprint(footprints, "left");

    // Exterior rectangle: x in [-0.12, 10.12], y in [-0.12, 8.12]
    // Interior rectangle: x in [0.12, 9.88], y in [0.12, 7.88]

    // Front wall (direction +x): right=exterior(y<0), left=interior(y>0)
    expectPoint(f.rightStart, { x: -0.12, y: -0.12 });
    expectPoint(f.rightEnd, { x: 10.12, y: -0.12 });
    expectPoint(f.leftStart, { x: 0.12, y: 0.12 });
    expectPoint(f.leftEnd, { x: 9.88, y: 0.12 });

    // Right wall (direction +y): right=exterior(x>10), left=interior(x<10)
    expectPoint(r.rightStart, { x: 10.12, y: -0.12 });
    expectPoint(r.rightEnd, { x: 10.12, y: 8.12 });
    expectPoint(r.leftStart, { x: 9.88, y: 0.12 });
    expectPoint(r.leftEnd, { x: 9.88, y: 7.88 });

    // Back wall (direction -x): right=exterior(y>8), left=interior(y<8)
    expectPoint(ba.rightStart, { x: 10.12, y: 8.12 });
    expectPoint(ba.rightEnd, { x: -0.12, y: 8.12 });
    expectPoint(ba.leftStart, { x: 9.88, y: 7.88 });
    expectPoint(ba.leftEnd, { x: 0.12, y: 7.88 });

    // Left wall (direction -y): right=exterior(x<0), left=interior(x>0)
    expectPoint(l.rightStart, { x: -0.12, y: 8.12 });
    expectPoint(l.rightEnd, { x: -0.12, y: -0.12 });
    expectPoint(l.leftStart, { x: 0.12, y: 7.88 });
    expectPoint(l.leftEnd, { x: 0.12, y: 0.12 });
  });

  it("resolves a T-junction so the perpendicular wall sits flush against the spine", () => {
    // Spine split into two collinear walls so all junctions are endpoint-based.
    const spineLeft = makeWall({ id: "spine-l", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } });
    const spineRight = makeWall({ id: "spine-r", start: { x: 5, y: 0 }, end: { x: 10, y: 0 } });
    const stem = makeWall({ id: "stem", start: { x: 5, y: 0 }, end: { x: 5, y: 5 } });

    const footprints = buildWallNetwork([spineLeft, spineRight, stem]);
    const sl = getFootprint(footprints, "spine-l");
    const sr = getFootprint(footprints, "spine-r");
    const st = getFootprint(footprints, "stem");

    // Spine bottom edge is continuous across the junction (no kink on exterior side).
    expectPoint(sl.rightEnd, { x: 5, y: -0.12 });
    expectPoint(sr.rightStart, { x: 5, y: -0.12 });

    // Spine top edge is interrupted by the stem; each side has its own miter against the stem.
    expectPoint(sl.leftEnd, { x: 4.88, y: 0.12 });
    expectPoint(sr.leftStart, { x: 5.12, y: 0.12 });

    // Stem's foot meets the spine's interior face.
    expectPoint(st.leftStart, { x: 4.88, y: 0.12 });
    expectPoint(st.rightStart, { x: 5.12, y: 0.12 });
  });

  it("miters walls of different thicknesses correctly", () => {
    const a = makeWall({
      id: "a",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      thickness: 0.4,
    });
    const b = makeWall({
      id: "b",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 8 },
      thickness: 0.24,
    });

    const footprints = buildWallNetwork([a, b]);
    const fa = getFootprint(footprints, "a");
    const fb = getFootprint(footprints, "b");

    // Inner corner: a.leftStart is offset by a/2=0.2 in y; b.rightStart by b/2=0.12 in x.
    expectPoint(fa.leftStart, { x: 0.12, y: 0.2 });
    expectPoint(fb.rightStart, { x: 0.12, y: 0.2 });

    // Outer corner: extended outward by each wall's own half-thickness.
    expectPoint(fa.rightStart, { x: -0.12, y: -0.2 });
    expectPoint(fb.leftStart, { x: -0.12, y: -0.2 });
  });

  it("produces no kink when two collinear walls continue in the same direction", () => {
    const a = makeWall({ id: "a", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } });
    const b = makeWall({ id: "b", start: { x: 5, y: 0 }, end: { x: 10, y: 0 } });

    const footprints = buildWallNetwork([a, b]);
    const fa = getFootprint(footprints, "a");
    const fb = getFootprint(footprints, "b");

    // Endpoints meet exactly on both sides — no overlap, no gap.
    expectPoint(fa.leftEnd, { x: 5, y: 0.12 });
    expectPoint(fb.leftStart, { x: 5, y: 0.12 });
    expectPoint(fa.rightEnd, { x: 5, y: -0.12 });
    expectPoint(fb.rightStart, { x: 5, y: -0.12 });
  });

  it("treats endpoints within tolerance as the same junction", () => {
    // b's start is 1mm off from a's start; should still miter as a clean L-corner.
    const a = makeWall({ id: "a", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    const b = makeWall({ id: "b", start: { x: 0.001, y: 0 }, end: { x: 0, y: 8 } });

    const footprints = buildWallNetwork([a, b], { tolerance: 0.005 });
    const fa = getFootprint(footprints, "a");
    const fb = getFootprint(footprints, "b");

    // Should have produced a miter, not a square cap. Inner corner is shared.
    expectPoint(fa.leftStart, { x: 0.12, y: 0.12 });
    expectPoint(fb.rightStart, { x: 0.12, y: 0.12 });
  });
});

describe("slicePanelFootprint", () => {
  const miteredFootprint: WallFootprint = {
    wallId: "front",
    rightStart: { x: -0.12, y: -0.12 },
    rightEnd: { x: 10.12, y: -0.12 },
    leftStart: { x: 0.12, y: 0.12 },
    leftEnd: { x: 9.88, y: 0.12 },
  };
  const wallSegment = {
    start: { x: 0, y: 0 } as Point2,
    end: { x: 10, y: 0 } as Point2,
    thickness: 0.24,
  };

  it("returns the full footprint when slicing the whole wall", () => {
    const slice = slicePanelFootprint(miteredFootprint, wallSegment, {
      x: 0,
      width: 10,
    });

    expectPoint(slice.rightStart, { x: -0.12, y: -0.12 });
    expectPoint(slice.rightEnd, { x: 10.12, y: -0.12 });
    expectPoint(slice.leftStart, { x: 0.12, y: 0.12 });
    expectPoint(slice.leftEnd, { x: 9.88, y: 0.12 });
  });

  it("uses the mitered start corner and a perpendicular interior end", () => {
    // 'left' role panel: starts at wall start, ends before an opening at 3m.
    const slice = slicePanelFootprint(miteredFootprint, wallSegment, {
      x: 0,
      width: 3,
    });

    expectPoint(slice.rightStart, { x: -0.12, y: -0.12 });
    expectPoint(slice.leftStart, { x: 0.12, y: 0.12 });
    // Interior end: centerline at x=3, plus thickness/2 perpendicular.
    expectPoint(slice.rightEnd, { x: 3, y: -0.12 });
    expectPoint(slice.leftEnd, { x: 3, y: 0.12 });
  });

  it("uses perpendicular interior corners on both sides for a mid-wall panel", () => {
    // 'between' panel between two openings: ends at 5m–6.4m.
    const slice = slicePanelFootprint(miteredFootprint, wallSegment, {
      x: 5,
      width: 1.4,
    });

    expectPoint(slice.rightStart, { x: 5, y: -0.12 });
    expectPoint(slice.rightEnd, { x: 6.4, y: -0.12 });
    expectPoint(slice.leftStart, { x: 5, y: 0.12 });
    expectPoint(slice.leftEnd, { x: 6.4, y: 0.12 });
  });

  it("uses the mitered end corner and a perpendicular interior start", () => {
    // 'right' role panel: starts after the last opening, ends at wall end.
    const slice = slicePanelFootprint(miteredFootprint, wallSegment, {
      x: 7,
      width: 3,
    });

    expectPoint(slice.rightStart, { x: 7, y: -0.12 });
    expectPoint(slice.leftStart, { x: 7, y: 0.12 });
    expectPoint(slice.rightEnd, { x: 10.12, y: -0.12 });
    expectPoint(slice.leftEnd, { x: 9.88, y: 0.12 });
  });
});
