import { describe, expect, it } from "vitest";
import { exportProjectJson, importProjectJson } from "../app/persistence";
import { createSampleProject } from "../domain/sampleProject";

describe("createSampleProject", () => {
  it("ships with a default roof: front+back as eaves, sides as gables, 30° pitch, 0.4m overhang", () => {
    const project = createSampleProject();
    const top = project.storeys[project.storeys.length - 1];
    expect(project.roof).toBeDefined();
    expect(project.roof!.edges[`wall-front-${top.id}`]).toBe("eave");
    expect(project.roof!.edges[`wall-back-${top.id}`]).toBe("eave");
    expect(project.roof!.edges[`wall-left-${top.id}`]).toBe("gable");
    expect(project.roof!.edges[`wall-right-${top.id}`]).toBe("gable");
    expect(project.roof!.pitch).toBeCloseTo(Math.PI / 6);
    expect(project.roof!.overhang).toBeCloseTo(0.4);
    const material = project.materials.find((m) => m.id === project.roof!.materialId);
    expect(material?.kind).toBe("roof");
  });

  it("passes assertValidProject (round-trips through persistence)", () => {
    // 序列化 + 反序列化跑一遍 importProjectJson，能进 assertValidProject 全套校验。
    const project = createSampleProject();
    const json = exportProjectJson(project);
    expect(() => importProjectJson(json)).not.toThrow();
  });

});
