import { describe, expect, it } from "vitest";
import type {
  RoofGable,
  RoofGeometryV2,
  RoofPanel,
  SlabGeometryV2,
} from "../../geometry/v2/types";

describe("v2 slab + roof output types", () => {
  it("compiles with valid object literals", () => {
    const slab: SlabGeometryV2 = {
      slabId: "s1",
      outline: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 4 },
        { x: 0, y: 4 },
      ],
      holes: [],
      topZ: 0,
      thickness: 0.15,
      materialId: "mat-slab",
    };

    const panel: RoofPanel = {
      vertices: [
        { x: 0, y: 0, z: 3.2 },
        { x: 6, y: 0, z: 3.2 },
        { x: 3, y: 2, z: 5 },
      ],
      materialId: "mat-roof",
    };

    const gable: RoofGable = {
      vertices: [
        { x: 0, y: 0, z: 3.2 },
        { x: 6, y: 0, z: 3.2 },
        { x: 3, y: 0, z: 5 },
      ],
      materialId: "mat-roof",
    };

    const roof: RoofGeometryV2 = {
      roofId: "r1",
      panels: [panel],
      gables: [gable],
    };

    expect(slab.outline).toHaveLength(4);
    expect(panel.vertices).toHaveLength(3);
    expect(gable.vertices).toHaveLength(3);
    expect(roof.panels).toHaveLength(1);
  });
});
