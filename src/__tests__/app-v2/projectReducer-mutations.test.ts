import { describe, expect, it } from "vitest";
import { createV2SampleProject } from "../../domain/v2/sampleProject";
import { withSessionDefaults, projectReducerV2 } from "../../app/v2/projectReducer";

describe("projectReducerV2 — mutation actions", () => {
  it("set-storey-label dispatches setStoreyLabel", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, {
      type: "set-storey-label",
      storeyId: "1f",
      label: "Ground",
    });
    expect(next.storeys.find((s) => s.id === "1f")?.label).toBe("Ground");
  });

  it("set-storey-elevation dispatches setStoreyElevation", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, {
      type: "set-storey-elevation",
      storeyId: "2f",
      elevation: 4.0,
    });
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBe(4.0);
  });

  it("set-storey-height cascades to upper storeys", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, {
      type: "set-storey-height",
      storeyId: "1f",
      height: 3.5,
    });
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBeCloseTo(3.5);
    expect(next.storeys.find((s) => s.id === "roof")?.elevation).toBeCloseTo(6.7);
  });

  it("add-storey appends a new storey", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, { type: "add-storey" });
    expect(next.storeys.length).toBe(initial.storeys.length + 1);
  });

  it("update-wall dispatches updateWall", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, {
      type: "update-wall",
      wallId: "w-front",
      patch: { thickness: 0.3 },
    });
    expect(next.walls.find((w) => w.id === "w-front")?.thickness).toBe(0.3);
  });

  it("update-opening dispatches updateOpening", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, {
      type: "update-opening",
      openingId: "o-front-1f-win",
      patch: { width: 2.0 },
    });
    expect(
      next.openings.find((o) => o.id === "o-front-1f-win")?.width,
    ).toBe(2.0);
  });

  it("preserves session state across mutations", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const withTool = projectReducerV2(initial, { type: "set-tool", toolId: "wall" });
    expect(withTool.activeTool).toBe("wall");
    const next = projectReducerV2(withTool, {
      type: "set-storey-label",
      storeyId: "1f",
      label: "Ground",
    });
    // Session state preserved
    expect(next.activeTool).toBe("wall");
    expect(next.mode).toBe("3d");
    expect(next.activeView).toBe("plan-1f");
    // And the mutation applied
    expect(next.storeys.find((s) => s.id === "1f")?.label).toBe("Ground");
  });
});
