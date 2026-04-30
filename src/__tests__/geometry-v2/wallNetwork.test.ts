import { describe, expect, it } from "vitest";
import type { Wall } from "../../domain/v2/types";
import { buildWallNetwork } from "../../geometry/v2/wallNetwork";

const STOREYS = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
  { id: "roof", label: "roof", elevation: 6.4 },
];

function makeWall(overrides: Partial<Wall> & Pick<Wall, "id" | "start" | "end">): Wall {
  return {
    thickness: 0.24,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "2f", offset: 0 },
    exterior: true,
    materialId: "mat-wall",
    ...overrides,
  };
}

describe("buildWallNetwork v2", () => {
  it("emits one footprint per wall with correct corner ordering for a rectangle", () => {
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 6 } }),
      makeWall({ id: "b", start: { x: 10, y: 6 }, end: { x: 0, y: 6 } }),
      makeWall({ id: "l", start: { x: 0, y: 6 }, end: { x: 0, y: 0 } }),
    ];
    const fps = buildWallNetwork(walls, STOREYS);
    expect(fps).toHaveLength(4);
    const front = fps.find((f) => f.wallId === "f")!;
    expect(front.rightStart.x).toBeCloseTo(-0.12, 4);
    expect(front.rightStart.y).toBeCloseTo(-0.12, 4);
    expect(front.rightEnd.x).toBeCloseTo(10.12, 4);
    expect(front.rightEnd.y).toBeCloseTo(-0.12, 4);
  });

  it("falls back to free-end corners when junction walls have non-overlapping z", () => {
    const walls: Wall[] = [
      makeWall({
        id: "a",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        bottom: { kind: "storey", storeyId: "1f", offset: 0 },
        top: { kind: "storey", storeyId: "2f", offset: -0.1 }, // top at 3.1
      }),
      makeWall({
        id: "b",
        start: { x: 10, y: 0 },
        end: { x: 10, y: 6 },
        bottom: { kind: "storey", storeyId: "2f", offset: 0 },
        top: { kind: "storey", storeyId: "roof", offset: 0 },
      }),
    ];
    const fps = buildWallNetwork(walls, STOREYS);
    const a = fps.find((f) => f.wallId === "a")!;
    const b = fps.find((f) => f.wallId === "b")!;
    expect(a.rightEnd.x).toBeCloseTo(10, 4);
    expect(a.rightEnd.y).toBeCloseTo(-0.12, 4);
    expect(b.rightStart.x).toBeCloseTo(10.12, 4);
    expect(b.rightStart.y).toBeCloseTo(0, 4);
  });

  it("miters normally when all junction walls overlap z", () => {
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 6 } }),
    ];
    const fps = buildWallNetwork(walls, STOREYS);
    const front = fps.find((f) => f.wallId === "f")!;
    expect(front.rightEnd.x).toBeCloseTo(10.12, 4);
    expect(front.rightEnd.y).toBeCloseTo(-0.12, 4);
  });
});
