import { describe, expect, it } from "vitest";
import type { Opening, Storey, Wall } from "../../domain/types";
import { buildWallGeometry } from "../../geometry/wallBuilder";
import { buildWallNetwork } from "../../geometry/wallNetwork";
import type { FootprintQuad } from "../../geometry/types";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

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

function indexFootprints(walls: Wall[]): Map<string, FootprintQuad> {
  const index = new Map<string, FootprintQuad>();
  for (const fp of buildWallNetwork(walls, STOREYS)) {
    const { wallId, ...quad } = fp;
    index.set(wallId, quad);
  }
  return index;
}

describe("buildWallGeometry v2", () => {
  it("emits resolved bottomZ/topZ from anchors", () => {
    const wall = makeWall();
    const geo = buildWallGeometry(wall, [], STOREYS, indexFootprints([wall]));
    expect(geo.bottomZ).toBe(0);
    expect(geo.topZ).toBe(3.2);
    expect(geo.wallId).toBe("w-front");
    expect(geo.thickness).toBe(0.2);
    expect(geo.materialId).toBe("mat-wall");
  });

  it("emits panels using resolved height (no openings → single full panel)", () => {
    const wall = makeWall();
    const geo = buildWallGeometry(wall, [], STOREYS, indexFootprints([wall]));
    expect(geo.panels).toHaveLength(1);
    expect(geo.panels[0]).toMatchObject({ role: "full", height: 3.2, width: 6 });
  });

  it("splits panels around an opening", () => {
    const wall = makeWall();
    const opening: Opening = {
      id: "o1",
      wallId: "w-front",
      type: "window",
      offset: 2,
      sillHeight: 0.9,
      width: 1.5,
      height: 1.2,
      frameMaterialId: "mat-frame",
    };
    const geo = buildWallGeometry(wall, [opening], STOREYS, indexFootprints([wall]));
    expect(geo.panels).toHaveLength(4);
  });

  it("supports tall double-height walls via top anchor at higher storey", () => {
    const wall: Wall = {
      ...makeWall(),
      top: { kind: "absolute", z: 6.4 },
    };
    const geo = buildWallGeometry(wall, [], STOREYS, indexFootprints([wall]));
    expect(geo.bottomZ).toBe(0);
    expect(geo.topZ).toBe(6.4);
    expect(geo.panels[0].height).toBe(6.4);
  });

  it("clones start/end so callers can't mutate input", () => {
    const wall = makeWall();
    const geo = buildWallGeometry(wall, [], STOREYS, indexFootprints([wall]));
    geo.start.x = 999;
    expect(wall.start.x).toBe(0);
  });

  it("falls back to a degenerate footprint when wallId not in index", () => {
    const wall = makeWall();
    const emptyIndex = new Map<string, FootprintQuad>();
    const geo = buildWallGeometry(wall, [], STOREYS, emptyIndex);
    expect(geo.footprint.rightStart).toEqual({ x: 0, y: 0 });
    expect(geo.footprint.leftStart).toEqual({ x: 0, y: 0 });
  });
});
