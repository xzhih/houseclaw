import { describe, expect, it } from "vitest";
import type { Opening, Wall } from "../../domain/types";
import { buildWallPanels } from "../../geometry/wallPanels";

function makeWall(): Wall {
  return {
    id: "w",
    start: { x: 0, y: 0 },
    end: { x: 6, y: 0 },
    thickness: 0.2,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "2f", offset: 0 },
    exterior: true,
    materialId: "mat-wall",
  };
}

function makeOpening(overrides: Partial<Opening> & Pick<Opening, "id">): Opening {
  return {
    wallId: "w",
    type: "window",
    offset: 1,
    sillHeight: 0.9,
    width: 1.5,
    height: 1.2,
    frameMaterialId: "mat-frame",
    ...overrides,
  };
}

/** Sum of areas of all panels — equals wall area minus total opening area. */
function totalArea(panels: { width: number; height: number }[]): number {
  return panels.reduce((s, p) => s + p.width * p.height, 0);
}

describe("buildWallPanels", () => {
  it("returns a single full panel when there are no openings", () => {
    const panels = buildWallPanels(makeWall(), [], 3.2);
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({ role: "full", x: 0, y: 0, width: 6, height: 3.2 });
  });

  it("a single opening preserves wall_area − opening_area", () => {
    const panels = buildWallPanels(makeWall(), [makeOpening({ id: "o1" })], 3.2);
    expect(totalArea(panels)).toBeCloseTo(6 * 3.2 - 1.5 * 1.2, 4);
  });

  it("stacked openings at same x leave both holes (regression: showcase 3 楼窗)", () => {
    const wallH = 6.0;
    const openings: Opening[] = [
      makeOpening({ id: "low", offset: 2, width: 1, sillHeight: 0.9, height: 1.4 }),
      makeOpening({ id: "high", offset: 2, width: 1, sillHeight: 4.0, height: 1.4 }),
    ];
    const panels = buildWallPanels(makeWall(), openings, wallH);
    expect(totalArea(panels)).toBeCloseTo(6 * wallH - 2 * (1 * 1.4), 4);
    for (const p of panels) {
      const intersects = (oy: number, oh: number) =>
        p.x < 3 - 1e-6 &&
        p.x + p.width > 2 + 1e-6 &&
        p.y < oy + oh - 1e-6 &&
        p.y + p.height > oy + 1e-6;
      expect(intersects(0.9, 1.4)).toBe(false);
      expect(intersects(4.0, 1.4)).toBe(false);
    }
  });

  it("multiple openings at different x-ranges preserve total area", () => {
    const openings: Opening[] = [
      makeOpening({ id: "o1", offset: 0.5, width: 1 }),
      makeOpening({ id: "o2", offset: 3, width: 1.2 }),
    ];
    const panels = buildWallPanels(makeWall(), openings, 3.2);
    expect(totalArea(panels)).toBeCloseTo(6 * 3.2 - (1 * 1.2 + 1.2 * 1.2), 4);
  });

  it("uses caller-provided wallHeight, not any field on Wall", () => {
    const panels = buildWallPanels(makeWall(), [], 5.0);
    expect(panels[0].height).toBe(5);
  });
});
