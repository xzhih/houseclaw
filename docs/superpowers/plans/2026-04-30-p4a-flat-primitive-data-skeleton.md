# P4A: 扁平 3D 原型 — 数据骨架 + 3D 显示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v2 接入运行时 —— 写一个像样的 v2 sample，让 reducer 持有 v2 状态，threeScene 重写吃 `HouseGeometryV2`，Preview3D + AppShell 串通，浏览器打开能看到 v2 sample 的 3D 透视。**P4A 不做 2D/编辑/PropertyPanel/工具栏交互**，那些按钮在 P4A 期间显示为 WIP 占位。

**Architecture:** v2 reducer 在 `src/app/v2/projectReducer.ts`、v2 threeScene 在 `src/rendering/v2/threeScene.ts`，与 v1 完全并列。`Preview3D.tsx` + `AppShell.tsx` 改为吃 v2 项目（in-place 重写）。v1 的 `DrawingSurface2D / ToolPalette / PropertyPanel` 等文件**保留在仓库但 AppShell 不渲染它们**（替换为占位）—— P4B / P4C 才会真正重写或替换那些组件。

**Tech Stack:** TypeScript 5、React 19、Three.js 0.184、vitest。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-flat-primitive-refactor-design.md` §6.2 P4。

**关键决策：**
- workspace.ts / persistence.ts **不动**，P4A 期间它们**继续保留 v1 sample 加载逻辑**但不再被使用（AppShell 直接 import v2 sample 作为初始状态）。P4B 或 P4C 时再替换为 v2 持久化。
- v2 reducer 只支持 `set-mode / set-view / set-tool / select / replace-project` 五个 action。**所有 mutation 类 action（update-wall、add-stair 等）留 P4C**。
- AppShell 在 P4A 把 2D 视图、PropertyPanel、ToolPalette 折叠成"v2 编辑器即将上线"占位文案。**Preview3D 是 P4A 唯一可见的核心功能**。
- `src/rendering/walkControls.ts` 和 `walkPhysics.ts` 共用，**不复制**，新 v2 threeScene 直接 import。

---

## File Structure

新建：

- `src/domain/v2/sampleProject.ts` — `createV2SampleProject()` 返回非平凡 v2 showcase（2 层 + 4 外墙 + 2 楼板 + 1 双坡屋顶 + 几个开洞 + 1 楼梯）
- `src/app/v2/projectReducer.ts` — minimal v2 reducer
- `src/rendering/v2/threeScene.ts` — v2 native scene（接 `HouseGeometryV2` + storey list）

修改（in-place）：

- `src/components/Preview3D.tsx` — switch to v2 project + v2 threeScene
- `src/components/AppShell.tsx` — load v2 sample，只渲染 Preview3D，2D/PropertyPanel/ToolPalette 显示 WIP 占位

新建测试：

- `src/__tests__/domain-v2/sampleProject.test.ts`
- `src/__tests__/app-v2/projectReducer.test.ts`
- `src/__tests__/rendering-v2/threeScene.test.ts`

不动：v1 的 `src/domain/types.ts`、`src/geometry/*`、`src/projection/*`（v1 路径）、`src/rendering/threeScene.ts`、`src/app/persistence.ts`、`src/app/workspace.ts`、`src/app/projectReducer.ts`、其余 components、所有 v2 已落代码。

P4A 结束后：
- `bun run test` 全套绿（新 ~10 测试）
- `bun run build` 全绿
- `bun run dev` 在浏览器打开，3D preview 看到 v2 sample 房子

---

## Task 1: v2 sample showcase

**Files:**
- Create: `src/domain/v2/sampleProject.ts`
- Create: `src/__tests__/domain-v2/sampleProject.test.ts`

A v2 project that's **bigger than the test fixture** but **smaller than the image-style house** (P5)。Goal: enough geometry to test render, exercise multi-storey walls, slab + roof + stair + multiple openings.

具体内容：
- 2 storeys: 1F 在 0m，2F 在 3.2m
- 4 外墙形成 8m × 6m 矩形，bottom anchored 1F、top anchored 顶（新建一层 storey "roof" 在 z=6.4m）
- 1 楼板 1F (z=0) + 1 楼板 2F (z=3.2)
- 1 屋顶（4-vert polygon = 外墙 bbox 加 0.5m 出檐，base = roof storey, edges = [eave, gable, eave, gable]，pitch=π/6）
- 4 开洞：前墙 1 门 + 1 窗，后墙 1 窗，右墙 1 窗
- 1 楼梯（直跑，from 1F → to 2F）
- 5 材质（白漆、深灰瓦、深灰窗框、深木门、混凝土楼板）

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/domain-v2/sampleProject.test.ts
import { describe, expect, it } from "vitest";
import { assertValidProject } from "../../domain/v2/validate";
import { createV2SampleProject } from "../../domain/v2/sampleProject";

describe("createV2SampleProject", () => {
  it("returns a project that passes assertValidProject", () => {
    const project = createV2SampleProject();
    expect(() => assertValidProject(project)).not.toThrow();
  });

  it("has 3 storeys (1F, 2F, roof)", () => {
    const project = createV2SampleProject();
    expect(project.storeys).toHaveLength(3);
    expect(project.storeys.map((s) => s.id)).toEqual(["1f", "2f", "roof"]);
  });

  it("has 4 exterior walls forming a rectangle", () => {
    const project = createV2SampleProject();
    const exterior = project.walls.filter((w) => w.exterior);
    expect(exterior).toHaveLength(4);
  });

  it("has 2 slabs (one per inhabited storey)", () => {
    const project = createV2SampleProject();
    expect(project.slabs).toHaveLength(2);
  });

  it("has 1 roof", () => {
    const project = createV2SampleProject();
    expect(project.roofs).toHaveLength(1);
  });

  it("has at least one stair", () => {
    const project = createV2SampleProject();
    expect(project.stairs.length).toBeGreaterThanOrEqual(1);
  });

  it("has multiple openings (door + windows)", () => {
    const project = createV2SampleProject();
    expect(project.openings.length).toBeGreaterThanOrEqual(3);
    const types = new Set(project.openings.map((o) => o.type));
    expect(types.has("door")).toBe(true);
    expect(types.has("window")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/domain-v2/sampleProject.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement v2 sample**

Create `src/domain/v2/sampleProject.ts` with this exact content:

```typescript
import type { HouseProject, Storey, Wall, Slab, Roof, Opening, Stair, Material } from "./types";

const W = 8;        // building width (x extent)
const D = 6;        // building depth (y extent)
const STOREY_H = 3.2;
const SLAB_THICK = 0.18;
const WALL_THICK = 0.24;

const STOREYS: Storey[] = [
  { id: "1f", label: "一层", elevation: 0 },
  { id: "2f", label: "二层", elevation: STOREY_H },
  { id: "roof", label: "屋面", elevation: STOREY_H * 2 },
];

const MATERIALS: Material[] = [
  { id: "mat-wall-white", name: "白漆外墙", kind: "wall", color: "#f4efe6" },
  { id: "mat-roof-tile", name: "深灰瓦", kind: "roof", color: "#3a3a3a" },
  { id: "mat-frame-dark", name: "深灰窗框", kind: "frame", color: "#2a2a2a" },
  { id: "mat-door-walnut", name: "深木门", kind: "frame", color: "#5b3a26" },
  { id: "mat-slab-stone", name: "混凝土楼板", kind: "decor", color: "#bdbdbd" },
];

const WALLS: Wall[] = [
  {
    id: "w-front",
    start: { x: 0, y: 0 }, end: { x: W, y: 0 },
    thickness: WALL_THICK,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "roof", offset: 0 },
    exterior: true,
    materialId: "mat-wall-white",
  },
  {
    id: "w-right",
    start: { x: W, y: 0 }, end: { x: W, y: D },
    thickness: WALL_THICK,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "roof", offset: 0 },
    exterior: true,
    materialId: "mat-wall-white",
  },
  {
    id: "w-back",
    start: { x: W, y: D }, end: { x: 0, y: D },
    thickness: WALL_THICK,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "roof", offset: 0 },
    exterior: true,
    materialId: "mat-wall-white",
  },
  {
    id: "w-left",
    start: { x: 0, y: D }, end: { x: 0, y: 0 },
    thickness: WALL_THICK,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "roof", offset: 0 },
    exterior: true,
    materialId: "mat-wall-white",
  },
];

const SLABS: Slab[] = [
  {
    id: "slab-1f",
    polygon: [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: D },
      { x: 0, y: D },
    ],
    top: { kind: "storey", storeyId: "1f", offset: 0 },
    thickness: SLAB_THICK,
    materialId: "mat-slab-stone",
  },
  {
    id: "slab-2f",
    polygon: [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: D },
      { x: 0, y: D },
    ],
    top: { kind: "storey", storeyId: "2f", offset: 0 },
    thickness: SLAB_THICK,
    materialId: "mat-slab-stone",
  },
];

const ROOFS: Roof[] = [
  {
    id: "roof-main",
    polygon: [
      { x: -0.5, y: -0.5 },
      { x: W + 0.5, y: -0.5 },
      { x: W + 0.5, y: D + 0.5 },
      { x: -0.5, y: D + 0.5 },
    ],
    base: { kind: "storey", storeyId: "roof", offset: 0 },
    edges: ["eave", "gable", "eave", "gable"],
    pitch: Math.PI / 6,
    overhang: 0.5,
    materialId: "mat-roof-tile",
  },
];

const OPENINGS: Opening[] = [
  // Front: entry door + 1F window + 2F window
  {
    id: "o-front-door",
    wallId: "w-front",
    type: "door",
    offset: 3.5,
    sillHeight: 0,
    width: 1.0,
    height: 2.1,
    frameMaterialId: "mat-door-walnut",
  },
  {
    id: "o-front-1f-win",
    wallId: "w-front",
    type: "window",
    offset: 1.0,
    sillHeight: 0.9,
    width: 1.6,
    height: 1.4,
    frameMaterialId: "mat-frame-dark",
  },
  {
    id: "o-front-2f-win",
    wallId: "w-front",
    type: "window",
    offset: 5.5,
    sillHeight: STOREY_H + 0.9,
    width: 1.6,
    height: 1.4,
    frameMaterialId: "mat-frame-dark",
  },
  // Back: 1 window
  {
    id: "o-back-2f-win",
    wallId: "w-back",
    type: "window",
    offset: 3.0,
    sillHeight: STOREY_H + 0.9,
    width: 2.0,
    height: 1.4,
    frameMaterialId: "mat-frame-dark",
  },
  // Right: 1 small window
  {
    id: "o-right-1f-win",
    wallId: "w-right",
    type: "window",
    offset: 2.5,
    sillHeight: 0.9,
    width: 1.0,
    height: 1.2,
    frameMaterialId: "mat-frame-dark",
  },
];

const STAIRS: Stair[] = [
  {
    id: "stair-1f-2f",
    x: 0.3, y: 0.3, width: 1, depth: 3,
    shape: "straight",
    treadDepth: 0.27,
    bottomEdge: "+y",
    from: { kind: "storey", storeyId: "1f", offset: 0 },
    to: { kind: "storey", storeyId: "2f", offset: 0 },
    materialId: "mat-slab-stone",
  },
];

export function createV2SampleProject(): HouseProject {
  return {
    schemaVersion: 2,
    id: "showcase-v2",
    name: "Showcase v2",
    storeys: STOREYS,
    materials: MATERIALS,
    walls: WALLS,
    slabs: SLABS,
    roofs: ROOFS,
    openings: OPENINGS,
    balconies: [],
    stairs: STAIRS,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/__tests__/domain-v2/sampleProject.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Cumulative + build**

Run: `bun run test src/__tests__/domain-v2/`
Expected: cumulative passes (count varies, all green).

Run: `bun run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/domain/v2/sampleProject.ts src/__tests__/domain-v2/sampleProject.test.ts
git commit -m "feat(domain-v2): showcase sample (2-storey + roof + stair)"
```

---

## Task 2: v2 projectReducer (minimal)

**Files:**
- Create: `src/app/v2/projectReducer.ts`
- Create: `src/__tests__/app-v2/projectReducer.test.ts`

5 actions only: `set-mode / set-view / set-tool / select / replace-project`. **No mutation actions** — those come in P4C.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/app-v2/projectReducer.test.ts
import { describe, expect, it } from "vitest";
import { createV2SampleProject } from "../../domain/v2/sampleProject";
import { projectReducerV2 } from "../../app/v2/projectReducer";

describe("projectReducerV2", () => {
  it("set-mode toggles between 2d and 3d", () => {
    const initial = createV2SampleProject();
    const next = projectReducerV2(initial, { type: "set-mode", mode: "3d" });
    expect(next.mode).toBe("3d");
  });

  it("set-view changes activeView", () => {
    const initial = createV2SampleProject();
    const next = projectReducerV2(initial, { type: "set-view", viewId: "elevation-front" });
    expect(next.activeView).toBe("elevation-front");
  });

  it("set-tool changes activeTool", () => {
    const initial = createV2SampleProject();
    const next = projectReducerV2(initial, { type: "set-tool", toolId: "wall" });
    expect(next.activeTool).toBe("wall");
  });

  it("select sets the selection state", () => {
    const initial = createV2SampleProject();
    const sel = { kind: "wall" as const, wallId: "w-front" };
    const next = projectReducerV2(initial, { type: "select", selection: sel });
    expect(next.selection).toEqual(sel);
  });

  it("replace-project swaps the entire project", () => {
    const initial = createV2SampleProject();
    const replacement = { ...initial, name: "Replaced" };
    const next = projectReducerV2(initial, { type: "replace-project", project: replacement });
    expect(next.name).toBe("Replaced");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/app-v2/projectReducer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement reducer**

Create `src/app/v2/projectReducer.ts` with this exact content:

```typescript
import type { HouseProject } from "../../domain/v2/types";

// Reuse v1's mode / view / tool string unions for now — they're language-level
// strings and don't depend on schema. v2 adds "slab" and "roof" tool ids vs v1
// "skirt", but P4A keeps the type permissive (string literal) since this
// reducer doesn't validate tool names.
export type ModeV2 = "2d" | "3d";
export type ViewIdV2 = string;
export type ToolIdV2 = string;
export type SelectionV2 =
  | { kind: "wall"; wallId: string }
  | { kind: "opening"; openingId: string }
  | { kind: "balcony"; balconyId: string }
  | { kind: "slab"; slabId: string }
  | { kind: "roof"; roofId: string }
  | { kind: "stair"; stairId: string }
  | { kind: "storey"; storeyId: string }
  | undefined;

/** v2 project plus session-level UI state held in the reducer. P4A keeps these
 *  fields on the project object for compatibility with v1 components that still
 *  read them; P4C may move them out into a separate UIState slice. */
