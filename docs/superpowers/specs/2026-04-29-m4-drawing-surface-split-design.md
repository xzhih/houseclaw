# M4：DrawingSurface2D 拆分

日期：2026-04-29
分支：`xzhih-dev`
路线图：`docs/2026-04-28-iteration-friction-roadmap.md`

## 背景

`src/components/DrawingSurface2D.tsx` 当前 **2390 LOC**，承载 plan / elevation / roof 三种视图的全部 2D 交互入口：

- DragState union：13 个 variant（wall-translate / wall-endpoint / opening / plan-opening-resize / balcony / plan-balcony-resize / elev-opening-move / elev-opening-resize / elev-balcony-move / elev-balcony-resize / stair-translate / stair-resize / stair-rotate / elev-storey-translate）
- 14 个 `begin*` drag-factory 把 pointerDown 翻译成初始 DragState
- `applyDrag` 一个 350 行的 13-arm switch，混着 `onProjectChange` + `setActiveSnap` + `setGuideMatches` + `setDragReadout`
- 三个独立 render 函数（renderPlan ~400 / renderElevation ~165 / renderRoofView ~110），都是纯函数但全在主文件
- 主组件 ~1060 行：viewport state + projection setup + 14 begin* + applyDrag + pointerMove/Up + JSX
- `__tests__/` 没有任何与 DrawingSurface2D 相关的测试，drag 状态机当前 0 自动覆盖

这种集中度有两个问题：

1. **13-transition 的状态机没法独立测**——applyDrag 直接吃 React setState 与 `onProjectChange` 闭包，跑测必须挂载组件、模拟 pointerEvent
2. **加构件时 DrawingSurface2D 必改**——M3 之前每加一个构件至少要改这里 4 处（DragState 加 variant、begin* 加 factory、applyDrag 加 case、render 加 element）。即使 M3 把 mutation 收敛了，UI 这一层仍然散

## 目标

- **drag state machine 提取为纯函数**，单测覆盖 13 transition 的核心 patch 表达 + 边界条件 + click-to-select
- **主入口文件 `DrawingSurface2D.tsx` ≤ 400 LOC**；canvas/ 子文件单个 ≤ 600 LOC
- **renderPlan / renderElevation / renderRoofView 落到独立文件**，signature 与行为零变化
- 不改任何外部行为（pointer 事件路径、吸附结果、键盘快捷键、JSON round-trip）

## 非目标（明确推迟）

- 把 14 个 begin* drag-factory 数据化（用 registry 替代 switch-style 14 函数）——boilerplate 多但没扩展性需求拉动
- 把 renderPlan/Elevation/Roof 改写成 React 组件——已是纯函数，搬位置就够
- 把 SelectionOverlay / ConstraintGuides 单独拆成独立组件——selection highlight 嵌在 renderPlan 元素循环里、SmartGuides 已经独立
- 把 6 个 useState 合并为 useReducer——状态彼此联动有限，合并反而绕路
- 引入新的几何 / 投影逻辑——只搬不改

## 方案

### 整体结构

```
src/components/canvas/                        (已存在，沿用)
  ├── dragState.ts          # NEW: DragState union (~170) + GuideMatch / DragReadout / *DragHandlers 类型
  ├── dragMachine.ts        # NEW: applyDrag 纯函数 + selectionOnClick 纯函数 (~400)
  ├── useDragHandlers.ts    # NEW: 14 个 begin* drag-factory hook (~280)
  ├── useViewport.ts        # NEW: viewport state + wheel/pan (~60)
  ├── renderUtils.ts        # NEW: PointMapping / eventToViewBoxPoint / bounds / 几何 helper (~340)
  ├── renderPlan.tsx        # NEW: renderPlan + renderSelectableBalcony (~430)
  ├── renderElevation.tsx   # NEW: renderElevation (~165)
  ├── renderRoofView.tsx    # NEW: renderRoofView (~110)
  └── (已存在: GridOverlay / ScaleRuler / SmartGuides / StatusReadout / ZoomControls / types.ts)

src/components/
  └── DrawingSurface2D.tsx  # 收缩为壳 ≤ 400 LOC

src/__tests__/
  └── dragMachine.test.ts   # NEW: 13 transition × 边界用例 + selectionOnClick
```

