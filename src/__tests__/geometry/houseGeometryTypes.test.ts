import { describe, expect, it } from "vitest";
import type {
  BalconyGeometry,
  FrameStrip,
  HouseGeometry,
  StairBox,
  StairGeometry,
} from "../../geometry/types";

describe("v2 orchestrator types", () => {
  it("compiles with valid object literals", () => {
    const frame: FrameStrip = {
      role: "top",
      center: { x: 0, y: 0, z: 2 },
      size: { alongWall: 1, height: 0.06, depth: 0.04 },
      rotationY: 0,
      materialId: "mat-frame",
    };

    const box: StairBox = { cx: 0, cy: 0, cz: 0, sx: 1, sy: 0.165, sz: 0.27 };
    const stair: StairGeometry = { stairId: "s1", treads: [box], landings: [], materialId: "mat-stair" };

    const balcony: BalconyGeometry = {
      balconyId: "b1",
      attachedWallId: "w1",
      offset: 1,
      width: 2,
      depth: 1,
      slabThickness: 0.15,
      slabTopZ: 3.2,
      railingHeight: 1.1,
      materialId: "mat-wall",
      railingMaterialId: "mat-frame",
    };

    const house: HouseGeometry = {
      walls: [],
      slabs: [],
      roofs: [],
      stairs: [],
      balconies: [],
      openingFrames: [],
    };

    expect(frame.size.alongWall).toBe(1);
    expect(stair.treads[0].sx).toBe(1);
    expect(balcony.slabTopZ).toBe(3.2);
    expect(house.walls).toHaveLength(0);
  });
});