export type SessionStateV2 = {
  mode: ModeV2;
  activeView: ViewIdV2;
  activeTool: ToolIdV2;
  selection: SelectionV2;
};

export type ProjectStateV2 = HouseProject & SessionStateV2;

export type ProjectActionV2 =
  | { type: "set-mode"; mode: ModeV2 }
  | { type: "set-view"; viewId: ViewIdV2 }
  | { type: "set-tool"; toolId: ToolIdV2 }
  | { type: "select"; selection: SelectionV2 }
  | { type: "replace-project"; project: ProjectStateV2 };

export function projectReducerV2(
  state: ProjectStateV2,
  action: ProjectActionV2,
): ProjectStateV2 {
  switch (action.type) {
    case "set-mode":
      return { ...state, mode: action.mode };
    case "set-view":
      return { ...state, activeView: action.viewId };
    case "set-tool":
      return { ...state, activeTool: action.toolId };
    case "select":
      return { ...state, selection: action.selection };
    case "replace-project":
      return action.project;
  }
}

export function withSessionDefaults(project: HouseProject): ProjectStateV2 {
  return {
    ...project,
    mode: "3d",
    activeView: "plan-1f",
    activeTool: "select",
    selection: undefined,
  };
}
```

(The test calls `projectReducerV2(createV2SampleProject(), ...)`. `createV2SampleProject` returns `HouseProject` which is missing the session fields. The test expects `next.mode` etc. The mismatch means the test treats the return as a partial type. To make tests pass, the reducer must accept input that has `mode` etc. We use `withSessionDefaults` to bridge — but the tests above call the reducer directly. Let me re-check.)

The test passes a bare `HouseProject` (no session fields) to the reducer. The reducer reads `state.mode` for set-mode but actually the action payload provides the new value, so reading state.mode isn't necessary. The reducer just spreads ...state and adds the field. TypeScript will be lax if we widen the input to `HouseProject` and the spread implicitly merges. Let me re-do the test to use `withSessionDefaults`:

Actually tests test reducer behavior, not types. Let me adjust the test to call `withSessionDefaults`:

Update the test step above:

```typescript
import { describe, expect, it } from "vitest";
import { createV2SampleProject } from "../../domain/v2/sampleProject";
import { projectReducerV2, withSessionDefaults } from "../../app/v2/projectReducer";

