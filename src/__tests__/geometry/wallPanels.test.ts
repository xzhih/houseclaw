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

describe("buildWallPanels v2", () => {
  it("returns a single full panel when there are no openings", () => {
    const panels = buildWallPanels(makeWall(), [], 3.2);
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({ role: "full", x: 0, y: 0, width: 6, height: 3.2 });
  });

  it("splits around a single opening into 2 gap panels + below + above", () => {
    const panels = buildWallPanels(makeWall(), [makeOpening({ id: "o1" })], 3.2);
    expect(panels).toHaveLength(4);
    const roles = panels.map((p) => p.role).sort();
    expect(roles).toEqual(["above", "below", "left", "right"]);
  });

  it("handles multiple openings with sweep-line splitting", () => {
    const openings: Opening[] = [
      makeOpening({ id: "o1", offset: 0.5, width: 1 }),
      makeOpening({ id: "o2", offset: 3, width: 1.2 }),
    ];
    const panels = buildWallPanels(makeWall(), openings, 3.2);
    expect(panels).toHaveLength(7);
    const gapRoles = panels.filter((p) => ["left", "between", "right"].includes(p.role));
    expect(gapRoles).toHaveLength(3);
  });

  it("uses caller-provided wallHeight, not any field on Wall", () => {
    const panels = buildWallPanels(makeWall(), [], 5.0);
    expect(panels[0].height).toBe(5);
  });
});
