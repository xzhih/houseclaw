import { describe, expect, it } from "vitest";
import type {
  FootprintQuad,
  WallGeometryV2,
  WallPanel,
  WallPanelRole,
  WallSegment,
} from "../../geometry/v2/types";

// Pure type-shape smoke test: assigning a literal to each type asserts the
// schema compiles. Vitest sees no runtime assertions but the file must
// compile without errors via `bun run build`.
describe("v2 geometry types", () => {
  it("compiles with valid object literals", () => {
    const fp: FootprintQuad = {
      rightStart: { x: 0, y: 0 },
      rightEnd: { x: 1, y: 0 },
      leftEnd: { x: 1, y: 0.2 },
      leftStart: { x: 0, y: 0.2 },
    };

    const seg: WallSegment = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, thickness: 0.2 };

    const panel: WallPanel = { role: "full", x: 0, y: 0, width: 1, height: 3 };
    const role: WallPanelRole = "between";

    const wg: WallGeometryV2 = {
      wallId: "w1",
      start: { x: 0, y: 0 },
      end: { x: 6, y: 0 },
      thickness: 0.2,
      bottomZ: 0,
      topZ: 3.2,
      materialId: "mat-wall",
      panels: [panel],
      footprint: fp,
    };

    expect(fp.rightStart.x).toBe(0);
    expect(seg.thickness).toBe(0.2);
    expect(role).toBe("between");
    expect(wg.bottomZ).toBe(0);
  });
});
