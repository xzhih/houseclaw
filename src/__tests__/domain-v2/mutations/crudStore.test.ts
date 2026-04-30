import { describe, expect, it } from "vitest";
import { createV2SampleProject } from "../../../domain/v2/sampleProject";
import { createCrudStore } from "../../../domain/v2/mutations/crudStore";
import { EntityNotFoundError } from "../../../domain/v2/mutations/errors";
import type { HouseProject, Wall } from "../../../domain/v2/types";

const wallStore = createCrudStore<Wall, Partial<Wall>>({
  arrayKey: "walls",
  entityKind: "wall",
});

describe("v2 createCrudStore", () => {
  it("add appends to the array and returns assertValid project", () => {
    const project = createV2SampleProject();
    const draft: Wall = {
      id: "w-extra",
      start: { x: 8, y: 0 },
      end: { x: 12, y: 0 },
      thickness: 0.2,
      bottom: { kind: "storey", storeyId: "1f", offset: 0 },
      top: { kind: "storey", storeyId: "2f", offset: 0 },
      exterior: false,
      materialId: "mat-wall-white",
    };
    const next = wallStore.add(project, draft);
    expect(next.walls).toHaveLength(project.walls.length + 1);
    expect(next.walls.find((w) => w.id === "w-extra")).toBeDefined();
  });

  it("update modifies a record by id", () => {
    const project = createV2SampleProject();
    const next = wallStore.update(project, "w-front", { thickness: 0.3 });
    const w = next.walls.find((wall) => wall.id === "w-front")!;
    expect(w.thickness).toBe(0.3);
  });

  it("update throws EntityNotFoundError when id missing", () => {
    const project = createV2SampleProject();
    expect(() => wallStore.update(project, "ghost", { thickness: 0.3 })).toThrow(
      EntityNotFoundError,
    );
  });

  it("remove drops the record", () => {
    const project = createV2SampleProject();
    const trimmed: HouseProject = {
      ...project,
      openings: project.openings.filter((o) => o.wallId !== "w-front"),
    };
    const next = wallStore.remove(trimmed, "w-front");
    expect(next.walls.find((w) => w.id === "w-front")).toBeUndefined();
  });

  it("remove returns project unchanged when id missing", () => {
    const project = createV2SampleProject();
    expect(wallStore.remove(project, "ghost")).toBe(project);
  });

  it("cascade hook deletes dependent rows on remove", () => {
    const cascadingStore = createCrudStore<Wall, Partial<Wall>>({
      arrayKey: "walls",
      entityKind: "wall",
      cascade: (project, removed) => ({
        openings: project.openings.filter((o) => o.wallId !== removed.id),
        balconies: project.balconies.filter((b) => b.attachedWallId !== removed.id),
      }),
    });
    const project = createV2SampleProject();
    const next = cascadingStore.remove(project, "w-front");
    expect(next.walls.find((w) => w.id === "w-front")).toBeUndefined();
    expect(next.openings.every((o) => o.wallId !== "w-front")).toBe(true);
  });
});
