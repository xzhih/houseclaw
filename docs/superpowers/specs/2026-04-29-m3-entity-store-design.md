# M3：EntityStore\<T\>

日期：2026-04-29
分支：`xzhih-dev`
路线图：`docs/2026-04-28-iteration-friction-roadmap.md`

## 背景

`src/domain/mutations.ts` 累积了 30+ 函数 / 590 行，三种实体形态混杂：

- **CRUD（4 种）**：wall / opening / balcony / skirt — `addX(project, draft)` + `updateX(project, id, patch)` + `removeX(project, id)`
- **Attach（1 种）**：stair — 挂在 `Storey.stair` 上
- **Singleton（1 种）**：roof — 唯一实例

加新 kind 要手抄三个函数；校验风格不一致（skirt 在 `updateSkirt:56-91` 内联 35 行，其他靠 `assertValidProject`）；错误全是字符串；`removeSkirt:96-99` 内联选区清理是孤例，其他不做。

本轮把 mutation 层内部工厂化：定义 `createCrudStore` / `createAttachStore` / `createSingletonStore` 三个工厂，每种实体写 1 个配置就拿到全部 CRUD 函数。**公共 API 不变**——调用方零改动。

## 目标

- `mutations.ts` 行数从 ~590 降到 ~250
- 加新 CRUD 实体：在 `stores.ts` 加 1 个 `createCrudStore` 配置 + 在 `mutations.ts` 加 3 个 export 行（约 8-10 行总改动）
- 校验风格统一：所有 store 通过 `validate(entity, project)` 钩子做 entity-level 范围校验；`assertValidProject` 仍是最后兜底
- 错误类型化：`EntityNotFoundError` / `EntityRangeError` / `EntityStateError` 三类；锚点立起来，UI 差异化展示推后
- 顺手修一个 bug：`removeWall` 当前没级联清理 skirts（M1 加 skirt 时漏了）

## 非目标

明确推迟，避免 scope creep：

- mutation 层抛错的 UI 差异化展示（红字 vs toast vs inline）—— M3 只立锚点
- 楼层 ops（add/duplicate/remove/resize/translate）store 化 —— 它们是结构性操作，不是 entity CRUD
- `addRoof` / `toggleRoofEdge` store 化 —— 它们是 bespoke 操作
- `assertValidProject` 重构 —— M3 不动 constraints 层
- M4 范围内的 `DrawingSurface2D` 拆分

## 方案

### 整体结构

```
src/domain/
├── mutations.ts           # 大幅瘦身（~590 → ~250 行）
├── mutations/             # 新建子目录
│   ├── errors.ts          # 三类 error 定义
│   ├── crudStore.ts       # createCrudStore<T, P>
│   ├── attachStore.ts     # createAttachStore<T, P>
│   ├── singletonStore.ts  # createSingletonStore<T, P>
│   └── stores.ts          # 6 个 entity store 配置
```

`mutations.ts` 顶部从子目录 import 6 个 store，re-export 派生的公共 API 函数。AppShell / PropertyPanel / selectionRegistry 调用 `addWall` / `updateSkirt` / 等公共 API 的方式完全不变。

### errors.ts

```ts
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

**用法约定**：

| 错误类型 | 使用场景 | 例子 |
|---|---|---|
| `EntityNotFoundError` | store 找不到目标 id | `update(project, "skirt-99", patch)` 但项目里没这个 skirt |
| `EntityRangeError` | 字段值越界/非法 | skirt offset 为负、overhang 超 1.5、roof pitch 非法 |
| `EntityStateError` | 前置条件失败/状态冲突 | "Skirt must attach to an exterior wall"、"Roof already exists"、"Host wall not found"（数据指针失效） |

`assertValidProject` 抛的错（`domain/constraints.ts`）保持原样（`throw new Error(...)`）—— 那是全局 invariant 校验，不是 entity 操作，不在 M3 范围。

### crudStore.ts

```ts
type HasId = { id: string };

export type CrudStoreConfig<T extends HasId, P> = {
  arrayKey: keyof HouseProject;            // "walls" | "openings" | "balconies" | "skirts"
  entityKind: ObjectSelectionKind;
  applyPatch?(current: T, patch: P): T;    // 默认 { ...current, ...patch }
  validate?(merged: T, project: HouseProject): void;
  cascade?(project: HouseProject, removed: T): Partial<HouseProject>;
};

