# P4C-α: 扁平 3D 原型 — v2 mutations + Storey 编辑器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v2 mutations 全套接通 —— 端口 v1 `domain/mutations*` 到 `domain/v2/mutations*`，给 v2 reducer 加 mutation actions，写 `StoreysEditor` 组件并接到 AppShell。**P4C-α 的最小可见结果**：用户能在浏览器里改 storey 标签 / 标高 / 层高 / 加层 / 删层，所有几何对象自动跟着 anchor 联动。

**Architecture:** v2 mutations 用 `crudStore` 单一抽象（v2 没 attachStore / singletonStore，因为 stair 和 roof 都是顶层数组）。Storey mutations 单独写（带级联逻辑：编辑层高 → 平移上方所有 storey）。`StoreysEditor` 组件是 spec §5.3 的层高/标高表，dispatch v2 mutation actions。

**Tech Stack:** TypeScript 5、React 19、vitest。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-flat-primitive-refactor-design.md` §5.3、§6.2 P4。

**关键决策：**
- v2 stores：6 个（walls / openings / slabs / roofs / balconies / stairs）— 全部 crudStore 模式。删 v1 的 `attachStore`（stair）和 `singletonStore`（roof）—— v2 stair/roof 都是顶层数组用 crudStore 处理。
- 删 v1 的 skirts mutations。
- Storey mutations 单独写在 `domain/v2/mutations/storeys.ts`：`addStorey / removeStorey / setStoreyLabel / setStoreyElevation / setStoreyHeight`（最后一个带级联）。
- v2 reducer 加 mutation actions：`add-X / update-X / remove-X` 模式（每个 entity 类型一组）+ storey 专用 actions。
- `StoreysEditor` 在 AppShell 2D 模式下放在 `ViewTabs` 上方（spec 说 PropertyPanel 顶部，但 PropertyPanel 是 P4C-β 才有，先临时放这里）。
- **不接通 PropertyPanel / ToolPalette 工具点击 / 拖拽** —— 那些是 P4C-β / γ。

---

## File Structure

新建：

- `src/domain/v2/mutations/errors.ts` — typed error classes（端口 v1 verbatim）
- `src/domain/v2/mutations/crudStore.ts` — 端口 v1 crudStore，适配 v2 类型
- `src/domain/v2/mutations/stores.ts` — 6 个 store 实例 + Patch 类型
- `src/domain/v2/mutations/storeys.ts` — storey 专用 mutations（含级联）
- `src/domain/v2/mutations.ts` — 顶层 re-exports（`addWall / updateWall / ... / addStorey / setStoreyHeight`）
- `src/components/StoreysEditor.tsx` — spec §5.3 的层高/标高表
- 新增测试：
  - `src/__tests__/domain-v2/mutations/crudStore.test.ts`
  - `src/__tests__/domain-v2/mutations/storeys.test.ts`
  - `src/__tests__/app-v2/projectReducer-mutations.test.ts`

修改：

- `src/app/v2/projectReducer.ts` — 加 mutation actions + 派发到 v2 mutations
- `src/components/AppShell.tsx` — 2D 模式顶部接通 StoreysEditor

不动：所有 v1 文件、其他 v2 已落代码（domain/v2 现有 + geometry/v2 + projection/v2 + rendering/v2）、其他 components。

P4C-α 结束后：
- `bun run test` 全套绿（新增 ~30+ 条测试，6 个 v1 UI 测试继续 skip）
- `bun run build` 全绿
- 浏览器 2D 模式顶部出现 storey 编辑器，能改 label / 标高 / 层高 / 添删层；3D + 2D 几何同步刷新

---

## Task 1: v2 mutations 基础设施（errors + crudStore）

**Files:**
- Create: `src/domain/v2/mutations/errors.ts`
- Create: `src/domain/v2/mutations/crudStore.ts`
- Create: `src/__tests__/domain-v2/mutations/crudStore.test.ts`

### Step 1: Read v1 references

Read in full:
- `src/domain/mutations/errors.ts`
- `src/domain/mutations/crudStore.ts`

### Step 2: Write the failing test

Create `src/__tests__/domain-v2/mutations/crudStore.test.ts`:

```typescript
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
    // First strip openings/balconies that reference w-front so cascade is unnecessary.
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
```

### Step 3: Run test (expect FAIL)

Run: `bun run test src/__tests__/domain-v2/mutations/crudStore.test.ts`
Expected: FAIL — modules not found.

### Step 4: Implement errors.ts

Create `src/domain/v2/mutations/errors.ts` with this exact content:

```typescript
export type EntityKindV2 =
  | "wall"
  | "opening"
  | "balcony"
  | "slab"
  | "roof"
  | "stair"
  | "storey";

