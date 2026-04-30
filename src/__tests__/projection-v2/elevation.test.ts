import { describe, expect, it } from "vitest";
import { createValidV2Project } from "../../domain/v2/fixtures";
import { projectElevationV2 } from "../../projection/v2/elevation";

describe("projectElevationV2", () => {
  it("returns viewId + side", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    expect(view.viewId).toBe("elevation-front");
    expect(view.side).toBe("front");
  });

  it("front view includes only horizontal exterior walls", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    expect(view.wallBands).toHaveLength(2);
    const wallIds = view.wallBands.map((b) => b.wallId).sort();
    expect(wallIds).toEqual(["w-back", "w-front"]);
  });

  it("left view includes only vertical exterior walls", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "left");
    expect(view.wallBands).toHaveLength(2);
    const wallIds = view.wallBands.map((b) => b.wallId).sort();
    expect(wallIds).toEqual(["w-left", "w-right"]);
  });

  it("wall band x and width come from projected wall extent", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    const front = view.wallBands.find((b) => b.wallId === "w-front")!;
    expect(front.width).toBeCloseTo(6, 4);
    expect(front.x).toBeCloseTo(0, 4);
  });

  it("wall band y and height come from anchor-resolved bottomZ/topZ", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    const front = view.wallBands.find((b) => b.wallId === "w-front")!;
    expect(front.y).toBe(0);
    expect(front.height).toBeCloseTo(3.2, 4);
  });

  it("front-side wall has lower depth than back-side wall (closer = smaller depth)", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    const front = view.wallBands.find((b) => b.wallId === "w-front")!;
    const back = view.wallBands.find((b) => b.wallId === "w-back")!;
    expect(front.depth).toBeLessThan(back.depth);
  });

  it("excludes interior walls", () => {
    const project = createValidV2Project();
    project.walls.push({
      id: "w-interior",
      start: { x: 3, y: 0 },
      end: { x: 3, y: 4 },
      thickness: 0.1,
      bottom: { kind: "storey", storeyId: "1f", offset: 0 },
      top: { kind: "storey", storeyId: "2f", offset: 0 },
      exterior: false,
      materialId: "mat-wall",
    });
    const view = projectElevationV2(project, "left");
    expect(view.wallBands.find((b) => b.wallId === "w-interior")).toBeUndefined();
  });

  it("emits a slab line per slab at z = top.resolved", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    expect(view.slabLines).toHaveLength(1);
    expect(view.slabLines[0].slabId).toBe("slab-1f");
    expect(view.slabLines[0].start.y).toBe(0);
  });

  it("emits opening rects with anchor-resolved y from wall.bottom + sillHeight", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    expect(view.openings).toHaveLength(1);
    const opening = view.openings[0];
    expect(opening.y).toBeCloseTo(0.9);
    expect(opening.height).toBeCloseTo(1.2);
  });

  it("emits roof polygons (panels + gables) with depth tags", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    expect(view.roofPolygons.length).toBeGreaterThan(0);
    const panels = view.roofPolygons.filter((p) => p.kind === "panel");
    const gables = view.roofPolygons.filter((p) => p.kind === "gable");
    expect(panels.length).toBeGreaterThan(0);
    expect(gables.length).toBeGreaterThan(0);
  });

  it("supports tall walls spanning multiple storeys (anchor-resolved height)", () => {
    const project = createValidV2Project();
    project.walls[0].top = { kind: "absolute", z: 6.4 };
    const view = projectElevationV2(project, "front");
    const tall = view.wallBands.find((b) => b.wallId === project.walls[0].id)!;
    expect(tall.height).toBeCloseTo(6.4, 4);
  });
});