8 个新文件 + 1 测试文件。每个 ≤ 600 LOC。

**与路线图字面的偏离**：

1. 路线图列了 `SelectionOverlay` / `ConstraintGuides` 模块；实操中 selection highlight 嵌在 renderPlan 的元素循环里（每个 wall 渲染时直接判断 selected），强行拆出来要么复制循环、要么开 props 通道，都不划算。`<SmartGuides>` 已是独立组件——`ConstraintGuides` 等同于它，无需新建。
2. 路线图 `EventRouter` 单独列出；实操中 pointerDown/Move/Up 的核心调度逻辑只有 ~80 LOC（dragState 命中 → applyDrag；否则 hover/pan），独立成文件让壳更难读，inline 在主文件更顺。

### dragMachine 接口（M4 核心）

把 `applyDrag` 从混着 `setState` + `onProjectChange` 的副作用函数改纯：

```ts
// canvas/dragMachine.ts
import type { DragState } from "./dragState";

export type WallSegment = { start: Point2D; end: Point2D };

export type DragContext = {
  project: HouseProject;
  planProjection?: PlanProjection;
  /** 同 storey 的其他 wall（machine 自己不再过滤），caller 预先准备好闭包 */
  otherWallSegmentsExclude: (excludeWallId?: string) => WallSegment[];
};

export type DragOutcome = {
  /** 下一个 project；若 drag 因约束（min-size 等）拒绝，等于入参 project */
  project: HouseProject;
  activeSnap: Point2D | null;
  guideMatches: GuideMatch[];
  dragReadout: DragReadout | null;
};

/**
 * 计算一次 drag 帧的全部输出。无副作用、无 React。
 * 返回 null 时表示"忽略本帧"（最小尺寸违例等），caller 不应更新任何状态。
 */
export function applyDrag(
  state: DragState,
  currentWorld: Point2D,
  ctx: DragContext,
): DragOutcome | null;

/**
 * pointer-up 收尾时，根据未发生位移的 drag 计算 click-to-select。
 * 返回 undefined 表示"保留当前选中"。
 */
export function selectionOnClick(state: DragState): ObjectSelection | undefined;
```

**关键决定**：

1. **machine 内部用 mutations.ts 的纯 mutation**（`moveWall` / `updateOpening` / `updateBalcony` / `updateStair` / `translateStorey`）——不重新实现几何，只组装。M3 已经把这些 mutation 验证过抛 typed error；machine 用 `try { ... } catch { return null }` 吃掉，对应当前的 "invalid move — keep last valid state"。
2. **min-size 拒绝路径**（当前的 `if (newWidth < minSize) return;`）→ 改成 `return null`。返回 null 是"本帧无效"语义，比"原项目+无 readout"更精确。
3. **outcome 总包含全部 4 个字段**，caller 全量替换 React state——简单可测。当前每个 case 自己决定哪个 set\* 调、哪个不调，搬到纯函数后由各 case 显式构造 `activeSnap` / `guideMatches` / `dragReadout` 字段（多数 case 把 snap/guides 设 null/空数组）。
4. **不内化 grid / threshold 常量**：`PLAN_GRID_SIZE = 0.1` / `PLAN_ENDPOINT_THRESHOLD = 0.2` / `DRAG_MOVE_THRESHOLD_WORLD = 0.04` 作为模块级常量留在 dragMachine.ts 内，单元测试可以直接断言基于 0.1 的 grid 吸附。如果以后要让用户调整 grid 大小，再注入。
5. **`otherWallSegmentsExclude` 由 caller 注入**——它依赖 `storeyId` 过滤，是 view-specific 的，machine 不知道当前 view，让组件准备好闭包。
6. **`selectionOnClick` 是另一个纯函数**：语义是"未拖动 + 释放"，跟 applyDrag 的"拖动中"不属于同一动作。两个函数都从 DragState 派生，但语义独立。

### useViewport hook

把 viewport state + wheel 监听 + middle-button pan 一锅端：