export class EntityNotFoundError extends Error {
  constructor(kind: EntityKindV2, id: string) {
    super(`${kind} not found: ${id}`);
    this.name = "EntityNotFoundError";
  }
}

export class EntityRangeError extends Error {
  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
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

### Step 5: Implement crudStore.ts

Create `src/domain/v2/mutations/crudStore.ts` with this exact content:

```typescript
import { assertValidProject } from "../validate";
import type { HouseProject } from "../types";
import { EntityNotFoundError, type EntityKindV2 } from "./errors";

type HasId = { id: string };

export type CrudStoreConfig<T extends HasId, P> = {
  arrayKey: keyof HouseProject;
  entityKind: EntityKindV2;
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

### Step 6: Run tests + build

```bash
bun run test src/__tests__/domain-v2/mutations/crudStore.test.ts
bun run build
```

Expected: 6 tests pass, build green.

### Step 7: Commit

```bash
git add src/domain/v2/mutations/errors.ts src/domain/v2/mutations/crudStore.ts src/__tests__/domain-v2/mutations/crudStore.test.ts
git commit -m "feat(domain-v2): mutations infrastructure (crudStore + errors)"
```

---

## Task 2: v2 stores 实例 + Storey mutations

**Files:**
- Create: `src/domain/v2/mutations/stores.ts` — 6 stores
- Create: `src/domain/v2/mutations/storeys.ts` — storey mutations
- Create: `src/domain/v2/mutations.ts` — top-level re-exports
- Create: `src/__tests__/domain-v2/mutations/storeys.test.ts`

### Step 1: Write the failing storey tests

Create `src/__tests__/domain-v2/mutations/storeys.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createV2SampleProject } from "../../../domain/v2/sampleProject";
import {
  addStorey,
  removeStorey,
  setStoreyElevation,
  setStoreyHeight,
  setStoreyLabel,
} from "../../../domain/v2/mutations/storeys";

describe("setStoreyLabel", () => {
  it("renames a storey", () => {
    const project = createV2SampleProject();
    const next = setStoreyLabel(project, "1f", "Ground");
    expect(next.storeys.find((s) => s.id === "1f")?.label).toBe("Ground");
  });
});

describe("setStoreyElevation", () => {
  it("changes a single storey's elevation without cascading", () => {
    const project = createV2SampleProject();
    const next = setStoreyElevation(project, "2f", 4.0);
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBe(4.0);
    // Other storeys untouched
    expect(next.storeys.find((s) => s.id === "1f")?.elevation).toBe(0);
    expect(next.storeys.find((s) => s.id === "roof")?.elevation).toBe(6.4);
  });
});

describe("setStoreyHeight (cascade)", () => {
  it("editing 1F height shifts all storeys above by delta", () => {
    const project = createV2SampleProject();
    // 1F height = 2F.elevation - 1F.elevation = 3.2 - 0 = 3.2
    // Set new height to 3.5 → delta 0.3 → 2F → 3.5, roof → 6.7
    const next = setStoreyHeight(project, "1f", 3.5);
    expect(next.storeys.find((s) => s.id === "1f")?.elevation).toBe(0);
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBeCloseTo(3.5);
    expect(next.storeys.find((s) => s.id === "roof")?.elevation).toBeCloseTo(6.7);
  });

  it("editing 2F height shifts only roof, not 1F", () => {
    const project = createV2SampleProject();
    // 2F height = roof.elevation - 2F.elevation = 6.4 - 3.2 = 3.2
    // Set new height to 3.0 → delta -0.2 → roof → 6.2; 1F + 2F unchanged
    const next = setStoreyHeight(project, "2f", 3.0);
    expect(next.storeys.find((s) => s.id === "1f")?.elevation).toBe(0);
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBe(3.2);
    expect(next.storeys.find((s) => s.id === "roof")?.elevation).toBeCloseTo(6.2);
  });

  it("throws when storey is the topmost (no next to compute height from)", () => {
    const project = createV2SampleProject();
    expect(() => setStoreyHeight(project, "roof", 3.0)).toThrow(/topmost/i);
  });
});

