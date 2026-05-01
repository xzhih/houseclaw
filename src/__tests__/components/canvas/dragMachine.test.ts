import { describe, expect, it } from "vitest";
import {
  applyDrag,
  selectionOnClick,
  type DragContext,
} from "../../../components/canvas/dragMachine";
import type { DragState } from "../../../components/canvas/dragState";
import type { PointMapping } from "../../../components/canvas/types";
import { withSessionDefaults } from "../../../app/projectReducer";
import { createSampleProject } from "../../../domain/sampleProject";
import type { ProjectAction } from "../../../app/projectReducer";

const noopMapping: PointMapping = {
  project: (p) => p,
  unproject: (p) => p,
  scale: 1,
};

function makeCtx(): DragContext {
  const project = withSessionDefaults(createSampleProject());
  return {
    project,
    otherWallSegmentsExclude: (excludeWallId) =>
      project.walls
        .filter((w) => w.id !== excludeWallId)
        .map((w) => ({ start: w.start, end: w.end })),
  };
}

describe("dragMachine — wall-translate", () => {
  it("snaps to grid in absence of endpoint snap and emits update-wall", () => {
    const state: DragState = {
      kind: "wall-translate",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: noopMapping,
      wallId: "w-test",
      origStart: { x: 1, y: 2 },
      origEnd: { x: 4, y: 2 },
    };
    // Move far from any endpoint of sample project so grid snap dominates.
    const out = applyDrag(state, { x: 100, y: 100.04 }, makeCtx());
    expect(out).not.toBeNull();
    const action = out!.actions[0] as Extract<ProjectAction, { type: "update-wall" }>;
    expect(action.type).toBe("update-wall");
    expect(action.wallId).toBe("w-test");
    // dx=100 → grid snap (gridSize 0.1) keeps it at 100; dy=100.04 → snap to 100.0
    expect(action.patch.start).toEqual({ x: 101, y: 102 });
    expect(action.patch.end).toEqual({ x: 104, y: 102 });
  });
});

describe("dragMachine — wall-endpoint", () => {
  it("moves the endpoint while keeping fixedPoint stable", () => {
    const state: DragState = {
      kind: "wall-endpoint",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: noopMapping,
      wallId: "w-test",
      endpoint: "end",
      origPoint: { x: 5, y: 0 },
      fixedPoint: { x: 0, y: 0 },
    };
    const out = applyDrag(state, { x: 100, y: 100 }, makeCtx());
    expect(out).not.toBeNull();
    const action = out!.actions[0] as Extract<ProjectAction, { type: "update-wall" }>;
    expect(action.patch.start).toEqual({ x: 0, y: 0 });
    expect(action.patch.end).toEqual({ x: 105, y: 100 });
  });
});

describe("dragMachine — opening drag (plan)", () => {
  it("clamps offset to [0, wallLen - openingWidth]", () => {
    const state: DragState = {
      kind: "opening",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: noopMapping,
      openingId: "op",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 10, y: 0 },
      origOffset: 4,
      openingWidth: 1,
    };
    // Drag far to the right — should clamp to wallLen - width = 9.
    const out = applyDrag(state, { x: 1000, y: 0 }, makeCtx());
    const action = out!.actions[0] as Extract<ProjectAction, { type: "update-opening" }>;
    expect(action.patch.offset).toBe(9);
  });

  it("clamps offset to 0 when dragged left of wall start", () => {
    const state: DragState = {
      kind: "opening",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: noopMapping,
      openingId: "op",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 10, y: 0 },
      origOffset: 4,
      openingWidth: 1,
    };
    const out = applyDrag(state, { x: -1000, y: 0 }, makeCtx());
    const action = out!.actions[0] as Extract<ProjectAction, { type: "update-opening" }>;
    expect(action.patch.offset).toBe(0);
  });
});

describe("dragMachine — plan-opening-resize", () => {
  it("rejects drag that shrinks below minSize 0.05", () => {
    const state: DragState = {
      kind: "plan-opening-resize",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: noopMapping,
      openingId: "op",
      edge: "r",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 10, y: 0 },
      origOffset: 4,
      origWidth: 1,
      wallLen: 10,
    };
    // Right edge dragged left by more than origWidth - minSize → newWidth pinned at minSize, returns valid result.
    const out = applyDrag(state, { x: -100, y: 0 }, makeCtx());
    expect(out).not.toBeNull();
    const action = out!.actions[0] as Extract<ProjectAction, { type: "update-opening" }>;
    expect(action.patch.width).toBeGreaterThanOrEqual(0.05);
  });

  it("expands width when right edge dragged right", () => {
    const state: DragState = {
      kind: "plan-opening-resize",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: noopMapping,
      openingId: "op",
      edge: "r",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 10, y: 0 },
      origOffset: 4,
      origWidth: 1,
      wallLen: 10,
    };
    const out = applyDrag(state, { x: 2, y: 0 }, makeCtx());
    const action = out!.actions[0] as Extract<ProjectAction, { type: "update-opening" }>;
    // along = +2 → newWidth = 3; offset stays at 4.
    expect(action.patch.width).toBe(3);
    expect(action.patch.offset).toBe(4);
  });
});

