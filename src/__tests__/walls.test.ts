import { describe, expect, it } from "vitest";
import { createBasicProject } from "../domain/sampleProject";
import { createWallDraft, nextWallId } from "../domain/walls";

describe("wall identifiers", () => {
  it("returns wall-{storeyId}-1 when no slots are used", () => {
    expect(nextWallId(createBasicProject(), "1f")).toBe("wall-1f-1");
  });

  it("returns the lowest unused slot when other walls follow the pattern", () => {
    const project = createBasicProject();
    const seeded = {
      ...project,
      walls: [
        ...project.walls,
        { ...project.walls[0], id: "wall-1f-1" },
        { ...project.walls[0], id: "wall-1f-3" },
      ],
    };

    expect(nextWallId(seeded, "1f")).toBe("wall-1f-2");
  });

  it("ignores walls on other storeys when picking a slot", () => {
    const project = createBasicProject();
    const seeded = {
      ...project,
      walls: [...project.walls, { ...project.walls[0], id: "wall-2f-1", storeyId: "2f" }],
    };

    expect(nextWallId(seeded, "1f")).toBe("wall-1f-1");
  });
});

describe("wall draft", () => {
  it("builds a wall pinned to the storey height with the project default thickness and the first wall material", () => {
    const project = createBasicProject();
    const draft = createWallDraft(project, "1f", { x: 0, y: 0 }, { x: 4, y: 0 });

    expect(draft).toEqual({
      id: "wall-1f-1",
      storeyId: "1f",
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
      thickness: project.defaultWallThickness,
      height: 3.2,
      exterior: true,
      materialId: "mat-white-render",
    });
  });

  it("falls back to defaultStoreyHeight when the storey is missing", () => {
    const project = createBasicProject();
    const broken = { ...project, storeys: [] };
    const draft = createWallDraft(broken, "1f", { x: 0, y: 0 }, { x: 1, y: 0 });

    expect(draft.height).toBe(project.defaultStoreyHeight);
  });

  it("throws when the project has no materials at all", () => {
    const project = createBasicProject();
    const broken = { ...project, materials: [] };

    expect(() => createWallDraft(broken, "1f", { x: 0, y: 0 }, { x: 1, y: 0 })).toThrow(
      /no materials/,
    );
  });
});