describe("addStorey", () => {
  it("appends a new storey above the current top with default height 3.2m", () => {
    const project = createV2SampleProject();
    // Current top is "roof" at 6.4m. New storey should be at 6.4 + 3.2 = 9.6m.
    const next = addStorey(project);
    expect(next.storeys.length).toBe(project.storeys.length + 1);
    const newStorey = next.storeys[next.storeys.length - 1];
    expect(newStorey.elevation).toBeCloseTo(9.6);
  });
});

describe("removeStorey", () => {
  it("removes a storey when nothing references it", () => {
    const project = createV2SampleProject();
    const newProject = addStorey(project);
    const idToRemove = newProject.storeys[newProject.storeys.length - 1].id;
    const next = removeStorey(newProject, idToRemove);
    expect(next.storeys.find((s) => s.id === idToRemove)).toBeUndefined();
  });

  it("throws when an object still references the storey", () => {
    const project = createV2SampleProject();
    // 1F has walls anchored to it.
    expect(() => removeStorey(project, "1f")).toThrow(/in use/i);
  });
});
```

### Step 2: Run test (expect FAIL — modules not found)

### Step 3: Implement `src/domain/v2/mutations/stores.ts`

Create with this exact content:

```typescript
import type {
  Balcony,
  HouseProject,
  Opening,
  Roof,
  Slab,
  Stair,
  Wall,
} from "../types";
import { createCrudStore } from "./crudStore";

// ───── Patch types ─────
export type WallPatch = Partial<Omit<Wall, "id">>;
export type OpeningPatch = Partial<Omit<Opening, "id" | "wallId">>;
export type BalconyPatch = Partial<Omit<Balcony, "id" | "attachedWallId">>;
export type SlabPatch = Partial<Omit<Slab, "id">>;
export type RoofPatch = Partial<Omit<Roof, "id">>;
export type StairPatch = Partial<Omit<Stair, "id">>;

// Internal patch types that allow attempted writes to protected fields (the
// applyPatch handlers strip them at runtime).
type UnsafeWallPatch = WallPatch & Partial<Pick<Wall, "id">>;
type UnsafeOpeningPatch = OpeningPatch & Partial<Pick<Opening, "id" | "wallId">>;
type UnsafeBalconyPatch = BalconyPatch & Partial<Pick<Balcony, "id" | "attachedWallId">>;
type UnsafeSlabPatch = SlabPatch & Partial<Pick<Slab, "id">>;
type UnsafeRoofPatch = RoofPatch & Partial<Pick<Roof, "id">>;
type UnsafeStairPatch = StairPatch & Partial<Pick<Stair, "id">>;

// ───── Stores ─────