export type CrudStore<T extends HasId, P> = {
  add(project: HouseProject, draft: T): HouseProject;
  update(project: HouseProject, id: string, patch: P): HouseProject;
  remove(project: HouseProject, id: string): HouseProject;
};

export function createCrudStore<T extends HasId, P>(cfg: CrudStoreConfig<T, P>): CrudStore<T, P>;
```

**内部行为**：

- `add`：把 draft 推入数组；若有 `validate`，先校验；最后 `assertValidProject`
- `update`：找 id（找不到抛 `EntityNotFoundError(kind, id)`）；调 `applyPatch(current, patch)`；validate；assertValidProject
- `remove`：filter 掉；若有 `cascade`，**浅 spread 合并**返回的 `Partial<HouseProject>`（即 `{ ...project, ...cascadeResult, [arrayKey]: filteredArray }`，cascade 返回的字段整体替换原字段）；assertValidProject。id 不存在 → 静默返回原 project（与现有 `removeSkirt` 行为一致）
- **不**管选区。`removeSkirt:96-99` 现有的内联选区清理删掉（dead code，AppShell 在 `selectionRegistry.deleteSelection` 后无条件 dispatch select undefined）

**关于 `UnsafeWallPatch` 等类型**：当前定义在 `mutations.ts:14-16` 私有作用域。M3 重构后 stores.ts 需引用，**移到 stores.ts 顶部本地定义**（不需要导出，stores.ts 内部用即可）。`mutations.ts` 不再持有这些类型。

### attachStore.ts

```ts
export type AttachStoreConfig<T, P> = {
  hostArrayKey: "storeys";              // 暂时只支持 storey-attached
  field: keyof Storey;                  // "stair"
  applyPatch?(current: T, patch: P): T;
  validate?(merged: T, host: Storey, project: HouseProject): void;
};

export type AttachStore<T, P> = {
  attach(project: HouseProject, hostId: string, value: T): HouseProject;
  update(project: HouseProject, hostId: string, patch: P): HouseProject;
  detach(project: HouseProject, hostId: string): HouseProject;
};

export function createAttachStore<T, P>(cfg: AttachStoreConfig<T, P>): AttachStore<T, P>;
```

**内部行为**：

- `attach`：找 host storey（找不到抛 `EntityNotFoundError("storey", id)`）；写 `host.field = value`（**允许覆盖**已有值，匹配现有 `addStair` 行为）；validate；assertValidProject
- `update`：找 host；**host 不存在 → 静默返回原 project**（匹配现有 `updateStair`：用 `.map` 遍历无匹配项不报错）；host 存在但 `host.field === undefined` → 静默返回；否则 mutate；validate；assertValidProject
- `detach`：找 host；host 不存在 → 静默返回；host 存在但 `host.field === undefined` → 静默返回；否则用 spread 删除 `host.field`；assertValidProject

注：`AttachStoreConfig` 不需要 `entityKind` 字段——所有错误路径都涉及 host（kind 总是 "storey"），entity 自身无独立 NotFound 路径。若未来 attach.update 在 host 不存在时改为抛错，再加该字段。

### singletonStore.ts

```ts
export type SingletonStoreConfig<T, P> = {
  field: keyof HouseProject;            // "roof"
  entityKind: ObjectSelectionKind;
  applyPatch(current: T, patch: P): T;  // 必填（roof 需要 clamp）
  validate?(merged: T, project: HouseProject): void;
};

export type SingletonStore<T, P> = {
  update(project: HouseProject, patch: P): HouseProject;
  clear(project: HouseProject): HouseProject;
};

