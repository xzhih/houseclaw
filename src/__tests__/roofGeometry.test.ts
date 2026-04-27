import { describe, expect, it } from "vitest";
import { buildRoofGeometry } from "../geometry/roofGeometry";
import type { Roof, Storey, Wall } from "../domain/types";

const TOP: Storey = {
  id: "top",
  label: "TOP",
  elevation: 0,
  height: 3,
  slabThickness: 0.18,
};

// Rectangle 10 x 8, walls in CCW order: front (y=0) → right (x=10) → back (y=8) → left (x=0).
function rectWalls(): Wall[] {
  const base = {
    storeyId: "top",
    thickness: 0.24,
    height: 3,
    exterior: true as const,
    materialId: "mat-wall",
  };
  return [
    { ...base, id: "w-front", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    { ...base, id: "w-right", start: { x: 10, y: 0 }, end: { x: 10, y: 8 } },
    { ...base, id: "w-back", start: { x: 10, y: 8 }, end: { x: 0, y: 8 } },
    { ...base, id: "w-left", start: { x: 0, y: 8 }, end: { x: 0, y: 0 } },
  ];
}

const RECT_RING = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 8 },
  { x: 0, y: 8 },
];

const PITCH = Math.PI / 6; // 30°
const OVERHANG = 0.6;
const WALL_TOP = TOP.elevation + TOP.height;

describe("buildRoofGeometry — shed (1 eave + 3 gables)", () => {
  const roof: Roof = {
    edges: { "w-front": "eave", "w-right": "gable", "w-back": "gable", "w-left": "gable" },
    pitch: PITCH,
    overhang: OVERHANG,
    materialId: "mat-roof",
  };

  it("emits 1 panel and 3 gables", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    expect(geom).toBeDefined();
    expect(geom.panels).toHaveLength(1);
    expect(geom.gables).toHaveLength(3);
  });

  it("the panel rises from front-eave (z = wall-top) to back-gable (z = wall-top + (D + 2*overhang)*tan)", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const panel = geom.panels[0];
    const minZ = Math.min(...panel.vertices.map((v) => v.z));
    const maxZ = Math.max(...panel.vertices.map((v) => v.z));
    const expectedRise = (8 + 2 * OVERHANG) * Math.tan(PITCH);
    expect(minZ).toBeCloseTo(WALL_TOP);
    expect(maxZ).toBeCloseTo(WALL_TOP + expectedRise);
  });

  it("returns undefined when no edge resolves to eave", () => {
    const allGable: Roof = {
      ...roof,
      edges: { "w-front": "gable", "w-right": "gable", "w-back": "gable", "w-left": "gable" },
    };
    expect(buildRoofGeometry(TOP, RECT_RING, rectWalls(), allGable)).toBeUndefined();
  });

  it("returns undefined when walls.length !== 4", () => {
    expect(buildRoofGeometry(TOP, RECT_RING, rectWalls().slice(0, 3), roof)).toBeUndefined();
  });

  it("the side gable triangles have their apex at the high (back) end", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    // gables[0] is opposite (back), full triangle. gables[1..2] are side gables (left, right).
    const sideGables = geom.gables.filter((g) => g.wallId !== "w-back");
    expect(sideGables).toHaveLength(2);
    const expectedRise = (8 + 2 * OVERHANG) * Math.tan(PITCH);
    for (const sg of sideGables) {
      const apex = sg.vertices.reduce((a, b) => (a.z > b.z ? a : b));
      // Apex z should be wall-top + peak rise.
      expect(apex.z).toBeCloseTo(WALL_TOP + expectedRise);
      // Apex's y should be at the back (yMax) of the OUTER rect, i.e. 8 + 0.6 = 8.6.
      expect(apex.y).toBeCloseTo(8 + OVERHANG);
    }
  });
});