```ts
// canvas/useViewport.ts
export type Viewport = { zoom: number; panX: number; panY: number };
export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 8;

export function useViewport(svgRef: RefObject<SVGSVGElement | null>, resetKey: string) {
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const panLastPos = useRef({ x: 0, y: 0 });
  const panPointerId = useRef<number | null>(null);

  // 切 project / view 时重置
  useEffect(() => setViewport(DEFAULT_VIEWPORT), [resetKey]);

  // wheel: ctrl/meta = zoom，否则 pan；通过 svgRef 自己 attach（passive: false）
  useEffect(() => { /* ... */ }, [svgRef]);

  return {
    viewport,
    setViewport,
    isPanning,
    panHandlers: {
      onPointerDown: (e: PointerEvent<SVGSVGElement>) => void,
      onPointerMove: (e: PointerEvent<SVGSVGElement>, viewport: Viewport, setViewport: ...) => void,
      onPointerUp:   (e: PointerEvent<SVGSVGElement>) => void,
    },
  };
}
```

`resetKey` 传 `${project.id}|${project.activeView}` 拼接串。`onPointerMove` 接受当前 viewport 与 setViewport——因为 zoom 影响 pan 步长，在 hook 内部 ref 化反而更绕。

### useDragHandlers hook

把 14 个 begin* drag-factory 收进一个 hook，返回 plan + elevation 两组 handler 对象（保留现有 `PlanDragHandlers` / `ElevationDragHandlers` shape）：

```ts
// canvas/useDragHandlers.ts
type Args = {
  project: HouseProject;
  storeyId: string | undefined;
  elevationSide: ElevationSide | undefined;
  planMapping: PointMapping | undefined;
  elevationMapping: PointMapping | undefined;
  svgRef: RefObject<SVGSVGElement | null>;
  setDragState: (state: DragState) => void;
};

export function useDragHandlers(args: Args): {
  planHandlers: PlanDragHandlers;
  elevationHandlers: ElevationDragHandlers;
};
```

实现就是当前主组件 1493-1851 行的 14 个函数原样搬进来，依赖通过 args 注入；闭包策略：每帧重新构造（依赖 project，不假装稳定）。

**关键决定**：

1. **不数据化 14 个 factory**：每个 begin* 有独立的 wall/opening/balcony lookup + 字段 copy 逻辑，硬抽 registry 等于把 13-arm switch 换 14-entry map，没收益。begin* 是机械样板，集中在一文件已够看。
2. **handler 对象保形不变**：`PlanDragHandlers` / `ElevationDragHandlers` 这两个 type 已是 renderPlan/Elevation 的 props 协议；搬到 dragState.ts 跟 DragState 同住，shape 不动。
3. **不试图测 useDragHandlers**：纯样板；machine 部分已覆盖 outcome，factory 的"DragState 字段从 wall/opening 拷贝"如果有 bug，TS 类型 + 集成手测已够。
4. **`setDragState` 而非 returning state**：保持 React 风格；hook 不持有 dragState，由主组件持有（dragState 还要喂给 pointerMove → applyDrag）。

### 主组件壳与 pointer 调度

`DrawingSurface2D.tsx` 收缩后只剩 5 件事：组合 hook、算 projection、调度 pointer 事件、装 JSX。骨架：

