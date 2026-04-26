# 楼梯组件实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有的 `Storey.stairOpening`（仅切洞）升级为可选样式（直跑 / L 形 / U 形）的楼梯组件：自动按 storey 高度和踏步深度算梯段，3D 漫游模式下能直接走上去。

**Architecture:**
- 数据层：`Storey.stairOpening` 改名 `Storey.stair` 并扩字段；`computeStairConfig(height, treadDepth)` 派生踢踏数。
- 几何层：`buildStairGeometry(stair, storey, lowerStoreyTopY)` 三形状各返回一组 axis-aligned box（踏步 + L/U 平台）。
- 渲染层：threeScene 把所有踏步/平台 mesh 实例化并加入 `collidables`，物理代码零改动。
- UI 层：ToolPalette 加 `stair` 工具，AppShell 用默认参数生成；PropertyPanel 编辑 shape / treadDepth / bottomEdge / turn / materialId；DrawingSurface2D 跨上下两层渲染平面符号。

**Tech Stack:** TypeScript 6.0, React 19, three.js 0.184, vitest 4.1, jsdom 29。

**Spec:** `docs/superpowers/specs/2026-04-27-stair-component-design.md`

---

## 测试命令小抄

- 全跑：`npm test`
- 单文件：`npx vitest run src/__tests__/stairs.test.ts`
- 单 case：`npx vitest run src/__tests__/stairs.test.ts -t "computes riser count"`
- 类型检查：`npm run lint`

---

## Task 1: 重命名 `stairOpening` → `stair`（保字段）+ 修所有引用

纯重命名，不加新字段。先把改名落实，确保现有测试全过；再下一 Task 加形状参数。

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/sampleProject.ts:76, 84`
- Modify: `src/domain/constraints.ts:152` 及附近循环
- Modify: `src/geometry/slabGeometry.ts:87`
- Modify: `src/__tests__/constraints.test.ts:122, 133, 145, 156`
- Modify: `src/__tests__/slabGeometry.test.ts:63`

- [ ] **Step 1: 改 `src/domain/types.ts`**

把 `StairOpening` 改名为 `Stair`，把 `Storey.stairOpening?` 改成 `Storey.stair?`：

```ts
// 旧：
// export type StairOpening = { x: number; y: number; width: number; depth: number };
// export type Storey = { ...; stairOpening?: StairOpening };

// 新：
export type Stair = {
  x: number;
  y: number;
  width: number;
  depth: number;
};

export type Storey = {
  // ... 原其它字段保持
  stair?: Stair;
};
```

- [ ] **Step 2: 改 `src/domain/sampleProject.ts`**

第 76 行和第 84 行的 `stairOpening: { ... }` 改为 `stair: { ... }`，字段值保持不变：

```ts
// 76 行所在 storey ("2f")
stair: { x: 0.6, y: 5.0, width: 1.2, depth: 2.5 },
// 84 行所在 storey ("3f")
stair: { x: 0.6, y: 5.0, width: 1.2, depth: 2.5 },
```

- [ ] **Step 3: 改 `src/domain/constraints.ts:152`**

把 `const opening = storey.stairOpening;` 改成 `const opening = storey.stair;`。错误消息里的 `stair opening` 字眼可以留，或同步改为 `stair`：

```ts
const opening = storey.stair;
if (!opening) continue;

if (storey.id === lowestStoreyId) {
  errors.push(`Storey ${storey.id} cannot have a stair (no storey below).`);
  continue;
}
```

后续的字段访问（`opening.width / depth / x / y`）保持不变。

- [ ] **Step 4: 改 `src/geometry/slabGeometry.ts:87`**

```ts
// 旧：hole: storey.stairOpening ? holeFromOpening(storey.stairOpening) : undefined,
hole: storey.stair ? holeFromOpening(storey.stair) : undefined,
```

- [ ] **Step 5: 改 `src/__tests__/constraints.test.ts`**

四处 `stairOpening` 全改成 `stair`：

```ts
// line 122: oneF.stair = { x: 1, y: 1, width: 1, depth: 1 };
// line 133: twoF.stair = { x: 1, y: 1, width: 0, depth: 1 };
// line 145: twoF.stair = { x: 0.6, y: 7.5, width: 1.2, depth: 2.5 };
// line 156: twoF.stair = { x: 0.6, y: 5.0, width: 1.2, depth: 2.5 };
```

如果错误消息断言含 `"stair opening"`，同步改为 `"stair"`。

- [ ] **Step 6: 改 `src/__tests__/slabGeometry.test.ts:63`**

```ts
// stairOpening: { x: 0.6, y: 5.0, width: 1.2, depth: 2.5 },
stair: { x: 0.6, y: 5.0, width: 1.2, depth: 2.5 },
```

- [ ] **Step 7: 跑完整测试 + lint**

Run: `npm run lint && npm test`
Expected: PASS（无类型错误，所有现有测试通过）。

- [ ] **Step 8: 提交**

```bash
git add src/domain/types.ts src/domain/sampleProject.ts src/domain/constraints.ts \
       src/geometry/slabGeometry.ts \
       src/__tests__/constraints.test.ts src/__tests__/slabGeometry.test.ts
git commit -m "refactor: 重命名 Storey.stairOpening → Storey.stair（字段集合不变）"
```

---

## Task 2: 扩 `Stair` 类型，sampleProject 填默认值

加 shape / treadDepth / bottomEdge / turn / materialId 五个字段；sample data 全部填上默认值；现有测试 fixtures 同步补值。

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/sampleProject.ts`
- Modify: `src/__tests__/constraints.test.ts`
- Modify: `src/__tests__/slabGeometry.test.ts`

- [ ] **Step 1: 在 `src/domain/types.ts` 定义新的 enum 和扩 `Stair`**

```ts
export type StairShape = "straight" | "l" | "u";
export type StairEdge = "+x" | "-x" | "+y" | "-y";
export type StairTurn = "left" | "right";

export type Stair = {
  x: number;
  y: number;
  width: number;
  depth: number;
  shape: StairShape;
  treadDepth: number;
  bottomEdge: StairEdge;
  turn?: StairTurn;
  materialId: string;
};
```

- [ ] **Step 2: 在 `src/domain/sampleProject.ts` 填默认值**

两处 `stair: { ... }` 都补成：

```ts
stair: {
  x: 0.6,
  y: 5.0,
  width: 1.2,
  depth: 2.5,
  shape: "straight",
  treadDepth: 0.27,
  bottomEdge: "+y",
  materialId: FRAME_MATERIAL_ID,
},
```

- [ ] **Step 3: 修 `src/__tests__/constraints.test.ts` 里的四处 fixture**

每处补全新字段。例：

```ts
oneF.stair = {
  x: 1, y: 1, width: 1, depth: 1,
  shape: "straight", treadDepth: 0.27, bottomEdge: "+y",
  materialId: "mat-dark-frame",
};
```

注意 line 133 那条故意把 `width: 0`（无效宽度断言）保留——只补全形状字段即可。

- [ ] **Step 4: 修 `src/__tests__/slabGeometry.test.ts` 里的 fixture**

同样补全：

```ts
stair: {
  x: 0.6, y: 5.0, width: 1.2, depth: 2.5,
  shape: "straight", treadDepth: 0.27, bottomEdge: "+y",
  materialId: "mat-dark-frame",
},
```

- [ ] **Step 5: 跑测试 + lint**

Run: `npm run lint && npm test`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/domain/types.ts src/domain/sampleProject.ts \
       src/__tests__/constraints.test.ts src/__tests__/slabGeometry.test.ts
git commit -m "feat(domain): Stair 类型补 shape/treadDepth/bottomEdge/turn/materialId 字段"
```

---

## Task 3: `computeStairConfig` 派生函数

派生踢踏数、踢踏高度、踏步数。新文件 `src/domain/stairs.ts`，配套单元测试。

**Files:**
- Create: `src/domain/stairs.ts`
- Test: `src/__tests__/stairs.test.ts`

- [ ] **Step 1: 写失败测试 `src/__tests__/stairs.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { computeStairConfig, TARGET_RISER } from "../domain/stairs";

describe("computeStairConfig", () => {
  it("rounds risers to nearest integer using TARGET_RISER", () => {
    // 3.2 / 0.165 = 19.39 → round to 19
    const cfg = computeStairConfig(3.2, 0.27);
    expect(cfg.riserCount).toBe(19);
    expect(cfg.riserHeight).toBeCloseTo(3.2 / 19, 6);
    expect(cfg.treadCount).toBe(18);
  });

  it("uses minimum 2 risers even for very short storeys", () => {
    const cfg = computeStairConfig(0.1, 0.27);
    expect(cfg.riserCount).toBe(2);
    expect(cfg.treadCount).toBe(1);
    expect(cfg.riserHeight).toBeCloseTo(0.05, 6);
  });

  it("scales for taller storeys", () => {
    // 4.0 / 0.165 = 24.24 → round 24
    const cfg = computeStairConfig(4.0, 0.27);
    expect(cfg.riserCount).toBe(24);
    expect(cfg.riserHeight).toBeCloseTo(4.0 / 24, 6);
    expect(cfg.treadCount).toBe(23);
  });

  it("ignores treadDepth (does not affect riser math)", () => {
    expect(computeStairConfig(3.2, 0.20)).toEqual(computeStairConfig(3.2, 0.30));
  });

  it("exports TARGET_RISER constant", () => {
    expect(TARGET_RISER).toBe(0.165);
  });
});
```

- [ ] **Step 2: 跑测试，确认 FAIL**

Run: `npx vitest run src/__tests__/stairs.test.ts`
Expected: FAIL with "Cannot find module '../domain/stairs'" 类似错误。

- [ ] **Step 3: 实现 `src/domain/stairs.ts`**

```ts
export const TARGET_RISER = 0.165;

export type StairConfig = {
  riserCount: number;
  riserHeight: number;
  treadCount: number;
};

