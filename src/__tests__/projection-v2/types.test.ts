import { describe, expect, it } from "vitest";
import type {
  ElevationProjectionV2,
  ElevationSide,
  ElevationWallBandV2,
  PlanProjectionV2,
  PlanWallSegmentV2,
  RoofViewEdgeStroke,
  RoofViewPolygon,
  RoofViewProjectionV2,
} from "../../projection/v2/types";

describe("v2 projection types", () => {
  it("compiles with valid object literals", () => {
    const wallSeg: PlanWallSegmentV2 = {
      wallId: "w1",
      start: { x: 0, y: 0 },
      end: { x: 6, y: 0 },
      thickness: 0.2,
    };

    const plan: PlanProjectionV2 = {
      viewId: "plan-1f",
      storeyId: "1f",
      cutZ: 1.2,
      wallSegments: [wallSeg],
      slabOutlines: [],
      openings: [],
      balconies: [],
      stairs: [],
    };

    const wallBand: ElevationWallBandV2 = {
      wallId: "w1",
      x: 0,
      y: 0,
      width: 6,
      height: 3.2,
      depth: 0,
    };

    const side: ElevationSide = "front";
    const elevation: ElevationProjectionV2 = {
      viewId: "elevation-front",
      side,
      wallBands: [wallBand],
      slabLines: [],
      openings: [],
      balconies: [],
      roofPolygons: [],
    };

    const edge: RoofViewEdgeStroke = {
      from: { x: 0, y: 0 },
      to: { x: 6, y: 0 },
      kind: "eave",
    };

    const polygon: RoofViewPolygon = {
      roofId: "r1",
      vertices: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 4 },
        { x: 0, y: 4 },
      ],
      edges: [edge],
      ridgeLines: [],
    };

    const roofView: RoofViewProjectionV2 = {
      viewId: "roof",
      polygons: [polygon],
    };

    expect(plan.cutZ).toBe(1.2);
    expect(elevation.side).toBe("front");
    expect(roofView.polygons).toHaveLength(1);
  });
});