export function createSingletonStore<T, P>(cfg: SingletonStoreConfig<T, P>): SingletonStore<T, P>;
```

**内部行为**：

- `update`：若 `project[field]` 不存在抛 `EntityStateError("No <kind> to update.")`；否则 applyPatch + validate + assertValidProject
- `clear`：直接置 undefined；若已 undefined，返回原 project；否则 assertValidProject
- **不**导出 `set` ——roof 只能通过 bespoke `addRoof` 创建（它需要从 project 计算 edges/material）。这是有意为之

### stores.ts（6 个 entity store 配置）

```ts
export const wallStore = createCrudStore<Wall, WallPatch>({
  arrayKey: "walls",
  entityKind: "wall",
  applyPatch: (wall, patch) => {
    const { id: _, storeyId: __, start: ___, end: ____, ...allowed } = patch as UnsafeWallPatch;
    return { ...wall, ...allowed };
  },
  cascade: (project, removed) => ({
    openings: project.openings.filter((o) => o.wallId !== removed.id),
    balconies: project.balconies.filter((b) => b.attachedWallId !== removed.id),
    skirts: project.skirts.filter((s) => s.hostWallId !== removed.id),
    // ↑ M3 顺手补：当前 removeWall 没级联 skirts
  }),
});

export const openingStore = createCrudStore<Opening, OpeningPatch>({
  arrayKey: "openings",
  entityKind: "opening",
  applyPatch: (o, p) => {
    const { id: _, wallId: __, ...allowed } = p as UnsafeOpeningPatch;
    return { ...o, ...allowed };
  },
});

export const balconyStore = createCrudStore<Balcony, BalconyPatch>({
  arrayKey: "balconies",
  entityKind: "balcony",
  applyPatch: (b, p) => {
    const { id: _, storeyId: __, attachedWallId: ___, ...allowed } = p as UnsafeBalconyPatch;
    return { ...b, ...allowed };
  },
});

export const skirtStore = createCrudStore<SkirtRoof, SkirtPatch>({
  arrayKey: "skirts",
  entityKind: "skirt",
  applyPatch: (s, p) => ({ ...s, ...p }),  // SkirtPatch 已 omit id/hostWallId
  validate: (skirt, project) => {
    // 从 updateSkirt:56-91 搬过来的 35 行
    const wall = project.walls.find((w) => w.id === skirt.hostWallId);
    if (!wall) throw new EntityStateError(`Host wall ${skirt.hostWallId} not found`);
    const wlen = wallLength(wall);
    const storey = project.storeys.find((s) => s.id === wall.storeyId);
    if (!storey) throw new EntityStateError(`Storey ${wall.storeyId} not found`);

    if (skirt.offset < 0) throw new EntityRangeError("offset", "offset 不能为负");
    if (skirt.width < 0.3) throw new EntityRangeError("width", "宽度过小");
    if (skirt.offset + skirt.width > wlen + 1e-6) throw new EntityRangeError("width", "披檐超出墙长");
    if (skirt.depth < 0.3 || skirt.depth > 4) throw new EntityRangeError("depth", "外伸深度超出范围");
    if (skirt.overhang < 0.05 || skirt.overhang > 1.5) throw new EntityRangeError("overhang", "出檐超出范围");
    if (skirt.pitch < Math.PI / 36 || skirt.pitch > Math.PI / 3) throw new EntityRangeError("pitch", "坡度超出范围");
    if (skirt.elevation <= storey.elevation || skirt.elevation > storey.elevation + storey.height + 1e-6) {
      throw new EntityRangeError("elevation", "挂接高度必须在所属楼层范围内");
    }
  },
});

export const stairStore = createAttachStore<Stair, StairPatch>({
  hostArrayKey: "storeys",
  field: "stair",
  // applyPatch 默认 spread；validate 暂留空，依赖 assertValidProject
});

export type RoofPatch = Partial<Pick<Roof, "pitch" | "overhang" | "materialId">>;

export const roofStore = createSingletonStore<Roof, RoofPatch>({
  field: "roof",
  entityKind: "roof",
  applyPatch: (roof, patch) => ({
    ...roof,
    ...(patch.pitch !== undefined ? { pitch: clamp(patch.pitch, PITCH_MIN, PITCH_MAX) } : {}),
    ...(patch.overhang !== undefined ? { overhang: clamp(patch.overhang, OVERHANG_MIN, OVERHANG_MAX) } : {}),
    ...(patch.materialId !== undefined ? { materialId: patch.materialId } : {}),
  }),
});
```

### mutations.ts 重构后骨架

```ts
import { /* 保留必要的 */ } from "./types";
import { wallStore, openingStore, balconyStore, skirtStore, stairStore, roofStore } from "./mutations/stores";
import { EntityStateError } from "./mutations/errors";
export type { OpeningPatch, WallPatch, BalconyPatch, StoreyPatch, StairPatch, SkirtPatch, RoofPatch };

