# M3 EntityStore\<T\> 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `src/domain/mutations.ts` 中的 30+ 函数（CRUD/attach/singleton 三种实体形态混杂、~590 行）重构为三个 store 工厂 + 6 个 entity config，公共 API 签名零变化。

**Architecture:** 新增 `src/domain/mutations/` 子目录，包含 `errors.ts`（3 类 typed error）和三个 store 工厂（`crudStore.ts` / `attachStore.ts` / `singletonStore.ts`），以及 `stores.ts`（6 个 entity config）。`mutations.ts` 改为从 store 派生 13 个 CRUD/attach/singleton 函数（每个 1 行 `export const`），保留 9 个 bespoke 函数（楼层 ops、addRoof、toggleRoofEdge、addSkirt 包装、moveWall）。

**Tech Stack:** TypeScript, Vitest, bun

**关联文档:**
- Spec: `docs/superpowers/specs/2026-04-29-m3-entity-store-design.md`
- Roadmap: `docs/2026-04-28-iteration-friction-roadmap.md`

---

## 文件结构

| 文件 | 操作 | 责任 |
|---|---|---|
| `src/domain/mutations/errors.ts` | 新建 | `EntityNotFoundError` / `EntityRangeError` / `EntityStateError` |
| `src/domain/mutations/crudStore.ts` | 新建 | `createCrudStore<T, P>` 工厂；CRUD 4 entity 用 |
| `src/domain/mutations/attachStore.ts` | 新建 | `createAttachStore<T, P>` 工厂；stair 用 |
| `src/domain/mutations/singletonStore.ts` | 新建 | `createSingletonStore<T, P>` 工厂；roof 用 |
| `src/domain/mutations/stores.ts` | 新建 | 6 个 entity store 配置（wall/opening/balcony/skirt/stair/roof） |
| `src/domain/mutations.ts` | 修改 | 删除被 store 取代的实现，re-export store 派生函数；保留 bespoke ops |
| `src/__tests__/entityStores.test.ts` | 新建 | 三个工厂 + 错误类型的单测 |
| `src/__tests__/mutations.test.ts` | 修改 | 删除 1 条 obsolete 测试（removeSkirt 内联清选区） |

---

## Task 1：errors.ts

> **目标**：建立三类 typed error；这是后续工厂引用的基础。

**Files:**
- Create: `src/domain/mutations/errors.ts`

- [ ] **Step 1.1：创建 errors.ts**

```ts
// src/domain/mutations/errors.ts
import type { ObjectSelectionKind } from "../selection";

export class EntityNotFoundError extends Error {
  constructor(public kind: ObjectSelectionKind, public id: string) {
    super(`${kind} ${id} not found`);
    this.name = "EntityNotFoundError";
  }
}

export class EntityRangeError extends Error {
  constructor(public field: string, message: string) {
    super(message);
    this.name = "EntityRangeError";
  }
}

export class EntityStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityStateError";
  }
}
```

- [ ] **Step 1.2：lint 通过**

```bash
bun run lint
```

**期望**：clean。

- [ ] **Step 1.3：commit**

```bash
git add src/domain/mutations/errors.ts
git commit -m "$(cat <<'EOF'
feat(mutations): typed entity errors (NotFound / Range / State)

为 M3 EntityStore 工厂建立错误锚点。本 commit 仅落地类型，
工厂引用在后续 task 中接入。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2：crudStore.ts 工厂

> **目标**：实现 `createCrudStore<T, P>`，含 add / update / remove / cascade / validate 完整语义；先写测试再实现。

**Files:**
- Create: `src/domain/mutations/crudStore.ts`
- Create: `src/__tests__/entityStores.test.ts`（先建框架，后续 task 续填）

- [ ] **Step 2.1：写 entityStores.test.ts 的 createCrudStore 测试块**

```ts
// src/__tests__/entityStores.test.ts
import { describe, expect, it } from "vitest";
import { createSampleProject } from "../domain/sampleProject";
import { addSkirt } from "../domain/mutations";
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
```

注意 `arrayKey: "walls"` 与实际 `HouseProject.walls` 字段对齐；测试用的 mini stores 故意不带 `applyPatch`/`cascade`/`validate` 来验证默认行为。

- [ ] **Step 2.2：跑测试，确认全部失败**

```bash
bun run test src/__tests__/entityStores.test.ts 2>&1 | tail -10
```

**期望**：编译错误（"Cannot find module '../domain/mutations/crudStore'"）。

- [ ] **Step 2.3：实现 crudStore.ts**

```ts
// src/domain/mutations/crudStore.ts
import { assertValidProject } from "../constraints";
import type { ObjectSelectionKind } from "../selection";
import type { HouseProject } from "../types";
import { EntityNotFoundError } from "./errors";

type HasId = { id: string };

export type CrudStoreConfig<T extends HasId, P> = {
  arrayKey: keyof HouseProject;
  entityKind: ObjectSelectionKind;
  applyPatch?(current: T, patch: P): T;
  validate?(merged: T, project: HouseProject): void;
  cascade?(project: HouseProject, removed: T): Partial<HouseProject>;
};