```tsx
export function DrawingSurface2D({ project, onSelect, onProjectChange }: Props) {
  const storeyId = planStoreyIdFromView(project.activeView, project.storeys);
  const elevationSide = ELEVATION_SIDE_BY_VIEW[project.activeView];
  const svgRef = useRef<SVGSVGElement | null>(null);

  // ---- viewport
  const { viewport, setViewport, isPanning, panHandlers } =
    useViewport(svgRef, `${project.id}|${project.activeView}`);

  // ---- drag state
  const [dragState, setDragState] = useState<DragState | undefined>(undefined);
  const [activeSnap, setActiveSnap] = useState<Point2D | null>(null);
  const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);
  const [gridVisible, setGridVisible] = useState(true);
  const [dragReadout, setDragReadout] = useState<DragReadout | null>(null);
  const [guideMatches, setGuideMatches] = useState<GuideMatch[]>([]);

  // ---- projection
  const planProjection = storeyId ? projectPlanView(project, storeyId) : undefined;
  // ... ghostProjection / planMapping / planFootprints / elevationProjection / elevationMapping

  // ---- 14 个 begin* 工厂
  const { planHandlers, elevationHandlers } = useDragHandlers({
    project, storeyId, elevationSide,
    planMapping, elevationMapping, svgRef, setDragState,
  });

  // ---- otherWallSegmentsExclude（view-specific 闭包）
  const otherWallSegmentsExclude = (excludeWallId?: string) =>
    storeyId === undefined ? [] : project.walls
      .filter(w => w.storeyId === storeyId && w.id !== excludeWallId)
      .map(w => ({ start: w.start, end: w.end }));

  // ---- pointer 调度（核心 ~90 LOC）
  const handlePointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button === 1) panHandlers.onPointerDown(e);
  };

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (dragState && e.pointerId === dragState.pointerId) {
      const world = eventToWorldWith(svgRef, e, dragState.mapping);
      if (!world) return;
      setCursorWorld(world);
      const dx = world.x - dragState.startWorld.x;
      const dy = world.y - dragState.startWorld.y;
      if (!dragState.moved && Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD_WORLD) return;
      if (!dragState.moved) setDragState({ ...dragState, moved: true });

      const ctx: DragContext = { project, planProjection, otherWallSegmentsExclude };
      const outcome = applyDrag(dragState, world, ctx);
      if (!outcome) return;
      onProjectChange(outcome.project);
      setActiveSnap(outcome.activeSnap);
      setGuideMatches(outcome.guideMatches);
      setDragReadout(outcome.dragReadout);
      return;
    }
    if (isPanning) { panHandlers.onPointerMove(e, viewport, setViewport); return; }
    // hover：cursorWorld
    const m = planMapping ?? elevationMapping;
    setCursorWorld(m ? (eventToWorldWith(svgRef, e, m) ?? null) : null);
  };

  const handlePointerUp = (e: PointerEvent<SVGSVGElement>) => {
    if (dragState && e.pointerId === dragState.pointerId) {
      const finished = dragState;
      const wasMoved = finished.moved;
      setDragState(undefined);
      setActiveSnap(null);
      setDragReadout(null);
      setGuideMatches([]);
      if (svgRef.current?.hasPointerCapture(e.pointerId))
        svgRef.current.releasePointerCapture(e.pointerId);
      if (!wasMoved) {
        const sel = selectionOnClick(finished);
        if (sel) onSelect(sel);
      }
      return;
    }
    panHandlers.onPointerUp(e);
  };

  // ---- JSX：renderPlan / renderElevation / renderRoofView 从 canvas/* import
  return (...);
}
```

**关键决定**：

1. **6 个 useState 并存**——它们大多数转换都不联动（cursorWorld 跟 hover、gridVisible 跟工具栏切换），合一个 reducer 反而绕。
2. **`otherWallSegmentsExclude` 留主组件**——view-specific，组件传闭包给 ctx。
3. **wheel 监听挪进 useViewport**——通过 `svgRef` 自己 attach（passive: false），避免 React 合成事件不能 preventDefault 的问题。
4. **panHandlers.onPointerMove 签名带 viewport / setViewport**：因为 zoom 影响步长，比把 viewport 强行变 ref 便宜。

预算复核：壳 ≈ projection setup (50) + dispatch handlers (90) + JSX (70) + 杂项 (30) ≈ **240 LOC**。安全。

### 渲染层落到独立文件

renderPlan / renderElevation / renderRoofView **signature 与行为零变化**。共享几何工具集中到 `renderUtils.ts`，由三个 render 文件 import。

```ts
// canvas/renderUtils.ts (~340 LOC)
export type PointMapping = { project, unproject, scale };
export const ELEVATION_SIDE_BY_VIEW: Partial<Record<ViewId, ElevationSide>>;
export function createPointMapping(bounds: Bounds): PointMapping;
export function eventToViewBoxPoint(svg, clientX, clientY): Point2D;
export function planBounds(p: PlanProjection): Bounds;
export function elevationBounds(p: ElevationProjection): Bounds;
export function unionBounds(a: Bounds, b: Bounds): Bounds;
export function elevationAxisToWorld(side, dxAxis): { dx; dy };
export function computeSolidPanels(...): ...;
export function openingLine(...): ...;
export function balconyPolygon(...): ...;
export function polyPoints(points: Point2D[]): string;
export function buildStairSymbolGeometry(...): StairSymbolGeometry;
```

