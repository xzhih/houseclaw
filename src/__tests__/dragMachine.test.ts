import { describe, expect, it } from "vitest";
import { applyDrag, selectionOnClick, type DragContext } from "../components/canvas/dragMachine";
import type { DragState } from "../components/canvas/dragState";
import type { PointMapping } from "../components/canvas/types";
import type { HouseProject } from "../domain/types";
import { projectPlanView } from "../projection/plan";

const MAPPING: PointMapping = {
  project: (p) => p,
  unproject: (p) => p,
  scale: 1,
};

function fixture(): HouseProject {
  return {
    schemaVersion: 1,
    id: "p",
    name: "fx",
    unitSystem: "metric",
    defaultWallThickness: 0.2,
    defaultStoreyHeight: 3,
    mode: "2d",
    activeView: "plan-1f",
    activeTool: "select",
    storeys: [
      { id: "1f", label: "1F", elevation: 0, height: 3, slabThickness: 0.2 },
    ],
    materials: [
      { id: "m-wall", name: "墙", color: "#fff", kind: "wall" },
      { id: "m-frame", name: "frame", color: "#ccc", kind: "frame" },
      { id: "m-rail", name: "rail", color: "#888", kind: "railing" },
    ],
    walls: [
      // 4x3 rectangular room (4 exterior walls)
      { id: "w-s", storeyId: "1f", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, thickness: 0.2, height: 3, exterior: true, materialId: "m-wall" },
      { id: "w-e", storeyId: "1f", start: { x: 4, y: 0 }, end: { x: 4, y: 3 }, thickness: 0.2, height: 3, exterior: true, materialId: "m-wall" },
      { id: "w-n", storeyId: "1f", start: { x: 4, y: 3 }, end: { x: 0, y: 3 }, thickness: 0.2, height: 3, exterior: true, materialId: "m-wall" },
      { id: "w-w", storeyId: "1f", start: { x: 0, y: 3 }, end: { x: 0, y: 0 }, thickness: 0.2, height: 3, exterior: true, materialId: "m-wall" },
    ],
    openings: [
      { id: "o1", wallId: "w-s", type: "window", offset: 1.0, sillHeight: 1.0, width: 1.0, height: 1.2, frameMaterialId: "m-frame" },
    ],
    balconies: [
      { id: "b1", storeyId: "1f", attachedWallId: "w-s", offset: 0.5, width: 1.5, depth: 1.0, slabThickness: 0.15, railingHeight: 1.0, materialId: "m-wall", railingMaterialId: "m-rail" },
    ],
    skirts: [],
  };
}

function projectWithStair(): HouseProject {
  const p = fixture();
  return {
    ...p,
    storeys: [
      {
        ...p.storeys[0],
        stair: {
          x: 1, y: 1, width: 1.5, depth: 1, shape: "straight",
          treadDepth: 0.25, bottomEdge: "+y", materialId: "m-wall", rotation: 0,
        },
      },
      { id: "2f", label: "2F", elevation: 3.2, height: 3, slabThickness: 0.2 },
    ],
  };
}

