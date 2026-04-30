import { describe, expect, it } from "vitest";
import { createV2SampleProject } from "../../domain/v2/sampleProject";
import { projectReducerV2, withSessionDefaults } from "../../app/v2/projectReducer";

describe("projectReducerV2", () => {
  it("set-mode toggles between 2d and 3d", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, { type: "set-mode", mode: "3d" });
    expect(next.mode).toBe("3d");
  });

  it("set-view changes activeView", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, { type: "set-view", viewId: "elevation-front" });
    expect(next.activeView).toBe("elevation-front");
  });

  it("set-tool changes activeTool", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, { type: "set-tool", toolId: "wall" });
    expect(next.activeTool).toBe("wall");
  });

  it("select sets the selection state", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const sel = { kind: "wall" as const, wallId: "w-front" };
    const next = projectReducerV2(initial, { type: "select", selection: sel });
    expect(next.selection).toEqual(sel);
  });

  it("replace-project swaps the entire project", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const replacement = { ...initial, name: "Replaced" };
    const next = projectReducerV2(initial, { type: "replace-project", project: replacement });
    expect(next.name).toBe("Replaced");
  });

  it("withSessionDefaults adds default session fields", () => {
    const session = withSessionDefaults(createV2SampleProject());
    expect(session.mode).toBe("3d");
    expect(session.activeView).toBe("plan-1f");
    expect(session.activeTool).toBe("select");
    expect(session.selection).toBeUndefined();
  });
});
