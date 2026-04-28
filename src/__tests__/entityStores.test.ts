import { describe, expect, it } from "vitest";
import { createSampleProject } from "../domain/sampleProject";
import { createCrudStore } from "../domain/mutations/crudStore";
import {
  EntityNotFoundError,
  EntityRangeError,
} from "../domain/mutations/errors";
import type { Wall, HouseProject } from "../domain/types";
import { createAttachStore } from "../domain/mutations/attachStore";
import type { Stair } from "../domain/types";

describe("createCrudStore", () => {
  // 用一个最小 wall store 跑通骨架；真正配置在 Task 5 的 stores.ts
  const testWallStore = createCrudStore<Wall, { thickness?: number }>({
    arrayKey: "walls",
    entityKind: "wall",
    cascade: (project, removed) => ({
      openings: project.openings.filter((o) => o.wallId !== removed.id),
      balconies: project.balconies.filter((b) => b.attachedWallId !== removed.id),
      skirts: project.skirts.filter((s) => s.hostWallId !== removed.id),
    }),
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

describe("createAttachStore (stair)", () => {
  const stairStore = createAttachStore<Stair, { width?: number }>({
    hostArrayKey: "storeys",
    field: "stair",
  });

  function findStair(project: HouseProject, storeyId: string): Stair | undefined {
    return project.storeys.find((s) => s.id === storeyId)?.stair;
  }

  function projectWithStair(): { project: HouseProject; storeyId: string; stair: Stair } {
    const project = createSampleProject();
    const storeyId = project.storeys.find((s) => s.stair)!.id;
    return { project, storeyId, stair: project.storeys.find((s) => s.id === storeyId)!.stair! };
  }

  describe("attach", () => {
    it("writes to host.field", () => {
      const project = createSampleProject();
      const targetStorey = project.storeys.find((s) => !s.stair)!;
      const sample = projectWithStair();
      const next = stairStore.attach(project, targetStorey.id, sample.stair);
      expect(findStair(next, targetStorey.id)).toBeDefined();
    });

    it("overwrites existing entity (matches addStair behavior)", () => {
      const { project, storeyId, stair } = projectWithStair();
      const replaced: Stair = { ...stair, width: 9.99 };
      const next = stairStore.attach(project, storeyId, replaced);
      expect(findStair(next, storeyId)!.width).toBe(9.99);
    });

    it("throws EntityNotFoundError when host id missing", () => {
      const { project, stair } = projectWithStair();
      expect(() => stairStore.attach(project, "ghost-storey", stair)).toThrow(
        EntityNotFoundError,
      );
    });
  });

  describe("update", () => {
    it("mutates host.field via default spread", () => {
      const { project, storeyId } = projectWithStair();
      const next = stairStore.update(project, storeyId, { width: 1.5 });
      expect(findStair(next, storeyId)!.width).toBe(1.5);
    });

    it("silent no-op if host has no entity", () => {
      const project = createSampleProject();
      const noStairStorey = project.storeys.find((s) => !s.stair)!;
      const next = stairStore.update(project, noStairStorey.id, { width: 1.5 });
      expect(next).toBe(project);
    });

    it("silent no-op if host id missing", () => {
      const project = createSampleProject();
      const next = stairStore.update(project, "ghost-storey", { width: 1.5 });
      expect(next).toBe(project);
    });
  });

  describe("detach", () => {
    it("clears host.field", () => {
      const { project, storeyId } = projectWithStair();
      const next = stairStore.detach(project, storeyId);
      expect(findStair(next, storeyId)).toBeUndefined();
    });

    it("silent no-op if host id missing", () => {
      const project = createSampleProject();
      const next = stairStore.detach(project, "ghost-storey");
      expect(next).toBe(project);
    });

    it("silent no-op if host has no entity", () => {
      const project = createSampleProject();
      const noStairStorey = project.storeys.find((s) => !s.stair)!;
      const next = stairStore.detach(project, noStairStorey.id);
      expect(next).toBe(project);
    });
  });
});