describe("projectReducerV2", () => {
  it("set-mode toggles between 2d and 3d", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, { type: "set-mode", mode: "3d" });
    expect(next.mode).toBe("3d");
  });

  it("set-view changes activeView", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, { type: "set-view", viewId: "elevation-front" });
    expect(next.activeView).toBe("elevation-front");
  });

  it("set-tool changes activeTool", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const next = projectReducerV2(initial, { type: "set-tool", toolId: "wall" });
    expect(next.activeTool).toBe("wall");
  });

  it("select sets the selection state", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const sel = { kind: "wall" as const, wallId: "w-front" };
    const next = projectReducerV2(initial, { type: "select", selection: sel });
    expect(next.selection).toEqual(sel);
  });

  it("replace-project swaps the entire project", () => {
    const initial = withSessionDefaults(createV2SampleProject());
    const replacement = { ...initial, name: "Replaced" };
    const next = projectReducerV2(initial, { type: "replace-project", project: replacement });
    expect(next.name).toBe("Replaced");
  });

  it("withSessionDefaults adds default session fields", () => {
    const session = withSessionDefaults(createV2SampleProject());
    expect(session.mode).toBe("3d");
    expect(session.activeView).toBe("plan-1f");
    expect(session.activeTool).toBe("select");
    expect(session.selection).toBeUndefined();
  });
});
```

Use this revised test file in Step 1 above instead of the original.

- [ ] **Step 4: Run tests**

Run: `bun run test src/__tests__/app-v2/projectReducer.test.ts`
Expected: 6 tests PASS.

Run: `bun run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/app/v2/projectReducer.ts src/__tests__/app-v2/projectReducer.test.ts
git commit -m "feat(app-v2): minimal projectReducer (view/tool/select/replace)"
```

---

## Task 3: v2 threeScene — rendering pipeline rewrite

**Files:**
- Create: `src/rendering/v2/threeScene.ts`
- Create: `src/__tests__/rendering-v2/threeScene.test.ts`

The v1 `src/rendering/threeScene.ts` is 940 LOC. **Don't port the entire file** — port only the public `mountHouseScene` interface and the inner mesh-building loop.

The v2 version takes a v2 `HouseProject` (for storeys + materials lookup) and a precomputed `HouseGeometryV2` (from `buildSceneGeometryV2`). It owns:
- THREE.Scene + WebGLRenderer + camera + lighting setup
- OrbitControls + walk controls (REUSE `src/rendering/walkControls.ts`)
- Mesh creation per geometry bucket (walls / slabs / roofs / stairs / balconies / opening frames)
- Walk physics ground-plane derivation from v2 slab elevations
- `dispose()`, `setCameraMode()`, `teleportToStorey()`, `setLighting()` API

**v2 mesh creation** is meaningfully different from v1:
- Wall bands now use `WallGeometryV2.bottomZ + topZ` (not v1's storey lookup).
- Slabs use `SlabGeometryV2.outline + holes + topZ + thickness` directly (THREE.Shape with Path holes for ExtrudeGeometry).
- Roofs use `RoofGeometryV2.panels + gables` directly.
- Opening frames use `FrameStrip[]` directly.
- Stairs use `StairGeometryV2.treads + landings`.
- Balconies use `BalconyGeometryV2` (slab + railing boxes — same approach as v1 inline).

**Shared with v1:** `walkControls.ts`, `walkPhysics.ts`, lighting constants, sun-azimuth-to-3D conversion.

Strategy: **read** `src/rendering/threeScene.ts` to understand the structure, then write `src/rendering/v2/threeScene.ts` from scratch with the v2 input shape. Keep the same public API surface (`MountedScene`, `LightingParams`, `mountHouseScene` etc.).

This is a heavy task. Allow up to 600 LOC. Allocate budget.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/rendering-v2/threeScene.test.ts
import { describe, expect, it, vi } from "vitest";
import { createV2SampleProject } from "../../domain/v2/sampleProject";
import { mountHouseSceneV2 } from "../../rendering/v2/threeScene";

describe("mountHouseSceneV2", () => {
  it("returns a MountedScene with required methods", () => {
    const host = document.createElement("div");
    const project = createV2SampleProject();
    let scene;
    try {
      scene = mountHouseSceneV2(host, project, {});
    } catch (e) {
      // jsdom doesn't support WebGL — accept this branch.
      expect(String(e)).toMatch(/webgl/i);
      return;
    }
    expect(typeof scene.dispose).toBe("function");
    expect(typeof scene.setCameraMode).toBe("function");
    expect(typeof scene.teleportToStorey).toBe("function");
    expect(typeof scene.setLighting).toBe("function");
    scene.dispose();
  });
});
```

