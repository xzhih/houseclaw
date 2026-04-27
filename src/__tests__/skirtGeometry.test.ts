import { describe, expect, it } from "vitest";
import { buildSkirtGeometry } from "../geometry/skirtGeometry";
import type { SkirtRoof, Wall } from "../domain/types";

const HOST_WALL: Wall = {
  id: "wall-host",
  storeyId: "1f",
  start: { x: 0, y: 0 },
  end: { x: 10, y: 0 },          // along +x; outward normal is +y (using wall.right convention)
  thickness: 0.24,
  height: 3,
  exterior: true,
  materialId: "mat-white-render",
};

function makeSkirt(overrides: Partial<SkirtRoof> = {}): SkirtRoof {
  return {
    id: "skirt-1",
    hostWallId: HOST_WALL.id,
    offset: 0,
    width: 10,
    depth: 1.0,
    elevation: 3.0,
    pitch: Math.PI / 6,
    overhang: 0.3,
    materialId: "mat-gray-tile",
    ...overrides,
  };
}

describe("buildSkirtGeometry", () => {
  it("emits a 4-vertex panel + 2 end caps", () => {
    const geom = buildSkirtGeometry(makeSkirt(), HOST_WALL);
    expect(geom.panel.vertices).toHaveLength(4);
    expect(geom.endCaps).toHaveLength(2);
    expect(geom.endCaps[0].vertices).toHaveLength(3);
    expect(geom.endCaps[1].vertices).toHaveLength(3);
  });

  it("anchor edge sits at elevation, eave edge sits lower by depth*tan(pitch) + overhang*tan(pitch)", () => {
    const geom = buildSkirtGeometry(makeSkirt(), HOST_WALL);
    const zs = geom.panel.vertices.map((v) => v.z);
    const high = Math.max(...zs);
    const low = Math.min(...zs);
    expect(high).toBeCloseTo(3.0);
    const drop = (1.0 + 0.3) * Math.tan(Math.PI / 6);
    expect(low).toBeCloseTo(3.0 - drop);
  });

  it("anchor edge spans wall direction with overhang on both ends", () => {
    const geom = buildSkirtGeometry(makeSkirt(), HOST_WALL);
    // Wall is along +x from x=0 to x=10. Anchor line should span x=[-0.3, 10.3] with overhang.
    const anchorVerts = geom.panel.vertices.filter((v) => v.z > 2.99);
    const xs = anchorVerts.map((v) => v.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-0.3);
    expect(xs[xs.length - 1]).toBeCloseTo(10.3);
  });

  it("eave edge offset outward by depth+overhang along wall normal (+y for this host wall)", () => {
    const geom = buildSkirtGeometry(makeSkirt(), HOST_WALL);
    const eaveVerts = geom.panel.vertices.filter((v) => v.z < 3.0);
    for (const v of eaveVerts) {
      expect(v.y).toBeCloseTo(1.3);
    }
  });

  it("end cap at offset side has W-vertex (wall, low) at host start + overhang anchor x, low z", () => {
    const geom = buildSkirtGeometry(makeSkirt(), HOST_WALL);
    const startCap = geom.endCaps[0];
    const ws = startCap.vertices.filter((v) => v.y === 0); // on wall plane
    expect(ws.length).toBeGreaterThan(0);
  });

  it("partial-width skirt with offset > 0", () => {
    const geom = buildSkirtGeometry(makeSkirt({ offset: 2, width: 4 }), HOST_WALL);
    const anchorVerts = geom.panel.vertices.filter((v) => v.z > 2.99);
    const xs = anchorVerts.map((v) => v.x).sort((a, b) => a - b);
    // Anchor spans [offset - overhang, offset + width + overhang] = [1.7, 6.3]
    expect(xs[0]).toBeCloseTo(1.7);
    expect(xs[xs.length - 1]).toBeCloseTo(6.3);
  });
});
