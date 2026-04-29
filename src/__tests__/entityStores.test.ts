import { describe, expect, it } from "vitest";
import { createBasicProject } from "../domain/sampleProject";
import { createCrudStore } from "../domain/mutations/crudStore";
import {
  EntityNotFoundError,
  EntityRangeError,
  EntityStateError,
} from "../domain/mutations/errors";
import type { Wall, HouseProject } from "../domain/types";
import { createAttachStore } from "../domain/mutations/attachStore";
import type { Stair } from "../domain/types";
import { createSingletonStore } from "../domain/mutations/singletonStore";
import { addRoof, removeRoof } from "../domain/mutations";
import type { Roof } from "../domain/types";

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
      const project = createBasicProject();
      const draft: Wall = { ...project.walls[0], id: "test-wall-x" };
      const next = testWallStore.add(project, draft);
      expect(next.walls.length).toBe(project.walls.length + 1);
      expect(next.walls.find((w) => w.id === "test-wall-x")).toBeDefined();
    });
  });

  describe("update", () => {
    it("throws EntityNotFoundError when id missing", () => {
      const project = createBasicProject();
      expect(() => testWallStore.update(project, "ghost-id", { thickness: 0.3 })).toThrow(
        EntityNotFoundError,
      );
    });

    it("applies patch via default spread", () => {
      const project = createBasicProject();
      const id = project.walls[0].id;
      const next = testWallStore.update(project, id, { thickness: 0.42 });
      expect(next.walls.find((w) => w.id === id)!.thickness).toBe(0.42);
    });
  });

  describe("remove", () => {
    it("filters target entity", () => {
      const project = createBasicProject();
      const id = project.walls[0].id;
      const next = testWallStore.remove(project, id);
      expect(next.walls.find((w) => w.id === id)).toBeUndefined();
    });

    it("returns same project when id missing (no throw)", () => {
      const project = createBasicProject();
      const next = testWallStore.remove(project, "ghost-id");
      expect(next).toBe(project);
    });

    it("invokes cascade and shallow-merges result", () => {
      const project = createBasicProject();
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
      const project = createBasicProject();
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
      const project = createBasicProject();
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
    const project = createBasicProject();
    const storeyId = project.storeys.find((s) => s.stair)!.id;
    return { project, storeyId, stair: project.storeys.find((s) => s.id === storeyId)!.stair! };
  }

  describe("attach", () => {
    it("writes to host.field", () => {
      const project = createBasicProject();
      const sample = projectWithStair();
      // Detach 1f's existing stair to free up a non-top storey for attach
      const cleared = stairStore.detach(project, sample.storeyId);
      const next = stairStore.attach(cleared, sample.storeyId, sample.stair);
      expect(findStair(next, sample.storeyId)).toBeDefined();
    });

    it("overwrites existing entity (matches addStair behavior)", () => {
      const { project, storeyId, stair } = projectWithStair();
      const replaced: Stair = { ...stair, width: 1.2 };
      const next = stairStore.attach(project, storeyId, replaced);
      expect(findStair(next, storeyId)!.width).toBe(1.2);
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
      const next = stairStore.update(project, storeyId, { width: 1.2 });
      expect(findStair(next, storeyId)!.width).toBe(1.2);
    });

    it("silent no-op if host has no entity", () => {
      const project = createBasicProject();
      const noStairStorey = project.storeys.find((s) => !s.stair)!;
      const next = stairStore.update(project, noStairStorey.id, { width: 1.5 });
      expect(next).toBe(project);
    });

    it("silent no-op if host id missing", () => {
      const project = createBasicProject();
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
      const project = createBasicProject();
      const next = stairStore.detach(project, "ghost-storey");
      expect(next).toBe(project);
    });

    it("silent no-op if host has no entity", () => {
      const project = createBasicProject();
      const noStairStorey = project.storeys.find((s) => !s.stair)!;
      const next = stairStore.detach(project, noStairStorey.id);
      expect(next).toBe(project);
    });
  });
});

describe("createSingletonStore (roof)", () => {
  const PI3 = Math.PI / 3;

  function projectWithRoof(): HouseProject {
    const p = createBasicProject();
    return p.roof ? p : addRoof(p);
  }

  function projectWithoutRoof(): HouseProject {
    const p = createBasicProject();
    return p.roof ? removeRoof(p) : p;
  }

  type RoofPatch = Partial<Pick<Roof, "pitch" | "overhang" | "materialId">>;
  const roofStore = createSingletonStore<Roof, RoofPatch>({
    field: "roof",
    entityKind: "roof",
    applyPatch: (roof, patch) => ({
      ...roof,
      ...(patch.pitch !== undefined ? { pitch: Math.min(PI3, Math.max(Math.PI / 36, patch.pitch)) } : {}),
      ...(patch.overhang !== undefined ? { overhang: Math.min(2, Math.max(0, patch.overhang)) } : {}),
      ...(patch.materialId !== undefined ? { materialId: patch.materialId } : {}),
    }),
  });

  describe("update", () => {
    it("applies clamp via applyPatch", () => {
      const project = projectWithRoof();
      const next = roofStore.update(project, { pitch: 999 });
      expect(next.roof!.pitch).toBeCloseTo(PI3, 5);
    });

    it("throws EntityStateError when no roof", () => {
      const project = projectWithoutRoof();
      expect(() => roofStore.update(project, { pitch: 0.5 })).toThrow(EntityStateError);
    });
  });

  describe("clear", () => {
    it("sets field to undefined", () => {
      const project = projectWithRoof();
      const next = roofStore.clear(project);
      expect(next.roof).toBeUndefined();
    });

    it("returns same project when already undefined", () => {
      const project = projectWithoutRoof();
      const next = roofStore.clear(project);
      expect(next).toBe(project);
    });
  });
});

describe("error types", () => {
  it("EntityNotFoundError carries kind + id", () => {
    const err = new EntityNotFoundError("wall", "w-1");
    expect(err.kind).toBe("wall");
    expect(err.id).toBe("w-1");
    expect(err.message).toBe("wall w-1 not found");
  });

  it("EntityRangeError carries field name", () => {
    const err = new EntityRangeError("width", "too small");
    expect(err.field).toBe("width");
    expect(err.message).toBe("too small");
  });

  it("EntityStateError preserves message", () => {
    const err = new EntityStateError("Roof already exists.");
    expect(err.message).toBe("Roof already exists.");
  });
});
