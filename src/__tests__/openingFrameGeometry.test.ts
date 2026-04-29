import { describe, expect, it } from "vitest";
import { buildOpeningFrameStrips } from "../geometry/openingFrameGeometry";
import type { Opening, Wall } from "../domain/types";

const HOST_WALL: Wall = {
  id: "w-host",
  storeyId: "1f",
  start: { x: 0, y: 0 },
  end: { x: 10, y: 0 },        // along +x; outward normal -y (right side)
  thickness: 0.24,
  height: 3.2,
  exterior: true,
  materialId: "mat-white-render",
};

function makeOpening(overrides: Partial<Opening> = {}): Opening {
  return {
    id: "o1",
    wallId: HOST_WALL.id,
    type: "window",
    offset: 2.0,
    sillHeight: 0.6,
    width: 2.0,
    height: 1.8,
    frameMaterialId: "mat-dark-frame",
    ...overrides,
  };
}

describe("buildOpeningFrameStrips", () => {
  it("emits exactly 4 strips per opening (top/bottom/left/right)", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    expect(strips).toHaveLength(4);
    const roles = strips.map((s) => s.role).sort();
    expect(roles).toEqual(["bottom", "left", "right", "top"]);
  });

  it("all strips carry the opening frame material id", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    for (const s of strips) expect(s.materialId).toBe("mat-dark-frame");
  });

  it("bottom strip sits at sillHeight (in z)", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    const bottom = strips.find((s) => s.role === "bottom")!;
    // bottom strip is 0.06m tall, centered at sillHeight + 0.03
    expect(bottom.center.z).toBeCloseTo(0.6 + 0.03, 5);
  });

  it("top strip sits at sillHeight + height - 0.06/2 (in z)", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    const top = strips.find((s) => s.role === "top")!;
    // top strip 0.06m tall, centered at sillHeight + height - 0.03
    expect(top.center.z).toBeCloseTo(0.6 + 1.8 - 0.03, 5);
  });

  it("left/right strips span opening height in z and 0.06m in width", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    const left = strips.find((s) => s.role === "left")!;
    const right = strips.find((s) => s.role === "right")!;
    expect(left.size.height).toBeCloseTo(1.8, 5);
    expect(right.size.height).toBeCloseTo(1.8, 5);
    expect(left.size.alongWall).toBeCloseTo(0.06, 5);
    expect(right.size.alongWall).toBeCloseTo(0.06, 5);
  });

  it("strips are positioned on the wall's outer face (n̂ = -y for this wall)", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    // wall midline at y=0, thickness 0.24 → outer face y = -0.12
    // frame protrudes outward by half-depth (0.04 / 2 = 0.02)
    // expect every strip center.y ≈ -0.12 - 0.02 = -0.14
    for (const s of strips) expect(s.center.y).toBeCloseTo(-0.14, 5);
  });

  it("rotationY is consistent across strips for a given wall direction", () => {
    const stripsX = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    expect(stripsX[0].rotationY).toBeCloseTo(0, 5);

    const wallY: Wall = { ...HOST_WALL, start: { x: 5, y: 0 }, end: { x: 5, y: 8 } };
    const stripsY = buildOpeningFrameStrips(makeOpening({ offset: 1, width: 1.5 }), wallY);
    const rots = stripsY.map((s) => s.rotationY);
    expect(rots.every((r) => Math.abs(r - rots[0]) < 1e-9)).toBe(true);
  });

  it("returns no strips for void openings", () => {
    const strips = buildOpeningFrameStrips(makeOpening({ type: "void" }), HOST_WALL);
    expect(strips).toEqual([]);
  });
});