function ctxFor(project: HouseProject): DragContext {
  const planProjection = projectPlanView(project, "1f");
  return {
    project,
    planProjection,
    otherWallSegmentsExclude: (exclude) =>
      project.walls
        .filter((w) => w.storeyId === "1f" && w.id !== exclude)
        .map((w) => ({ start: w.start, end: w.end })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// wall-translate
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag wall-translate", () => {
  function dragWall(currentWorld: { x: number; y: number }, startWorld = { x: 2, y: 0 }) {
    const project = fixture();
    const state: DragState = {
      kind: "wall-translate",
      pointerId: 1,
      startWorld,
      moved: true,
      mapping: MAPPING,
      wallId: "w-s",
      origStart: { x: 0, y: 0 },
      origEnd: { x: 4, y: 0 },
    };
    return { out: applyDrag(state, currentWorld, ctxFor(project)), project };
  }

  it("snaps to grid when no nearby endpoint", () => {
    const { out } = dragWall({ x: 2.07, y: 0.43 });
    expect(out).not.toBeNull();
    expect(out!.activeSnap).toBeNull();
    const wall = out!.project.walls.find((w) => w.id === "w-s")!;
    // dx=0.07 → snap 0.1; dy=0.43 → snap 0.4
    expect(wall.start.x).toBeCloseTo(0.1, 5);
    expect(wall.start.y).toBeCloseTo(0.4, 5);
    expect(wall.end.x).toBeCloseTo(4.1, 5);
    expect(wall.end.y).toBeCloseTo(0.4, 5);
    expect(out!.dragReadout).toEqual({ kind: "wall-translate", dx: 0.1, dy: 0.4 });
  });

  it("snaps start to other-wall endpoint when within threshold", () => {
    // dx=0, dy=2.95 → candStart=(0,2.95), distance from (0,3)=0.05 < 0.2 threshold
    const { out } = dragWall({ x: 2, y: 2.95 });
    expect(out).not.toBeNull();
    expect(out!.activeSnap).toEqual({ x: 0, y: 3 });
    const wall = out!.project.walls.find((w) => w.id === "w-s")!;
    expect(wall.start).toEqual({ x: 0, y: 3 });
  });

  it("returns outcome with activeSnap=null when no snap nearby", () => {
    // dx=dy=0.5 → candStart=(0.5,0.5), candEnd=(4.5,0.5) — both >0.2 from any other-wall endpoint.
    const { out } = dragWall({ x: 2.5, y: 0.5 }, { x: 2, y: 0 });
    expect(out).not.toBeNull();
    expect(out!.activeSnap).toBeNull();
  });

  it("guideMatches always empty (wall-translate doesn't compute guides)", () => {
    const { out } = dragWall({ x: 2.07, y: 0.43 });
    expect(out!.guideMatches).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// wall-endpoint
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag wall-endpoint", () => {
  it("snaps to other-wall endpoint when within threshold", () => {
    const project = fixture();
    const state: DragState = {
      kind: "wall-endpoint",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      wallId: "w-s",
      endpoint: "start",
      origPoint: { x: 0, y: 0 },
      fixedPoint: { x: 4, y: 0 },
    };
    // Drag start to near (0,3) — w-w endpoint
    const out = applyDrag(state, { x: 0.05, y: 2.95 }, ctxFor(project));
    expect(out).not.toBeNull();
    expect(out!.activeSnap).toEqual({ x: 0, y: 3 });
    const wall = out!.project.walls.find((w) => w.id === "w-s")!;
    expect(wall.start).toEqual({ x: 0, y: 3 });
  });

  it("falls back when no endpoint snap (snap=null, mutation applied)", () => {
    const project = fixture();
    const state: DragState = {
      kind: "wall-endpoint",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      wallId: "w-s",
      endpoint: "start",
      origPoint: { x: 0, y: 0 },
      fixedPoint: { x: 4, y: 0 },
    };
    // Drag to a point far from any anchor / endpoint.
    const out = applyDrag(state, { x: 1.55, y: 1.45 }, ctxFor(project));
    expect(out).not.toBeNull();
    expect(out!.activeSnap).toBeNull();
    // The mutation was applied — wall.start moved off origin.
    const wall = out!.project.walls.find((w) => w.id === "w-s")!;
    expect(wall.start).not.toEqual({ x: 0, y: 0 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// opening drag
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag opening drag", () => {
  function dragOpening(currentWorld: { x: number; y: number }) {
    const project = fixture();
    const state: DragState = {
      kind: "opening",
      pointerId: 1,
      startWorld: { x: 1.5, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 4, y: 0 },
      origOffset: 1.0,
      openingWidth: 1.0,
    };
    return { out: applyDrag(state, currentWorld, ctxFor(project)), project };
  }

  it("rounds offset to grid along wall axis", () => {
    const { out } = dragOpening({ x: 1.57, y: 0 });
    expect(out).not.toBeNull();
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    // dx=0.07; offsetDelta = 0.07 (wall along +x); origOffset+0.07=1.07 → grid 1.1
    expect(op.offset).toBeCloseTo(1.1, 5);
    expect(out!.dragReadout).toEqual({ kind: "opening", offset: 1.1 });
  });

  it("clamps offset to <= wallLen - openingWidth", () => {
    const { out } = dragOpening({ x: 100, y: 0 });
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    // wallLen=4, openingWidth=1, max offset=3
    expect(op.offset).toBe(3.0);
  });

  it("clamps offset >= 0", () => {
    const { out } = dragOpening({ x: -100, y: 0 });
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    expect(op.offset).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// balcony drag
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag balcony drag", () => {
  function dragBalcony(currentWorld: { x: number; y: number }) {
    // Use a fixture without overlapping opening so we can drag freely.
    const project: HouseProject = {
      ...fixture(),
      openings: [],
    };
    const state: DragState = {
      kind: "balcony",
      pointerId: 1,
      startWorld: { x: 1, y: 0 },
      moved: true,
      mapping: MAPPING,
      balconyId: "b1",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 4, y: 0 },
      origOffset: 0.5,
      balconyWidth: 1.5,
    };
    return { out: applyDrag(state, currentWorld, ctxFor(project)), project };
  }

  it("rounds offset to grid", () => {
    const { out } = dragBalcony({ x: 1.07, y: 0 });
    expect(out).not.toBeNull();
    const b = out!.project.balconies.find((b) => b.id === "b1")!;
    // dx=0.07 → newOffset=0.57 → grid 0.6
    expect(b.offset).toBeCloseTo(0.6, 5);
    expect(out!.dragReadout).toEqual({ kind: "balcony", offset: 0.6 });
  });

  it("clamps offset to <= wallLen - balconyWidth", () => {
    const { out } = dragBalcony({ x: 100, y: 0 });
    const b = out!.project.balconies.find((b) => b.id === "b1")!;
    expect(b.offset).toBe(2.5); // 4 - 1.5
  });

  it("clamps offset >= 0", () => {
    const { out } = dragBalcony({ x: -100, y: 0 });
    const b = out!.project.balconies.find((b) => b.id === "b1")!;
    expect(b.offset).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// plan-opening-resize
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag plan-opening-resize", () => {
  function resizeOpening(edge: "l" | "r", currentWorld: { x: number; y: number }) {
    const project = fixture();
    const state: DragState = {
      kind: "plan-opening-resize",
      pointerId: 1,
      startWorld: { x: 1.5, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      edge,
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 4, y: 0 },
      origOffset: 1.0,
      origWidth: 1.0,
      wallLen: 4,
    };
    return applyDrag(state, currentWorld, ctxFor(project));
  }

  it("right edge grows width", () => {
    // Use a fixture with no balcony to avoid potential opening-overlap concerns.
    const project: HouseProject = { ...fixture(), balconies: [] };
    const state: DragState = {
      kind: "plan-opening-resize",
      pointerId: 1,
      startWorld: { x: 2.0, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      edge: "r",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 4, y: 0 },
      origOffset: 1.0,
      origWidth: 1.0,
      wallLen: 4,
    };
    const out = applyDrag(state, { x: 2.35, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    // along=0.35; newWidth=1+0.35=1.35 → grid 1.4
    expect(op.width).toBeCloseTo(1.4, 5);
  });

  it("returns null when overshoot drops newWidth below minSize=0.05", () => {
    // Place opening near wall end, then push offset+width past wallLen so the
    // wallLen-clamp drives newWidth under minSize.
    const project = fixture();
    const state: DragState = {
      kind: "plan-opening-resize",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      edge: "r",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 4, y: 0 },
      origOffset: 3.97,
      origWidth: 0.1,
      wallLen: 4,
    };
    // along=0 → newWidth=max(0.05, 0.1)=0.1; newOffset+newWidth=4.07>4
    // → newWidth = 4 - 3.97 = 0.03 < 0.05 → null.
    const out = applyDrag(state, { x: 0, y: 0 }, ctxFor(project));
    expect(out).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// plan-balcony-resize
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag plan-balcony-resize", () => {
  it("right edge grows width", () => {
    const project: HouseProject = { ...fixture(), openings: [] };
    const state: DragState = {
      kind: "plan-balcony-resize",
      pointerId: 1,
      startWorld: { x: 2.0, y: 0 },
      moved: true,
      mapping: MAPPING,
      balconyId: "b1",
      edge: "r",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 4, y: 0 },
      origOffset: 0.5,
      origWidth: 1.5,
      wallLen: 4,
    };
    const out = applyDrag(state, { x: 2.35, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    const b = out!.project.balconies.find((b) => b.id === "b1")!;
    // along=0.35; newWidth=1.5+0.35=1.85 → grid 1.9
    expect(b.width).toBeCloseTo(1.9, 5);
  });

  it("returns null when overshoot drops newWidth below minSize=0.3", () => {
    // Place balcony near wall end so the wallLen-clamp drives newWidth under minSize.
    const project: HouseProject = { ...fixture(), openings: [] };
    const state: DragState = {
      kind: "plan-balcony-resize",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      balconyId: "b1",
      edge: "r",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 4, y: 0 },
      origOffset: 3.8,
      origWidth: 0.3,
      wallLen: 4,
    };
    // along=0 → newWidth=max(0.3, 0.3)=0.3; newOffset+newWidth=4.1>4
    // → newWidth=4-3.8=0.2 < 0.3 → null.
    const out = applyDrag(state, { x: 0, y: 0 }, ctxFor(project));
    expect(out).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// elev-opening-move
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag elev-opening-move", () => {
  it("clamps offset and rounds to grid", () => {
    const project = fixture();
    const state: DragState = {
      kind: "elev-opening-move",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      origOffset: 1.0,
      origSill: 1.0,
      width: 1.0,
      height: 1.2,
      wallLen: 4,
      storeyHeight: 3,
      projSign: 1,
    };
    const out = applyDrag(state, { x: 0.55, y: 0.27 }, ctxFor(project));
    expect(out).not.toBeNull();
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    expect(op.offset).toBeCloseTo(1.6, 5); // 1+0.55 → 1.55 → grid 1.6
    expect(op.sillHeight).toBeCloseTo(1.3, 5);
  });

  it("respects projSign=-1 mirror (back/left elevations)", () => {
    const project = fixture();
    const state: DragState = {
      kind: "elev-opening-move",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      origOffset: 1.0,
      origSill: 1.0,
      width: 1.0,
      height: 1.2,
      wallLen: 4,
      storeyHeight: 3,
      projSign: -1,
    };
    const out = applyDrag(state, { x: 0.6, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    // dxOffset=0.6*(-1)=-0.6 → newOffset=1-0.6=0.4 (already on grid)
    // sign would have produced 1.6 if projSign were +1 — different value confirms mirror.
    expect(op.offset).toBeCloseTo(0.4, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// elev-opening-resize
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag elev-opening-resize", () => {
  it("returns null when overshoot drops newWidth below minSize=0.05", () => {
    const project = fixture();
    const state: DragState = {
      kind: "elev-opening-resize",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      corner: "tr",
      origOffset: 3.97,
      origSill: 1.0,
      origWidth: 0.1,
      origHeight: 1.2,
      wallLen: 4,
      storeyHeight: 3,
      projSign: 1,
    };
    // dx=0 → newWidth=max(0.05, 0.1)=0.1; newOffset=3.97; 3.97+0.1=4.07>4
    // → newWidth=4-3.97=0.03 < 0.05 → null.
    const out = applyDrag(state, { x: 0, y: 0 }, ctxFor(project));
    expect(out).toBeNull();
  });

  it("grows width and height for tr corner", () => {
    const project = fixture();
    const state: DragState = {
      kind: "elev-opening-resize",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      corner: "tr",
      origOffset: 1.0,
      origSill: 1.0,
      origWidth: 1.0,
      origHeight: 1.2,
      wallLen: 4,
      storeyHeight: 3,
      projSign: 1,
    };
    // dx=0.27 → newWidth=1.27 → grid 1.3
    // dy=0.21 → newHeight=1.41 → grid 1.4
    const out = applyDrag(state, { x: 0.27, y: 0.21 }, ctxFor(project));
    expect(out).not.toBeNull();
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    expect(op.width).toBeCloseTo(1.3, 5);
    expect(op.height).toBeCloseTo(1.4, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// elev-balcony-move
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag elev-balcony-move", () => {
  it("clamps offset and rounds to grid; projSign=1", () => {
    const project: HouseProject = { ...fixture(), openings: [] };
    const state: DragState = {
      kind: "elev-balcony-move",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      balconyId: "b1",
      origOffset: 0.5,
      width: 1.5,
      wallLen: 4,
      projSign: 1,
    };
    const out = applyDrag(state, { x: 0.27, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    const b = out!.project.balconies.find((b) => b.id === "b1")!;
    // dxOffset=0.27 → newOffset=0.77 → grid 0.8
    expect(b.offset).toBeCloseTo(0.8, 5);
    expect(out!.dragReadout).toEqual({ kind: "elev-balcony-move", offset: 0.8 });
  });

  it("respects projSign=-1 mirror", () => {
    const project: HouseProject = { ...fixture(), openings: [] };
    const state: DragState = {
      kind: "elev-balcony-move",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      balconyId: "b1",
      origOffset: 0.5,
      width: 1.5,
      wallLen: 4,
      projSign: -1,
    };
    // dx=0.27 * -1 = -0.27 → 0.5 - 0.27 = 0.23 → grid 0.2
    const out = applyDrag(state, { x: 0.27, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    const b = out!.project.balconies.find((b) => b.id === "b1")!;
    expect(b.offset).toBeCloseTo(0.2, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// elev-balcony-resize
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag elev-balcony-resize", () => {
  it("right edge grows width", () => {
    const project: HouseProject = { ...fixture(), openings: [] };
    const state: DragState = {
      kind: "elev-balcony-resize",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      balconyId: "b1",
      edge: "r",
      origOffset: 0.5,
      origWidth: 1.5,
      wallLen: 4,
      projSign: 1,
    };
    // dxOffset=0.35 → newWidth=1.5+0.35=1.85 → grid 1.9
    const out = applyDrag(state, { x: 0.35, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    const b = out!.project.balconies.find((b) => b.id === "b1")!;
    expect(b.width).toBeCloseTo(1.9, 5);
  });

  it("returns null when newWidth < minSize=0.3", () => {
    const project: HouseProject = { ...fixture(), openings: [] };
    // Place balcony so origOffset+origWidth > wallLen via origOffset=3.85, origWidth=0.3 (sum=4.15>4).
    // Wall-end clamp recomputes newWidth = wallLen - origOffset = 0.15 < minSize=0.3 → null.
    const state: DragState = {
      kind: "elev-balcony-resize",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      balconyId: "b1",
      edge: "r",
      origOffset: 3.85,
      origWidth: 0.3,
      wallLen: 4,
      projSign: 1,
    };
    const out = applyDrag(state, { x: 0, y: 0 }, ctxFor(project));
    expect(out).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// stair-translate / stair-resize / stair-rotate
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag stair-translate", () => {
  it("snaps x/y to grid", () => {
    const project = projectWithStair();
    const state: DragState = {
      kind: "stair-translate",
      pointerId: 1,
      startWorld: { x: 1.7, y: 1.5 },
      moved: true,
      mapping: MAPPING,
      storeyId: "1f",
      origX: 1,
      origY: 1,
    };
    const out = applyDrag(state, { x: 1.77, y: 1.63 }, ctxFor(project));
    expect(out).not.toBeNull();
    const stair = out!.project.storeys[0].stair!;
    // dx=0.07 → 0.1; dy=0.13 → 0.1; newX=1+0.1=1.1, newY=1+0.1=1.1
    expect(stair.x).toBeCloseTo(1.1, 5);
    expect(stair.y).toBeCloseTo(1.1, 5);
  });
});

describe("applyDrag stair-rotate", () => {
  it("updates rotation; result wraps to (-π, π]", () => {
    const project = projectWithStair();
    const center = { x: 1.75, y: 1.5 };
    const state: DragState = {
      kind: "stair-rotate",
      pointerId: 1,
      startWorld: { x: center.x + 1, y: center.y },
      moved: true,
      mapping: MAPPING,
      storeyId: "1f",
      center,
      initialMouseAngle: 0,
      origRotation: 0,
    };
    // Mouse at (center.x, center.y+1) — angle = π/2
    const out = applyDrag(state, { x: center.x, y: center.y + 1 }, ctxFor(project));
    expect(out).not.toBeNull();
    const stair = out!.project.storeys[0].stair!;
    expect(stair.rotation).toBeCloseTo(Math.PI / 2, 5);
  });
});

describe("applyDrag stair-resize", () => {
  it("happy path: tr corner produces non-null with stair dimensions changed", () => {
    const project = projectWithStair();
    const state: DragState = {
      kind: "stair-resize",
      pointerId: 1,
      startWorld: { x: 2.5, y: 2 },
      moved: true,
      mapping: MAPPING,
      storeyId: "1f",
      corner: "tr",
      // worldAnchor = opposite corner in world coords (bottom-left for tr)
      worldAnchor: { x: 1, y: 1 },
      origRotation: 0,
    };
    // Move mouse to (2.7, 2.2) so newWidth=1.7, newDepth=1.2
    const out = applyDrag(state, { x: 2.7, y: 2.2 }, ctxFor(project));
    expect(out).not.toBeNull();
    const stair = out!.project.storeys[0].stair!;
    expect(stair.width).toBeCloseTo(1.7, 3);
    expect(stair.depth).toBeCloseTo(1.2, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// elev-storey-translate
// ─────────────────────────────────────────────────────────────────────────────

describe("applyDrag elev-storey-translate", () => {
  it("front side: dx maps to world dx with grid snap", () => {
    const project = fixture();
    const state: DragState = {
      kind: "elev-storey-translate",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      storeyId: "1f",
      side: "front",
      origProject: project,
    };
    const out = applyDrag(state, { x: 0.55, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    expect(out!.dragReadout).toEqual({ kind: "elev-storey-translate", dy: 0.6 });
    // Verify w-s wall start.x changed by 0.6
    const wallS = out!.project.walls.find((w) => w.id === "w-s")!;
    expect(wallS.start.x).toBeCloseTo(0.6, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// selectionOnClick
// ─────────────────────────────────────────────────────────────────────────────

describe("selectionOnClick", () => {
  function makeState<K extends DragState["kind"]>(kind: K, payload: object): DragState {
    return {
      kind,
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: false,
      mapping: MAPPING,
      ...payload,
    } as DragState;
  }

  it.each([
    [
      "wall-translate",
      { wallId: "w-s", origStart: { x: 0, y: 0 }, origEnd: { x: 4, y: 0 } },
      { kind: "wall", id: "w-s" },
    ],
    [
      "opening",
      {
        openingId: "o1",
        wallStart: { x: 0, y: 0 },
        wallEnd: { x: 4, y: 0 },
        origOffset: 1,
        openingWidth: 1,
      },
      { kind: "opening", id: "o1" },
    ],
    [
      "elev-opening-move",
      {
        openingId: "o1",
        origOffset: 1,
        origSill: 1,
        width: 1,
        height: 1,
        wallLen: 4,
        storeyHeight: 3,
        projSign: 1,
      },
      { kind: "opening", id: "o1" },
    ],
    [
      "balcony",
      {
        balconyId: "b1",
        wallStart: { x: 0, y: 0 },
        wallEnd: { x: 4, y: 0 },
        origOffset: 0.5,
        balconyWidth: 1.5,
      },
      { kind: "balcony", id: "b1" },
    ],
    [
      "elev-balcony-move",
      {
        balconyId: "b1",
        origOffset: 0.5,
        width: 1.5,
        wallLen: 4,
        projSign: 1,
      },
      { kind: "balcony", id: "b1" },
    ],
    ["stair-translate", { storeyId: "1f", origX: 0, origY: 0 }, { kind: "stair", id: "1f" }],
    [
      "elev-storey-translate",
      { storeyId: "1f", side: "front", origProject: fixture() },
      { kind: "storey", id: "1f" },
    ],
  ] as const)("kind=%s -> selection matches", (kind, payload, expected) => {
    expect(selectionOnClick(makeState(kind as DragState["kind"], payload))).toEqual(expected);
  });

  it.each([
    [
      "wall-endpoint",
      {
        wallId: "w-s",
        endpoint: "start",
        origPoint: { x: 0, y: 0 },
        fixedPoint: { x: 4, y: 0 },
      },
    ],
    [
      "plan-opening-resize",
      {
        openingId: "o1",
        edge: "r",
        wallStart: { x: 0, y: 0 },
        wallEnd: { x: 4, y: 0 },
        origOffset: 1,
        origWidth: 1,
        wallLen: 4,
      },
    ],
    [
      "plan-balcony-resize",
      {
        balconyId: "b1",
        edge: "r",
        wallStart: { x: 0, y: 0 },
        wallEnd: { x: 4, y: 0 },
        origOffset: 0.5,
        origWidth: 1.5,
        wallLen: 4,
      },
    ],
    [
      "stair-resize",
      { storeyId: "1f", corner: "tr", worldAnchor: { x: 0, y: 0 }, origRotation: 0 },
    ],
    [
      "stair-rotate",
      { storeyId: "1f", center: { x: 0, y: 0 }, initialMouseAngle: 0, origRotation: 0 },
    ],
  ] as const)("returns undefined for handle kind=%s", (kind, payload) => {
    expect(selectionOnClick(makeState(kind as DragState["kind"], payload))).toBeUndefined();
  });
});
