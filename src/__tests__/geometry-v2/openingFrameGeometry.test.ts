import { describe, expect, it } from "vitest";
import type { Opening, Wall } from "../../domain/v2/types";
import { buildOpeningFrameStrips } from "../../geometry/v2/openingFrameGeometry";

function makeWall(): Wall {
  return {
    id: "w-front",
    start: { x: 0, y: 0 },
    end: { x: 6, y: 0 },
    thickness: 0.2,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "2f", offset: 0 },
    exterior: true,
    materialId: "mat-wall",
  };
}

function makeOpening(overrides?: Partial<Opening>): Opening {
  return {
    id: "o1",
    wallId: "w-front",
    type: "window",
    offset: 1.5,
    sillHeight: 0.9,
    width: 1.5,
    height: 1.2,
    frameMaterialId: "mat-frame",
    ...overrides,
  };
}

describe("buildOpeningFrameStrips v2", () => {
  it("emits 4 strips around a window opening (top/bottom/left/right)", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), makeWall(), 0);
    expect(strips).toHaveLength(4);
    const roles = strips.map((s) => s.role).sort();
    expect(roles).toEqual(["bottom", "left", "right", "top"]);
  });

  it("emits 0 strips for void openings (structural openings)", () => {
    const strips = buildOpeningFrameStrips(makeOpening({ type: "void" }), makeWall(), 0);
    expect(strips).toHaveLength(0);
  });

  it("emits 4 strips for door openings", () => {
    const strips = buildOpeningFrameStrips(makeOpening({ type: "door" }), makeWall(), 0);
    expect(strips).toHaveLength(4);
  });

  it("uses opening.frameMaterialId for all strips", () => {
    const strips = buildOpeningFrameStrips(
      makeOpening({ frameMaterialId: "mat-walnut" }),
      makeWall(),
      0,
    );
    expect(strips.every((s) => s.materialId === "mat-walnut")).toBe(true);
  });

  it("emits 0 strips for zero-length wall", () => {
    const wall: Wall = { ...makeWall(), end: { x: 0, y: 0 } };
    const strips = buildOpeningFrameStrips(makeOpening(), wall, 0);
    expect(strips).toHaveLength(0);
  });

  it("strip z is wallBottomZ + sillHeight (already-resolved world z)", () => {
    // wall bottom at z=0 → bottom strip z = 0 + 0.9 + FRAME_BAR/2 ≈ 0.93
    const strips = buildOpeningFrameStrips(makeOpening(), makeWall(), 0);
    const bottom = strips.find((s) => s.role === "bottom")!;
    expect(bottom.center.z).toBeCloseTo(0.93, 2);
  });

  it("bakes wallBottomZ into strip z (wall anchored above 0)", () => {
    // wall bottom at z=3.2 → bottom strip z = 3.2 + 0.9 + FRAME_BAR/2 ≈ 4.13
    const strips = buildOpeningFrameStrips(makeOpening(), makeWall(), 3.2);
    const bottom = strips.find((s) => s.role === "bottom")!;
    expect(bottom.center.z).toBeCloseTo(4.13, 2);
  });
});
