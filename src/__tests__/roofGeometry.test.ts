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

describe("buildRoofGeometry — gable (2 opposite eaves)", () => {
  const roof: Roof = {
    edges: { "w-front": "eave", "w-back": "eave", "w-left": "gable", "w-right": "gable" },
    pitch: PITCH,
    overhang: OVERHANG,
    materialId: "mat-roof",
  };

  it("emits 2 panels and 2 gables", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    expect(geom.panels).toHaveLength(2);
    expect(geom.gables).toHaveLength(2);
  });

  it("ridge sits at half-depth height = ((D + 2*overhang) / 2) * tan(pitch)", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const ridgeZ = Math.max(...geom.panels.flatMap((p) => p.vertices.map((v) => v.z)));
    const expected = WALL_TOP + ((8 + 2 * OVERHANG) / 2) * Math.tan(PITCH);
    expect(ridgeZ).toBeCloseTo(expected);
  });
});

describe("buildRoofGeometry — hip (4 eaves)", () => {
  const roof: Roof = {
    edges: { "w-front": "eave", "w-back": "eave", "w-left": "eave", "w-right": "eave" },
    pitch: PITCH,
    overhang: OVERHANG,
    materialId: "mat-roof",
  };

  it("emits 4 panels and 0 gables", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    expect(geom.panels).toHaveLength(4);
    expect(geom.gables).toHaveLength(0);
  });

  it("ridge height = (min(W, D) / 2) * tan(pitch) above wall top", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const ridgeZ = Math.max(...geom.panels.flatMap((p) => p.vertices.map((v) => v.z)));
    // Outer rect is (10+2*0.6) x (8+2*0.6) = 11.2 x 9.2; min half = 4.6.
    const expected = WALL_TOP + 4.6 * Math.tan(PITCH);
    expect(ridgeZ).toBeCloseTo(expected);
  });
});

/** Shoelace signed area in plan (x,y). Positive = CCW from above. */
function signedAreaXY(pts: { x: number; y: number; z: number }[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    sum += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return sum / 2;
}

describe("buildRoofGeometry — half-hip (3 eaves + 1 gable)", () => {
  const roofGableLeft: Roof = {
    edges: { "w-front": "eave", "w-right": "eave", "w-back": "eave", "w-left": "gable" },
    pitch: PITCH,
    overhang: OVERHANG,
    materialId: "mat-roof",
  };
  const roofGableRight: Roof = {
    edges: { "w-front": "eave", "w-left": "eave", "w-back": "eave", "w-right": "gable" },
    pitch: PITCH,
    overhang: OVERHANG,
    materialId: "mat-roof",
  };

  it("emits 3 panels and 1 gable", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roofGableLeft)!;
    expect(geom.panels).toHaveLength(3);
    expect(geom.gables).toHaveLength(1);
  });

  it("ridge sits at half-depth (along the eave-eave-axis) of the rectangle", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roofGableLeft)!;
    const ridgeZ = Math.max(...geom.panels.flatMap((p) => p.vertices.map((v) => v.z)));
    // Outer y dimension = 8 + 2*0.6 = 9.2 → half = 4.6.
    const expected = WALL_TOP + 4.6 * Math.tan(PITCH);
    expect(ridgeZ).toBeCloseTo(expected);
  });

  it("all trapezoid panels have positive (CCW) signed area in plan — gable left", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roofGableLeft)!;
    // The two side-eave panels are 4-vertex (trapezoids); the hip panel is 3-vertex.
    for (const panel of geom.panels) {
      if (panel.vertices.length === 4) {
        expect(signedAreaXY(panel.vertices)).toBeGreaterThan(0);
      }
    }
  });

  it("all trapezoid panels have positive (CCW) signed area in plan — gable right", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roofGableRight)!;
    for (const panel of geom.panels) {
      if (panel.vertices.length === 4) {
        expect(signedAreaXY(panel.vertices)).toBeGreaterThan(0);
      }
    }
  });
});

