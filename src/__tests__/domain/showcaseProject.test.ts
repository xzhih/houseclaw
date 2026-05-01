import { describe, expect, it } from "vitest";
import { assertValidProject } from "../../domain/validate";
import { createShowcaseProject } from "../../domain/showcaseProject";

describe("createShowcaseProject", () => {
  it("returns a valid project", () => {
    const project = createShowcaseProject();
    expect(() => assertValidProject(project)).not.toThrow();
  });

  it("has 4 storeys (1F, 2F, 3F, roof)", () => {
    const project = createShowcaseProject();
    expect(project.storeys.map((s) => s.id)).toEqual(["1f", "2f", "3f", "roof"]);
  });

  it("has 2 stairs (1F→2F and 2F→3F)", () => {
    const project = createShowcaseProject();
    expect(project.stairs).toHaveLength(2);
  });

  it("has front + side balconies", () => {
    const project = createShowcaseProject();
    expect(project.balconies).toHaveLength(2);
    expect(project.balconies.every((b) => b.attachedWallId === "w-front")).toBe(true);
  });

  it("generates a fresh id each call (so duplicates don't collide)", () => {
    const a = createShowcaseProject();
    const b = createShowcaseProject();
    expect(a.id).not.toBe(b.id);
  });
});
