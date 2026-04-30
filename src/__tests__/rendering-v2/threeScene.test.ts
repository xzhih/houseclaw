import { describe, expect, it } from "vitest";
import { createV2SampleProject } from "../../domain/v2/sampleProject";
import { DEFAULT_LIGHTING, mountHouseSceneV2 } from "../../rendering/v2/threeScene";

describe("mountHouseSceneV2", () => {
  it("DEFAULT_LIGHTING exports sane defaults", () => {
    expect(DEFAULT_LIGHTING.exposure).toBeGreaterThan(0);
    expect(DEFAULT_LIGHTING.sunAltitudeDeg).toBeGreaterThan(0);
    expect(DEFAULT_LIGHTING.sunAltitudeDeg).toBeLessThan(90);
  });

  it("mountHouseSceneV2 returns a MountedScene with required methods OR throws on missing WebGL (jsdom)", () => {
    const host = document.createElement("div");
    const project = createV2SampleProject();
    let scene;
    try {
      scene = mountHouseSceneV2(host, project, {});
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