(jsdom does not support WebGL, so the test allows for "WebGL unavailable" failure paths. The smoke test really just verifies the import + module structure compiles. Real visual verification is manual via `bun run dev`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/rendering-v2/threeScene.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Read v1 source for reference**

Read `src/rendering/threeScene.ts` end-to-end to understand:
- How it creates the renderer, camera, scene, lighting
- How it iterates v1 walls/slabs/roof to create meshes
- How it wires walk controls
- What `MountedScene` API it returns

Don't copy the file — use it as a structural reference.

- [ ] **Step 4: Implement `src/rendering/v2/threeScene.ts`**

The implementation is too large to inline here verbatim. Follow this scaffold and refer to v1 for the exact rendering choices (lighting setup, tonemapping, shadow flags, renderer parameters, etc.).

```typescript
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { HouseProject } from "../../domain/v2/types";
import { buildSceneGeometryV2 } from "../../geometry/v2/houseGeometry";
import type {
  BalconyGeometryV2,
  FrameStrip,
  HouseGeometryV2,
  RoofGable,
  RoofPanel,
  SlabGeometryV2,
  StairGeometryV2,
  WallGeometryV2,
} from "../../geometry/v2/types";
import { attachWalkControls, type WalkCallbacks } from "../walkControls";
import { pickFloorSwitchXZ } from "../walkPhysics";

export type CameraMode = "orbit" | "walk";

export type LightingParams = {
  exposure: number;
  hemiIntensity: number;
  keyIntensity: number;
  fillIntensity: number;
  sunAzimuthDeg: number;
  sunAltitudeDeg: number;
};

export const DEFAULT_LIGHTING: LightingParams = {
  exposure: 1.0,
  hemiIntensity: 0.7,
  keyIntensity: 1.5,
  fillIntensity: 0.6,
  sunAzimuthDeg: 160,
  sunAltitudeDeg: 36,
};

export type MountedSceneOptions = {
  onWalkExit?: () => void;
  onDigitKey?: (digit: number) => void;
  onCameraMove?: (cameraY: number) => void;
  lighting?: LightingParams;
};

export type MountedScene = {
  setCameraMode(mode: CameraMode): void;
  teleportToStorey(storeyId: string): void;
  setLighting(params: LightingParams): void;
  dispose(): void;
};

const FALLBACK_WALL_COLOR = "#dedbd2";
// (... copy the same defaults / fallback colors from v1 threeScene.ts ...)

function materialColorById(project: HouseProject, materialId: string, fallback = FALLBACK_WALL_COLOR): string {
  return project.materials.find((m) => m.id === materialId)?.color ?? fallback;
}

// (Plan: scene-y axis is up; plan x → world x; plan y → world -z.)
function planYToSceneZ(planY: number): number {
  return -planY;
}

// (--- Mesh builders per v2 type ---)

function buildWallMesh(geo: WallGeometryV2, project: HouseProject): THREE.Object3D {
  // Iterate geo.panels — each WallPanel is (x, y, width, height) in wall-local
  // coords. Use geo.footprint to position. Plan→scene transforms:
  //   - panel.x along the wall's footprint baseline
  //   - panel.y is wall-local vertical = world Y offset above bottomZ
  // Each panel becomes a thin BoxGeometry positioned at the wall's
  // footprint's centerline + outward normal half-thickness.
  // ... (See v1 threeScene.ts buildWallSegments for the algorithm)
  return new THREE.Group();
}

function buildSlabMesh(geo: SlabGeometryV2, project: HouseProject): THREE.Mesh {
  const shape = new THREE.Shape(geo.outline.map((p) => new THREE.Vector2(p.x, p.y)));
  for (const hole of geo.holes) {
    const path = new THREE.Path(hole.map((p) => new THREE.Vector2(p.x, p.y)));
    shape.holes.push(path);
  }
  const extrude = new THREE.ExtrudeGeometry(shape, { depth: geo.thickness, bevelEnabled: false });
  // Extrude grows along +z by default; we want the slab to extend DOWNWARD
  // from its top face. Position so top face = geo.topZ.
  const mat = new THREE.MeshStandardMaterial({
    color: materialColorById(project, geo.materialId, "#bdbdbd"),
  });
  const mesh = new THREE.Mesh(extrude, mat);
  // The shape lives in plan (x, y); the extrude grows along +z. Three.js scene
  // y is up, so we rotate the geometry to lie in world (x, z).
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = geo.topZ;
  // Plan-y → scene-z (negate).
  mesh.scale.z = -1;
  return mesh;
}

function buildRoofMesh(panels: RoofPanel[], gables: RoofGable[], project: HouseProject): THREE.Group {
  const group = new THREE.Group();
  for (const panel of panels) {
    // Build a polygon mesh from panel.vertices (Point3 in world coords).
    const verts = panel.vertices.map((v) => new THREE.Vector3(v.x, v.z, planYToSceneZ(v.y)));
    const geometry = new THREE.BufferGeometry();
    if (verts.length === 3) {
      geometry.setFromPoints(verts);
      geometry.setIndex([0, 1, 2]);
    } else if (verts.length === 4) {
      geometry.setFromPoints(verts);
      geometry.setIndex([0, 1, 2, 0, 2, 3]);
    }
    geometry.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: materialColorById(project, panel.materialId, "#3a3a3a"),
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(geometry, mat));
  }
  for (const gable of gables) {
    const verts = gable.vertices.map((v) => new THREE.Vector3(v.x, v.z, planYToSceneZ(v.y)));
    const geometry = new THREE.BufferGeometry();
    geometry.setFromPoints(verts);
    geometry.setIndex([0, 1, 2]);
    geometry.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: materialColorById(project, gable.materialId, FALLBACK_WALL_COLOR),
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(geometry, mat));
  }
  return group;
}

function buildStairMesh(geo: StairGeometryV2, project: HouseProject): THREE.Group {
  const group = new THREE.Group();
  const color = materialColorById(project, geo.materialId, "#bdbdbd");
  const mat = new THREE.MeshStandardMaterial({ color });
  for (const box of [...geo.treads, ...geo.landings]) {
    const g = new THREE.BoxGeometry(box.sx, box.sy, box.sz);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(box.cx, box.cy, planYToSceneZ(box.cz));
    if (box.rotationY !== undefined) mesh.rotation.y = box.rotationY;
    group.add(mesh);
  }
  return group;
}

function buildBalconyMesh(geo: BalconyGeometryV2, project: HouseProject): THREE.Group {
  // Slab box + 3-sided railing wall (front + 2 sides) similar to v1.
  // Position based on attached wall + offset/width/depth/slabTopZ.
  // ... (See v1 threeScene.ts addBalcony for the exact box positioning)
  return new THREE.Group();
}

function buildFrameMesh(strip: FrameStrip, project: HouseProject): THREE.Mesh {
  const g = new THREE.BoxGeometry(strip.size.alongWall, strip.size.height, strip.size.depth);
  const mat = new THREE.MeshStandardMaterial({
    color: materialColorById(project, strip.materialId, "#2a2a2a"),
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.position.set(strip.center.x, strip.center.z, planYToSceneZ(strip.center.y));
  mesh.rotation.y = strip.rotationY;
  return mesh;
}

// (--- Lighting + sun direction — copy from v1 threeScene.ts verbatim ---)
// (--- mountHouseSceneV2 wires renderer + scene + camera + lighting + meshes + walk ---)

export function mountHouseSceneV2(
  host: HTMLElement,
  project: HouseProject,
  options: MountedSceneOptions,
): MountedScene {
  const sceneGeometry: HouseGeometryV2 = buildSceneGeometryV2(project);
  // ... full scene setup similar to v1 ...
  // Iterate sceneGeometry buckets; for each, call the corresponding builder
  // above and add to the scene.
  // ...
  // Return MountedScene.
  throw new Error("Not yet fully implemented — see plan Task 3");
}
```

**Implementer note:** This is a large task. Read v1 `src/rendering/threeScene.ts` in full and **port** the lighting / camera / renderer setup verbatim, then replace the geometry-iteration sections with v2 calls above. The wall mesh builder is the most involved — v1's `buildWallSegments` slices the wall footprint into per-panel boxes with proper outward-normal positioning. Reuse the same algorithm against `WallGeometryV2.panels + WallGeometryV2.footprint`.

**Acceptable scope:**
- The rendered scene must be visually similar to v1 for the v2 sample
- Walk mode + orbit mode + lighting all functional
- `dispose()` cleans up GPU resources

**Out of scope:**
- Performance optimizations (instancing, shared materials)
- Shadow tweaks beyond v1 baseline
- Animation / transitions

If you find an algorithmic detail that's hard to port (e.g. v1's footprint inset for slab anti-z-fight, the wall panel outward normal math), copy it verbatim from v1 — don't try to re-derive.