// ───── 从 store 派生（13 个函数，每个 1 行）─────
export const addWall    = wallStore.add;
export const updateWall = wallStore.update;
export const removeWall = wallStore.remove;

export const addOpening    = openingStore.add;
export const updateOpening = openingStore.update;
export const removeOpening = openingStore.remove;

export const addBalcony    = balconyStore.add;
export const updateBalcony = balconyStore.update;
export const removeBalcony = balconyStore.remove;

export const updateSkirt = skirtStore.update;
export const removeSkirt = skirtStore.remove;

export const addStair    = stairStore.attach;
export const updateStair = stairStore.update;
export const removeStair = stairStore.detach;

export const updateRoof = roofStore.update;
export const removeRoof = roofStore.clear;

// ───── 仍 bespoke ─────
export function addSkirt(project: HouseProject, hostWallId: string): HouseProject {
  const wall = project.walls.find((w) => w.id === hostWallId);
  if (!wall) throw new EntityStateError(`Wall ${hostWallId} not found`);
  if (!wall.exterior) throw new EntityStateError(`Skirt must attach to an exterior wall`);
  const skirt = createSkirtDraft(project, wall);
  return skirtStore.add(project, skirt);
}

export function addRoof(project: HouseProject): HouseProject { /* 不动 */ }
export function toggleRoofEdge(project: HouseProject, wallId: string): HouseProject { /* 不动 */ }

export function addStorey(project: HouseProject): HouseProject { /* 不动 */ }
export function duplicateStorey(...) { /* 不动 */ }
export function removeStorey(...) { /* 不动 */ }
export function updateStorey(...) { /* 不动 */ }
export function resizeStoreyExtent(...) { /* 不动 */ }
export function translateStorey(...) { /* 不动 */ }

export const applyWallMaterial = (project, wallId, materialId) => updateWall(project, wallId, { materialId });
export function moveWall(...) { /* 不动 — 绕过 WallPatch 的 omit */ }
```

### 派生函数的类型签名

`export const addWall = wallStore.add;` 形式可能让 TS 推导出宽泛的 `(...args: any[]) => any`。为防止此事，store 工厂返回值的类型签名要精确：

```ts
// 在 createCrudStore 返回值类型里明示
type CrudStore<T extends HasId, P> = {
  add(project: HouseProject, draft: T): HouseProject;
  update(project: HouseProject, id: string, patch: P): HouseProject;
  remove(project: HouseProject, id: string): HouseProject;
};
```

这样 `wallStore.add` 的类型就是 `(project: HouseProject, draft: Wall) => HouseProject`，精确传递给 `addWall`。验证：现有 `mutations.test.ts` 调用 `addWall(project, wallObj)` 编译通过即说明类型对齐。

## 测试

新增 `src/__tests__/entityStores.test.ts`（~150 行）；现有 `mutations.test.ts` 大体不动，**仅删除 1 个测试**：

`mutations.test.ts:392-403`（`describe("removeSkirt")` 内的 `it("removes the skirt and clears matching selection")`）锁定的是 `removeSkirt` 内联选区清理行为。M3 设计 c 已明确把选区清理移出 store（dead code），此测试随之失效。

**删除**该测试，不重新实现等价测试——选区清理的契约由 `selectionRegistry.deleteSelection`（M1 范围）持有，AppShell 在 dispatch replace-project 后无条件 dispatch select undefined，已经覆盖。
`describe("removeSkirt")` 块内若还有其他测试（如纯过滤行为），保留。

```ts
describe("createCrudStore", () => {
  describe("add", () => {
    it("appends to array and runs validate", () => { /* skirt 越界 draft → EntityRangeError */ });
    it("invokes assertValidProject as final gate", () => { /* wall 破坏全局不变量 → throw */ });
  });

  describe("update", () => {
    it("throws EntityNotFoundError when id missing", () => { /* wallStore.update("ghost") */ });
    it("rejects out-of-range patch via validate hook (skirt)", () => { /* skirt.width = 0.1 */ });
    it("strips protected fields per applyPatch (wall)", () => { /* { id: "evil", thickness: 0.3 } */ });
  });

  describe("remove", () => {
    it("filters target entity", () => { /* skirtStore.remove */ });
    it("returns same project when id missing (no throw)", () => { /* 静默 no-op */ });
    it("cascades dependents (wall removes openings/balconies/skirts)", () => {
      // 锁住 M3 顺手修的 bug
      const project = projectWithSkirtOnWall("wall-1");
      const next = wallStore.remove(project, "wall-1");
      expect(next.skirts).toEqual([]);
    });
  });
});