/** Cross product of two 3D vectors. */
function cross3(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): { x: number; y: number; z: number } {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/** Outward direction from a polygon = (v1-v0) × (v2-v0). */
function outwardNormal(verts: { x: number; y: number; z: number }[]): { x: number; y: number; z: number } {
  const v0 = verts[0], v1 = verts[1], v2 = verts[2];
  return cross3(
    { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z },
    { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z },
  );
}

describe("buildRoofGeometry — gable winding (CCW from outside)", () => {
  it("back gable in shed-with-front-eave configuration faces outward (+y)", () => {
    const roof: Roof = {
      edges: { "w-front": "eave", "w-right": "gable", "w-back": "gable", "w-left": "gable" },
      pitch: PITCH,
      overhang: OVERHANG,
      materialId: "mat-roof",
    };
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const back = geom.gables.find((g) => g.wallId === "w-back")!;
    const n = outwardNormal(back.vertices);
    // Outward of back wall is +y in plan space.
    expect(n.y).toBeGreaterThan(0);
  });

  it("back gable in gable2opp-with-vertical-eaves faces outward (+y)", () => {
    const roof: Roof = {
      edges: { "w-front": "gable", "w-right": "eave", "w-back": "gable", "w-left": "eave" },
      pitch: PITCH,
      overhang: OVERHANG,
      materialId: "mat-roof",
    };
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const back = geom.gables.find((g) => g.wallId === "w-back")!;
    const n = outwardNormal(back.vertices);
    expect(n.y).toBeGreaterThan(0);
  });

  it("right gable in shed-with-front-eave faces outward (+x)", () => {
    const roof: Roof = {
      edges: { "w-front": "eave", "w-right": "gable", "w-back": "gable", "w-left": "gable" },
      pitch: PITCH,
      overhang: OVERHANG,
      materialId: "mat-roof",
    };
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const right = geom.gables.find((g) => g.wallId === "w-right")!;
    const n = outwardNormal(right.vertices);
    expect(n.x).toBeGreaterThan(0);
  });
});

describe("buildRoofGeometry — corner slope (2 adjacent eaves)", () => {
  const roof: Roof = {
    edges: { "w-front": "eave", "w-right": "eave", "w-back": "gable", "w-left": "gable" },
    pitch: PITCH,
    overhang: OVERHANG,
    materialId: "mat-roof",
  };

  it("emits 2 panels and 2 gables", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    expect(geom.panels).toHaveLength(2);
    expect(geom.gables).toHaveLength(2);
  });

  it("highest point sits at the corner of the two gables (apex)", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const apexZ = Math.max(...geom.panels.flatMap((p) => p.vertices.map((v) => v.z)));
    // Apex = the back-left outer corner; rises by min(W, D) of the slope coming
    // from each adjacent eave. With pitches equal, it's whichever eave's plane
    // wins at that corner. Outer rect 11.2 x 9.2; the SE-eaves push the BL
    // corner up by (W) along front-eave and (D) along right-eave; min wins.
    // For (front+right) eaves and BL corner = (xMin, yMax): front plane
    // height = (yMax - yMin) * tan = 9.2 * tan; right plane = (xMax - xMin)
    // * tan = 11.2 * tan; min = 9.2 * tan ≈ 5.31m.
    const expected = WALL_TOP + 9.2 * Math.tan(PITCH);
    expect(apexZ).toBeCloseTo(expected);
  });

  it("front eave is a trapezoid (4 verts) and right eave is a triangle (3 verts)", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const front = geom.panels.find((p) =>
      p.vertices.some((v) => v.y < -0.5) && p.vertices.some((v) => v.y > 8.5),
    );
    const right = geom.panels.find((p) =>
      p.vertices.every((v) => v.x > 0 || Math.abs(v.x - 1.4) < 0.01),
    );
    // The wide-span panel (front) is the trapezoid; the short-span panel (right) is the triangle.
    expect(front?.vertices.length).toBe(4);
    expect(right?.vertices.length).toBe(3);
  });

  it("all panels have positive (CCW) signed area in plan", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    for (const panel of geom.panels) {
      expect(signedAreaXY(panel.vertices)).toBeGreaterThan(0);
    }
  });

  it("the back gable has the knee at hipExit (4 verts when W != D)", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const backGable = geom.gables.find((g) => g.wallId === "w-back")!;
    expect(backGable.vertices).toHaveLength(4);
    // The knee should be at (1.4, 8.6, peak).
    const peak = WALL_TOP + 9.2 * Math.tan(PITCH);
    const knee = backGable.vertices.find((v) =>
      Math.abs(v.x - 1.4) < 0.01 && Math.abs(v.y - 8.6) < 0.01,
    );
    expect(knee).toBeDefined();
    expect(knee!.z).toBeCloseTo(peak);
  });
});
