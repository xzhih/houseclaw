import { describe, expect, it } from "vitest";
import type { Roof, RoofEdgeKind, Storey } from "../../domain/types";
import { buildRoofGeometry } from "../../geometry/roofGeometry";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

function makeRoof(edges: RoofEdgeKind[], overrides?: Partial<Roof>): Roof {
  return {
    id: "roof-1",
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 },
    ],
    base: { kind: "storey", storeyId: "2f", offset: 0 },
    edges,
    pitch: Math.PI / 6, // 30°
    overhang: 0.5,
    materialId: "mat-roof",
    ...overrides,
  };
}

describe("buildRoofGeometry v2 — shed (1 eave + 3 gables)", () => {
  it("emits 1 panel and 3 gables", () => {
    const roof = makeRoof(["eave", "gable", "gable", "gable"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    expect(geo!.roofId).toBe("roof-1");
    expect(geo!.panels).toHaveLength(1);
    expect(geo!.gables).toHaveLength(3);
  });

  it("returns undefined when no edge resolves to eave", () => {
    const roof = makeRoof(["gable", "gable", "gable", "gable"]);
    expect(buildRoofGeometry(roof, STOREYS)).toBeUndefined();
  });

  it("returns undefined when polygon is not 4 vertices", () => {
    const roof: Roof = {
      ...makeRoof(["eave", "gable", "gable"]),
      polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 6 }],
    };
    expect(buildRoofGeometry(roof, STOREYS)).toBeUndefined();
  });

  it("uses roof.materialId for both panels and gables", () => {
    const roof = makeRoof(["eave", "gable", "gable", "gable"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo!.panels.every((p) => p.materialId === "mat-roof")).toBe(true);
    expect(geo!.gables.every((g) => g.materialId === "mat-roof")).toBe(true);
  });
});

describe("buildRoofGeometry v2 — gable (2 opposite eaves)", () => {
  it("emits 2 panels and 2 gables", () => {
    const roof = makeRoof(["eave", "gable", "eave", "gable"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    expect(geo!.panels).toHaveLength(2);
    expect(geo!.gables).toHaveLength(2);
  });
});

describe("buildRoofGeometry v2 — hip (4 eaves)", () => {
  it("emits 4 panels and 0 gables", () => {
    const roof = makeRoof(["eave", "eave", "eave", "eave"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    expect(geo!.panels).toHaveLength(4);
    expect(geo!.gables).toHaveLength(0);
  });
});

describe("buildRoofGeometry v2 — half-hip (3 eaves + 1 gable)", () => {
  it("emits 3 panels and 1 gable", () => {
    const roof = makeRoof(["eave", "eave", "gable", "eave"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    expect(geo!.panels).toHaveLength(3);
    expect(geo!.gables).toHaveLength(1);
  });
});

describe("buildRoofGeometry v2 — corner slope (2 adjacent eaves)", () => {
  it("emits 2 panels and 2 gables", () => {
    const roof = makeRoof(["eave", "eave", "gable", "gable"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    expect(geo!.panels).toHaveLength(2);
    expect(geo!.gables).toHaveLength(2);
  });
});

describe("buildRoofGeometry v2 — hip edge as gable (P2B simplification)", () => {
  it("treats 'hip' as 'gable' for now", () => {
    const eaveGable = buildRoofGeometry(makeRoof(["eave", "gable", "gable", "gable"]), STOREYS)!;
    const eaveHip = buildRoofGeometry(makeRoof(["eave", "hip", "hip", "hip"]), STOREYS)!;
    expect(eaveHip.panels).toHaveLength(eaveGable.panels.length);
    expect(eaveHip.gables).toHaveLength(eaveGable.gables.length);
  });
});

describe("buildRoofGeometry v2 — base anchor resolution", () => {
  it("resolves base anchor to wallTopZ", () => {
    const roof = makeRoof(["eave", "gable", "eave", "gable"], {
      base: { kind: "absolute", z: 5.0 },
    });
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    const lowZ = Math.min(...geo!.panels.flatMap((p) => p.vertices.map((v) => v.z)));
    expect(lowZ).toBeCloseTo(5.0);
  });
});
