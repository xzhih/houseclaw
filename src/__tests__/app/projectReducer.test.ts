import { describe, expect, it } from "vitest";
import { createSampleProject } from "../../domain/sampleProject";
import { projectReducer, reducerErrorChannel, withSessionDefaults } from "../../app/projectReducer";

describe("projectReducer", () => {
  it("set-mode toggles between 2d and 3d", () => {
    const initial = withSessionDefaults(createSampleProject());
    const next = projectReducer(initial, { type: "set-mode", mode: "3d" });
    expect(next.mode).toBe("3d");
  });

  it("set-view changes activeView", () => {
    const initial = withSessionDefaults(createSampleProject());
    const next = projectReducer(initial, { type: "set-view", viewId: "elevation-front" });
    expect(next.activeView).toBe("elevation-front");
  });

  it("set-tool changes activeTool", () => {
    const initial = withSessionDefaults(createSampleProject());
    const next = projectReducer(initial, { type: "set-tool", toolId: "wall" });
    expect(next.activeTool).toBe("wall");
  });

  it("select sets the selection state", () => {
    const initial = withSessionDefaults(createSampleProject());
    const sel = { kind: "wall" as const, wallId: "w-front" };
    const next = projectReducer(initial, { type: "select", selection: sel });
    expect(next.selection).toEqual(sel);
  });

  it("replace-project swaps the entire project", () => {
    const initial = withSessionDefaults(createSampleProject());
    const replacement = { ...initial, name: "Replaced" };
    const next = projectReducer(initial, { type: "replace-project", project: replacement });
    expect(next.name).toBe("Replaced");
  });

  it("withSessionDefaults adds default session fields", () => {
    const session = withSessionDefaults(createSampleProject());
    expect(session.mode).toBe("3d");
    expect(session.activeView).toBe("plan-1f");
    expect(session.activeTool).toBe("select");
    expect(session.selection).toBeUndefined();
  });

  it("returns previous state when a mutation throws — never crashes", () => {
    const initial = withSessionDefaults(createSampleProject());
    reducerErrorChannel.last = null;
    // 1f↔2f swap inverts walls anchored bottom=1f, top=2f → invalid project.
    const next = projectReducer(initial, {
      type: "swap-storey-elevations",
      aId: "1f",
      bId: "2f",
    });
    expect(next).toBe(initial);
    expect(reducerErrorChannel.last).toMatch(/Invalid/);
  });
});
