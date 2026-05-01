import { describe, expect, it } from "vitest";
import { createSampleProject } from "../../domain/sampleProject";
import { DEFAULT_LIGHTING, mountHouseScene } from "../../rendering/threeScene";

describe("mountHouseScene", () => {
  it("DEFAULT_LIGHTING exports sane defaults", () => {
    expect(DEFAULT_LIGHTING.exposure).toBeGreaterThan(0);
    expect(DEFAULT_LIGHTING.sunAltitudeDeg).toBeGreaterThan(0);
    expect(DEFAULT_LIGHTING.sunAltitudeDeg).toBeLessThan(90);
  });

  it("mountHouseScene returns a MountedScene with required methods OR throws on missing WebGL (jsdom)", () => {
    const host = document.createElement("div");
    const project = createSampleProject();
    let scene;
    try {
      scene = mountHouseScene(host, project, {});
    } catch (e) {
      // jsdom doesn't support WebGL — accept this branch.
      const msg = String(e).toLowerCase();
      expect(msg).toMatch(/webgl|context|getcontext|canvas/);
      return;
    }
    expect(typeof scene.dispose).toBe("function");
    expect(typeof scene.setCameraMode).toBe("function");
    expect(typeof scene.teleportToStorey).toBe("function");
    expect(typeof scene.setLighting).toBe("function");
    scene.dispose();
  });
});
