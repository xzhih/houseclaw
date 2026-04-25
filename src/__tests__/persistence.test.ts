import { describe, expect, it } from "vitest";
import { exportProjectJson, importProjectJson } from "../app/persistence";
import { createSampleProject } from "../domain/sampleProject";

describe("project persistence", () => {
  it("round-trips project JSON", () => {
    const project = createSampleProject();
    const json = exportProjectJson(project);
    const restored = importProjectJson(json);

    expect(restored.id).toBe(project.id);
    expect(restored.walls).toHaveLength(project.walls.length);
    expect(restored.openings[0].id).toBe("window-front-1f");
  });
});