export function computeStairConfig(storeyHeight: number, _treadDepth: number): StairConfig {
  const riserCount = Math.max(2, Math.round(storeyHeight / TARGET_RISER));
  const riserHeight = storeyHeight / riserCount;
  const treadCount = riserCount - 1;
  return { riserCount, riserHeight, treadCount };
}
```

注意：`treadDepth` 目前不用于派生 risers，但参数留着——后续若想接入"舒适度判定"再用。

- [ ] **Step 4: 跑测试，确认 PASS**

Run: `npx vitest run src/__tests__/stairs.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/domain/stairs.ts src/__tests__/stairs.test.ts
git commit -m "feat(domain): computeStairConfig 派生踢踏数/高度/踏步数"
```

---

## Task 4: Selection 加 `stair` 种类

`Storey.stair` 是 storey 上的子对象，没有独立 id；选择标识用 `id = storeyId`。

**Files:**
- Modify: `src/domain/selection.ts`
- Test: `src/__tests__/selection.test.ts`（已存在，加 case）

- [ ] **Step 1: 写失败测试**

打开 `src/__tests__/selection.test.ts`，加：

```ts
import { isSelected, type ObjectSelection } from "../domain/selection";

describe("stair selection", () => {
  it("isSelected matches stair kind by storey id", () => {
    const sel: ObjectSelection = { kind: "stair", id: "2f" };
    expect(isSelected(sel, "stair", "2f")).toBe(true);
    expect(isSelected(sel, "stair", "3f")).toBe(false);
    expect(isSelected(sel, "wall", "2f")).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试，确认 FAIL**

Run: `npx vitest run src/__tests__/selection.test.ts`
Expected: FAIL 因为 `kind: "stair"` 类型不被允许。

- [ ] **Step 3: 改 `src/domain/selection.ts`**

```ts
export type ObjectSelection =
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "balcony"; id: string }
  | { kind: "storey"; id: string }
  | { kind: "stair"; id: string };  // id = storeyId
```

- [ ] **Step 4: 跑测试，确认 PASS**

Run: `npx vitest run src/__tests__/selection.test.ts`
Expected: PASS。

- [ ] **Step 5: 跑全套测试 + lint**

Run: `npm run lint && npm test`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/domain/selection.ts src/__tests__/selection.test.ts
git commit -m "feat(selection): 加 stair 选择种类"
```

---

## Task 5: stair mutations + reducer actions

`addStair` / `updateStair` / `removeStair` 三个纯函数。Reducer 加对应 action。最底层 storey 的拒绝继续靠 `constraints.ts` 的 `assertValidProject` 在 mutation 里抛异常。

**Files:**
- Modify: `src/domain/mutations.ts`
- Modify: `src/app/projectReducer.ts`
- Test: `src/__tests__/domain.test.ts` 或新建 `src/__tests__/stairMutations.test.ts`

- [ ] **Step 1: 写失败测试 `src/__tests__/stairMutations.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { createSampleProject } from "../domain/sampleProject";
import { addStair, removeStair, updateStair } from "../domain/mutations";
import type { Stair } from "../domain/types";

const FULL_STAIR: Stair = {
  x: 1.0, y: 5.0, width: 1.2, depth: 2.5,
  shape: "straight", treadDepth: 0.27, bottomEdge: "+y",
  materialId: "mat-dark-frame",
};

describe("stair mutations", () => {
  it("addStair attaches stair to a storey above the lowest", () => {
    const project = createSampleProject();
    // sample 已经在 2f / 3f 上有 stair；先用 removeStair 拆掉
    const cleared = removeStair(project, "2f");
    const next = addStair(cleared, "2f", FULL_STAIR);
    const twoF = next.storeys.find((s) => s.id === "2f");
    expect(twoF?.stair).toEqual(FULL_STAIR);
  });

  it("addStair on the lowest storey throws via constraints", () => {
    const project = createSampleProject();
    expect(() => addStair(project, "1f", FULL_STAIR)).toThrow(/cannot have a stair/);
  });

  it("updateStair patches selected fields and validates", () => {
    const project = createSampleProject();
    const next = updateStair(project, "2f", { shape: "u", treadDepth: 0.30 });
    const twoF = next.storeys.find((s) => s.id === "2f");
    expect(twoF?.stair?.shape).toBe("u");
    expect(twoF?.stair?.treadDepth).toBe(0.30);
    // 其他字段保持
    expect(twoF?.stair?.bottomEdge).toBe("+y");
  });

  it("removeStair clears the field", () => {
    const project = createSampleProject();
    const next = removeStair(project, "2f");
    expect(next.storeys.find((s) => s.id === "2f")?.stair).toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试，确认 FAIL**

Run: `npx vitest run src/__tests__/stairMutations.test.ts`
Expected: FAIL with "addStair is not exported" 等。

- [ ] **Step 3: 在 `src/domain/mutations.ts` 加三个函数**

文件顶部 import 加入 `Stair`：

```ts
import type { Balcony, HouseProject, Opening, Point2, Stair, Storey, Wall } from "./types";
```

加类型与函数：

```ts
export type StairPatch = Partial<Omit<Stair, never>>;

export function addStair(project: HouseProject, storeyId: string, stair: Stair): HouseProject {
  return assertValidProject({
    ...project,
    storeys: project.storeys.map((storey) =>
      storey.id === storeyId ? { ...storey, stair } : storey,
    ),
  });
}

export function updateStair(project: HouseProject, storeyId: string, patch: StairPatch): HouseProject {
  return assertValidProject({
    ...project,
    storeys: project.storeys.map((storey) => {
      if (storey.id !== storeyId) return storey;
      if (!storey.stair) return storey;
      return { ...storey, stair: { ...storey.stair, ...patch } };
    }),
  });
}

export function removeStair(project: HouseProject, storeyId: string): HouseProject {
  return assertValidProject({
    ...project,
    storeys: project.storeys.map((storey) => {
      if (storey.id !== storeyId) return storey;
      const { stair: _ignored, ...rest } = storey;
      return rest as Storey;
    }),
  });
}
```

- [ ] **Step 4: 跑测试，确认 PASS**

Run: `npx vitest run src/__tests__/stairMutations.test.ts`
Expected: PASS。

- [ ] **Step 5: Reducer 加 actions（`src/app/projectReducer.ts`）**

import 区加：

```ts
import {
  // ...
  addStair,
  removeStair,
  updateStair,
  type StairPatch,
} from "../domain/mutations";
import type { ..., Stair } from "../domain/types";
```

`ProjectAction` 联合加：

```ts
| { type: "add-stair"; storeyId: string; stair: Stair }
| { type: "update-stair"; storeyId: string; patch: StairPatch }
| { type: "remove-stair"; storeyId: string }
```

`projectReducer` switch 加三个 case：

```ts
case "add-stair":
  return addStair(project, action.storeyId, action.stair);
case "update-stair":
  return updateStair(project, action.storeyId, action.patch);
case "remove-stair":
  return removeStair(project, action.storeyId);
```

- [ ] **Step 6: 跑 lint + 全测**

Run: `npm run lint && npm test`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/domain/mutations.ts src/app/projectReducer.ts \
       src/__tests__/stairMutations.test.ts
git commit -m "feat(mutations): addStair/updateStair/removeStair + reducer actions"
```

---

## Task 6: 直跑楼梯几何

新文件 `src/geometry/stairGeometry.ts`，先做 `straight`，给出共享类型。

**Files:**
- Create: `src/geometry/stairGeometry.ts`
- Test: `src/__tests__/stairGeometry.test.ts`

**几何坐标约定**

- 楼梯属于 storey N（上层），从 storey N-1 顶面爬到 storey N 顶面。
- `lowerStoreyTopY` 由调用方提供（= storeyN.elevation - storeyN_minus_1.height，或直接 storeyN_minus_1.elevation；此 Task 内取调用方传入的值）。
- 洞口在世界 XZ 平面：x 沿 +X，y 沿 +Z（注意 three.js 里"楼面 y" = 世界 Z）。
- 三种 shape 几何全部用 axis-aligned box 描述。
- "踏步 i"（i = 0..treadCount-1）：踩上去后人在 `lowerStoreyTopY + (i+1)*riserHeight` 高度。

**StairBox 数据结构**

```ts
export type StairBox = {
  cx: number;   // 世界 X 中心
  cy: number;   // 世界 Y 中心（垂直）
  cz: number;   // 世界 Z 中心
  sx: number;   // 沿 X 尺寸
  sy: number;   // 沿 Y 尺寸（高度）
  sz: number;   // 沿 Z 尺寸
};

export type StairGeometry = {
  treads: StairBox[];     // 踏步
  landings: StairBox[];   // L/U 平台（直跑为空数组）
};
```

- [ ] **Step 1: 写失败测试 `src/__tests__/stairGeometry.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import type { Stair, Storey } from "../domain/types";
import { buildStairGeometry } from "../geometry/stairGeometry";

const STOREY: Storey = {
  id: "2f",
  label: "2F",
  elevation: 3.2,
  height: 3.2,
  slabThickness: 0.18,
};

const BASE_STAIR: Stair = {
  x: 0, y: 0, width: 1.2, depth: 5.0,   // 故意够长，让 18 级 × 0.27 = 4.86 装得下
  shape: "straight",
  treadDepth: 0.27,
  bottomEdge: "+y",
  materialId: "mat-dark-frame",
};

describe("buildStairGeometry — straight", () => {
  it("emits treadCount tread boxes", () => {
    const geom = buildStairGeometry(BASE_STAIR, STOREY, 0); // lowerStoreyTopY = 0
    // computeStairConfig(3.2, 0.27): riserCount=19, treadCount=18
    expect(geom.treads).toHaveLength(18);
    expect(geom.landings).toHaveLength(0);
  });

  it("first tread sits at riserHeight, climbs in -y direction (bottomEdge='+y' starts at high y)", () => {
    const geom = buildStairGeometry(BASE_STAIR, STOREY, 0);
    const riserHeight = 3.2 / 19;
    const first = geom.treads[0];

    // 第 0 级踏步顶面 y = riserHeight
    expect(first.cy + first.sy / 2).toBeCloseTo(riserHeight, 4);
    // 高度 = riserHeight
    expect(first.sy).toBeCloseTo(riserHeight, 4);
    // 第 0 级踏步沿 Z 占据 (depth - 0.27, depth) 区间（从 +y 边往里第一格）
    expect(first.cz).toBeCloseTo(BASE_STAIR.depth - 0.27 / 2, 4);
    expect(first.sz).toBeCloseTo(0.27, 4);
    // 沿 X 占满洞口宽
    expect(first.cx).toBeCloseTo(BASE_STAIR.width / 2, 4);
    expect(first.sx).toBeCloseTo(BASE_STAIR.width, 4);
  });

  it("top tread top surface aligns with upper storey top (climbHeight)", () => {
    const geom = buildStairGeometry(BASE_STAIR, STOREY, 0);
    const top = geom.treads[geom.treads.length - 1];
    expect(top.cy + top.sy / 2).toBeCloseTo(3.2, 4);
  });

  it("treads are placed in opening-local coords (offset by stair.x, stair.y)", () => {
    const offset: Stair = { ...BASE_STAIR, x: 2.0, y: 1.5 };
    const geom = buildStairGeometry(offset, STOREY, 0);
    const first = geom.treads[0];
    expect(first.cx).toBeCloseTo(offset.x + offset.width / 2, 4);
    expect(first.cz).toBeCloseTo(offset.y + offset.depth - 0.27 / 2, 4);
  });

  it("bottomEdge='-y' reverses climb direction (first tread at y=0 side)", () => {
    const reversed: Stair = { ...BASE_STAIR, bottomEdge: "-y" };
    const geom = buildStairGeometry(reversed, STOREY, 0);
    const first = geom.treads[0];
    expect(first.cz).toBeCloseTo(0.27 / 2, 4);
  });

  it("bottomEdge='+x' rotates: width axis becomes climb axis", () => {
    const rot: Stair = { ...BASE_STAIR, bottomEdge: "+x", width: 5.0, depth: 1.2 };
    const geom = buildStairGeometry(rot, STOREY, 0);
    const first = geom.treads[0];
    // 沿 X 起跑（高 X 端是 bottomEdge），第一级在 (width - treadDepth, width)
    expect(first.cx).toBeCloseTo(rot.width - 0.27 / 2, 4);
    expect(first.sx).toBeCloseTo(0.27, 4);
    // Z 上占满 depth
    expect(first.cz).toBeCloseTo(rot.depth / 2, 4);
    expect(first.sz).toBeCloseTo(rot.depth, 4);
  });

  it("sets storey climb height from storey.elevation - lowerStoreyTopY", () => {
    // 拿 lowerStoreyTopY=1.0 的非零起点；climb = 3.2 - 1.0 = 2.2
    const geom = buildStairGeometry(BASE_STAIR, STOREY, 1.0);
    const top = geom.treads[geom.treads.length - 1];
    expect(top.cy + top.sy / 2).toBeCloseTo(3.2, 4);
    const first = geom.treads[0];
    // riserHeight = 2.2 / round(2.2/0.165) = 2.2 / 13 ≈ 0.1692
    const riserCount = Math.round(2.2 / 0.165);
    const riserHeight = 2.2 / riserCount;
    expect(first.cy + first.sy / 2).toBeCloseTo(1.0 + riserHeight, 4);
  });
});
```

- [ ] **Step 2: 跑测试，确认 FAIL**

Run: `npx vitest run src/__tests__/stairGeometry.test.ts`
Expected: FAIL with "Cannot find module '../geometry/stairGeometry'"。

- [ ] **Step 3: 实现 `src/geometry/stairGeometry.ts`（仅 straight）**

```ts
import { computeStairConfig } from "../domain/stairs";
import type { Stair, StairEdge, Storey } from "../domain/types";

export type StairBox = {
  cx: number; cy: number; cz: number;
  sx: number; sy: number; sz: number;
};

export type StairGeometry = {
  treads: StairBox[];
  landings: StairBox[];
};

type Axis = "x" | "z";

type EdgeBasis = {
  runAxis: Axis;       // 哪个轴是"爬升方向"
  runLength: number;   // 该轴上洞口尺寸
  crossAxis: Axis;
  crossLength: number;
  // 第 i 级踏步沿 runAxis 的中心位置（从 stair 原点起算）
  runCenterAt: (i: number, treadDepth: number) => number;
};

function basisForEdge(stair: Stair): EdgeBasis {
  switch (stair.bottomEdge) {
    case "+y": return {
      runAxis: "z", runLength: stair.depth,
      crossAxis: "x", crossLength: stair.width,
      runCenterAt: (i, td) => stair.depth - (i + 0.5) * td,
    };
    case "-y": return {
      runAxis: "z", runLength: stair.depth,
      crossAxis: "x", crossLength: stair.width,
      runCenterAt: (i, td) => (i + 0.5) * td,
    };
    case "+x": return {
      runAxis: "x", runLength: stair.width,
      crossAxis: "z", crossLength: stair.depth,
      runCenterAt: (i, td) => stair.width - (i + 0.5) * td,
    };
    case "-x": return {
      runAxis: "x", runLength: stair.width,
      crossAxis: "z", crossLength: stair.depth,
      runCenterAt: (i, td) => (i + 0.5) * td,
    };
  }
}

function makeBox(
  stair: Stair,
  basis: EdgeBasis,
  runCenter: number,
  runSize: number,
  cy: number,
  sy: number,
): StairBox {
  // 把 (runCenter, crossCenter) 投回 (cx, cz)
  const crossCenter = basis.crossLength / 2;
  if (basis.runAxis === "z") {
    return {
      cx: stair.x + crossCenter,
      cy,
      cz: stair.y + runCenter,
      sx: basis.crossLength,
      sy,
      sz: runSize,
    };
  }
  // runAxis = "x"
  return {
    cx: stair.x + runCenter,
    cy,
    cz: stair.y + crossCenter,
    sx: runSize,
    sy,
    sz: basis.crossLength,
  };
}

function buildStraight(stair: Stair, lowerStoreyTopY: number, climb: number): StairGeometry {
  const cfg = computeStairConfig(climb, stair.treadDepth);
  const basis = basisForEdge(stair);
  const treads: StairBox[] = [];
  for (let i = 0; i < cfg.treadCount; i += 1) {
    const runCenter = basis.runCenterAt(i, stair.treadDepth);
    const cy = lowerStoreyTopY + (i + 0.5) * cfg.riserHeight + cfg.riserHeight / 2;
    treads.push(makeBox(stair, basis, runCenter, stair.treadDepth, cy, cfg.riserHeight));
  }
  return { treads, landings: [] };
}

export function buildStairGeometry(
  stair: Stair,
  storey: Storey,
  lowerStoreyTopY: number,
): StairGeometry {
  const climb = storey.elevation - lowerStoreyTopY;
  switch (stair.shape) {
    case "straight": return buildStraight(stair, lowerStoreyTopY, climb);
    case "l":
    case "u":
      // 暂未实现——下一 Task
      return { treads: [], landings: [] };
  }
}
```

注意 `cy` 公式：第 i 级踏步顶面在 `lowerStoreyTopY + (i+1)*riserHeight`，box 高度 = `riserHeight`，所以中心 = `lowerStoreyTopY + (i+1)*riserHeight - riserHeight/2 = lowerStoreyTopY + (i+0.5)*riserHeight`。前面写错了 `(i+0.5)*r + r/2`——应改为 `(i+0.5)*r`：

```ts
const cy = lowerStoreyTopY + (i + 0.5) * cfg.riserHeight;
```

修正后的 `buildStraight`：

```ts
function buildStraight(stair: Stair, lowerStoreyTopY: number, climb: number): StairGeometry {
  const cfg = computeStairConfig(climb, stair.treadDepth);
  const basis = basisForEdge(stair);
  const treads: StairBox[] = [];
  for (let i = 0; i < cfg.treadCount; i += 1) {
    const runCenter = basis.runCenterAt(i, stair.treadDepth);
    const cy = lowerStoreyTopY + (i + 0.5) * cfg.riserHeight;
    treads.push(makeBox(stair, basis, runCenter, stair.treadDepth, cy, cfg.riserHeight));
  }
  return { treads, landings: [] };
}
```

但这样最顶级踏步顶面 = `lowerStoreyTopY + treadCount*riserHeight = lowerStoreyTopY + (riserCount-1)*riserHeight`，离上层楼板顶面差 1 个 riserHeight。

为了让"最顶级踏步顶面与上层楼板齐平"成立，最顶级踏步 cy 应该单独抬高 0.5*riserHeight：让其顶面 = `lowerStoreyTopY + climbHeight`。下文修正：

```ts
function buildStraight(stair: Stair, lowerStoreyTopY: number, climb: number): StairGeometry {
  const cfg = computeStairConfig(climb, stair.treadDepth);
  const basis = basisForEdge(stair);
  const treads: StairBox[] = [];
  for (let i = 0; i < cfg.treadCount; i += 1) {
    const runCenter = basis.runCenterAt(i, stair.treadDepth);
    // 第 i 级顶面 = lowerStoreyTopY + (i+1) * riserHeight，except 最后一级直接对齐 upper floor
    const isTop = i === cfg.treadCount - 1;
    const topY = isTop ? lowerStoreyTopY + climb : lowerStoreyTopY + (i + 1) * cfg.riserHeight;
    const cy = topY - cfg.riserHeight / 2;
    treads.push(makeBox(stair, basis, runCenter, stair.treadDepth, cy, cfg.riserHeight));
  }
  return { treads, landings: [] };
}
```

但 `treadCount = riserCount - 1`，如果非顶级公式 `(i+1)*riserHeight` 对最后一级 i=treadCount-1=riserCount-2 给 `(riserCount-1)*riserHeight`，与 climb=`riserCount*riserHeight` 差一个 riserHeight。所以最顶级要拉高 1 个 riserHeight，不是 0.5。

这等价于把最顶级踏步直接置于 upper floor 高度（顶面贴上层楼板）。其 cy = `lowerStoreyTopY + climb - riserHeight/2`。spec 里讲的"延伸进上层楼板下方 1cm"可在最顶级踏步上 sy 加 0.01：

```ts
const isTop = i === cfg.treadCount - 1;
if (isTop) {
  // 顶级踏步：顶面对齐 upper floor，并向上钻 0.01m 进上层楼板
  const topY = lowerStoreyTopY + climb + 0.01;
  const sy = cfg.riserHeight + 0.01;
  const cy = topY - sy / 2;
  treads.push(makeBox(stair, basis, runCenter, stair.treadDepth, cy, sy));
} else {
  const topY = lowerStoreyTopY + (i + 1) * cfg.riserHeight;
  const cy = topY - cfg.riserHeight / 2;
  treads.push(makeBox(stair, basis, runCenter, stair.treadDepth, cy, cfg.riserHeight));
}
```

测试里 "top tread top surface aligns with upper storey top" 容差用 4 位即可（`toBeCloseTo(3.2, 4)`），加 0.01 上钻不影响"top 表面 = climb"判断（因为 0.01 > 1e-4 ≈ tolerance；若失败则改判断为 `>= climb` 或单独验证 cy + sy/2 - 0.01 == climb）。**实施时若测试因 0.01 上钻失败，把对应断言改为：**

```ts
expect(top.cy + top.sy / 2).toBeCloseTo(3.2 + 0.01, 4);
```

并补一条 "顶级踏步 sy = riserHeight + 0.01" 的断言。

- [ ] **Step 4: 跑测试，确认 PASS**

Run: `npx vitest run src/__tests__/stairGeometry.test.ts`
Expected: PASS（按上文若顶部钻 0.01 影响断言，按提示同步改测试）。

- [ ] **Step 5: 跑 lint**

Run: `npm run lint`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/geometry/stairGeometry.ts src/__tests__/stairGeometry.test.ts
git commit -m "feat(geometry): 直跑楼梯几何 (踏步 box)"
```

---

## Task 7: L 形楼梯几何

延续 Task 6 的文件，加 `buildL`。

**Files:**
- Modify: `src/geometry/stairGeometry.ts`
- Modify: `src/__tests__/stairGeometry.test.ts`

**L 形几何规则（来自 spec §3）**

- `LW = min(stair.width, stair.depth) / 2`（两段跑共用宽度）
- `nLow = floor(treadCount / 2)`，`nUp = treadCount - nLow - 1`（减 1 给平台占位）
- 下跑：从 bottomEdge 起，沿 bottomEdge 反向爬 `nLow` 级，沿 crossAxis 占 `LW`（贴 turn 选定的那一侧）
- 平台：方形，边长 = LW，顶面 y = `lowerStoreyTopY + nLow*riserHeight`，紧接下跑末端的转角
- 上跑：从平台另一侧沿 ⊥ runAxis 方向（即 crossAxis 方向）爬 `nUp` 级
- `turn=right` ⇒ 平台靠 crossAxis 的"高坐标"侧（cross + 方向）；`turn=left` ⇒ 反之

**几何坐标具体公式**

设 `runAxis = "z"`, `crossAxis = "x"`（bottomEdge="+y"）：
- 下跑沿 `-z` 方向爬升，crossAxis 上占 `[crossOffset, crossOffset + LW]`
- `turn=right` ⇒ crossOffset = stair.width - LW（贴 +x 侧）
- `turn=left`  ⇒ crossOffset = 0（贴 -x 侧）
- 第 i 级（i = 0..nLow-1）：沿 z 中心 `stair.y + stair.depth - (i+0.5)*treadDepth`；沿 x 中心 `stair.x + crossOffset + LW/2`；高度 cy = `lowerStoreyTopY + (i+0.5)*riserHeight`
- 平台：沿 x 中心同上跑（贴对侧），沿 z 中心 = `stair.y + stair.depth - nLow*treadDepth - LW/2`；顶面 y = `lowerStoreyTopY + nLow*riserHeight`，sy = 0.05（薄一点，仅作可视/可踩平台），cy = topY - sy/2

  实际上平台需要"踏脚"功能，不能太薄；用 sy = `riserHeight`，平台顶面 = `lowerStoreyTopY + (nLow+1) * riserHeight - riserHeight = lowerStoreyTopY + nLow*riserHeight` 这就回到顶面定义。**采用 sy = riserHeight，cy = topY - riserHeight/2**。

- 上跑：沿 crossAxis 反方向（从平台出发）爬升。
  - `turn=right`：上跑沿 `-x` 方向，crossOffset 同下跑（仍贴 +x 侧）；上跑级数 j=0..nUp-1，沿 x 中心 = `stair.x + (stair.width - LW) - (j+0.5)*treadDepth`；沿 z 中心 = `stair.y + stair.depth - nLow*treadDepth - LW/2`（与平台 z 中心一致）
  - `turn=left`：上跑沿 `+x` 方向；x 中心 = `stair.x + LW + (j+0.5)*treadDepth`
  - 高度 cy = `lowerStoreyTopY + (nLow + 1 + j + 0.5)*riserHeight`
  - 顶级（j = nUp-1）：与 straight 一样，cy 拉到 upper floor，sy 加 0.01

bottomEdge ≠ "+y" 时，把上述 (x,z) 角色按 basis 旋转一致地映射。

- [ ] **Step 1: 加测试到 `src/__tests__/stairGeometry.test.ts`**

```ts
describe("buildStairGeometry — L", () => {
  const STAIR: Stair = {
    x: 0, y: 0, width: 3.0, depth: 3.0,
    shape: "l", treadDepth: 0.27,
    bottomEdge: "+y", turn: "right",
    materialId: "mat-dark-frame",
  };

  it("emits nLow + nUp tread boxes + 1 landing", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    // riserCount=19, treadCount=18, nLow=9, nUp=18-9-1=8
    expect(geom.treads).toHaveLength(9 + 8);
    expect(geom.landings).toHaveLength(1);
  });

  it("landing is square, side LW = 1.5, top at nLow*riserHeight", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const lw = 1.5; // min(3,3)/2
    const riserHeight = 3.2 / 19;
    const landing = geom.landings[0];
    expect(landing.sx).toBeCloseTo(lw, 4);
    expect(landing.sz).toBeCloseTo(lw, 4);
    expect(landing.cy + landing.sy / 2).toBeCloseTo(9 * riserHeight, 4);
  });

  it("turn='right' puts the lower flight on +x side", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const lower0 = geom.treads[0];
    expect(lower0.cx).toBeCloseTo(STAIR.x + STAIR.width - 1.5 / 2, 4);
  });

  it("turn='left' mirrors lower flight to -x side", () => {
    const geom = buildStairGeometry({ ...STAIR, turn: "left" }, STOREY, 0);
    const lower0 = geom.treads[0];
    expect(lower0.cx).toBeCloseTo(STAIR.x + 1.5 / 2, 4);
  });

  it("upper flight runs perpendicular from landing", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    // 上跑第一级 = treads[9]
    const upper0 = geom.treads[9];
    // turn=right: 上跑沿 -x 从平台出发；x 中心 = stair.width - 1.5 - 0.27/2 = 1.365
    expect(upper0.cx).toBeCloseTo(STAIR.width - 1.5 - 0.27 / 2, 4);
  });
});
```

- [ ] **Step 2: 跑测试，确认 FAIL**

Run: `npx vitest run src/__tests__/stairGeometry.test.ts -t "buildStairGeometry — L"`
Expected: FAIL（L 形目前返回空数组）。

- [ ] **Step 3: 实现 `buildL` 替换 stairGeometry.ts 中 L 占位**

把 `case "l":` 改为调用真函数：

```ts
case "l": return buildL(stair, lowerStoreyTopY, climb);
```

然后实现 `buildL`：

```ts
function buildL(stair: Stair, lowerStoreyTopY: number, climb: number): StairGeometry {
  const cfg = computeStairConfig(climb, stair.treadDepth);
  const basis = basisForEdge(stair);
  const lw = Math.min(stair.width, stair.depth) / 2;
  const nLow = Math.floor(cfg.treadCount / 2);
  const nUp = cfg.treadCount - nLow - 1;
  const turn = stair.turn ?? "right";

  const treads: StairBox[] = [];

  // 下跑：沿 runAxis 反方向爬，crossAxis 上贴 turn 侧的 LW 半边
  // crossOffset = turn=right ? (crossLength - LW) : 0
  const crossOffset = turn === "right" ? basis.crossLength - lw : 0;

  for (let i = 0; i < nLow; i += 1) {
    const runCenter = basis.runCenterAt(i, stair.treadDepth);
    const cy = lowerStoreyTopY + (i + 0.5) * cfg.riserHeight;
    treads.push(makeBoxAtCross(stair, basis, runCenter, stair.treadDepth, crossOffset + lw / 2, lw, cy, cfg.riserHeight));
  }

  // 平台：crossAxis 在对侧（即 crossOffsetOpposite = turn=right ? 0 : crossLength - LW）
  const crossOffsetUpper = turn === "right" ? 0 : basis.crossLength - lw;
  const platformRunCenter = basis.runLength - nLow * stair.treadDepth - lw / 2;
  const platformY = lowerStoreyTopY + nLow * cfg.riserHeight;
  const landings: StairBox[] = [
    makeBoxAtCross(
      stair, basis,
      platformRunCenter, lw,
      crossOffsetUpper + lw / 2, lw,
      platformY - cfg.riserHeight / 2, cfg.riserHeight,
    ),
  ];

  // 上跑：沿 crossAxis 方向（从平台出发，朝 crossOffset 那一侧——即下跑那一侧的"对边"）
  // 上跑 cross 起点：turn=right → crossLength - lw（上跑朝 -cross 方向走，从 crossLength-lw 起到 0+lw 之间）
  //                  turn=left  → 0          （上跑朝 +cross 方向走）
  // 但上跑是在与下跑垂直的方向上，所以 cross 上是"runAxis 移动"，run 上"crossAxis"——即角色互换。
  // 简化：把上跑想成"在原 crossAxis 上的一段直跑"，第 j 级中心 cross 位置：
  //   turn=right：crossOffsetUpper + lw + (j+0.5)*treadDepth（朝 +cross 方向反过来——错。重看）

  // 改正：turn=right 下跑贴 +x，平台贴 -x；上跑从平台 -x 端沿 +x 方向延伸不行，因为那会撞下跑。
  // 重看平面图：
  //   turn=right: 下跑在 +x 半边，上跑应在平台另一端朝 -x 方向（从平台 +x 端开始沿 -x）。
  //   平台 x 中心 = lw/2（贴 -x 侧）；上跑应从 x = lw 起朝 -x... 也不对，上跑必须不与平台重叠。
  //
  // 重新定义：平台跟下跑同侧（贴 +x），下跑爬到平台底，平台是下跑顶端转折点；
  // 上跑从平台 -x 边沿 -x 方向延伸至 stair.x。
  // 即 turn=right：crossOffset (下跑+平台) = crossLength - lw；上跑沿 -cross 走。

  // 因此重写：
  //   crossOffsetLowerAndPlatform = turn==='right' ? crossLength - lw : 0
  //   上跑 j 级 cross 中心 = (turn=='right' ? crossLength - lw - (j+0.5)*treadDepth : lw + (j+0.5)*treadDepth)
  //   上跑 run 中心固定 = platformRunCenter（与平台对齐）

  for (let j = 0; j < nUp; j += 1) {
    const crossCenter = turn === "right"
      ? basis.crossLength - lw - (j + 0.5) * stair.treadDepth
      : lw + (j + 0.5) * stair.treadDepth;
    const isTop = j === nUp - 1;
    const topY = isTop ? lowerStoreyTopY + climb + 0.01 : lowerStoreyTopY + (nLow + 1 + j + 1) * cfg.riserHeight;
    const sy = isTop ? cfg.riserHeight + 0.01 : cfg.riserHeight;
    const cy = topY - sy / 2;
    treads.push(makeBoxAtCross(stair, basis, platformRunCenter, lw, crossCenter, stair.treadDepth, cy, sy));
  }

  return { treads, landings };
}
```

注意 `makeBoxAtCross` 是新 helper（替代之前 `makeBox`），参数：`runCenter, runSize, crossCenter, crossSize, cy, sy`。

加这个 helper：

```ts
function makeBoxAtCross(
  stair: Stair,
  basis: EdgeBasis,
  runCenter: number, runSize: number,
  crossCenter: number, crossSize: number,
  cy: number, sy: number,
): StairBox {
  if (basis.runAxis === "z") {
    return {
      cx: stair.x + crossCenter,
      cy,
      cz: stair.y + runCenter,
      sx: crossSize, sy, sz: runSize,
    };
  }
  return {
    cx: stair.x + runCenter,
    cy,
    cz: stair.y + crossCenter,
    sx: runSize, sy, sz: crossSize,
  };
}
```

`makeBox`（在 Task 6 里）调用方改写为对 `makeBoxAtCross` 的转发：

```ts
function makeBox(
  stair: Stair, basis: EdgeBasis,
  runCenter: number, runSize: number,
  cy: number, sy: number,
): StairBox {
  return makeBoxAtCross(stair, basis, runCenter, runSize, basis.crossLength / 2, basis.crossLength, cy, sy);
}
```

注释里上面那一大段"重看平面图"是设计推导，提交时可整理成简洁注释或删除。

- [ ] **Step 4: 跑测试，确认 PASS**

Run: `npx vitest run src/__tests__/stairGeometry.test.ts`
Expected: PASS（如有失败，按 stack trace 调整 cross 朝向公式）。

- [ ] **Step 5: 提交**

```bash
git add src/geometry/stairGeometry.ts src/__tests__/stairGeometry.test.ts
git commit -m "feat(geometry): L 形楼梯（下跑 + 平台 + 上跑）"
```

---

## Task 8: U 形楼梯几何

**Files:**
- Modify: `src/geometry/stairGeometry.ts`
- Modify: `src/__tests__/stairGeometry.test.ts`

**U 形几何规则**

- 两跑沿 runAxis 平行，远端长方平台
- 每跑宽 `flightWidth = (crossLength - GAP) / 2`，GAP = 0.05
- 平台位置：runAxis 上紧贴远端（与 bottomEdge 对边），cross 占满 crossLength；平台沿 runAxis 深度 = 1*treadDepth（最简）
- 下跑：从 bottomEdge 起，沿 runAxis 反向爬 nLow = floor(treadCount/2) 级；占 crossLength 的 [0, flightWidth]
- 上跑：从平台另一端返回（runAxis 正向），剩余 nUp = treadCount - nLow - 1 级；占 [crossLength - flightWidth, crossLength]
- 顶级踏步同 straight，钻 0.01

- [ ] **Step 1: 加测试**

```ts
describe("buildStairGeometry — U", () => {
  const STAIR: Stair = {
    x: 0, y: 0, width: 2.5, depth: 5.0,
    shape: "u", treadDepth: 0.27,
    bottomEdge: "+y",
    materialId: "mat-dark-frame",
  };

  it("emits two flights + 1 landing", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    // treadCount=18, nLow=9, nUp=8 → total treads = 17
    expect(geom.treads).toHaveLength(17);
    expect(geom.landings).toHaveLength(1);
  });

  it("flight widths split crossLength minus 0.05 gap", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const flightWidth = (2.5 - 0.05) / 2;
    expect(geom.treads[0].sx).toBeCloseTo(flightWidth, 4);
  });

  it("lower flight on cross [0, flightWidth], upper flight on opposite cross half", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const fw = (2.5 - 0.05) / 2;
    const lower0 = geom.treads[0];
    const upper0 = geom.treads[9];
    expect(lower0.cx).toBeCloseTo(fw / 2, 4);
    expect(upper0.cx).toBeCloseTo(2.5 - fw / 2, 4);
  });

  it("landing sits at far end of bottomEdge axis, top at nLow*riserHeight", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const riserHeight = 3.2 / 19;
    const landing = geom.landings[0];
    expect(landing.cz).toBeCloseTo(STAIR.depth - 9 * 0.27 - 0.27 / 2, 4);
    expect(landing.cy + landing.sy / 2).toBeCloseTo(9 * riserHeight, 4);
  });
});
```

- [ ] **Step 2: 跑测试，确认 FAIL**

Run: `npx vitest run src/__tests__/stairGeometry.test.ts -t "buildStairGeometry — U"`
Expected: FAIL。

- [ ] **Step 3: 实现 `buildU`**

```ts
function buildU(stair: Stair, lowerStoreyTopY: number, climb: number): StairGeometry {
  const cfg = computeStairConfig(climb, stair.treadDepth);
  const basis = basisForEdge(stair);
  const GAP = 0.05;
  const flightWidth = (basis.crossLength - GAP) / 2;
  const nLow = Math.floor(cfg.treadCount / 2);
  const nUp = cfg.treadCount - nLow - 1;

  const treads: StairBox[] = [];

  // 下跑 cross 中心 = flightWidth/2
  for (let i = 0; i < nLow; i += 1) {
    const runCenter = basis.runCenterAt(i, stair.treadDepth);
    const cy = lowerStoreyTopY + (i + 0.5) * cfg.riserHeight;
    treads.push(makeBoxAtCross(stair, basis, runCenter, stair.treadDepth, flightWidth / 2, flightWidth, cy, cfg.riserHeight));
  }

  // 平台：runAxis 上紧贴远端，深度 = 1 个 treadDepth
  const platformRunCenter = basis.runLength - nLow * stair.treadDepth - stair.treadDepth / 2;
  const platformY = lowerStoreyTopY + nLow * cfg.riserHeight;
  const landings: StairBox[] = [
    makeBoxAtCross(stair, basis, platformRunCenter, stair.treadDepth, basis.crossLength / 2, basis.crossLength, platformY - cfg.riserHeight / 2, cfg.riserHeight),
  ];

  // 上跑 cross 中心 = crossLength - flightWidth/2
  for (let j = 0; j < nUp; j += 1) {
    // 上跑沿 runAxis 正方向（从平台朝 bottomEdge 方向回）
    const runCenter = basis.runLength - nLow * stair.treadDepth - stair.treadDepth - (j + 0.5) * stair.treadDepth;
    // 注意此处是从平台外端 runStart 开始往 +run 方向走（即 runCenter 递减）
    const isTop = j === nUp - 1;
    const topY = isTop ? lowerStoreyTopY + climb + 0.01 : lowerStoreyTopY + (nLow + 1 + j + 1) * cfg.riserHeight;
    const sy = isTop ? cfg.riserHeight + 0.01 : cfg.riserHeight;
    const cy = topY - sy / 2;
    treads.push(makeBoxAtCross(stair, basis, runCenter, stair.treadDepth, basis.crossLength - flightWidth / 2, flightWidth, cy, sy));
  }

  return { treads, landings };
}
```

dispatcher case 改成 `case "u": return buildU(...)`。

- [ ] **Step 4: 跑测试，确认 PASS**

Run: `npx vitest run src/__tests__/stairGeometry.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/geometry/stairGeometry.ts src/__tests__/stairGeometry.test.ts
git commit -m "feat(geometry): U 形楼梯（双跑 + 远端平台）"
```

---

## Task 9: 把楼梯几何并入 `HouseGeometry`

让上层渲染器可以一并取到。

**Files:**
- Modify: `src/geometry/types.ts`
- Modify: `src/geometry/houseGeometry.ts`
- Test: `src/__tests__/geometry.test.ts`

- [ ] **Step 1: 写失败测试 `src/__tests__/geometry.test.ts`**

在已有的 `geometry.test.ts` 末尾加：

```ts
import { createSampleProject } from "../domain/sampleProject";
import { buildHouseGeometry } from "../geometry/houseGeometry";

describe("buildHouseGeometry — stairs", () => {
  it("emits a stairs entry per storey with a stair", () => {
    const project = createSampleProject();
    const house = buildHouseGeometry(project);
    // sample 在 2f / 3f 上有 stair
    const storeyIds = house.stairs.map((s) => s.storeyId).sort();
    expect(storeyIds).toEqual(["2f", "3f"]);
  });

  it("each stair entry has tread and landing arrays", () => {
    const project = createSampleProject();
    const house = buildHouseGeometry(project);
    for (const stair of house.stairs) {
      expect(Array.isArray(stair.treads)).toBe(true);
      expect(Array.isArray(stair.landings)).toBe(true);
      expect(stair.treads.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 跑测试，确认 FAIL**

Run: `npx vitest run src/__tests__/geometry.test.ts -t "buildHouseGeometry — stairs"`
Expected: FAIL（`house.stairs` undefined 或类型错误）。

- [ ] **Step 3: 改 `src/geometry/types.ts`**

```ts
import type { StairBox } from "./stairGeometry";

export type StairRenderGeometry = {
  storeyId: string;
  materialId: string;
  treads: StairBox[];
  landings: StairBox[];
};

export type HouseGeometry = {
  walls: WallGeometry[];
  balconies: BalconyGeometry[];
  slabs: SlabGeometry[];
  stairs: StairRenderGeometry[];   // 新增
};
```

- [ ] **Step 4: 改 `src/geometry/houseGeometry.ts`**

import 顶部加 `buildStairGeometry`、`StairRenderGeometry`：

```ts
import { buildStairGeometry } from "./stairGeometry";
import type { HouseGeometry, SlabGeometry, StairRenderGeometry } from "./types";
```

`buildHouseGeometry` 内部加 stairs 收集：

```ts
const stairs: StairRenderGeometry[] = [];

const sortedStoreys = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
for (let i = 0; i < sortedStoreys.length; i += 1) {
  const storey = sortedStoreys[i];
  if (!storey.stair) continue;
  if (i === 0) continue; // 最底层 storey 不应有 stair（防御）
  const lowerStoreyTopY = sortedStoreys[i - 1].elevation;
  const geom = buildStairGeometry(storey.stair, storey, lowerStoreyTopY);
  stairs.push({
    storeyId: storey.id,
    materialId: storey.stair.materialId,
    treads: geom.treads,
    landings: geom.landings,
  });
}
```

返回值带上 `stairs`：

```ts
return { walls, balconies, slabs, stairs };
```

- [ ] **Step 5: 跑测试，确认 PASS**

Run: `npx vitest run src/__tests__/geometry.test.ts`
Expected: PASS。

- [ ] **Step 6: 跑全测 + lint**

Run: `npm run lint && npm test`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/geometry/types.ts src/geometry/houseGeometry.ts src/__tests__/geometry.test.ts
git commit -m "feat(geometry): HouseGeometry 加 stairs 数组（每楼层一架）"
```

---

## Task 10: threeScene 渲染楼梯 + 加入 collidables

**Files:**
- Modify: `src/rendering/threeScene.ts`
- Test: `src/__tests__/preview3d.test.tsx`

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/preview3d.test.tsx` 加（或新建一个 case 文件）：

```ts
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Preview3D } from "../components/Preview3D";
import { createSampleProject } from "../domain/sampleProject";

describe("Preview3D — stairs", () => {
  it("renders without throwing when stairs are present", () => {
    const project = createSampleProject();
    expect(() => render(<Preview3D project={project} />)).not.toThrow();
  });
});
```

如果项目里已有渲染 smoke test，把 stair 项目作为 fixture 复用即可。

更精细的断言（场景里有 stair 网格）需要看 Preview3D 是否暴露 scene 句柄。如果不方便检查，做一个 stair-mesh 计数测试在 threeScene 单测层面：

新建 `src/__tests__/threeSceneStairs.test.ts`（只测 buildHouseGeometry 给出的 stairs 走通到 mesh 创建函数即可，不实例化 WebGL）。如果 threeScene 没有可测的纯函数边界，以渲染 smoke test 为准。

- [ ] **Step 2: 跑测试，确认 FAIL（或暂时不确定状态）**

Run: `npx vitest run src/__tests__/preview3d.test.tsx`
Expected: 取决于 threeScene 现状——若 sample 已含 stair 字段但 threeScene 没处理，可能不报错但渲染缺楼梯；smoke test 可能仍 PASS。如果是这种情况，测试改成断言 `houseGeometry.stairs.length > 0` 在 sample 上成立后，专注实现层并通过下文 walkPhysics test 验证。

- [ ] **Step 3: 改 `src/rendering/threeScene.ts`**

阅读 `threeScene.ts` 现有的 wall/slab/balcony 网格构造方式（约 line 600 附近）。**不重新发明**——找到 `wallMeshes / slabMeshes / balconyMeshes` 的构造范式，照抄一份给 stairs：

```ts
// 在已有 mesh 构造之后、collidables 组装之前
const stairMeshes: THREE.Mesh[] = [];
for (const stair of houseGeometry.stairs) {
  const material = materialForId(stair.materialId);
  const stairGroup = new THREE.Group();
  for (const box of [...stair.treads, ...stair.landings]) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(box.sx, box.sy, box.sz),
      material,
    );
    mesh.position.set(box.cx, box.cy, box.cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    stairGroup.add(mesh);
    stairMeshes.push(mesh);
  }
  scene.add(stairGroup);
}
```

`materialForId` / 现有材质查找用 threeScene 内已有的辅助（看代码确定）。注意：一些代码生成 material 是只用 `MeshStandardMaterial({ color })` 不查询 catalog——按照 wall/balcony 的现有写法照抄。

- [ ] **Step 4: 把 stair mesh 加入 collidables**

找到 `threeScene.ts:631` 附近：

```ts
// 旧：const collidables: THREE.Object3D[] = [...wallMeshes, ...slabMeshes, ...balconyMeshes, ground];
const collidables: THREE.Object3D[] = [
  ...wallMeshes,
  ...slabMeshes,
  ...balconyMeshes,
  ...stairMeshes,
  ground,
];
```

- [ ] **Step 5: 跑 build + lint + 测试**

Run: `npm run lint && npm test`
Expected: PASS。

- [ ] **Step 6: 手动验**

启动 `npm run dev`，sample project（已有 2F / 3F 各一架直跑楼梯）应在 3D 视图里看见踏步。进入漫游模式（既有按钮），走到楼梯处尝试上下。

  注：本 Task 的"渲染存在"是必要条件，"能走"由下个 Task 用集成测试覆盖。

- [ ] **Step 7: 提交**

```bash
git add src/rendering/threeScene.ts src/__tests__/preview3d.test.tsx
# 若新建了 threeSceneStairs.test.ts 也一并加
git commit -m "feat(render): threeScene 渲染楼梯并加入 collidables"
```

---

## Task 11: walkPhysics 集成测试 — 直跑楼梯可走上去

**Files:**
- Modify: `src/__tests__/walkPhysics.test.ts`

构造一个手工 collidables（数组，每个对象提供 raycast 兼容的 fake，或用真 three.js box），然后调 `resolveHorizontalCollision` + `resolveVerticalState` 模拟一段帧序列，断言相机 y 单调递增直到上层标高。

如果用真 three.js 太重（jsdom + WebGL），改用 `walkPhysics` 暴露的纯接口 + 手写 probe：

- 构造 fake `HorizontalProbe`：基于踏步盒的 AABB 集合，做 ray-AABB 相交。
- 构造 fake `VerticalProbe`：返回 `position.x / z` 处最高踏步顶 y。

- [ ] **Step 1: 写测试**

```ts
import { describe, expect, it } from "vitest";
import {
  resolveHorizontalCollision,
  resolveVerticalState,
  type HorizontalProbe,
  type VerticalProbe,
} from "../rendering/walkPhysics";
import { computeStairConfig } from "../domain/stairs";

type AABB = { min: [number, number, number]; max: [number, number, number] };

function aabbForTread(i: number, riserHeight: number, treadDepth: number, climbStartZ: number, runDir: -1 | 1, width: number): AABB {
  // 取 bottomEdge='+y' (climb in -z), with x in [0, width]
  // tread i: top y = (i+1)*riserHeight, depth-axis center = climbStartZ + runDir * (i+0.5)*treadDepth
  const cz = climbStartZ + runDir * (i + 0.5) * treadDepth;
  return {
    min: [0, i * riserHeight, cz - treadDepth / 2],
    max: [width, (i + 1) * riserHeight, cz + treadDepth / 2],
  };
}

function rayAabb(origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, max: number, box: AABB): number | null {
  // slab method
  let tmin = 0, tmax = max;
  for (const ax of ["x", "y", "z"] as const) {
    const o = origin[ax]; const d = dir[ax];
    const lo = box.min[ax === "x" ? 0 : ax === "y" ? 1 : 2];
    const hi = box.max[ax === "x" ? 0 : ax === "y" ? 1 : 2];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

describe("walkPhysics — straight stair ascent", () => {
  it("camera y monotonically increases when walking forward up steps", () => {
    const climb = 3.2;
    const treadDepth = 0.27;
    const cfg = computeStairConfig(climb, treadDepth);
    const width = 1.2;

    // 楼梯放在 z 从 5.0 (bottom) 向 -z 方向延伸（bottomEdge="+y" → 实际 climb in -z）
    // 简化：把楼梯起点放在 z=5，climb 方向 z 减小
    const treads: AABB[] = [];
    for (let i = 0; i < cfg.treadCount; i += 1) {
      treads.push(aabbForTread(i, cfg.riserHeight, treadDepth, 5.0, -1, width));
    }
    // 上层楼板（让 player 走过最顶级踏步后落到上层）
    const upperFloor: AABB = {
      min: [-10, climb, -10],
      max: [10 + width, climb + 0.18, 5.0],
    };
    const lowerFloor: AABB = {
      min: [-10, 0, 5.0 + 0.001],
      max: [10 + width, 0.001, 10],
    };
    const all = [...treads, upperFloor, lowerFloor];

    const horizontalProbe: HorizontalProbe = (origin, direction, maxDistance) => {
      let best: number | null = null;
      for (const box of all) {
        const t = rayAabb(origin, { x: direction.x, y: 0, z: direction.z }, maxDistance, box);
        if (t !== null && (best === null || t < best)) best = t;
      }
      return best;
    };
    const verticalProbe: VerticalProbe = (origin, maxDistance) => {
      let bestY: number | null = null;
      for (const box of all) {
        const t = rayAabb(origin, { x: 0, y: -1, z: 0 }, maxDistance, box);
        if (t !== null) {
          const y = origin.y - t;
          if (bestY === null || y > bestY) bestY = y;
        }
      }
      return bestY;
    };

    const config = { eyeHeight: 1.6, snapThreshold: 0.2, gravity: -9.8, maxRayLength: 5 };
    let pos = { x: width / 2, y: 1.6, z: 6.0 };  // 起步点：站在 lowerFloor 上，朝 -z 方向走
    let vy = 0;
    const ys: number[] = [pos.y];
    const dt = 0.016;
    const speed = 1.4;

    for (let frame = 0; frame < 600; frame += 1) {
      const desired = { x: 0, z: -speed * dt };
      const adjusted = resolveHorizontalCollision(pos, desired, 0.3, horizontalProbe);
      pos.x += adjusted.x;
      pos.z += adjusted.z;
      const next = resolveVerticalState({ cameraY: pos.y, vy }, { x: pos.x, z: pos.z }, dt, config, verticalProbe);
      if (next === "respawn") throw new Error("fell off stair");
      pos.y = next.cameraY;
      vy = next.vy;
      ys.push(pos.y);
      if (pos.z < 5.0 - cfg.treadCount * treadDepth - 0.5) break;
    }

    // 最终高度应在上层楼板高度 + 1.6
    expect(pos.y).toBeCloseTo(climb + 1.6, 1);
    // 单调（允许踏步抖动 ≤ 1cm 噪声）
    let drops = 0;
    for (let i = 1; i < ys.length; i += 1) if (ys[i] < ys[i - 1] - 0.01) drops += 1;
    expect(drops).toBe(0);
  });
});
```

- [ ] **Step 2: 跑测试，确认 PASS**

Run: `npx vitest run src/__tests__/walkPhysics.test.ts -t "straight stair ascent"`
Expected: PASS（如果失败：检查物理常量推导，或看是不是 chest probe 真把人卡住了——应该不会）。

如果测试失败说明物理实际上还是会卡住（与我们的分析矛盾），则后续需要回到 spec 加 ramp collider；但按计算预期 PASS。

- [ ] **Step 3: 提交**

```bash
git add src/__tests__/walkPhysics.test.ts
git commit -m "test(walk): 直跑楼梯可走上去（单调递增到上层）"
```

---

## Task 12: ToolPalette + AppShell 加楼梯工具

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/components/ToolPalette.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/app/persistence.ts`（VALID_TOOL_IDS）
- Test: `src/__tests__/ui.test.tsx` 或新建 `stairTool.test.tsx`

- [ ] **Step 1: 在 `types.ts` 的 `ToolId` 联合加 `"stair"`**

```ts
export type ToolId =
  | "select" | "wall" | "door" | "window" | "opening"
  | "balcony" | "stair" | "material";
```

- [ ] **Step 2: 在 `persistence.ts` 的 `VALID_TOOL_IDS` 加 `"stair"`**

跟着 ToolId 联合一致。

- [ ] **Step 3: 在 `ToolPalette.tsx` 的 `ADD_OPTIONS` 加楼梯**

```ts
const ADD_OPTIONS: AddOption[] = [
  { id: "wall", label: "墙" },
  { id: "door", label: "门" },
  { id: "window", label: "窗" },
  { id: "opening", label: "开孔" },
  { id: "balcony", label: "阳台" },
  { id: "stair", label: "楼梯" },
];
```

- [ ] **Step 4: 在 `AppShell.tsx` `handleAddComponent` 里加 stair 分支**

定位 line 270 附近 balcony 分支，在它**之前**或之后加：

```ts
if (toolId === "stair") {
  // 默认放在 storey 中央偏前的位置；用户后续在 PropertyPanel 调
  const draftStair: Stair = {
    x: 1.0,
    y: 3.0,
    width: 1.2,
    depth: 2.5,
    shape: "straight",
    treadDepth: 0.27,
    bottomEdge: "+y",
    materialId: pickFrameMaterialId(project),  // 见下文 helper
  };
  try {
    dispatch({ type: "add-stair", storeyId, stair: draftStair });
    dispatch({ type: "select", selection: { kind: "stair", id: storeyId } });
    if (PLAN_STOREY_BY_VIEW[project.activeView] !== storeyId) {
      dispatch({ type: "set-view", viewId: `plan-${storeyId}` as ViewId });
    }
  } catch (error) {
    setAddError(error instanceof Error ? error.message : "无法添加楼梯。");
  }
  return;
}
```

加 `pickFrameMaterialId` helper（同文件，模块级）：

```ts
function pickFrameMaterialId(project: HouseProject): string {
  const frame = project.materials.find((m) => m.kind === "frame");
  return frame?.id ?? project.materials[0]?.id ?? "";
}
```

import 顶部加 `Stair` 与 `addStair`（如果还没引；reducer 已经处理 add-stair 所以也可以不直接 import addStair）：

```ts
import type { Stair } from "../domain/types";
```

如果默认坐标 `(1.0, 3.0, 1.2, 2.5)` 在某个 storey footprint 之外会被 `assertValidProject` 拒绝。AppShell 的 try/catch 会捕获并 setAddError。这是预期：用户看到错误，知道要先调位置或换楼层。

- [ ] **Step 5: 写测试 `src/__tests__/stairTool.test.tsx`**

```tsx
import { describe, expect, it } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import { AppShell } from "../components/AppShell";
import { createSampleProject } from "../domain/sampleProject";

describe("stair tool", () => {
  it("adding stair to a storey without one creates it via reducer", () => {
    const project = createSampleProject();
    // 拿掉 2F 上的 stair 模拟"无 stair 楼层"
    const cleared = {
      ...project,
      storeys: project.storeys.map((s) =>
        s.id === "2f" ? { ...s, stair: undefined } : s,
      ),
    };
    render(<AppShell initialProject={cleared} />);
    // 打开 添加 菜单
    fireEvent.click(screen.getByRole("button", { name: /添加组件/ }));
    fireEvent.click(screen.getByText("添加楼梯"));
    // sample 多 storey → 显示选楼层菜单
    fireEvent.click(screen.getByText("2F"));
    // 断言：state 里 2F.stair 出现（若 AppShell 暴露 ref / 用其它方式间接断言；保守版本：检查屏幕上是否有 "stair" 选中相关 UI 元素）
    // 此断言依赖 AppShell 的当前测试 helpers——根据现有 ui.test.tsx 风格仿写。
  });
});
```

如果 AppShell 测试不易直接断言项目状态，**在 AppShell 加可选 `onProjectChange` 回调**，或在 reducer 单测层面验：

```ts
import { projectReducer } from "../app/projectReducer";
// ...
const next = projectReducer(cleared, {
  type: "add-stair",
  storeyId: "2f",
  stair: {
    x: 1, y: 3, width: 1.2, depth: 2.5,
    shape: "straight", treadDepth: 0.27, bottomEdge: "+y",
    materialId: "mat-dark-frame",
  },
});
expect(next.storeys.find((s) => s.id === "2f")?.stair).toBeDefined();
```

后者更稳。如果 reducer 测试已在 `__tests__/reducer.test.ts`，加 case 进去即可。

- [ ] **Step 6: 跑全测 + lint**

Run: `npm run lint && npm test`
Expected: PASS。

- [ ] **Step 7: 手动验**

`npm run dev` → 工具栏点"添加" → 楼梯 → 选层 → 检查 3D 视图出现新楼梯（默认位置可能与现有墙重叠产生错误提示——是预期）。

- [ ] **Step 8: 提交**

```bash
git add src/domain/types.ts src/app/persistence.ts \
       src/components/ToolPalette.tsx src/components/AppShell.tsx \
       src/__tests__/stairTool.test.tsx src/__tests__/reducer.test.ts
git commit -m "feat(ui): ToolPalette 加楼梯工具，AppShell 默认参数生成"
```

---

## Task 13: PropertyPanel 编辑楼梯

**Files:**
- Modify: `src/components/PropertyPanel.tsx`
- Test: `src/__tests__/propertyEditing.test.tsx`

**UI 结构**

selection.kind === "stair" 时，PropertyPanel 显示：

- 标题："楼梯（{storey.label}）"
- 形状按钮组：[一字 / L / U]，当前 shape 高亮
- 踏步深度：NumberField 单位米，min 0.20 max 0.40 step 0.01
- 入口边按钮组：[+X / -X / +Y / -Y]
- 转向按钮组（仅 shape=l）：[左转 / 右转]
- 材质选择：filter kind ∈ [frame, decor]
- 只读：踢踏数 / 踢踏高度（中文 "踢踏数" / "踢踏高度"，单位 m）

每次值变化 → `dispatch({ type: "update-stair", storeyId, patch: { ... } })`。

- [ ] **Step 1: 写失败测试**

在 `src/__tests__/propertyEditing.test.tsx` 加：

```tsx
describe("PropertyPanel — stair", () => {
  it("changes shape via button group", () => {
    const project = createSampleProject();
    const projectWithSel = { ...project, selection: { kind: "stair" as const, id: "2f" } };
    render(<AppShell initialProject={projectWithSel} />);
    // 切换到 plan-2f
    fireEvent.click(screen.getByRole("button", { name: "L" }));
    // 状态变更通过界面副作用断言（如形状按钮的 aria-pressed 翻转）
    expect(screen.getByRole("button", { name: "L" })).toHaveAttribute("aria-pressed", "true");
  });

  it("displays derived riser count and height", () => {
    const project = createSampleProject();
    const projectWithSel = { ...project, selection: { kind: "stair" as const, id: "2f" } };
    render(<AppShell initialProject={projectWithSel} />);
    expect(screen.getByText(/踢踏数/)).toBeInTheDocument();
    expect(screen.getByText(/19/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试，确认 FAIL**

Run: `npx vitest run src/__tests__/propertyEditing.test.tsx -t "PropertyPanel — stair"`
Expected: FAIL（按钮不存在）。

- [ ] **Step 3: 改 `src/components/PropertyPanel.tsx`**

仿照已有 wall/balcony 的 props/分支模式加 stair 分支。读 `props.project.storeys.find(s => s.id === selection.id)?.stair`。

按钮组用现成 React 模式（看现有 wall 形态切换的实现）。NumberField 已有组件复用。

事件 handler 一律走 props 提供的 `onUpdateStair(storeyId, patch)`，由 AppShell 转 dispatch。

- [ ] **Step 4: AppShell 接 onUpdateStair**

```ts
const handleUpdateStair = (storeyId: string, patch: StairPatch) => {
  try {
    dispatch({ type: "update-stair", storeyId, patch });
  } catch (error) {
    setAddError(error instanceof Error ? error.message : "无法更新楼梯。");
  }
};

// 渲染 PropertyPanel 处把它传下去
<PropertyPanel ... onUpdateStair={handleUpdateStair} />
```

- [ ] **Step 5: 跑测试，确认 PASS**

Run: `npx vitest run src/__tests__/propertyEditing.test.tsx`
Expected: PASS。

- [ ] **Step 6: 全测 + lint**

Run: `npm run lint && npm test`
Expected: PASS。

- [ ] **Step 7: 提交**

```bash
git add src/components/PropertyPanel.tsx src/components/AppShell.tsx \
       src/__tests__/propertyEditing.test.tsx
git commit -m "feat(ui): PropertyPanel 楼梯编辑（形状/踏步/朝向/转向/材质）"
```

---

## Task 14: DrawingSurface2D 渲染楼梯平面符号 + 选中

**Files:**
- Modify: `src/components/DrawingSurface2D.tsx`
- Test: `src/__tests__/wallDrawing.test.tsx` 或新建 `src/__tests__/stairPlanSymbol.test.tsx`

**渲染规则（spec §4）**

- 当前 plan 视图属于 storey N，渲染：
  - 上半段踏步（从转折/中点到 bottomEdge 对边） + "DN" 文字 + 朝 bottomEdge 方向的箭头 + 折线
  - 同时把 storey N+1 的 stair（若存在）取出渲染下半段（从 bottomEdge 到中点） + "UP" + 朝远离 bottomEdge 方向的箭头 + 折线
- 直跑：折线在 treadCount/2 位置，一道斜杠
- L：折线在转角平台位置
- U：折线在远端平台

**最简实现**（避免画建筑制图级别细节）：

- 整体楼梯外框（洞口矩形）画一条边框（虚线）
- 踏步：每级一条短横线（垂直于跑方向），平面上看像楼梯条纹
- 折线：在 treadCount/2 处画一道"波浪线"——最简就是"两条平行线之间一道斜杠"
- UP/DN 文字：放在跑的中段
- 箭头：单一三角形，沿跑方向

DrawingSurface2D 现在用 SVG 还是 Canvas？看实现。

- [ ] **Step 1: 阅读 DrawingSurface2D**

Run: `head -200 src/components/DrawingSurface2D.tsx` 了解坐标系、缩放、渲染管线。

- [ ] **Step 2: 写失败测试 `src/__tests__/stairPlanSymbol.test.tsx`**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "../components/AppShell";
import { createSampleProject } from "../domain/sampleProject";

describe("DrawingSurface2D — stair", () => {
  it("renders UP arrow on lower-storey plan when upper storey has a stair", () => {
    const project = createSampleProject();
    // sample 2F 上有 stair，1F plan 视图应显示"UP"
    const projectOn1F = { ...project, activeView: "plan-1f" as const };
    render(<AppShell initialProject={projectOn1F} />);
    expect(screen.getByText("UP")).toBeInTheDocument();
  });

  it("renders DN arrow on upper-storey plan", () => {
    const project = createSampleProject();
    const projectOn2F = { ...project, activeView: "plan-2f" as const };
    render(<AppShell initialProject={projectOn2F} />);
    expect(screen.getByText("DN")).toBeInTheDocument();
  });

  it("clicking the stair area selects stair", () => {
    const project = createSampleProject();
    const projectOn2F = { ...project, activeView: "plan-2f" as const };
    const { container } = render(<AppShell initialProject={projectOn2F} />);
    const stairEl = container.querySelector('[data-stair-id="2f"]');
    expect(stairEl).toBeTruthy();
    // 模拟 click（DrawingSurface2D 用 svg 上的 pointer events，需要符合该组件 helpers）
    // 此处仅验 DOM 存在即可；点选行为由组件单测层面更细致地断言。
  });
});
```

- [ ] **Step 3: 跑测试，确认 FAIL**

Run: `npx vitest run src/__tests__/stairPlanSymbol.test.tsx`
Expected: FAIL。

- [ ] **Step 4: 在 `DrawingSurface2D.tsx` 里加 stair 渲染**

定位现有"渲染当前 storey 的 walls / openings / balconies"循环，在它**之后**加 stair 渲染。两次：当前 storey 上半段 + 下层视角 plan 时取上面那层 stair 的下半段。

先在 DrawingSurface2D.tsx 顶部加 helper：

```ts
function findUpperStorey(project: HouseProject, storeyId: string): Storey | undefined {
  const sorted = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const idx = sorted.findIndex((s) => s.id === storeyId);
  return idx >= 0 ? sorted[idx + 1] : undefined;
}
```

然后伪代码（实际写法照抄现有渲染）：

```tsx
const currentPlanStoreyId = PLAN_STOREY_BY_VIEW[project.activeView];
if (currentPlanStoreyId) {
  const currentStorey = project.storeys.find((s) => s.id === currentPlanStoreyId);
  // 上半段（这层自己的 stair）
  if (currentStorey?.stair) {
    renderStairSymbol(currentStorey, currentStorey.stair, "upper");  // "DN"
  }
  // 下半段（上层 storey 的 stair）
  const upperStorey = findUpperStorey(project, currentPlanStoreyId);
  if (upperStorey?.stair) {
    renderStairSymbol(upperStorey, upperStorey.stair, "lower");  // "UP"
  }
}
```

`renderStairSymbol(ownerStorey, stair, halfKind)` 在 svg/canvas 里画：
- 矩形（dashed 边框）
- N 条短线（treads）
- 一道折线分隔（中段斜杠）
- "UP" 或 "DN" 文字
- 一个朝向 bottomEdge 反向（UP）/正向（DN）的小三角

把整组元素挂在 `<g data-stair-id={ownerStorey.id} ...>` 上，pointer-down 时 `dispatch({ type: "select", selection: { kind: "stair", id: ownerStorey.id } })`。

- [ ] **Step 5: 跑测试，确认 PASS**

Run: `npx vitest run src/__tests__/stairPlanSymbol.test.tsx`
Expected: PASS。

- [ ] **Step 6: 全测 + lint**

Run: `npm run lint && npm test`
Expected: PASS。

- [ ] **Step 7: 手动验**

`npm run dev` → 切到 1F plan → 看到"UP" + 楼梯线 → 切到 2F plan → "DN" + 楼梯线。点 2F plan 上的楼梯 → PropertyPanel 弹出楼梯编辑表单（Task 13 已做）。

- [ ] **Step 8: 提交**

```bash
git add src/components/DrawingSurface2D.tsx src/__tests__/stairPlanSymbol.test.tsx
git commit -m "feat(2d): 跨上下两层渲染楼梯平面符号 + 点选"
```

---

## Task 15: 全套验证 + dev 环境跑一遍

**Files:** —

- [ ] **Step 1: lint + 全测**

Run: `npm run lint && npm test`
Expected: PASS。

- [ ] **Step 2: build**

Run: `npm run build`
Expected: 成功生成 dist。

- [ ] **Step 3: dev 跑一遍各场景**

Run: `npm run dev`

依次验证：
1. 默认 sample 项目 → 1F plan 显示 UP 楼梯，2F plan 显示 DN + UP（来自 3F），3F plan 显示 DN。
2. 选中楼梯 → PropertyPanel 显示形状/踏步/朝向，能改 shape 切换 L/U（注意 sample 洞口可能不适合 L/U，但不应崩）。
3. 3D 视图 → 楼梯踏步可见。
4. 漫游模式 → 走到楼梯前能上去；上到上层后能走出洞口到上层楼面；从上层走到楼梯顶能下来。
5. 添加新楼梯：选 1F 添加楼梯应被拒（toast 错误：cannot have a stair）；选最顶层加楼梯应成功。

不必为每个场景写自动化——上面 14 个 task 已经覆盖单元/集成测试。这里是回归冒烟。

- [ ] **Step 4: 如有发现，回到对应 task 修；否则收工**

无新提交需要。

---

## Self-Review

写完后回头扫一遍 spec 各章节，看每条要求都有对应 task：

- §1 数据模型 → Task 1+2 ✓
- §2 自动计算 → Task 3 ✓
- §3 几何（直/L/U + 顶部对齐）→ Task 6/7/8 ✓
- §4 平面图（跨层 UP/DN/折线）→ Task 14 ✓
- §5 3D 漫游（box collidables + 物理推导说明）→ Task 10 + 11 ✓
- §6 选择 + 编辑 → Task 4 (selection) / Task 5 (mutations+reducer) / Task 12 (ToolPalette) / Task 13 (PropertyPanel) ✓
- §7 数据迁移（rename 一刀切）→ Task 1 ✓
- §8 测试（config / geometry / walk / 最底层拒收）→ Task 3 / 6-8 / 11 / 5 ✓
- §9 UI 交互（顶级踏步对齐 / 选中样式）→ Task 6 (顶级 0.01 钻入) / Task 14 (data-stair-id 高亮可继承现有 selection 样式)

**Placeholder 扫**：
- Task 6 中提到"前面写错了 `(i+0.5)*r + r/2`——应改为 `(i+0.5)*r`" 是设计推导文字，最终代码里只保留正确版本，提交前确认。
- Task 7 中"重看平面图：…"那段长注释是设计推导，在最终代码里精简。
- Task 14 引用 `findUpperStorey(project, currentPlanStoreyId)` 但未定义；实施时定义为：

  ```ts
  function findUpperStorey(project: HouseProject, storeyId: string): Storey | undefined {
    const sorted = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
    const idx = sorted.findIndex((s) => s.id === storeyId);
    return idx >= 0 ? sorted[idx + 1] : undefined;
  }
  ```

  把它放在 DrawingSurface2D.tsx 顶部或抽到 `src/domain/measurements.ts` 里。

**类型一致性**：
- `StairBox` / `StairGeometry` / `StairRenderGeometry` / `Stair` 全部统一定义在 Task 6 / 9。
- `StairPatch` 在 Task 5 定义，Task 13 使用。
- `pickFrameMaterialId` 仅在 AppShell 用，本地定义不复用。

**Spec 缺口检查**：风险 & 待办（spec 末段）的几个项是预期不修的（L 在窄洞口挤压、踏步抖动），不需要 task。

OK plan 完整。