export const wallStore = createCrudStore<Wall, WallPatch>({
  arrayKey: "walls",
  entityKind: "wall",
  applyPatch: (wall, patch) => {
    const { id: _id, ...allowed } = patch as UnsafeWallPatch;
    return { ...wall, ...allowed };
  },
  cascade: (project, removed) => ({
    openings: project.openings.filter((o) => o.wallId !== removed.id),
    balconies: project.balconies.filter((b) => b.attachedWallId !== removed.id),
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
    const { id: _id, attachedWallId: _attachedWallId, ...allowed } = p as UnsafeBalconyPatch;
    return { ...b, ...allowed };
  },
});

export const slabStore = createCrudStore<Slab, SlabPatch>({
  arrayKey: "slabs",
  entityKind: "slab",
  applyPatch: (slab, patch) => {
    const { id: _id, ...allowed } = patch as UnsafeSlabPatch;
    return { ...slab, ...allowed };
  },
});

export const roofStore = createCrudStore<Roof, RoofPatch>({
  arrayKey: "roofs",
  entityKind: "roof",
  applyPatch: (roof, patch) => {
    const { id: _id, ...allowed } = patch as UnsafeRoofPatch;
    return { ...roof, ...allowed };
  },
});

export const stairStore = createCrudStore<Stair, StairPatch>({
  arrayKey: "stairs",
  entityKind: "stair",
  applyPatch: (stair, patch) => {
    const { id: _id, ...allowed } = patch as UnsafeStairPatch;
    return { ...stair, ...allowed };
  },
});
```

### Step 4: Implement `src/domain/v2/mutations/storeys.ts`

Create with this exact content:

```typescript
import { assertValidProject } from "../validate";
import type { HouseProject, Storey } from "../types";
import { EntityNotFoundError, EntityStateError } from "./errors";

const DEFAULT_STOREY_HEIGHT = 3.2;

function findStorey(project: HouseProject, storeyId: string): Storey {
  const s = project.storeys.find((x) => x.id === storeyId);
  if (!s) throw new EntityNotFoundError("storey", storeyId);
  return s;
}

function generateStoreyId(existing: readonly string[]): string {
  let n = existing.length + 1;
  while (existing.includes(`s${n}`)) n += 1;
  return `s${n}`;
}

export function setStoreyLabel(
  project: HouseProject,
  storeyId: string,
  label: string,
): HouseProject {
  findStorey(project, storeyId);
  const storeys = project.storeys.map((s) =>
    s.id === storeyId ? { ...s, label } : s,
  );
  return assertValidProject({ ...project, storeys });
}

export function setStoreyElevation(
  project: HouseProject,
  storeyId: string,
  elevation: number,
): HouseProject {
  findStorey(project, storeyId);
  const storeys = project.storeys.map((s) =>
    s.id === storeyId ? { ...s, elevation } : s,
  );
  return assertValidProject({ ...project, storeys });
}

/** Edit "this storey's height" = adjust the next storey's elevation + cascade
 *  every storey above by the same delta. */
export function setStoreyHeight(
  project: HouseProject,
  storeyId: string,
  newHeight: number,
): HouseProject {
  // Sort by elevation to find "next" storey above.
  const sorted = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const idx = sorted.findIndex((s) => s.id === storeyId);
  if (idx === -1) throw new EntityNotFoundError("storey", storeyId);
  if (idx === sorted.length - 1) {
    throw new EntityStateError("Storey is topmost — no height to set");
  }
  const current = sorted[idx];
  const next = sorted[idx + 1];
  const currentHeight = next.elevation - current.elevation;
  const delta = newHeight - currentHeight;
  // Apply delta to all storeys at index ≥ idx + 1.
  const shiftedIds = new Set(sorted.slice(idx + 1).map((s) => s.id));
  const storeys = project.storeys.map((s) =>
    shiftedIds.has(s.id) ? { ...s, elevation: s.elevation + delta } : s,
  );
  return assertValidProject({ ...project, storeys });
}

export function addStorey(project: HouseProject, label?: string): HouseProject {
  const sorted = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const top = sorted[sorted.length - 1];
  const newId = generateStoreyId(project.storeys.map((s) => s.id));
  const newElevation = top
    ? top.elevation + DEFAULT_STOREY_HEIGHT
    : 0;
  const newLabel = label ?? `${project.storeys.length + 1}F`;
  const storeys = [
    ...project.storeys,
    { id: newId, label: newLabel, elevation: newElevation },
  ];
  return assertValidProject({ ...project, storeys });
}

export function removeStorey(project: HouseProject, storeyId: string): HouseProject {
  findStorey(project, storeyId);
  // Check no objects reference this storey via anchor.
  const referencedByAnchor = (anchor: { kind: string; storeyId?: string }): boolean =>
    anchor.kind === "storey" && anchor.storeyId === storeyId;
  const used =
    project.walls.some(
      (w) => referencedByAnchor(w.bottom) || referencedByAnchor(w.top),
    ) ||
    project.slabs.some((s) => referencedByAnchor(s.top)) ||
    project.roofs.some((r) => referencedByAnchor(r.base)) ||
    project.balconies.some((b) => referencedByAnchor(b.slabTop)) ||
    project.stairs.some(
      (st) => referencedByAnchor(st.from) || referencedByAnchor(st.to),
    );
  if (used) {
    throw new EntityStateError(`Storey ${storeyId} is in use by anchored objects`);
  }
  const storeys = project.storeys.filter((s) => s.id !== storeyId);
  return assertValidProject({ ...project, storeys });
}
```

### Step 5: Implement `src/domain/v2/mutations.ts` top-level re-exports

Create with this exact content:

```typescript
export {
  wallStore,
  openingStore,
  balconyStore,
  slabStore,
  roofStore,
  stairStore,
  type WallPatch,
  type OpeningPatch,
  type BalconyPatch,
  type SlabPatch,
  type RoofPatch,
  type StairPatch,
} from "./mutations/stores";

import {
  wallStore,
  openingStore,
  balconyStore,
  slabStore,
  roofStore,
  stairStore,
} from "./mutations/stores";

export const addWall = wallStore.add;
export const updateWall = wallStore.update;
export const removeWall = wallStore.remove;

export const addOpening = openingStore.add;
export const updateOpening = openingStore.update;
export const removeOpening = openingStore.remove;

export const addBalcony = balconyStore.add;
export const updateBalcony = balconyStore.update;
export const removeBalcony = balconyStore.remove;

export const addSlab = slabStore.add;
export const updateSlab = slabStore.update;
export const removeSlab = slabStore.remove;

export const addRoof = roofStore.add;
export const updateRoof = roofStore.update;
export const removeRoof = roofStore.remove;

export const addStair = stairStore.add;
export const updateStair = stairStore.update;
export const removeStair = stairStore.remove;

export {
  setStoreyLabel,
  setStoreyElevation,
  setStoreyHeight,
  addStorey,
  removeStorey,
} from "./mutations/storeys";

export {
  EntityNotFoundError,
  EntityRangeError,
  EntityStateError,
  type EntityKindV2,
} from "./mutations/errors";
```

### Step 6: Run tests + build

```bash
bun run test src/__tests__/domain-v2/mutations/
bun run build
```

Expected: storey tests pass (8 tests in storeys.test.ts), build green.

### Step 7: Commit

```bash
git add src/domain/v2/mutations/stores.ts src/domain/v2/mutations/storeys.ts src/domain/v2/mutations.ts src/__tests__/domain-v2/mutations/storeys.test.ts
git commit -m "feat(domain-v2): stores + storey mutations (label/elevation/height/add/remove)"
```

---

## Task 3: v2 reducer mutation actions

**Files:**
- Modify: `src/app/v2/projectReducer.ts`
- Create: `src/__tests__/app-v2/projectReducer-mutations.test.ts`

### Step 1: Write the failing reducer tests

Create `src/__tests__/app-v2/projectReducer-mutations.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createV2SampleProject } from "../../domain/v2/sampleProject";
import { withSessionDefaults, projectReducerV2 } from "../../app/v2/projectReducer";