export type CrudStore<T extends HasId, P> = {
  add(project: HouseProject, draft: T): HouseProject;
  update(project: HouseProject, id: string, patch: P): HouseProject;
  remove(project: HouseProject, id: string): HouseProject;
};

export function createCrudStore<T extends HasId, P>(
  cfg: CrudStoreConfig<T, P>,
): CrudStore<T, P> {
  const applyPatch = cfg.applyPatch ?? ((current: T, patch: P) => ({ ...current, ...patch }));

  function getArray(project: HouseProject): T[] {
    return project[cfg.arrayKey] as unknown as T[];
  }

  function withArray(project: HouseProject, next: T[]): HouseProject {
    return { ...project, [cfg.arrayKey]: next };
  }

  return {
    add(project, draft) {
      cfg.validate?.(draft, project);
      const next = withArray(project, [...getArray(project), draft]);
      return assertValidProject(next);
    },

    update(project, id, patch) {
      const arr = getArray(project);
      const idx = arr.findIndex((e) => e.id === id);
      if (idx === -1) throw new EntityNotFoundError(cfg.entityKind, id);
      const merged = applyPatch(arr[idx], patch);
      cfg.validate?.(merged, project);
      const nextArr = [...arr];
      nextArr[idx] = merged;
      return assertValidProject(withArray(project, nextArr));
    },

    remove(project, id) {
      const arr = getArray(project);
      const removed = arr.find((e) => e.id === id);
      if (!removed) return project;
      const filtered = arr.filter((e) => e.id !== id);
      const cascadePatch = cfg.cascade?.(project, removed) ?? {};
      const next = {
        ...project,
        ...cascadePatch,
        [cfg.arrayKey]: filtered,
      };
      return assertValidProject(next);
    },
  };
}
```

- [ ] **Step 2.4：跑测试，确认通过**

```bash
bun run test src/__tests__/entityStores.test.ts 2>&1 | tail -10
```

**期望**：~7 tests pass。

- [ ] **Step 2.5：跑全量 lint + test**

```bash
bun run lint && bun run test
```

**期望**：全绿（334 + ~7 新 = 341 左右）。

- [ ] **Step 2.6：commit**

```bash
git add src/domain/mutations/crudStore.ts src/__tests__/entityStores.test.ts
git commit -m "$(cat <<'EOF'
feat(mutations): createCrudStore 工厂 + 单测

支持 add / update / remove，含可选 applyPatch / validate / cascade 三个钩子。
update 抛 EntityNotFoundError；remove id 不存在静默返回。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3：attachStore.ts 工厂

> **目标**：实现 `createAttachStore<T, P>`，覆盖 stair 的 storey-attached 模式。

**Files:**
- Create: `src/domain/mutations/attachStore.ts`
- Modify: `src/__tests__/entityStores.test.ts`（追加 createAttachStore describe 块）

- [ ] **Step 3.1：追加 createAttachStore 测试**

在 `src/__tests__/entityStores.test.ts` 末尾追加：

```ts
import { createAttachStore } from "../domain/mutations/attachStore";
import type { Stair } from "../domain/types";

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
```

- [ ] **Step 3.2：跑测试，确认失败**

```bash
bun run test src/__tests__/entityStores.test.ts 2>&1 | tail -10
```

**期望**：编译错误（找不到 attachStore）。

- [ ] **Step 3.3：实现 attachStore.ts**

```ts
// src/domain/mutations/attachStore.ts
import { assertValidProject } from "../constraints";
import type { HouseProject, Storey } from "../types";
import { EntityNotFoundError } from "./errors";

export type AttachStoreConfig<T, P> = {
  hostArrayKey: "storeys";
  field: keyof Storey;
  applyPatch?(current: T, patch: P): T;
  validate?(merged: T, host: Storey, project: HouseProject): void;
};

export type AttachStore<T, P> = {
  attach(project: HouseProject, hostId: string, value: T): HouseProject;
  update(project: HouseProject, hostId: string, patch: P): HouseProject;
  detach(project: HouseProject, hostId: string): HouseProject;
};

export function createAttachStore<T, P>(cfg: AttachStoreConfig<T, P>): AttachStore<T, P> {
  const applyPatch = cfg.applyPatch ?? ((current: T, patch: P) => ({ ...current, ...patch }));

  return {
    attach(project, hostId, value) {
      const idx = project.storeys.findIndex((s) => s.id === hostId);
      if (idx === -1) throw new EntityNotFoundError("storey", hostId);
      const host: Storey = { ...project.storeys[idx], [cfg.field]: value };
      cfg.validate?.(value, host, project);
      const storeys = [...project.storeys];
      storeys[idx] = host;
      return assertValidProject({ ...project, storeys });
    },

    update(project, hostId, patch) {
      const idx = project.storeys.findIndex((s) => s.id === hostId);
      if (idx === -1) return project;
      const current = project.storeys[idx][cfg.field] as T | undefined;
      if (current === undefined) return project;
      const merged = applyPatch(current, patch);
      const host: Storey = { ...project.storeys[idx], [cfg.field]: merged };
      cfg.validate?.(merged, host, project);
      const storeys = [...project.storeys];
      storeys[idx] = host;
      return assertValidProject({ ...project, storeys });
    },

    detach(project, hostId) {
      const idx = project.storeys.findIndex((s) => s.id === hostId);
      if (idx === -1) return project;
      const current = project.storeys[idx][cfg.field];
      if (current === undefined) return project;
      const { [cfg.field]: _removed, ...rest } = project.storeys[idx];
      const storeys = [...project.storeys];
      storeys[idx] = rest as Storey;
      return assertValidProject({ ...project, storeys });
    },
  };
}
```