describe("dragMachine — elev-opening-move", () => {
  it("clamps offset and sill to wall + storey bounds", () => {
    const state: DragState = {
      kind: "elev-opening-move",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: noopMapping,
      openingId: "op",
      origOffset: 1,
      origSill: 0.9,
      width: 1,
      height: 2,
      wallLen: 6,
      storeyHeight: 3,
      projSign: 1,
    };
    const out = applyDrag(state, { x: 1000, y: 1000 }, makeCtx());
    const action = out!.actions[0] as Extract<ProjectAction, { type: "update-opening" }>;
    expect(action.patch.offset).toBe(5); // wallLen - width
    expect(action.patch.sillHeight).toBe(1); // storeyHeight - height
  });

  it("respects negative projSign for mirrored elevations", () => {
    const state: DragState = {
      kind: "elev-opening-move",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: noopMapping,
      openingId: "op",
      origOffset: 1,
      origSill: 0.9,
      width: 1,
      height: 2,
      wallLen: 6,
      storeyHeight: 3,
      projSign: -1,
    };
    // Dragging right on screen → offset decreases.
    const out = applyDrag(state, { x: 0.5, y: 0 }, makeCtx());
    const action = out!.actions[0] as Extract<ProjectAction, { type: "update-opening" }>;
    expect(action.patch.offset).toBe(0.5); // 1 - 0.5 = 0.5
  });
});

describe("dragMachine — stair-translate", () => {
  it("snaps stair x/y to grid", () => {
    const state: DragState = {
      kind: "stair-translate",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: noopMapping,
      stairId: "st",
      origX: 1,
      origY: 1,
    };
    const out = applyDrag(state, { x: 0.07, y: 0.13 }, makeCtx());
    const action = out!.actions[0] as Extract<ProjectAction, { type: "update-stair" }>;
    expect(action.patch.x).toBe(1.1);
    expect(action.patch.y).toBe(1.1);
  });
});

describe("dragMachine — stair-rotate", () => {
  it("emits rotation normalized to (-π, π]", () => {
    const state: DragState = {
      kind: "stair-rotate",
      pointerId: 1,
      startWorld: { x: 1, y: 0 },
      moved: true,
      mapping: noopMapping,
      stairId: "st",
      center: { x: 0, y: 0 },
      initialMouseAngle: 0,
      origRotation: Math.PI - 0.01,
    };
    // Rotate roughly +0.1 rad → 0.09 over PI threshold → normalized.
    const out = applyDrag(state, { x: Math.cos(0.1), y: Math.sin(0.1) }, makeCtx());
    const action = out!.actions[0] as Extract<ProjectAction, { type: "update-stair" }>;
    expect(action.patch.rotation).toBeLessThanOrEqual(Math.PI);
    expect(action.patch.rotation).toBeGreaterThan(-Math.PI);
  });
});

describe("dragMachine — selectionOnClick", () => {
  it("maps wall-translate to wall selection", () => {
    const sel = selectionOnClick({
      kind: "wall-translate",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: false,
      mapping: noopMapping,
      wallId: "w1",
      origStart: { x: 0, y: 0 },
      origEnd: { x: 1, y: 0 },
    });
    expect(sel).toEqual({ kind: "wall", wallId: "w1" });
  });

  it("maps stair-translate to stair selection (via stairId)", () => {
    const sel = selectionOnClick({
      kind: "stair-translate",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: false,
      mapping: noopMapping,
      stairId: "st",
      origX: 0,
      origY: 0,
    });
    expect(sel).toEqual({ kind: "stair", stairId: "st" });
  });

  it("returns undefined for resize/edge handles (no click selection)", () => {
    const sel = selectionOnClick({
      kind: "plan-opening-resize",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: false,
      mapping: noopMapping,
      openingId: "op",
      edge: "r",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 10, y: 0 },
      origOffset: 4,
      origWidth: 1,
      wallLen: 10,
    });
    expect(sel).toBeUndefined();
  });
});