describe("projectReducerV2 — mutation actions", () => {
  it("set-storey-label dispatches setStoreyLabel", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, {
      type: "set-storey-label",
      storeyId: "1f",
      label: "Ground",
    });
    expect(next.storeys.find((s) => s.id === "1f")?.label).toBe("Ground");
  });

  it("set-storey-elevation dispatches setStoreyElevation", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, {
      type: "set-storey-elevation",
      storeyId: "2f",
      elevation: 4.0,
    });
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBe(4.0);
  });

  it("set-storey-height cascades to upper storeys", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, {
      type: "set-storey-height",
      storeyId: "1f",
      height: 3.5,
    });
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBeCloseTo(3.5);
    expect(next.storeys.find((s) => s.id === "roof")?.elevation).toBeCloseTo(6.7);
  });

  it("add-storey appends a new storey", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, { type: "add-storey" });
    expect(next.storeys.length).toBe(initial.storeys.length + 1);
  });

  it("update-wall dispatches updateWall", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, {
      type: "update-wall",
      wallId: "w-front",
      patch: { thickness: 0.3 },
    });
    expect(next.walls.find((w) => w.id === "w-front")?.thickness).toBe(0.3);
  });

  it("update-opening dispatches updateOpening", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, {
      type: "update-opening",
      openingId: "o-front-1f-win",
      patch: { width: 2.0 },
    });
    expect(
      next.openings.find((o) => o.id === "o-front-1f-win")?.width,
    ).toBe(2.0);
  });
});
```

### Step 2: Extend `src/app/v2/projectReducer.ts`

Append to the existing reducer file. First, expand the imports:

```typescript
import {
  setStoreyLabel,
  setStoreyElevation,
  setStoreyHeight,
  addStorey,
  removeStorey,
  updateWall,
  removeWall,
  addWall,
  updateOpening,
  removeOpening,
  addOpening,
  updateBalcony,
  removeBalcony,
  addBalcony,
  updateSlab,
  removeSlab,
  addSlab,
  updateRoof,
  removeRoof,
  addRoof,
  updateStair,
  removeStair,
  addStair,
  type WallPatch,
  type OpeningPatch,
  type BalconyPatch,
  type SlabPatch,
  type RoofPatch,
  type StairPatch,
} from "../../domain/v2/mutations";
import type {
  Wall,
  Opening,
  Balcony,
  Slab,
  Roof,
  Stair,
} from "../../domain/v2/types";
```

(Keep existing imports.)

Then expand `ProjectActionV2` union (add cases AFTER the existing ones):

```typescript
export type ProjectActionV2 =
  | { type: "set-mode"; mode: ModeV2 }
  | { type: "set-view"; viewId: ViewIdV2 }
  | { type: "set-tool"; toolId: ToolIdV2 }
  | { type: "select"; selection: SelectionV2 }
  | { type: "replace-project"; project: ProjectStateV2 }
  // Storey mutations
  | { type: "set-storey-label"; storeyId: string; label: string }
  | { type: "set-storey-elevation"; storeyId: string; elevation: number }
  | { type: "set-storey-height"; storeyId: string; height: number }
  | { type: "add-storey" }
  | { type: "remove-storey"; storeyId: string }
  // Wall mutations
  | { type: "add-wall"; wall: Wall }
  | { type: "update-wall"; wallId: string; patch: WallPatch }
  | { type: "remove-wall"; wallId: string }
  // Opening mutations
  | { type: "add-opening"; opening: Opening }
  | { type: "update-opening"; openingId: string; patch: OpeningPatch }
  | { type: "remove-opening"; openingId: string }
  // Balcony mutations
  | { type: "add-balcony"; balcony: Balcony }
  | { type: "update-balcony"; balconyId: string; patch: BalconyPatch }
  | { type: "remove-balcony"; balconyId: string }
  // Slab mutations
  | { type: "add-slab"; slab: Slab }
  | { type: "update-slab"; slabId: string; patch: SlabPatch }
  | { type: "remove-slab"; slabId: string }
  // Roof mutations
  | { type: "add-roof"; roof: Roof }
  | { type: "update-roof"; roofId: string; patch: RoofPatch }
  | { type: "remove-roof"; roofId: string }
  // Stair mutations
  | { type: "add-stair"; stair: Stair }
  | { type: "update-stair"; stairId: string; patch: StairPatch }
  | { type: "remove-stair"; stairId: string };