- [ ] **Step 3.4：跑测试，确认通过**

```bash
bun run test src/__tests__/entityStores.test.ts 2>&1 | tail -10
```

**期望**：crudStore 7 + attachStore 9 = 16 tests pass。

- [ ] **Step 3.5：跑全量 lint + test**

```bash
bun run lint && bun run test
```

**期望**：全绿。

- [ ] **Step 3.6：commit**

```bash
git add src/domain/mutations/attachStore.ts src/__tests__/entityStores.test.ts
git commit -m "$(cat <<'EOF'
feat(mutations): createAttachStore 工厂 + 单测

支持 attach / update / detach，host 不存在或 host.field 为空时静默 no-op。
attach 抛 EntityNotFoundError when host missing。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4：singletonStore.ts 工厂

> **目标**：实现 `createSingletonStore<T, P>`，覆盖 roof 的 update/clear。

**Files:**
- Create: `src/domain/mutations/singletonStore.ts`
- Modify: `src/__tests__/entityStores.test.ts`

- [ ] **Step 4.1：追加 createSingletonStore 测试**

在 `entityStores.test.ts` 末尾追加：

```ts
import { createSingletonStore } from "../domain/mutations/singletonStore";
import { EntityStateError } from "../domain/mutations/errors";
import { addRoof, removeRoof } from "../domain/mutations";
import type { Roof } from "../domain/types";