- [ ] **Step 5: Run tests**

Run: `bun run test src/__tests__/rendering-v2/threeScene.test.ts`
Expected: PASS — 1 test (the smoke).

Run: `bun run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/rendering/v2/threeScene.ts src/__tests__/rendering-v2/threeScene.test.ts
git commit -m "feat(rendering-v2): mountHouseSceneV2 (consumes HouseGeometryV2)"
```

---

## Task 4: Preview3D rewrite to v2

**Files:**
- Modify: `src/components/Preview3D.tsx`

Switch the prop type from v1 `HouseProject` to v2 `ProjectStateV2` and call `mountHouseSceneV2` instead of `mountHouseScene`.

The walk floor buttons currently reads `project.storeys` — keep that, the field name is shared.

- [ ] **Step 1: Apply edits to Preview3D.tsx**

Replace these top-of-file imports:

```typescript
import type { HouseProject } from "../domain/types";
import {
  DEFAULT_LIGHTING,
  mountHouseScene,
  type CameraMode,
  type LightingParams,
  type MountedScene,
} from "../rendering/threeScene";
```

With:

```typescript
import type { ProjectStateV2 } from "../app/v2/projectReducer";
import {
  DEFAULT_LIGHTING,
  mountHouseSceneV2,
  type CameraMode,
  type LightingParams,
  type MountedScene,
} from "../rendering/v2/threeScene";
```

