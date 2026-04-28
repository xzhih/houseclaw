import { describe, expect, it } from "vitest";
import { createSampleProject } from "../domain/sampleProject";
import { createCrudStore } from "../domain/mutations/crudStore";
import {
  EntityNotFoundError,
  EntityRangeError,
} from "../domain/mutations/errors";
import type { Wall, HouseProject } from "../domain/types";

describe("createCrudStore", () => {
  // 用一个最小 wall store 跑通骨架；真正配置在 Task 5 的 stores.ts
  const testWallStore = createCrudStore<Wall, { thickness?: number }>({
    arrayKey: "walls",
    entityKind: "wall",
  });

  describe("add", () => {
    it("appends to array", () => {
      const project = createSampleProject();
      const draft: Wall = { ...project.walls[0], id: "test-wall-x" };
      const next = testWallStore.add(project, draft);
      expect(next.walls.length).toBe(project.walls.length + 1);
      expect(next.walls.find((w) => w.id === "test-wall-x")).toBeDefined();
    });
  });

  describe("update", () => {
    it("throws EntityNotFoundError when id missing", () => {
      const project = createSampleProject();
      expect(() => testWallStore.update(project, "ghost-id", { thickness: 0.3 })).toThrow(
        EntityNotFoundError,
      );
    });

    it("applies patch via default spread", () => {
      const project = createSampleProject();
      const id = project.walls[0].id;
      const next = testWallStore.update(project, id, { thickness: 0.42 });
      expect(next.walls.find((w) => w.id === id)!.thickness).toBe(0.42);
    });
  });

  describe("remove", () => {
    it("filters target entity", () => {
      const project = createSampleProject();
      const id = project.walls[0].id;
      const next = testWallStore.remove(project, id);
      expect(next.walls.find((w) => w.id === id)).toBeUndefined();
    });

    it("returns same project when id missing (no throw)", () => {
      const project = createSampleProject();
      const next = testWallStore.remove(project, "ghost-id");
      expect(next).toBe(project);
    });

    it("invokes cascade and shallow-merges result", () => {
      const project = createSampleProject();
      const wallId = project.walls[0].id;
      const cascadeStore = createCrudStore<Wall, never>({
        arrayKey: "walls",
        entityKind: "wall",
        cascade: (p, removed) => ({
          openings: p.openings.filter((o) => o.wallId !== removed.id),
        }),
      });
      const next = cascadeStore.remove(project, wallId);
      // openings referencing removed wall should be gone
      expect(next.openings.some((o) => o.wallId === wallId)).toBe(false);
    });
  });

  describe("validate hook", () => {
    it("runs on add and rejects with custom error", () => {
      const project = createSampleProject();
      const validatedStore = createCrudStore<Wall, never>({
        arrayKey: "walls",
        entityKind: "wall",
        validate: (wall) => {
          if (wall.thickness < 0.1) {
            throw new EntityRangeError("thickness", "thickness too small");
          }
        },
      });
      const draft: Wall = { ...project.walls[0], id: "thin-wall", thickness: 0.05 };
      expect(() => validatedStore.add(project, draft)).toThrow(EntityRangeError);
    });

    it("runs on update", () => {
      const project = createSampleProject();
      const id = project.walls[0].id;
      const validatedStore = createCrudStore<Wall, { thickness?: number }>({
        arrayKey: "walls",
        entityKind: "wall",
        validate: (wall) => {
          if (wall.thickness < 0.1) {
            throw new EntityRangeError("thickness", "thickness too small");
          }
        },
      });
      expect(() => validatedStore.update(project, id, { thickness: 0.05 })).toThrow(
        EntityRangeError,
      );
    });
  });
});