```ts
// canvas/renderPlan.tsx (~430 LOC)
export function renderPlan(
  projection: PlanProjection,
  selection: ObjectSelection | undefined,
  onSelect: (s: ObjectSelection | undefined) => void,
  activeTool: ToolId,
  footprints: Map<string, WallFootprint>,
  activeSnap: Point2D | null,
  handlers: PlanDragHandlers,
  ghost?: PlanProjection,
): ReactElement;
```

```ts
// canvas/renderElevation.tsx (~165 LOC)
export function renderElevation(
  projection: ElevationProjection,
  selection: ObjectSelection | undefined,
  onSelect: ...,
  activeTool: ToolId,
  handlers: ElevationDragHandlers,
): ReactElement;
```

```ts
// canvas/renderRoofView.tsx (~110 LOC)
export function renderRoofView(
  project: HouseProject,
  onSelect: ...,
  onProjectChange: (p: HouseProject) => void,
): ReactElement;
```

**关键决定**：

1. **PlanDragHandlers / ElevationDragHandlers 类型搬到 dragState.ts**：与 DragState 同源（描述 begin* 入口），现在 props 上下游都从一处 import。
2. **`renderSelectableBalcony` helper 跟 renderPlan 同住**：返回 ReactElement 且只在 plan 用，没共享必要。
3. **不把 renderRoofView 改成 React 组件**：与 renderPlan/Elevation 保持一致。
4. **几何 helper 不抽到业务层**：plan/elevation 之外没人用。

### 常量分布

- `SURFACE_WIDTH=720` / `SURFACE_HEIGHT=520` / `SURFACE_PADDING=48`：留主文件（JSX viewBox 用）；renderUtils 也需要 `SURFACE_WIDTH/HEIGHT/PADDING` 计算 PointMapping，从主文件 export 或者搬到 renderUtils（**搬到 renderUtils**，主文件再 import）
- `PLAN_GRID_SIZE=0.1` / `PLAN_ENDPOINT_THRESHOLD=0.2` / `DRAG_MOVE_THRESHOLD_WORLD=0.04`：dragMachine.ts
- `ENDPOINT_HANDLE_RADIUS=7`：renderPlan.tsx
- `ELEVATION_SIDE_BY_VIEW`：renderUtils.ts
- `ZOOM_MIN=0.4` / `ZOOM_MAX=8`：useViewport.ts

## 测试

### dragMachine.test.ts — 新增

固定一份 minimal 项目 fixture（2 面墙 + 1 个 opening + 1 个 balcony + 1 个 stair），每个 transition 一组测试：

```ts
describe("applyDrag", () => {
  describe("wall-translate", () => {
    it("snaps to grid when no nearby endpoint", ...);
    it("snaps start to other-wall endpoint when within threshold", ...);
    it("snaps end to other-wall endpoint when start is farther", ...);
    it("returns outcome with activeSnap=null when no snap", ...);
  });
  describe("wall-endpoint", () => {
    it("snaps to endpoint when in range", ...);
    it("emits guide matches when axis-aligned with anchor", ...);
    it("falls back to grid when no snap and no guide", ...);
  });
  describe("opening drag", () => {
    it("clamps to wall length", ...);
    it("clamps to >=0 offset", ...);
    it("rounds to grid", ...);
  });
  describe("plan-opening-resize", () => {
    it("left edge: shrinks width and shifts offset", ...);
    it("right edge: grows width", ...);
    it("returns null when below minSize=0.05", ...);
  });
  describe("balcony / plan-balcony-resize", ...);                 // 镜像 opening
  describe("elev-opening-move / elev-opening-resize", ...);        // 含 projSign 镜像
  describe("elev-balcony-move / elev-balcony-resize", ...);
  describe("stair-translate / stair-resize / stair-rotate", ...);
  describe("elev-storey-translate", ...);
});

describe("selectionOnClick", () => {
  it.each([
    ["wall-translate",        { kind: "wall",    id: "w1" }],
    ["opening",               { kind: "opening", id: "o1" }],
    ["elev-opening-move",     { kind: "opening", id: "o1" }],
    ["balcony",               { kind: "balcony", id: "b1" }],
    ["elev-balcony-move",     { kind: "balcony", id: "b1" }],
    ["stair-translate",       { kind: "stair",   id: "1f"  }],
    ["elev-storey-translate", { kind: "storey",  id: "1f"  }],
  ])("kind=%s -> %o", ...);
  it("returns undefined for resize handles (wall-endpoint, plan-opening-resize, ...)", ...);
});
```