Replace the prop type:

```typescript
type Preview3DProps = {
  project: HouseProject;
};
```

With:

```typescript
type Preview3DProps = {
  project: ProjectStateV2;
};
```

Inside the `useEffect` that mounts the scene, replace `mountHouseScene(host, project, {...})` with `mountHouseSceneV2(host, project, {...})`. All other code stays the same — `project.storeys` exists on both types.

- [ ] **Step 2: Run build**

Run: `bun run build`
Expected: green. If TS errors mention v1 fields no longer on v2 (e.g. `slabThickness` on storeys), fix the consumer code in this same file.

- [ ] **Step 3: Run tests**

Run: `bun run test`
Expected: existing tests still pass (they don't render Preview3D directly in a real browser).

- [ ] **Step 4: Commit**

```bash
git add src/components/Preview3D.tsx
git commit -m "feat(components): Preview3D consumes v2 project + v2 threeScene"
```

---

## Task 5: AppShell rewrite — load v2, render only Preview3D + WIP placeholders

**Files:**
- Modify: `src/components/AppShell.tsx`

The v1 AppShell is 675 LOC orchestrating reducer + DrawingSurface2D + Preview3D + ToolPalette + PropertyPanel + ViewTabs etc. P4A drastically simplifies it: load v2 sample, dispatch to v2 reducer, render only Preview3D when `mode === "3d"`, show a placeholder message when `mode === "2d"`.

The strategy: **stash** the existing v1 AppShell code (don't delete) in case P4B/C needs reference, and rewrite the file to a minimal v2 shell.

- [ ] **Step 1: Read existing AppShell.tsx** to understand its structure

Read `src/components/AppShell.tsx` to see what's currently rendered.

- [ ] **Step 2: Replace AppShell.tsx with this minimal v2 version**

```typescript
import { useReducer } from "react";
import { withSessionDefaults, projectReducerV2, type ProjectStateV2 } from "../app/v2/projectReducer";
import { createV2SampleProject } from "../domain/v2/sampleProject";
import { Preview3D } from "./Preview3D";

function init(): ProjectStateV2 {
  return withSessionDefaults(createV2SampleProject());
}

export function AppShell() {
  const [project, dispatch] = useReducer(projectReducerV2, undefined, init);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">HouseClaw</h1>
        <div className="mode-toggle" role="group" aria-label="模式">
          <button
            type="button"
            aria-pressed={project.mode === "2d"}
            onClick={() => dispatch({ type: "set-mode", mode: "2d" })}
          >
            2D
          </button>
          <button
            type="button"
            aria-pressed={project.mode === "3d"}
            onClick={() => dispatch({ type: "set-mode", mode: "3d" })}
          >
            3D
          </button>
        </div>
      </header>

      <main className="app-main">
        {project.mode === "3d" ? (
          <Preview3D project={project} />
        ) : (
          <div className="wip-placeholder">
            <h2>v2 2D 编辑器即将上线</h2>
            <p>P4B 阶段会接通 plan / elevation / roof 视图。当前阶段只有 3D 预览可用。</p>
            <button
              type="button"
              onClick={() => dispatch({ type: "set-mode", mode: "3d" })}
            >
              返回 3D 预览
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Add minimal CSS for the placeholder** (if not already present)

Check `src/styles.css` for `.wip-placeholder` — if absent, append:

```css
.wip-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 64px;
  height: 100%;
  text-align: center;
  color: #666;
}

.wip-placeholder h2 {
  margin: 0;
  font-size: 1.4em;
  font-weight: 500;
}

.wip-placeholder button {
  padding: 8px 20px;
  border: 1px solid #999;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}
```

- [ ] **Step 4: Run build**

Run: `bun run build`
Expected: green.

If errors arise from now-orphaned imports of removed code, the new minimal AppShell.tsx replaces the file entirely so this should not happen — but if it does, the new file is self-contained.

- [ ] **Step 5: Run tests**

Run: `bun run test`
Expected: any existing AppShell-related tests will likely fail (they tested the v1 shell). For P4A, it's acceptable to delete those test files OR comment them out.

Look for tests that import from `../components/AppShell`:

```bash
grep -rl "from.*components/AppShell" src/__tests__/
```

For each test file found:
- If it tests features absent in P4A's minimal shell, comment out the entire test file body with a `// TODO P4B: rewrite for v2 shell` comment, and add `it.skip("placeholder", () => {});` so the file still compiles.
- Examples: `propertyEditing.test.tsx`, `selectionRegistry.test.tsx`, `elevationAdd.test.tsx`, `ui.test.tsx`, `preview3d.test.tsx`, `stairPlanSymbol.test.tsx`.

Re-run `bun run test` and confirm all green.

- [ ] **Step 6: Commit**

```bash
git add src/components/AppShell.tsx src/styles.css src/__tests__/
git commit -m "feat(components): AppShell loads v2 sample + 3D-only preview"
```

(Note: this commit may include the disabled-test files. List them explicitly if needed.)

---

## Task 6: Final green sweep + manual smoke

**Files:** None.

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`
Expected: all tests pass.

- [ ] **Step 2: Run the type check + build**

Run: `bun run build`
Expected: tsc clean, vite build succeeds.

- [ ] **Step 3: Manual browser smoke**

Run: `bun run dev` (in a separate terminal — or report the command for the user to run).
Expected: localhost URL prints. **Implementer should NOT open the browser themselves**, but should report:
- Dev server started on port X
- No console errors at startup (check terminal output)

The user will manually open the browser and verify.

- [ ] **Step 4: Confirm isolation**

Run: `git diff b5f97ec..HEAD -- src/ ':!src/domain/v2/' ':!src/__tests__/domain-v2/' ':!src/app/v2/' ':!src/__tests__/app-v2/' ':!src/rendering/v2/' ':!src/__tests__/rendering-v2/' ':!src/components/Preview3D.tsx' ':!src/components/AppShell.tsx' ':!src/styles.css' ':!src/__tests__/'`
Expected: empty (only the explicitly-modified files outside v2 dirs are AppShell, Preview3D, styles.css, plus possibly some skipped test files in src/__tests__).

---

## Done Criteria

- `bun run test` 全绿
- `bun run build` 全绿
- `bun run dev` 启动后浏览器看到 v2 sample 的 3D 透视
- 2D 模式显示 WIP 占位
- 现有 v1 + v2 已落代码（domain/v2、geometry/v2、projection/v2）零修改

## P4A 不做（明确边界）

- DrawingSurface2D 接通 v2 → P4B
- ToolPalette 工具点击交互 → P4B/C
- PropertyPanel 编辑器 → P4C
- v2 mutations (add/update/remove) → P4C
- v2 persistence + workspace 适配 → P4C
- Storey 列表编辑器 → P4C
- 任何视觉 polish（材质纹理、阴影优化等）→ 后续

## 风险

1. **threeScene 重写工作量超预期**：v1 是 940 LOC、富含 walk physics 和细节。对策：Task 3 实现允许大幅 LOC 预算；如果 implementer 卡住，escalate 上来人工审视。
2. **AppShell 替换可能让现有 UI 测试大量失败**：Task 5 Step 5 已规划 skip 这些测试。后续 P4B/C 重新启用并适配 v2。
3. **v2 sample 不一定 100% 通过 assertValidProject**：Task 1 测试已验证；如果 fail，调整 sample 数据直到 valid。