```

Then extend the reducer switch. After the existing cases, add:

```typescript
    // Storey mutations
    case "set-storey-label":
      return mergeProject(state, setStoreyLabel(state, action.storeyId, action.label));
    case "set-storey-elevation":
      return mergeProject(state, setStoreyElevation(state, action.storeyId, action.elevation));
    case "set-storey-height":
      return mergeProject(state, setStoreyHeight(state, action.storeyId, action.height));
    case "add-storey":
      return mergeProject(state, addStorey(state));
    case "remove-storey":
      return mergeProject(state, removeStorey(state, action.storeyId));

    // Wall mutations
    case "add-wall":
      return mergeProject(state, addWall(state, action.wall));
    case "update-wall":
      return mergeProject(state, updateWall(state, action.wallId, action.patch));
    case "remove-wall":
      return mergeProject(state, removeWall(state, action.wallId));

    // Opening mutations
    case "add-opening":
      return mergeProject(state, addOpening(state, action.opening));
    case "update-opening":
      return mergeProject(state, updateOpening(state, action.openingId, action.patch));
    case "remove-opening":
      return mergeProject(state, removeOpening(state, action.openingId));

    // Balcony mutations
    case "add-balcony":
      return mergeProject(state, addBalcony(state, action.balcony));
    case "update-balcony":
      return mergeProject(state, updateBalcony(state, action.balconyId, action.patch));
    case "remove-balcony":
      return mergeProject(state, removeBalcony(state, action.balconyId));

    // Slab mutations
    case "add-slab":
      return mergeProject(state, addSlab(state, action.slab));
    case "update-slab":
      return mergeProject(state, updateSlab(state, action.slabId, action.patch));
    case "remove-slab":
      return mergeProject(state, removeSlab(state, action.slabId));

    // Roof mutations
    case "add-roof":
      return mergeProject(state, addRoof(state, action.roof));
    case "update-roof":
      return mergeProject(state, updateRoof(state, action.roofId, action.patch));
    case "remove-roof":
      return mergeProject(state, removeRoof(state, action.roofId));

    // Stair mutations
    case "add-stair":
      return mergeProject(state, addStair(state, action.stair));
    case "update-stair":
      return mergeProject(state, updateStair(state, action.stairId, action.patch));
    case "remove-stair":
      return mergeProject(state, removeStair(state, action.stairId));