describe("createAttachStore (stair)", () => {
  it("attach writes to host.field", () => { /* stairStore.attach */ });
  it("update mutates host.field; no-op if host has no entity", () => { /* */ });
  it("detach clears host.field", () => { /* */ });
  it("throws EntityNotFoundError when host id missing", () => { /* */ });
});

describe("createSingletonStore (roof)", () => {
  it("update applies clamp via applyPatch", () => {
    const next = roofStore.update(project, { pitch: 999 });
    expect(next.roof!.pitch).toBeCloseTo(Math.PI / 3); // PITCH_MAX
  });
  it("update throws EntityStateError when no roof", () => { /* */ });
  it("clear sets field to undefined", () => { /* */ });
});

describe("error types", () => {
  it("EntityNotFoundError carries kind + id", () => { /* */ });
  it("EntityRangeError carries field name", () => { /* */ });
});
```

skirt 的 7 条范围校验消息逐字保留；测试用 `toThrow(/出檐超出范围/)` 这种正则锁文案，防止后续误改。

## Done criteria

1. `bun run lint` + `bun run test` + `bun run build` 全绿
2. 公共 API 签名零变化；调用方（AppShell / PropertyPanel / selectionRegistry）一行不改
3. `mutations.ts` 行数从 ~590 降到 ~250
4. 加新 CRUD 实体路径清晰：`stores.ts` 加 1 个 config + `mutations.ts` 加 3 个 export = ~8 行总改动
5. 删 wall 时 skirt 一并消失（cascade 含 skirts 过滤）
6. skirt 范围校验从 `updateSkirt` 内联搬到 `skirtStore.validate`，行为不变
7. 验收实验：在 `errors.ts` 临时 `throw new EntityRangeError(...)` 改成 `throw new Error(...)`，预期某条 entityStores 测试失败（type-checking 锁住）

## 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| `applyPatch` 处理受保护字段（id/storeyId/start/end 等）漏一个 | 该字段被意外覆盖 | 现有 `mutations.test.ts` 已有"reject patch with protected fields"用例锁住；store 沿用同样的剔除逻辑 |
| skirt validate 抛错的中文消息变了 | UI tryMutate 显示文案不一致 | 校验消息逐字保留；测试用正则锁文案 |
| `EntityNotFoundError` 与 `assertValidProject` 抛的"id not found"语义重叠 | 两层都抛错，调试混乱 | store 在 mutate 前查 id（抛 NotFound）；assertValidProject 只做"全局不变量"（端点共用、storey 单调等），与 entity-by-id 解耦 |
| `export const addWall = wallStore.add` 让 TS 推导丢失精确类型 | 调用方编译通过但实际签名是 any | `CrudStore<T, P>` 等返回值类型显式声明每个方法签名；现有测试编译过即对齐 |
| `removeSkirt` 内联选区清理删除后某条 path 漏接外层兜底 | 选区悬挂在已删实体上 | 验收时 grep 所有 `removeSkirt(` / `removeWall(` 调用方，确认每个下游有 selection 重置（或在 selectionRegistry 的 deleteSelection 路径上） |
| `addSkirt` 经过 `skirtStore.add` 后会运行 `skirtStore.validate`（原 `addSkirt` 不做范围校验） | 若 `createSkirtDraft` 产出的 draft 越界，`addSkirt` 会抛错而非成功 | 已验证：`createSkirtDraft` 默认值（offset=0、width=wallLength、depth=1.0、pitch=π/6、overhang=0.3、elevation=storey 顶）全部落在校验范围内。新行为更严格但不破坏现有路径 |

**回滚**：纯 mutation 层重构，无数据 schema 变化、无公共 API 变化。git revert 即可。