describe("createSingletonStore (roof)", () => {
  const PI3 = Math.PI / 3;

  function projectWithRoof(): HouseProject {
    return addRoof(createSampleProject());
  }

  function projectWithoutRoof(): HouseProject {
    const p = createSampleProject();
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
```

- [ ] **Step 4.2：跑测试，确认失败**

```bash
bun run test src/__tests__/entityStores.test.ts 2>&1 | tail -10
```

**期望**：编译错误（找不到 singletonStore）。

- [ ] **Step 4.3：实现 singletonStore.ts**

```ts
// src/domain/mutations/singletonStore.ts
import { assertValidProject } from "../constraints";
import type { ObjectSelectionKind } from "../selection";
import type { HouseProject } from "../types";
import { EntityStateError } from "./errors";

export type SingletonStoreConfig<T, P> = {
  field: keyof HouseProject;
  entityKind: ObjectSelectionKind;
  applyPatch(current: T, patch: P): T;
  validate?(merged: T, project: HouseProject): void;
};

export type SingletonStore<T, P> = {
  update(project: HouseProject, patch: P): HouseProject;
  clear(project: HouseProject): HouseProject;
};

export function createSingletonStore<T, P>(
  cfg: SingletonStoreConfig<T, P>,
): SingletonStore<T, P> {
  return {
    update(project, patch) {
      const current = project[cfg.field] as unknown as T | undefined;
      if (current === undefined) {
        throw new EntityStateError(`No ${cfg.entityKind} to update.`);
      }
      const merged = cfg.applyPatch(current, patch);
      cfg.validate?.(merged, project);
      return assertValidProject({ ...project, [cfg.field]: merged });
    },

    clear(project) {
      if (project[cfg.field] === undefined) return project;
      return assertValidProject({ ...project, [cfg.field]: undefined });
    },
  };
}
```

- [ ] **Step 4.4：跑测试**

```bash
bun run test src/__tests__/entityStores.test.ts 2>&1 | tail -10
```

**期望**：全部 ~21 tests pass。

- [ ] **Step 4.5：跑全量 lint + test**

```bash
bun run lint && bun run test
```

**期望**：全绿。

- [ ] **Step 4.6：commit**

```bash
git add src/domain/mutations/singletonStore.ts src/__tests__/entityStores.test.ts
git commit -m "$(cat <<'EOF'
feat(mutations): createSingletonStore + 错误类型契约测试

update 抛 EntityStateError when field missing；clear 已 undefined 时 no-op。
追加三类 error 的 carrier-fields 单测。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5：stores.ts 配置 + mutations.ts 重构

> **目标**：用三个工厂建出 6 个 entity store；mutations.ts 改为 re-export 派生函数；删除被取代的实现；删除 obsolete 测试。本 task 是 M3 的核心 refactor，多步操作必须一次性完成保证测试不破。

**Files:**
- Create: `src/domain/mutations/stores.ts`
- Modify: `src/domain/mutations.ts`
- Modify: `src/__tests__/mutations.test.ts`（删除 1 条 obsolete 测试）

- [ ] **Step 5.1：创建 stores.ts**

```ts
// src/domain/mutations/stores.ts
import { wallLength } from "../measurements";
import type {
  Balcony,
  HouseProject,
  Opening,
  Roof,
  SkirtRoof,
  Stair,
  Wall,
} from "../types";
import { createCrudStore } from "./crudStore";
import { createAttachStore } from "./attachStore";
import { createSingletonStore } from "./singletonStore";
import { EntityRangeError, EntityStateError } from "./errors";

// ───── Patch 类型 ─────
export type OpeningPatch = Partial<Omit<Opening, "id" | "wallId">>;
export type WallPatch = Partial<Omit<Wall, "id" | "storeyId" | "start" | "end">>;
export type BalconyPatch = Partial<Omit<Balcony, "id" | "storeyId" | "attachedWallId">>;
export type StairPatch = Partial<Omit<Stair, never>>;
export type SkirtPatch = Partial<Omit<SkirtRoof, "id" | "hostWallId">>;
export type RoofPatch = Partial<Pick<Roof, "pitch" | "overhang" | "materialId">>;

// stores.ts 内部用的 unsafe 形态（保留运行期剔除受保护字段）
type UnsafeOpeningPatch = OpeningPatch & Partial<Pick<Opening, "id" | "wallId">>;
type UnsafeWallPatch = WallPatch & Partial<Pick<Wall, "id" | "storeyId" | "start" | "end">>;
type UnsafeBalconyPatch = BalconyPatch & Partial<Pick<Balcony, "id" | "storeyId" | "attachedWallId">>;

// ───── roof clamp 常量 ─────
const PITCH_MIN = Math.PI / 36;
const PITCH_MAX = Math.PI / 3;
const OVERHANG_MIN = 0;
const OVERHANG_MAX = 2;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ───── stores ─────
export const wallStore = createCrudStore<Wall, WallPatch>({
  arrayKey: "walls",
  entityKind: "wall",
  applyPatch: (wall, patch) => {
    const {
      id: _id,
      storeyId: _storeyId,
      start: _start,
      end: _end,
      ...allowed
    } = patch as UnsafeWallPatch;
    return { ...wall, ...allowed };
  },
  cascade: (project, removed) => ({
    openings: project.openings.filter((o) => o.wallId !== removed.id),
    balconies: project.balconies.filter((b) => b.attachedWallId !== removed.id),
    skirts: project.skirts.filter((s) => s.hostWallId !== removed.id),
  }),
});

export const openingStore = createCrudStore<Opening, OpeningPatch>({
  arrayKey: "openings",
  entityKind: "opening",
  applyPatch: (o, p) => {
    const { id: _id, wallId: _wallId, ...allowed } = p as UnsafeOpeningPatch;
    return { ...o, ...allowed };
  },
});

export const balconyStore = createCrudStore<Balcony, BalconyPatch>({
  arrayKey: "balconies",
  entityKind: "balcony",
  applyPatch: (b, p) => {
    const {
      id: _id,
      storeyId: _storeyId,
      attachedWallId: _attachedWallId,
      ...allowed
    } = p as UnsafeBalconyPatch;
    return { ...b, ...allowed };
  },
});

export const skirtStore = createCrudStore<SkirtRoof, SkirtPatch>({
  arrayKey: "skirts",
  entityKind: "skirt",
  applyPatch: (s, p) => ({ ...s, ...p }),
  validate: (skirt, project) => {
    const wall = project.walls.find((w) => w.id === skirt.hostWallId);
    if (!wall) throw new EntityStateError(`Host wall ${skirt.hostWallId} not found`);
    const wlen = wallLength(wall);
    const storey = project.storeys.find((s) => s.id === wall.storeyId);
    if (!storey) throw new EntityStateError(`Storey ${wall.storeyId} not found`);

    if (skirt.offset < 0) throw new EntityRangeError("offset", "offset 不能为负");
    if (skirt.width < 0.3) throw new EntityRangeError("width", "宽度过小");
    if (skirt.offset + skirt.width > wlen + 1e-6)
      throw new EntityRangeError("width", "披檐超出墙长");
    if (skirt.depth < 0.3 || skirt.depth > 4)
      throw new EntityRangeError("depth", "外伸深度超出范围");
    if (skirt.overhang < 0.05 || skirt.overhang > 1.5)
      throw new EntityRangeError("overhang", "出檐超出范围");
    if (skirt.pitch < Math.PI / 36 || skirt.pitch > Math.PI / 3)
      throw new EntityRangeError("pitch", "坡度超出范围");
    if (
      skirt.elevation <= storey.elevation ||
      skirt.elevation > storey.elevation + storey.height + 1e-6
    ) {
      throw new EntityRangeError("elevation", "挂接高度必须在所属楼层范围内");
    }
  },
});

export const stairStore = createAttachStore<Stair, StairPatch>({
  hostArrayKey: "storeys",
  field: "stair",
});

export const roofStore = createSingletonStore<Roof, RoofPatch>({
  field: "roof",
  entityKind: "roof",
  applyPatch: (roof, patch) => ({
    ...roof,
    ...(patch.pitch !== undefined ? { pitch: clamp(patch.pitch, PITCH_MIN, PITCH_MAX) } : {}),
    ...(patch.overhang !== undefined
      ? { overhang: clamp(patch.overhang, OVERHANG_MIN, OVERHANG_MAX) }
      : {}),
    ...(patch.materialId !== undefined ? { materialId: patch.materialId } : {}),
  }),
});
```

- [ ] **Step 5.2：重构 mutations.ts**

把 `src/domain/mutations.ts` 完全替换为：

```ts
// src/domain/mutations.ts
import { storeyTop } from "./measurements";
import { assertValidProject } from "./constraints";
import { canBuildRoof } from "./views";
import { createSkirtDraft } from "./drafts";
import type {
  Balcony,
  HouseProject,
  Opening,
  Point2,
  Roof,
  RoofEdgeKind,
  SkirtRoof,
  Stair,
  Storey,
  Wall,
} from "./types";
import {
  balconyStore,
  openingStore,
  roofStore,
  skirtStore,
  stairStore,
  wallStore,
} from "./mutations/stores";
import { EntityStateError } from "./mutations/errors";

// ───── Patch 类型 re-export（PropertyPanel 等引用）─────
export type {
  BalconyPatch,
  OpeningPatch,
  RoofPatch,
  SkirtPatch,
  StairPatch,
  WallPatch,
} from "./mutations/stores";

export type StoreyPatch = Partial<Omit<Storey, "id" | "elevation">>;

type UnsafeStoreyPatch = StoreyPatch & Partial<Pick<Storey, "id" | "elevation">>;

// ───── 从 store 派生 ─────
export const addWall = wallStore.add;
export const updateWall = wallStore.update;
export const removeWall = wallStore.remove;

export const addOpening = openingStore.add;
export const updateOpening = openingStore.update;
export const removeOpening = openingStore.remove;

export const addBalcony = balconyStore.add;
export const updateBalcony = balconyStore.update;
export const removeBalcony = balconyStore.remove;

export const updateSkirt = skirtStore.update;
export const removeSkirt = skirtStore.remove;

export const addStair = stairStore.attach;
export const updateStair = stairStore.update;
export const removeStair = stairStore.detach;

export const updateRoof = roofStore.update;
export const removeRoof = roofStore.clear;

// ───── bespoke：addSkirt（包装 createSkirtDraft + skirtStore.add）─────
export function addSkirt(project: HouseProject, hostWallId: string): HouseProject {
  const wall = project.walls.find((w) => w.id === hostWallId);
  if (!wall) throw new EntityStateError(`Wall ${hostWallId} not found`);
  if (!wall.exterior) throw new EntityStateError(`Skirt must attach to an exterior wall`);
  const skirt = createSkirtDraft(project, wall);
  return skirtStore.add(project, skirt);
}

// ───── bespoke：roof 的非派生操作 ─────
const PITCH_MIN_ADD = Math.PI / 36;
const PITCH_MAX_ADD = Math.PI / 3;
const DEFAULT_PITCH = Math.PI / 6; // 30°
const DEFAULT_OVERHANG = 0.6;

function topStoreyOf(project: HouseProject) {
  return [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
}

export function addRoof(project: HouseProject): HouseProject {
  if (project.roof) throw new EntityStateError("Roof already exists.");
  if (!canBuildRoof(project))
    throw new EntityStateError("Top storey is not a 4-wall axis-aligned rectangle.");
  const top = topStoreyOf(project);
  const topWalls = project.walls.filter((w) => w.storeyId === top.id && w.exterior);
  const lengths = topWalls.map((w) => ({
    wall: w,
    length: Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y),
  }));
  lengths.sort((a, b) => b.length - a.length || a.wall.id.localeCompare(b.wall.id));
  const eaveIds = new Set([lengths[0].wall.id, lengths[1].wall.id]);
  const edges: Record<string, RoofEdgeKind> = {};
  for (const w of topWalls) edges[w.id] = eaveIds.has(w.id) ? "eave" : "gable";

  const roofMaterial =
    project.materials.find((m) => m.kind === "roof") ?? project.materials[0];
  const roof: Roof = {
    edges,
    pitch: DEFAULT_PITCH,
    overhang: DEFAULT_OVERHANG,
    materialId: roofMaterial.id,
  };
  return assertValidProject({ ...project, roof });
}

export function toggleRoofEdge(project: HouseProject, wallId: string): HouseProject {
  if (!project.roof) throw new EntityStateError("No roof to toggle.");
  const flipped: RoofEdgeKind = project.roof.edges[wallId] === "eave" ? "gable" : "eave";
  const top = topStoreyOf(project);
  const topWalls = project.walls.filter((w) => w.storeyId === top.id && w.exterior);
  const nextEdges = { ...project.roof.edges, [wallId]: flipped };
  const effectiveEaves = topWalls.filter((w) => nextEdges[w.id] === "eave").length;
  if (effectiveEaves === 0) throw new EntityStateError("Roof must keep at least one eave.");
  return assertValidProject({ ...project, roof: { ...project.roof, edges: nextEdges } });
}

// ───── bespoke：楼层 ops ─────
export function updateStorey(
  project: HouseProject,
  storeyId: string,
  patch: StoreyPatch,
): HouseProject {
  const { id: _id, elevation: _elev, ...allowed } = patch as UnsafeStoreyPatch;
  const nextHeight = allowed.height;

  if (nextHeight !== undefined && (!Number.isFinite(nextHeight) || nextHeight <= 0)) {
    throw new EntityStateError(`Storey ${storeyId} height must be positive.`);
  }

  let nextElevation = 0;
  const storeys = project.storeys.map((storey) => {
    const next: Storey = {
      ...storey,
      ...(storey.id === storeyId ? allowed : {}),
      elevation: nextElevation,
    };
    nextElevation = storeyTop(nextElevation, next.height);
    return next;
  });

  const walls =
    nextHeight !== undefined
      ? project.walls.map((wall) =>
          wall.storeyId === storeyId ? { ...wall, height: nextHeight } : wall,
        )
      : project.walls;

  return assertValidProject({ ...project, storeys, walls });
}

export function applyWallMaterial(
  project: HouseProject,
  wallId: string,
  materialId: string,
): HouseProject {
  return updateWall(project, wallId, { materialId });
}

export function moveWall(
  project: HouseProject,
  wallId: string,
  start: Point2,
  end: Point2,
): HouseProject {
  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) => (wall.id === wallId ? { ...wall, start, end } : wall)),
  });
}

export function resizeStoreyExtent(
  project: HouseProject,
  storeyId: string,
  axis: "x" | "y",
  newSize: number,
): HouseProject {
  if (!Number.isFinite(newSize) || newSize <= 0) {
    throw new EntityStateError(`Storey ${storeyId} ${axis} extent must be positive.`);
  }

  const storeyWalls = project.walls.filter((wall) => wall.storeyId === storeyId);
  if (storeyWalls.length === 0) return project;

  const coords = storeyWalls.flatMap((wall) =>
    axis === "x" ? [wall.start.x, wall.end.x] : [wall.start.y, wall.end.y],
  );
  const minCoord = Math.min(...coords);
  const maxCoord = Math.max(...coords);
  const oldSize = maxCoord - minCoord;
  if (oldSize <= 0) {
    throw new EntityStateError(
      `Storey ${storeyId} has zero ${axis} extent and cannot be resized.`,
    );
  }

  const factor = newSize / oldSize;
  if (factor === 1) return project;

  const scaleAlong = (value: number) => minCoord + (value - minCoord) * factor;

  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) => {
      if (wall.storeyId !== storeyId) return wall;
      if (axis === "x") {
        return {
          ...wall,
          start: { x: scaleAlong(wall.start.x), y: wall.start.y },
          end: { x: scaleAlong(wall.end.x), y: wall.end.y },
        };
      }
      return {
        ...wall,
        start: { x: wall.start.x, y: scaleAlong(wall.start.y) },
        end: { x: wall.end.x, y: scaleAlong(wall.end.y) },
      };
    }),
    storeys: project.storeys.map((storey) => {
      if (storey.id !== storeyId || !storey.stair) return storey;
      const stair = storey.stair;
      if (axis === "x") {
        return {
          ...storey,
          stair: { ...stair, x: scaleAlong(stair.x), width: stair.width * factor },
        };
      }
      return {
        ...storey,
        stair: { ...stair, y: scaleAlong(stair.y), depth: stair.depth * factor },
      };
    }),
  });
}

export function translateStorey(
  project: HouseProject,
  storeyId: string,
  dx: number,
  dy: number,
): HouseProject {
  if (dx === 0 && dy === 0) return project;
  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) =>
      wall.storeyId === storeyId
        ? {
            ...wall,
            start: { x: wall.start.x + dx, y: wall.start.y + dy },
            end: { x: wall.end.x + dx, y: wall.end.y + dy },
          }
        : wall,
    ),
    storeys: project.storeys.map((storey) =>
      storey.id === storeyId && storey.stair
        ? {
            ...storey,
            stair: {
              ...storey.stair,
              x: storey.stair.x + dx,
              y: storey.stair.y + dy,
            },
          }
        : storey,
    ),
  });
}

// ───── 楼层增删（bespoke，依赖大量内部 helpers）─────
function nextStoreyNumber(project: HouseProject): number {
  const used = new Set<number>();
  for (const storey of project.storeys) {
    const match = /^(\d+)f$/i.exec(storey.id);
    if (match) used.add(Number(match[1]));
  }
  let n = project.storeys.length + 1;
  while (used.has(n)) n += 1;
  return n;
}

function freshStoreyIdAndLabel(project: HouseProject): { id: string; label: string } {
  const taken = new Set(project.storeys.map((s) => s.id));
  let n = nextStoreyNumber(project);
  while (taken.has(`${n}f`)) n += 1;
  return { id: `${n}f`, label: `${n}F` };
}

function dedupeId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}

function reindexId(
  oldId: string,
  oldStoreyId: string,
  newStoreyId: string,
  taken: Set<string>,
): string {
  const candidate = oldId.includes(oldStoreyId)
    ? oldId.replace(oldStoreyId, newStoreyId)
    : `${oldId}-${newStoreyId}`;
  return dedupeId(candidate, taken);
}

export function addStorey(project: HouseProject): HouseProject {
  const last = project.storeys[project.storeys.length - 1];
  const { id, label } = freshStoreyIdAndLabel(project);
  const elevation = last ? storeyTop(last.elevation, last.height) : 0;
  const storey: Storey = {
    id,
    label,
    elevation,
    height: last?.height ?? project.defaultStoreyHeight,
    slabThickness: last?.slabThickness ?? project.defaultWallThickness,
  };
  return assertValidProject({ ...project, storeys: [...project.storeys, storey], roof: undefined });
}

export function duplicateStorey(project: HouseProject, sourceStoreyId: string): HouseProject {
  const source = project.storeys.find((s) => s.id === sourceStoreyId);
  if (!source) {
    throw new EntityStateError(`Storey ${sourceStoreyId} not found.`);
  }
  const { id: newStoreyId, label: newLabel } = freshStoreyIdAndLabel(project);
  const last = project.storeys[project.storeys.length - 1];
  const elevation = last ? storeyTop(last.elevation, last.height) : 0;

  const wallIdsTaken = new Set(project.walls.map((w) => w.id));
  const openingIdsTaken = new Set(project.openings.map((o) => o.id));
  const balconyIdsTaken = new Set(project.balconies.map((b) => b.id));
  const wallIdMap = new Map<string, string>();

  const sourceWalls = project.walls.filter((w) => w.storeyId === sourceStoreyId);
  const newWalls: Wall[] = sourceWalls.map((wall) => {
    const newId = reindexId(wall.id, sourceStoreyId, newStoreyId, wallIdsTaken);
    wallIdsTaken.add(newId);
    wallIdMap.set(wall.id, newId);
    return {
      ...wall,
      id: newId,
      storeyId: newStoreyId,
      start: { ...wall.start },
      end: { ...wall.end },
    };
  });

  const sourceWallIds = new Set(sourceWalls.map((w) => w.id));
  const newOpenings: Opening[] = project.openings
    .filter((o) => sourceWallIds.has(o.wallId))
    .map((opening) => {
      const newId = reindexId(opening.id, sourceStoreyId, newStoreyId, openingIdsTaken);
      openingIdsTaken.add(newId);
      const remappedWallId = wallIdMap.get(opening.wallId);
      if (!remappedWallId) {
        throw new EntityStateError(`Cannot duplicate opening ${opening.id}: source wall missing.`);
      }
      return { ...opening, id: newId, wallId: remappedWallId };
    });

  const newBalconies: Balcony[] = project.balconies
    .filter((b) => b.storeyId === sourceStoreyId)
    .map((balcony) => {
      const newId = reindexId(balcony.id, sourceStoreyId, newStoreyId, balconyIdsTaken);
      balconyIdsTaken.add(newId);
      const remappedWallId = wallIdMap.get(balcony.attachedWallId);
      if (!remappedWallId) {
        throw new EntityStateError(`Cannot duplicate balcony ${balcony.id}: source wall missing.`);
      }
      return {
        ...balcony,
        id: newId,
        storeyId: newStoreyId,
        attachedWallId: remappedWallId,
      };
    });

  const newStorey: Storey = {
    id: newStoreyId,
    label: newLabel,
    elevation,
    height: source.height,
    slabThickness: source.slabThickness,
    stair: undefined,
  };

  return assertValidProject({
    ...project,
    storeys: [...project.storeys, newStorey],
    walls: [...project.walls, ...newWalls],
    openings: [...project.openings, ...newOpenings],
    balconies: [...project.balconies, ...newBalconies],
    roof: undefined,
  });
}

export function removeStorey(project: HouseProject, storeyId: string): HouseProject {
  if (project.storeys.length <= 1) {
    throw new EntityStateError("Cannot remove the last storey.");
  }
  if (!project.storeys.some((s) => s.id === storeyId)) {
    return project;
  }

  const remainingWalls = project.walls.filter((w) => w.storeyId !== storeyId);
  const remainingWallIds = new Set(remainingWalls.map((w) => w.id));
  const remainingOpenings = project.openings.filter((o) => remainingWallIds.has(o.wallId));
  const remainingBalconies = project.balconies.filter(
    (b) => b.storeyId !== storeyId && remainingWallIds.has(b.attachedWallId),
  );

  let nextElevation = 0;
  const remainingStoreys = project.storeys
    .filter((s) => s.id !== storeyId)
    .map((storey) => {
      const next: Storey = { ...storey, elevation: nextElevation };
      nextElevation = storeyTop(nextElevation, storey.height);
      return next;
    });

  // 顶层不能挂 stair
  const top = remainingStoreys[remainingStoreys.length - 1];
  if (top?.stair) {
    remainingStoreys[remainingStoreys.length - 1] = { ...top, stair: undefined };
  }

  return assertValidProject({
    ...project,
    storeys: remainingStoreys,
    walls: remainingWalls,
    openings: remainingOpenings,
    balconies: remainingBalconies,
    roof: undefined,
  });
}
```

注意几个细节：

- `removeStorey` 末端的 stair 顶层清理逻辑保留（原 487 行附近）；但本次重构里只搬运，**不动行为**
- 字符串错误改成 `EntityStateError`（保留原 message），便于外层 typed catch；测试如果有 `toThrow(/Cannot remove/)` 仍能匹配
- 楼层 ops（addStorey / duplicateStorey / removeStorey / updateStorey / resizeStoreyExtent / translateStorey）保留 bespoke 实现，行为不变

- [ ] **Step 5.3：删除 obsolete 测试**

`src/__tests__/mutations.test.ts:392-401` 的 `it("removes the skirt and clears matching selection", ...)` 整段删除。`describe("removeSkirt")` 块内的 `it("preserves other selections", ...)`（line 403）保留——它锁的是"store 不动其他 selection"的契约。

删除后该 describe 块只剩 1 个 it。

- [ ] **Step 5.4：跑 lint + test**

```bash
bun run lint && bun run test
```

**期望**：全绿。可能出现的失败 + 修复：

- 编译报"找不到 OpeningPatch/WallPatch 等"：`mutations.ts` 内 `export type { ... } from "./mutations/stores"` 句要正确写
- `mutations.test.ts` 某个 toThrow 用例失败：检查 `EntityStateError` 等是否保留了原 message（应该都保留了）
- `selectionRegistry.tsx` 编译失败：检查 import 的类型是否有变；理论上不应有

- [ ] **Step 5.5：commit**

```bash
git add src/domain/mutations/stores.ts src/domain/mutations.ts src/__tests__/mutations.test.ts
git commit -m "$(cat <<'EOF'
refactor(mutations): 6 entity stores + mutations.ts re-export 派生

stores.ts 用三个工厂建出 wall/opening/balcony/skirt CRUD、stair attach、roof singleton。
mutations.ts 13 个派生函数改为 1 行 export const；保留楼层 ops、addRoof、
toggleRoofEdge、addSkirt 包装、moveWall 等 bespoke。

顺手修：removeWall 现在级联清理 skirts（M1 漏了）。
顺手清：删除 mutations.test.ts 中 "removes skirt and clears matching selection"
测试，该行为已被 store 设计明确推到 selectionRegistry 层。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6：验收

> **目标**：确认所有契约满足，文件大小达标，公共 API 零变动。

- [ ] **Step 6.1：build + test + lint 全绿**

```bash
bun run lint && bun run test && bun run build
```

**期望**：全部通过。test 数量约 334 - 1（删除的）+ ~21（新增的 entityStores tests）= ~354。

- [ ] **Step 6.2：mutations.ts 行数检查**

```bash
wc -l src/domain/mutations.ts
```

**期望**：~250-330 行（目标是从 590 大幅下降；具体落点取决于楼层 ops 的占用，~280 行属正常）。

- [ ] **Step 6.3：grep 公共 API 调用方零改动**

```bash
grep -rn "addWall\|updateWall\|removeWall\|addOpening\|updateOpening\|removeOpening\|addBalcony\|updateBalcony\|removeBalcony\|addSkirt\|updateSkirt\|removeSkirt\|addStair\|updateStair\|removeStair\|addRoof\|updateRoof\|removeRoof" src/components/ src/app/ 2>&1 | head -30
```

**期望**：所有调用方仍引用同名函数；没有出现 `wallStore.add` 这种内部名。

- [ ] **Step 6.4：grep cascade 覆盖**

```bash
grep -A 5 "cascade:" src/domain/mutations/stores.ts
```

**期望**：看到 wall 的 cascade 包含 `openings` / `balconies` / `skirts` 三条。

- [ ] **Step 6.5：手动 walkthrough（可选）**

```bash
bun run dev
```

按以下路径验证：
1. 加一面墙 → 加门 → 加阳台 → 加披檐 → 都正常
2. 删除墙 → 该墙上的门 / 阳台 / **披檐**全部消失（M3 修复点）
3. 编辑披檐宽度到 0.1 → 显示中文错误"宽度过小"（错误链路：EntityRangeError → tryMutate 转字符串 → 红字显示）
4. 楼梯 add/update/remove 正常
5. 屋顶 add → update pitch → remove，正常

不强制做这步，单测覆盖足够。

- [ ] **Step 6.6：错误类型验收实验（可选）**

临时把 `errors.ts` 的 `EntityRangeError` 重命名为 `EntityRangeError2`，跑 `bun run lint`，应当看到 stores.ts / entityStores.test.ts 多处编译错误（说明类型在被实际使用，不是死锚）。**回滚命名**。

---

## 总结：commit 链

完成后 `git log --oneline 23e5636..HEAD`（spec 之后）应当看到：

```
<hash> refactor(mutations): 6 entity stores + mutations.ts re-export 派生
<hash> feat(mutations): createSingletonStore + 错误类型契约测试
<hash> feat(mutations): createAttachStore 工厂 + 单测
<hash> feat(mutations): createCrudStore 工厂 + 单测
<hash> feat(mutations): typed entity errors (NotFound / Range / State)
```

5 个代码 commit。

## 验收契约（重申 spec）

1. ✅ `bun run lint` + `bun run test` + `bun run build` 全绿
2. ✅ 公共 API 签名零变化（grep 验证）
3. ✅ `mutations.ts` 行数从 590 降到 ~280
4. ✅ 加新 CRUD 实体路径清晰：stores.ts 加 1 个 config + mutations.ts 加 3 个 export
5. ✅ 删 wall 时 skirt 一并消失（M3 顺手修复）
6. ✅ skirt 校验从 updateSkirt 内联搬到 skirtStore.validate，行为不变
7. ✅ 错误类型化锚点立起来（NotFound / Range / State）