```

Add a helper `mergeProject` at the bottom of the reducer module (preserves session state across mutations):

```typescript
import type { HouseProject } from "../../domain/v2/types";

function mergeProject(state: ProjectStateV2, updated: HouseProject): ProjectStateV2 {
  return {
    ...updated,
    mode: state.mode,
    activeView: state.activeView,
    activeTool: state.activeTool,
    selection: state.selection,
  };
}
```

### Step 3: Run tests + build

```bash
bun run test src/__tests__/app-v2/projectReducer-mutations.test.ts
bun run build
```

Expected: 6 reducer tests pass, build green.

### Step 4: Commit

```bash
git add src/app/v2/projectReducer.ts src/__tests__/app-v2/projectReducer-mutations.test.ts
git commit -m "feat(app-v2): reducer mutation actions (storey + walls/openings/slabs/roofs/balconies/stairs)"
```

---

## Task 4: StoreysEditor 组件 + AppShell 集成

**Files:**
- Create: `src/components/StoreysEditor.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/styles.css` (CSS for storeys-editor)

### Step 1: Create `src/components/StoreysEditor.tsx`

Create with this exact content:

```typescript
import type { ProjectStateV2, ProjectActionV2 } from "../app/v2/projectReducer";

type StoreysEditorProps = {
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function formatElevation(z: number): string {
  if (Math.abs(z) < 0.001) return "±0.000";
  const sign = z >= 0 ? "+" : "−";
  return `${sign}${Math.abs(z).toFixed(3)}`;
}

export function StoreysEditor({ project, dispatch }: StoreysEditorProps) {
  const sorted = [...project.storeys].sort((a, b) => a.elevation - b.elevation);

  return (
    <div className="storeys-editor" role="group" aria-label="楼层管理">
      <div className="storeys-editor-row storeys-editor-header">
        <span>楼层</span>
        <span>标签</span>
        <span>标高 (m)</span>
        <span>层高 (m)</span>
        <span></span>
      </div>
      {sorted.map((storey, i) => {
        const next = sorted[i + 1];
        const computedHeight = next ? next.elevation - storey.elevation : null;
        return (
          <div key={storey.id} className="storeys-editor-row">
            <span className="storey-id">{storey.id}</span>
            <input
              type="text"
              value={storey.label}
              onChange={(e) =>
                dispatch({
                  type: "set-storey-label",
                  storeyId: storey.id,
                  label: e.target.value,
                })
              }
            />
            <input
              type="number"
              step="0.05"
              value={storey.elevation.toFixed(3)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) {
                  dispatch({
                    type: "set-storey-elevation",
                    storeyId: storey.id,
                    elevation: v,
                  });
                }
              }}
              aria-label={`${storey.label} 标高`}
              title={`${storey.label} 标高 ${formatElevation(storey.elevation)}m`}
            />
            {computedHeight !== null ? (
              <input
                type="number"
                step="0.05"
                min="0.5"
                value={computedHeight.toFixed(3)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0.5) {
                    dispatch({
                      type: "set-storey-height",
                      storeyId: storey.id,
                      height: v,
                    });
                  }
                }}
                aria-label={`${storey.label} 层高`}
              />
            ) : (
              <span className="storey-no-height">—</span>
            )}
            <button
              type="button"
              className="storey-remove"
              onClick={() =>
                dispatch({ type: "remove-storey", storeyId: storey.id })
              }
              title={`删除 ${storey.label}`}
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="storey-add-button"
        onClick={() => dispatch({ type: "add-storey" })}
      >
        + 添加楼层
      </button>
    </div>
  );
}
```

### Step 2: Append CSS to `src/styles.css`

```css

/* P4C-α: StoreysEditor */
.storeys-editor {
  background: white;
  border-bottom: 1px solid #ddd;
  padding: 12px 16px;
  font-size: 0.9em;
}
.storeys-editor-row {
  display: grid;
  grid-template-columns: 60px 120px 120px 120px 32px;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
}
.storeys-editor-header {
  font-weight: 500;
  color: #666;
  border-bottom: 1px solid #eee;
  padding-bottom: 6px;
  margin-bottom: 6px;
}
.storey-id {
  font-family: ui-monospace, monospace;
  color: #888;
}
.storeys-editor input[type="text"],
.storeys-editor input[type="number"] {
  padding: 3px 6px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 0.95em;
}
.storey-no-height {
  text-align: center;
  color: #aaa;
}
.storey-remove {
  width: 24px;
  height: 24px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 3px;
  cursor: pointer;
  color: #c00;
}
.storey-remove:hover {
  border-color: #c00;
  background: #fff5f5;
}
.storey-add-button {
  margin-top: 8px;
  padding: 4px 12px;
  border: 1px dashed #999;
  background: transparent;
  border-radius: 3px;
  cursor: pointer;
}
.storey-add-button:hover {
  border-color: #333;
}
```

### Step 3: Update `src/components/AppShell.tsx`

Find the existing 2D mode block:

```tsx
        ) : (
          <div className="editor-2d">
            <ViewTabs
              project={project}
              onChange={(viewId) => dispatch({ type: "set-view", viewId })}
            />
```

Replace with (add `<StoreysEditor>` above `<ViewTabs>`):

```tsx
        ) : (
          <div className="editor-2d">
            <StoreysEditor project={project} dispatch={dispatch} />
            <ViewTabs
              project={project}
              onChange={(viewId) => dispatch({ type: "set-view", viewId })}
            />
```

Add the import at the top:

```typescript
import { StoreysEditor } from "./StoreysEditor";
```

### Step 4: Run tests + build

```bash
bun run test
bun run build
```

Expected: full suite green (mutations tests + existing 503 + 6 skipped); build green.

### Step 5: Commit

```bash
git add src/components/StoreysEditor.tsx src/components/AppShell.tsx src/styles.css
git commit -m "feat(components): StoreysEditor (label/elevation/height/add/remove rows)"
```

---

## Task 5: Final sweep + browser smoke

**Files:** None (verification only).

### Step 1: Full test suite

Run: `bun run test`
Expected: all tests + 6 skipped pass.

### Step 2: Build

Run: `bun run build`
Expected: tsc + vite green.

### Step 3: Diff stat

```bash
git diff [P4B-final-commit]..HEAD --stat
```

Expected: ~10 files modified/added (4 mutations files + 1 reducer + 1 StoreysEditor + AppShell + styles + 3 test files).

### Step 4: Manual smoke

User opens browser:
- 2D mode: see `StoreysEditor` strip at top with 3 rows (1F / 2F / roof)
- Edit "1F" label → see immediate render
- Change "1F 层高" to 3.5m → 3D + 2D both reflect (2F floor moves up, all 2F walls/openings/etc shift with anchors)
- Click "+ 添加楼层" → new "4F" appears at top with default elevation
- Click "×" on the new storey → it disappears
- Try "×" on 1F (which has walls anchored): should fail silently OR show error toast (P4C-α just throws — UI catches and ignores for now)

---

## Done Criteria

- `bun run test` 全套绿
- `bun run build` 全套绿
- 浏览器 2D 模式顶部出现 StoreysEditor，编辑层高时几何同步刷新
- v1 + 已落 v2 代码（geometry/v2、projection/v2、rendering/v2 etc.）字面零修改

## P4C-α 不做（明确边界）

- PropertyPanel（每对象编辑器）→ P4C-β
- ToolPalette 工具点击 → 创建对象 → P4C-γ
- 拖拽编辑（移动墙端点等）→ P4C-γ
- 重启用 P4A 期间 skip 的 6 个测试 → P4C-γ
- StoreysEditor 在 3D 模式下也显示 → 后续 polish

## 风险

1. **Storey mutations 级联逻辑容易出错**：setStoreyHeight 的级联在编辑顶层往下时方向要对（应该是"this 之后所有"）。测试已覆盖。
2. **mergeProject 漏 session 字段**：如果 reducer 加了新 session 字段（mode/view/tool/selection 之外），mergeProject 也要带上。现在固定 4 个，足够。
3. **v2 reducer mutation actions 触发 assertValidProject 抛错** — 例如改 storey elevation 让某面墙长度变 0。UI 层应该 catch 并忽略 OR 显示错误提示。当前实现 throw 出 reducer，React 错误边界会接住但用户体验差。后续 polish 加 try-catch 包装层。