预计 ~50 个 it。每个 transition 至少 happy + 1 边界。

### 现有测试

不改动。`mutations.test.ts` / `selection.test.ts` / `entityStores.test.ts` / `propertyEditing.test.tsx` 等都是 domain / mutation / 编辑面板层，与本次重构无交集。

**不写 React component test**——
- DrawingSurface2D 已无独立 logic（壳）；逻辑全在 dragMachine.test.ts 里测了
- 路线图原话："状态机 100% 状态转换被单测覆盖" + "手动验证：所有 2D 交互不回退"
- 现有也没有 DrawingSurface2D 的 component test，不强行新建

### 验收 walkthrough（合并前）

1. plan-1f：拖墙体、拖墙端点、拖洞口移动、拖洞口边沿、拖阳台、拖楼梯（移动/缩放/旋转）—— 每项目视吸附辅助线 / grid 行为
2. elevation-front：拖洞口、拖洞口角点、拖阳台、拖阳台边、拖整层
3. 工具切到 wall：grid + endpoint snap 不回退
4. 键盘 Esc → ambientSelect、Delete → 删除（M1 已覆盖，回归即可）
5. middle-button pan、wheel zoom（Ctrl/Meta）/ pan
6. JSON 导入导出 round-trip（M2 测试已覆盖，纯回归）

## 迁移路径

单分支 `xzhih-dev` 推进，分步 commit：

1. 抽 `canvas/dragState.ts`：DragState union + GuideMatch + DragReadout + PlanDragHandlers + ElevationDragHandlers 类型搬过去；主文件 import 回来。验证 build 绿。
2. 抽 `canvas/renderUtils.ts`：PointMapping / eventToViewBoxPoint / bounds 系列 / 几何 helper / ELEVATION_SIDE_BY_VIEW / SURFACE_* 常量。主文件 import。
3. 抽 `canvas/renderPlan.tsx` / `canvas/renderElevation.tsx` / `canvas/renderRoofView.tsx`：搬函数体，import renderUtils。主文件 JSX 调用变成 import。
4. 抽 `canvas/useViewport.ts`：viewport state + wheel + pan handlers。主文件用 hook。
5. 抽 `canvas/useDragHandlers.ts`：14 个 begin*。主文件用 hook。
6. 抽 `canvas/dragMachine.ts`：先把 applyDrag 整体复制过来作为占位（保留 setX 调用、catch）；再把 setX 改成 outcome 字段；最后让组件接收 outcome、自己 setX。一步一 commit，每步跑 `bun run test` 与手测。
7. selectionOnClick 抽出，pointerUp 改用。
8. 测试：写 dragMachine.test.ts。
9. 收尾：lint + build + test 全绿；手动 walkthrough；commit。

## Done criteria

1. `bun run lint` + `bun run test` + `bun run build` 全绿
2. `wc -l src/components/DrawingSurface2D.tsx` ≤ 400；`canvas/*.tsx` 单文件 ≤ 600
3. `dragMachine.test.ts` 覆盖 13 transition + selectionOnClick
4. 验收 walkthrough 6 项手动通过
5. 加新构件场景未来再发生时，DrawingSurface2D.tsx 改动 ≤ 1 处（dragState 加 variant），其余分别落到 dragMachine.ts / useDragHandlers.ts / renderPlan.tsx 三个独立文件

## 风险与回滚

- **applyDrag 行为漂移**：纯函数提取过程中可能漏掉一处 `setActiveSnap(null)` 或 catch。缓解：迁移路径第 6 步分两阶段——先复制原样、保留 setX 调用占位跑过手测；再改 outcome 字段一次。每步独立 commit。最大风险点是 13 个 transition 中某条 patch 表达式抄错；测试覆盖 happy + null + snap + guide 四象限。
- **PointerCapture 漏 release**：当前每个 begin* 都做 setPointerCapture，pointerUp/Cancel 释放。搬到 hook 时 capture 的 element（svgRef）必须保持是同一个；hook 通过 args 拿 svgRef。
- **回滚**：纯组件层重构、无 domain / persistence 改动，git revert 即可，不影响存档兼容性。
