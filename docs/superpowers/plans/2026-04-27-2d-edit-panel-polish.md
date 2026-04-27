# 2D 编辑面板 Polish 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `DrawingSurface2D` 中加入 5 个对齐辅助：网格背景 / 实时坐标 / smart guides / zoom 控件 / 比例尺。

**Architecture:** 5 个新 React 覆盖层组件放在 `src/components/canvas/`；3 个纯函数放在 `src/geometry/`，单元测试覆盖。`DrawingSurface2D` 只做接线（新增 `cursorWorld` / `gridVisible` / `dragReadout` 三个 state，把 mapping/viewport 透传给覆盖层），不重构现有渲染。Smart guides 仅在平面 `wall-endpoint` 和 `stair-resize` 拖动里改写候选位置。

**Tech Stack:** React + TypeScript, SVG, vitest，沿用项目既有约定。

**Spec:** `docs/superpowers/specs/2026-04-27-2d-edit-panel-polish-design.md`

---

## Task 1: 共享类型 + cursorWorld / gridVisible 基础设施

**Files:**
- Create: `src/components/canvas/types.ts`
- Modify: `src/components/DrawingSurface2D.tsx:1140-1192` (新增 state + cursor 跟踪)
- Modify: `src/components/DrawingSurface2D.tsx:1932-1953` (handlePointerMove 加 cursor 跟踪)

- [ ] **Step 1: 新建共享类型文件**

```ts
// src/components/canvas/types.ts
export type Point2D = { x: number; y: number };
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export type Viewport = { zoom: number; panX: number; panY: number };
export type PointMapping = {
  project: (point: Point2D) => Point2D;
  unproject: (point: Point2D) => Point2D;
  scale: number;
};
```

- [ ] **Step 2: 在 DrawingSurface2D 加 state**

在 `src/components/DrawingSurface2D.tsx` 第 1145 行（`activeSnap` state 之后）加：

```ts
const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);
const [gridVisible, setGridVisible] = useState(true);
```

- [ ] **Step 3: 在 handlePointerMove 加 cursor 跟踪分支**

修改 `src/components/DrawingSurface2D.tsx:1932-1953` 的 `handlePointerMove`，在拖拽分支返回前 + pan 分支返回前**都不更新 cursor**，但在两者都不命中时（即非拖拽非 pan 的纯 hover）更新 cursor：

```ts
const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
  if (dragState && event.pointerId === dragState.pointerId) {
    const currentWorld = eventToWorldWith(event, dragState.mapping);
    if (!currentWorld) return;
    setCursorWorld(currentWorld);
    const dx = currentWorld.x - dragState.startWorld.x;
    const dy = currentWorld.y - dragState.startWorld.y;
    if (!dragState.moved && Math.hypot(dx, dy) < DRAG_MOVE_THRESHOLD_WORLD) return;
    if (!dragState.moved) {
      setDragState({ ...dragState, moved: true });
    }
    applyDrag(dragState, currentWorld);
    return;
  }

  if (isPanning && event.pointerId === panPointerId.current && svgRef.current) {
    // ... 现有 pan 逻辑保留 ...
    const rect = svgRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const dx = ((event.clientX - panLastPos.current.x) * SURFACE_WIDTH) / (rect.width * viewport.zoom);
    const dy = ((event.clientY - panLastPos.current.y) * SURFACE_HEIGHT) / (rect.height * viewport.zoom);
    panLastPos.current = { x: event.clientX, y: event.clientY };
    setViewport((current) => ({ ...current, panX: current.panX - dx, panY: current.panY - dy }));
    return;
  }

  // hover: 更新 cursorWorld（plan 或 elevation 视图）
  const activeMapping = planMapping ?? elevationMapping;
  if (!activeMapping) {
    setCursorWorld(null);
    return;
  }
  const world = eventToWorldWith(event, activeMapping);
  setCursorWorld(world ?? null);
};
```

- [ ] **Step 4: 加 onPointerLeave 清空 cursor**

`src/components/DrawingSurface2D.tsx:2014-2026` 的 `<svg>` 标签上加 `onPointerLeave`：

```tsx
<svg
  ref={svgRef}
  viewBox={`${viewport.panX} ${viewport.panY} ${SURFACE_WIDTH / viewport.zoom} ${SURFACE_HEIGHT / viewport.zoom}`}
  role="group"
  aria-label="当前 2D 结构视图"
  tabIndex={-1}
  style={{ cursor: isPanning ? "grabbing" : undefined }}
  onKeyDown={handleKeyDown}
  onPointerDown={handlePointerDown}
  onPointerMove={handlePointerMove}
  onPointerUp={handlePointerUp}
  onPointerCancel={handlePointerUp}
  onPointerLeave={() => setCursorWorld(null)}
>
```

- [ ] **Step 5: 跑测试 + 类型检查**

```bash
npm test -- --run
npx tsc --noEmit
```

Expected: 216 个测试全部通过；tsc 无错误。

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/types.ts src/components/DrawingSurface2D.tsx
git commit -m "feat(2d): 加 cursorWorld/gridVisible state + canvas/types 共享类型"
```

---

## Task 2: gridLines 纯函数（TDD）

**Files:**
- Create: `src/__tests__/gridLines.test.ts`
- Create: `src/geometry/gridLines.ts`

- [ ] **Step 1: 写测试（先失败）**

```ts
// src/__tests__/gridLines.test.ts
import { describe, expect, it } from "vitest";
import { buildGridLines } from "../geometry/gridLines";

describe("buildGridLines", () => {
  it("空 bounds 返回空数组", () => {
    const lines = buildGridLines(
      { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      0.1, 1.0, true,
    );
    // 仍包含通过 0 的轴线
    expect(lines.filter(l => l.axis === "x" && l.major)).toHaveLength(1);
    expect(lines.filter(l => l.axis === "y" && l.major)).toHaveLength(1);
  });

  it("0~2 范围 x 轴：21 条次线（含主线占位） + 主线分级", () => {
    const lines = buildGridLines(
      { minX: 0, minY: 0, maxX: 2, maxY: 1 },
      0.1, 1.0, true,
    );
    const xMinor = lines.filter(l => l.axis === "x" && !l.major);
    const xMajor = lines.filter(l => l.axis === "x" && l.major);
    // 主线: 0, 1, 2 → 3 条；次线: 0.1~0.9, 1.1~1.9 → 18 条
    expect(xMajor).toHaveLength(3);
    expect(xMinor).toHaveLength(18);
  });

  it("showMinor=false 时只返回主线", () => {
    const lines = buildGridLines(
      { minX: 0, minY: 0, maxX: 2, maxY: 1 },
      0.1, 1.0, false,
    );
    expect(lines.every(l => l.major)).toBe(true);
    expect(lines.filter(l => l.axis === "x")).toHaveLength(3);
    expect(lines.filter(l => l.axis === "y")).toHaveLength(2);
  });

  it("负值范围正确处理", () => {
    const lines = buildGridLines(
      { minX: -1, minY: -1, maxX: 1, maxY: 1 },
      0.1, 1.0, true,
    );
    const xMajor = lines.filter(l => l.axis === "x" && l.major).map(l => l.pos).sort((a,b)=>a-b);
    expect(xMajor).toEqual([-1, 0, 1]);
  });

  it("非整 bounds 取 floor/ceil", () => {
    const lines = buildGridLines(
      { minX: 0.05, minY: 0, maxX: 0.95, maxY: 0.5 },
      0.1, 1.0, true,
    );
    // x 主线：从 floor(0.05/1)*1=0 到 ceil(0.95/1)*1=1 → [0, 1]
    const xMajor = lines.filter(l => l.axis === "x" && l.major).map(l => l.pos).sort((a,b)=>a-b);
    expect(xMajor).toEqual([0, 1]);
    // x 次线：0.0 也是主线被排除；0.1, 0.2, ..., 0.9 → 9 条；1.0 也是主线被排除
    const xMinor = lines.filter(l => l.axis === "x" && !l.major);
    expect(xMinor).toHaveLength(9);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- --run gridLines
```

Expected: FAIL（找不到 `buildGridLines`）。

- [ ] **Step 3: 实现 gridLines.ts**

```ts
// src/geometry/gridLines.ts
import type { Bounds } from "../components/canvas/types";

export type GridLine = { axis: "x" | "y"; pos: number; major: boolean };

const EPS = 1e-6;

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function isOnMajorGrid(pos: number, majorSpacing: number): boolean {
  const ratio = pos / majorSpacing;
  return Math.abs(ratio - Math.round(ratio)) < EPS;
}

export function buildGridLines(
  visibleBounds: Bounds,
  minorSpacing: number,
  majorSpacing: number,
  showMinor: boolean,
): GridLine[] {
  const lines: GridLine[] = [];

  const addAxis = (axis: "x" | "y", min: number, max: number) => {
    const startMajor = Math.floor(min / majorSpacing) * majorSpacing;
    const endMajor = Math.ceil(max / majorSpacing) * majorSpacing;

    if (showMinor) {
      const startMinor = Math.floor(min / minorSpacing) * minorSpacing;
      const endMinor = Math.ceil(max / minorSpacing) * minorSpacing;
      for (let p = startMinor; p <= endMinor + EPS; p += minorSpacing) {
        const snapped = snap(p, minorSpacing);
        if (!isOnMajorGrid(snapped, majorSpacing)) {
          lines.push({ axis, pos: snapped, major: false });
        }
      }
    }
    for (let p = startMajor; p <= endMajor + EPS; p += majorSpacing) {
      lines.push({ axis, pos: snap(p, majorSpacing), major: true });
    }
  };

  addAxis("x", visibleBounds.minX, visibleBounds.maxX);
  addAxis("y", visibleBounds.minY, visibleBounds.maxY);
  return lines;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npm test -- --run gridLines
```

Expected: PASS（5 个用例）。

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/gridLines.test.ts src/geometry/gridLines.ts
git commit -m "feat(geometry): gridLines 纯函数 + 单测"
```

---

## Task 3: GridOverlay 组件 + 接到 DrawingSurface2D

**Files:**
- Create: `src/components/canvas/GridOverlay.tsx`
- Modify: `src/components/DrawingSurface2D.tsx:2027-2055` (在 SVG 内 `<rect>` 后插入 GridOverlay)
- Modify: `src/styles.css:678` (加 grid 相关样式)

- [ ] **Step 1: 写 GridOverlay 组件**

```tsx
// src/components/canvas/GridOverlay.tsx
import { Fragment } from "react";
import type { PointMapping, Viewport } from "./types";
import { buildGridLines } from "../../geometry/gridLines";

const SURFACE_WIDTH = 720;
const SURFACE_HEIGHT = 520;
const MINOR_SPACING = 0.1;
const MAJOR_SPACING = 1.0;
const MIN_MINOR_PX = 6;
const ORIGIN_LEN_M = 0.2;

type Props = {
  mapping: PointMapping;
  viewport: Viewport;
  visible: boolean;
};

export function GridOverlay({ mapping, viewport, visible }: Props) {
  if (!visible) return null;

  const vbMinX = viewport.panX;
  const vbMinY = viewport.panY;
  const vbMaxX = viewport.panX + SURFACE_WIDTH / viewport.zoom;
  const vbMaxY = viewport.panY + SURFACE_HEIGHT / viewport.zoom;

  const worldA = mapping.unproject({ x: vbMinX, y: vbMinY });
  const worldB = mapping.unproject({ x: vbMaxX, y: vbMaxY });
  const visibleBounds = {
    minX: Math.min(worldA.x, worldB.x),
    maxX: Math.max(worldA.x, worldB.x),
    minY: Math.min(worldA.y, worldB.y),
    maxY: Math.max(worldA.y, worldB.y),
  };

  const minorSpacingPx = MINOR_SPACING * mapping.scale * viewport.zoom;
  const showMinor = minorSpacingPx >= MIN_MINOR_PX;
  const lines = buildGridLines(visibleBounds, MINOR_SPACING, MAJOR_SPACING, showMinor);

  const stroke = 1 / viewport.zoom;
  const strokeOrigin = 1.5 / viewport.zoom;
  const originLenVb = ORIGIN_LEN_M * mapping.scale;
  const origin = mapping.project({ x: 0, y: 0 });

  return (
    <g className="grid-overlay" pointerEvents="none">
      {lines.map((line, i) => {
        const className = line.major ? "grid-line-major" : "grid-line-minor";
        if (line.axis === "x") {
          const px = mapping.project({ x: line.pos, y: 0 }).x;
          return (
            <line
              key={i}
              className={className}
              x1={px}
              x2={px}
              y1={vbMinY}
              y2={vbMaxY}
              strokeWidth={stroke}
            />
          );
        }
        const py = mapping.project({ x: 0, y: line.pos }).y;
        return (
          <line
            key={i}
            className={className}
            x1={vbMinX}
            x2={vbMaxX}
            y1={py}
            y2={py}
            strokeWidth={stroke}
          />
        );
      })}
      <Fragment>
        <line
          className="grid-origin"
          x1={origin.x - originLenVb / 2}
          x2={origin.x + originLenVb / 2}
          y1={origin.y}
          y2={origin.y}
          strokeWidth={strokeOrigin}
        />
        <line
          className="grid-origin"
          x1={origin.x}
          x2={origin.x}
          y1={origin.y - originLenVb / 2}
          y2={origin.y + originLenVb / 2}
          strokeWidth={strokeOrigin}
        />
      </Fragment>
    </g>
  );
}
```

- [ ] **Step 2: 接到 DrawingSurface2D**

`src/components/DrawingSurface2D.tsx`：
1. 顶部加 import：
```ts
import { GridOverlay } from "./canvas/GridOverlay";
```

2. 在 `<rect className="surface-grid" ... />` 之后（约第 2034 行）、`{storeyId && planProjection ? renderPlan(...)` 之前插入：

```tsx
{(() => {
  const activeMapping = planMapping ?? elevationMapping;
  if (!activeMapping) return null;
  return <GridOverlay mapping={activeMapping} viewport={viewport} visible={gridVisible} />;
})()}
```

- [ ] **Step 3: 加 CSS**

在 `src/styles.css:678` 的 `.surface-grid { fill: var(--canvas-bg); }` 之后追加：

```css
.grid-overlay .grid-line-minor {
  stroke: #ececec;
  fill: none;
  vector-effect: non-scaling-stroke;
}

.grid-overlay .grid-line-major {
  stroke: #d0d0d0;
  fill: none;
  vector-effect: non-scaling-stroke;
}

.grid-overlay .grid-origin {
  stroke: #a0a0a0;
  fill: none;
  vector-effect: non-scaling-stroke;
}
```

注意：因为我们已用 `strokeWidth={1/zoom}` 主动控制宽度，`vector-effect: non-scaling-stroke` 是双保险（也作用于 origin），可保留。

- [ ] **Step 4: 跑测试 + 启 dev server 视觉验证**

```bash
npm test -- --run
```

Expected: 仍 216 + 5 = 221 通过。

```bash
npm run dev
```

打开浏览器，进入平面视图：
- 应看到淡灰 10cm 网格 + 中灰 1m 主线 + 原点十字
- 缩放到很小：次线消失，主线仍在
- 切到立面：仍有网格
- 切到屋顶：无网格（因 mapping 都是 undefined）

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/GridOverlay.tsx src/components/DrawingSurface2D.tsx src/styles.css
git commit -m "feat(2d): A 网格背景（10cm 次线 + 1m 主线 + 原点十字）"
```

---

## Task 4: scaleRulerBucket 纯函数（TDD）

**Files:**
- Create: `src/__tests__/scaleRulerBucket.test.ts`
- Create: `src/geometry/scaleRulerBucket.ts`

- [ ] **Step 1: 写测试**

```ts
// src/__tests__/scaleRulerBucket.test.ts
import { describe, expect, it } from "vitest";
import { pickRulerLength } from "../geometry/scaleRulerBucket";

describe("pickRulerLength", () => {
  it("100 px/m → 1 m（100px 在 [60,150] 范围内最大）", () => {
    expect(pickRulerLength(100)).toBe(1);
  });

  it("10 px/m → 10 m（100px）", () => {
    expect(pickRulerLength(10)).toBe(10);
  });

  it("1000 px/m → 0.1 m（100px）", () => {
    expect(pickRulerLength(1000)).toBe(0.1);
  });

  it("50 px/m → 2 m（100px，因为 1m=50px 不在 [60,150] 但 2m=100px 在范围内）", () => {
    expect(pickRulerLength(50)).toBe(2);
  });

  it("75 px/m → 1m（75px 在范围）vs 2m（150px 在范围）→ 取 2m（最大）", () => {
    expect(pickRulerLength(75)).toBe(2);
  });

  it("极端小 px/m=0.5 → 没有候选落在范围，取最接近 105px 的（10m=5px 仍最大但远）", () => {
    // 10m * 0.5 = 5px, 距 105 = 100；最接近也是 10m
    expect(pickRulerLength(0.5)).toBe(10);
  });

  it("极端大 px/m=10000 → 0.1m=1000px 最接近", () => {
    expect(pickRulerLength(10000)).toBe(0.1);
  });

  it("非法输入返回 1m fallback", () => {
    expect(pickRulerLength(0)).toBe(1);
    expect(pickRulerLength(-5)).toBe(1);
    expect(pickRulerLength(NaN)).toBe(1);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- --run scaleRulerBucket
```

Expected: FAIL（找不到 `pickRulerLength`）。

- [ ] **Step 3: 实现**

```ts
// src/geometry/scaleRulerBucket.ts
const NICE_LENGTHS = [0.1, 0.2, 0.5, 1, 2, 5, 10] as const;
const TARGET_PX_MIN = 60;
const TARGET_PX_MAX = 150;

export function pickRulerLength(pixelsPerMeter: number): number {
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) return 1;

  const midPx = (TARGET_PX_MIN + TARGET_PX_MAX) / 2;
  let bestInRange: number | null = null;
  let bestOverall: number = NICE_LENGTHS[0];
  let bestDist = Infinity;

  for (const len of NICE_LENGTHS) {
    const px = len * pixelsPerMeter;
    if (px >= TARGET_PX_MIN && px <= TARGET_PX_MAX) {
      if (bestInRange === null || len > bestInRange) bestInRange = len;
    }
    const dist = Math.abs(px - midPx);
    if (dist < bestDist) {
      bestDist = dist;
      bestOverall = len;
    }
  }
  return bestInRange ?? bestOverall;
}

export const RULER_TARGET_PX_MIN = TARGET_PX_MIN;
export const RULER_TARGET_PX_MAX = TARGET_PX_MAX;
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npm test -- --run scaleRulerBucket
```

Expected: PASS（8 个用例）。

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/scaleRulerBucket.test.ts src/geometry/scaleRulerBucket.ts
git commit -m "feat(geometry): scaleRulerBucket 自适应长度选择 + 单测"
```

---

## Task 5: ScaleRuler 组件 + 接到 DrawingSurface2D

**Files:**
- Create: `src/components/canvas/ScaleRuler.tsx`
- Modify: `src/components/DrawingSurface2D.tsx:2055-2066` (在 zoom-reset 之外加 ScaleRuler)
- Modify: `src/styles.css` (加 scale-ruler 样式)

- [ ] **Step 1: 写 ScaleRuler 组件**

```tsx
// src/components/canvas/ScaleRuler.tsx
import type { PointMapping, Viewport } from "./types";
import { pickRulerLength } from "../../geometry/scaleRulerBucket";

const SURFACE_WIDTH = 720;

type Props = {
  mapping: PointMapping;
  viewport: Viewport;
};

function formatLength(meters: number): string {
  if (meters < 1) return `${meters * 100} cm`;
  return `${meters} m`;
}

export function ScaleRuler({ mapping, viewport }: Props) {
  // 屏幕 px / 米 = mapping.scale * viewport.zoom * (svgClientWidth / SURFACE_WIDTH)
  // 简化用 mapping.scale * viewport.zoom（同 spec 里说明）
  const pixelsPerMeter = mapping.scale * viewport.zoom;
  const lengthM = pickRulerLength(pixelsPerMeter);
  const widthPx = lengthM * pixelsPerMeter;

  return (
    <div className="scale-ruler" aria-label={`比例尺 ${formatLength(lengthM)}`}>
      <svg width={widthPx + 2} height={12} className="scale-ruler-bar" aria-hidden>
        <line x1={1} x2={widthPx + 1} y1={6} y2={6} />
        <line x1={1} x2={1} y1={2} y2={10} />
        <line x1={widthPx + 1} x2={widthPx + 1} y1={2} y2={10} />
      </svg>
      <span className="scale-ruler-label">{formatLength(lengthM)}</span>
    </div>
  );
}
```

- [ ] **Step 2: 接到 DrawingSurface2D**

`src/components/DrawingSurface2D.tsx`：
1. 加 import：
```ts
import { ScaleRuler } from "./canvas/ScaleRuler";
```

2. 在 `</svg>` 之后、`{isViewportTransformed ? (` 之前插入：

```tsx
{(() => {
  const activeMapping = planMapping ?? elevationMapping;
  if (!activeMapping) return null;
  return <ScaleRuler mapping={activeMapping} viewport={viewport} />;
})()}
```

- [ ] **Step 3: 加 CSS**

在 `src/styles.css` 的 `.zoom-reset:hover { ... }` 之后追加：

```css
.scale-ruler {
  position: absolute;
  bottom: 16px;
  right: 96px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 2px;
  pointer-events: none;
  font-size: 12px;
  color: #555;
  font-family: var(--font-mono, monospace);
}

.scale-ruler-bar line {
  stroke: #555;
  stroke-width: 1.5;
}

.scale-ruler-label {
  white-space: nowrap;
}
```

- [ ] **Step 4: 跑测试 + 视觉验证**

```bash
npm test -- --run
```

Expected: 全绿。

```bash
npm run dev
```

- 平面视图右下角应见 `|――| 1 m` 类似比例尺
- 放大缩小时长度自动切到 0.5/2/5 等

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/ScaleRuler.tsx src/components/DrawingSurface2D.tsx src/styles.css
git commit -m "feat(2d): F 比例尺（自适应 0.1m–10m）"
```

---

## Task 6: ZoomControls 组件 + 替换 zoom-reset 按钮

**Files:**
- Create: `src/components/canvas/ZoomControls.tsx`
- Modify: `src/components/DrawingSurface2D.tsx:2056-2066` (替换 zoom-reset)
- Modify: `src/styles.css:957-983` (替换 zoom-reset 样式为 zoom-controls)

- [ ] **Step 1: 写 ZoomControls 组件**

```tsx
// src/components/canvas/ZoomControls.tsx
import type { Viewport } from "./types";

const SURFACE_WIDTH = 720;
const SURFACE_HEIGHT = 520;
const ZOOM_STEP = 1.5;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 8;

type Props = {
  viewport: Viewport;
  onViewportChange: (next: Viewport) => void;
  defaultViewport: Viewport;
  gridVisible: boolean;
  onGridToggle: () => void;
};

function zoomAtCenter(viewport: Viewport, factor: number): Viewport {
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, viewport.zoom * factor));
  if (newZoom === viewport.zoom) return viewport;
  // 以 viewBox 中心为不动点
  const oldVbW = SURFACE_WIDTH / viewport.zoom;
  const oldVbH = SURFACE_HEIGHT / viewport.zoom;
  const centerX = viewport.panX + oldVbW / 2;
  const centerY = viewport.panY + oldVbH / 2;
  const newVbW = SURFACE_WIDTH / newZoom;
  const newVbH = SURFACE_HEIGHT / newZoom;
  return {
    zoom: newZoom,
    panX: centerX - newVbW / 2,
    panY: centerY - newVbH / 2,
  };
}

export function ZoomControls({
  viewport,
  onViewportChange,
  defaultViewport,
  gridVisible,
  onGridToggle,
}: Props) {
  return (
    <div className="zoom-controls" role="group" aria-label="视图控制">
      <button
        type="button"
        className="zoom-controls-btn"
        title="放大"
        aria-label="放大"
        onClick={() => onViewportChange(zoomAtCenter(viewport, ZOOM_STEP))}
      >
        +
      </button>
      <button
        type="button"
        className="zoom-controls-btn"
        title="缩小"
        aria-label="缩小"
        onClick={() => onViewportChange(zoomAtCenter(viewport, 1 / ZOOM_STEP))}
      >
        −
      </button>
      <button
        type="button"
        className="zoom-controls-btn"
        title={`重置视图 (${Math.round(viewport.zoom * 100)}%)`}
        aria-label="重置视图"
        onClick={() => onViewportChange(defaultViewport)}
      >
        ⌂
      </button>
      <button
        type="button"
        className={`zoom-controls-btn ${gridVisible ? "is-active" : ""}`}
        title={gridVisible ? "隐藏网格" : "显示网格"}
        aria-label="切换网格"
        aria-pressed={gridVisible}
        onClick={onGridToggle}
      >
        ⊞
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 接到 DrawingSurface2D，替换原 zoom-reset 按钮**

`src/components/DrawingSurface2D.tsx`：
1. 加 import：
```ts
import { ZoomControls } from "./canvas/ZoomControls";
```

2. 把 `src/components/DrawingSurface2D.tsx:2056-2066` 的整段 `{isViewportTransformed ? (...) : null}` 替换为：

```tsx
<ZoomControls
  viewport={viewport}
  onViewportChange={setViewport}
  defaultViewport={DEFAULT_VIEWPORT}
  gridVisible={gridVisible}
  onGridToggle={() => setGridVisible(v => !v)}
/>
```

3. 把 `resetViewport` 和 `isViewportTransformed` 两个未用的局部变量删掉（约 2008-2010 行）。

- [ ] **Step 3: 替换 CSS**

`src/styles.css` 的 `.zoom-reset { ... }` 和 `.zoom-reset:hover { ... }` 整段（957-983 行）替换为：

```css
.zoom-controls {
  position: absolute;
  top: 16px;
  right: 16px;
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--panel-border);
  border-radius: 4px;
}

.zoom-controls-btn {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #444;
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-family: inherit;
}

.zoom-controls-btn:hover {
  background: var(--panel-strong);
}

.zoom-controls-btn.is-active {
  background: var(--panel-strong);
  color: #222;
}
```

- [ ] **Step 4: 跑测试 + 视觉验证**

```bash
npm test -- --run
npx tsc --noEmit
```

Expected: 全绿；tsc 无错（resetViewport/isViewportTransformed 未用变量已删）。

```bash
npm run dev
```

- 右上角 4 个按钮：+ / − / ⌂ / ⊞
- 点 + −：以 viewBox 中心缩放
- 点 ⌂：回到默认视图
- 点 ⊞：网格显隐切换；按钮高亮反映状态

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/ZoomControls.tsx src/components/DrawingSurface2D.tsx src/styles.css
git commit -m "feat(2d): D zoom 控件 (+/−/重置/网格 toggle)"
```

---

## Task 7: dragReadout state machine（在 applyDrag 里填值）

**Files:**
- Modify: `src/components/canvas/types.ts` (加 DragReadout 类型)
- Modify: `src/components/DrawingSurface2D.tsx:1145+` (加 state)
- Modify: `src/components/DrawingSurface2D.tsx:applyDrag/handlePointerUp` (填/清)

- [ ] **Step 1: 在 types.ts 加 DragReadout 联合类型**

追加到 `src/components/canvas/types.ts`：

```ts
export type DragReadout =
  | { kind: "wall-translate"; dx: number; dy: number }
  | { kind: "wall-endpoint"; length: number }
  | { kind: "opening"; offset: number }
  | { kind: "plan-opening-resize"; width: number }
  | { kind: "balcony"; offset: number }
  | { kind: "plan-balcony-resize"; width: number }
  | { kind: "elev-opening-move"; offset: number; sill: number }
  | { kind: "elev-opening-resize"; width: number; height: number }
  | { kind: "elev-balcony-move"; offset: number }
  | { kind: "elev-balcony-resize"; width: number }
  | { kind: "stair-resize"; width: number; depth: number }
  | { kind: "stair-rotate"; angleDeg: number }
  | { kind: "elev-storey-translate"; dy: number };
```

- [ ] **Step 2: 在 DrawingSurface2D 加 state**

在 Task 1 加的 `gridVisible` state 之后追加：

```ts
const [dragReadout, setDragReadout] = useState<DragReadout | null>(null);
```

并加 import：
```ts
import type { DragReadout } from "./canvas/types";
```

- [ ] **Step 3: 在 applyDrag 各 case 里填 dragReadout**

打开 `src/components/DrawingSurface2D.tsx` 的 `applyDrag` 函数（约 1640 行起）。每个 case 在调用 `onProjectChange(...)` 之前/之后**追加** `setDragReadout({...})`。具体改法（行号是当前文件状态，按搜索定位）：

**`case "wall-translate"`（约 1646–1677）**：在 `onProjectChange(moveWall(...))` 之后加：
```ts
setDragReadout({ kind: "wall-translate", dx: roundToMm(finalDx), dy: roundToMm(finalDy) });
```

**`case "wall-endpoint"`（约 1678–1693）**：在 `onProjectChange(...)` 之后加：
```ts
const endpointLen = Math.hypot(newPt.x - state.fixedPoint.x, newPt.y - state.fixedPoint.y);
setDragReadout({ kind: "wall-endpoint", length: roundToMm(endpointLen) });
```
（注意 Task 10 会重写这个 case，届时把 readout 逻辑直接保留进新代码即可。）

**`case "opening"` / `case "balcony"`（合并 case，约 1694–1713）**：替换 `if/else` 块为：
```ts
if (state.kind === "opening") {
  onProjectChange(updateOpening(project, state.openingId, { offset: snapped }));
  setDragReadout({ kind: "opening", offset: snapped });
} else {
  onProjectChange(updateBalcony(project, state.balconyId, { offset: snapped }));
  setDragReadout({ kind: "balcony", offset: snapped });
}
```

**`case "plan-opening-resize"` / `case "plan-balcony-resize"`（合并 case，约 1714–1761）**：替换末尾 `if/else` 块为：
```ts
if (state.kind === "plan-opening-resize") {
  onProjectChange(updateOpening(project, state.openingId, {
    offset: snappedOffset,
    width: snappedWidth,
  }));
  setDragReadout({ kind: "plan-opening-resize", width: snappedWidth });
} else {
  onProjectChange(updateBalcony(project, state.balconyId, {
    offset: snappedOffset,
    width: snappedWidth,
  }));
  setDragReadout({ kind: "plan-balcony-resize", width: snappedWidth });
}
```

**`case "elev-opening-move"`（约 1762–1774）**：把 inline 的 `roundToMm(snapToGrid(...))` 提取到变量：
```ts
case "elev-opening-move": {
  const dxOffset = dx * state.projSign;
  const newOffsetRaw = clamp(state.origOffset + dxOffset, 0, Math.max(0, state.wallLen - state.width));
  const maxSill = Math.max(0, state.storeyHeight - state.height);
  const newSillRaw = clamp(state.origSill + dy, 0, maxSill);
  const offset = roundToMm(snapToGrid(newOffsetRaw));
  const sill = roundToMm(snapToGrid(newSillRaw));
  onProjectChange(updateOpening(project, state.openingId, { offset, sillHeight: sill }));
  setDragReadout({ kind: "elev-opening-move", offset, sill });
  break;
}
```

**`case "elev-opening-resize"`（约 1775–1824）**：在 `onProjectChange(...)` 之前提取尺寸到变量：
```ts
const offset = roundToMm(snapToGrid(newOffset));
const sill = roundToMm(snapToGrid(newSill));
const width = roundToMm(snapToGrid(newWidth));
const height = roundToMm(snapToGrid(newHeight));
onProjectChange(updateOpening(project, state.openingId, { offset, sillHeight: sill, width, height }));
setDragReadout({ kind: "elev-opening-resize", width, height });
```

**`case "elev-balcony-move"`（约 1825–1834）**：
```ts
const offset = roundToMm(snapToGrid(newOffset));
onProjectChange(updateBalcony(project, state.balconyId, { offset }));
setDragReadout({ kind: "elev-balcony-move", offset });
```

**`case "elev-balcony-resize"`（约 1835–1862）**：
```ts
const offset = roundToMm(snapToGrid(newOffset));
const width = roundToMm(snapToGrid(newWidth));
onProjectChange(updateBalcony(project, state.balconyId, { offset, width }));
setDragReadout({ kind: "elev-balcony-resize", width });
```

**`case "stair-resize"`（约 1863–1906）**：在 `onProjectChange(...)` 之后追加：
```ts
setDragReadout({ kind: "stair-resize", width: w, depth: d });
```
（同样会被 Task 10 重写一次，届时保留这一行。）

**`case "stair-rotate"`（约 1907–1917）**：在 `onProjectChange(...)` 之后追加：
```ts
setDragReadout({ kind: "stair-rotate", angleDeg: (newRotation * 180) / Math.PI });
```

**`case "elev-storey-translate"`（约 1918–1925）**：在 `onProjectChange(...)` 之后追加（`grid` 已是 dx 方向沿 elevation 轴的 snap 值，作为"位移量"显示足够）：
```ts
setDragReadout({ kind: "elev-storey-translate", dy: roundToMm(grid) });
```

- [ ] **Step 4: 在 handlePointerUp 清空 dragReadout**

在 `src/components/DrawingSurface2D.tsx:1959` 的 `setDragState(undefined);` 后面追加：

```ts
setDragReadout(null);
```

- [ ] **Step 5: 跑类型 + 测试**

```bash
npx tsc --noEmit
npm test -- --run
```

Expected: 全绿。`dragReadout` 当前还没人读，仅写入。

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/types.ts src/components/DrawingSurface2D.tsx
git commit -m "feat(2d): dragReadout state — 在 applyDrag 各 case 写入"
```

---

## Task 8: StatusReadout 组件 + 接到 DrawingSurface2D

**Files:**
- Create: `src/components/canvas/StatusReadout.tsx`
- Modify: `src/components/DrawingSurface2D.tsx` (接入)
- Modify: `src/styles.css` (加样式)

- [ ] **Step 1: 写 StatusReadout 组件**

```tsx
// src/components/canvas/StatusReadout.tsx
import type { DragReadout, Point2D } from "./types";

type Props = {
  cursorWorld: Point2D | null;
  dragReadout: DragReadout | null;
};

function fmt(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function formatDragReadout(d: DragReadout): string {
  switch (d.kind) {
    case "wall-translate":
      return `Δ: (${fmt(d.dx)}, ${fmt(d.dy)}) m`;
    case "wall-endpoint":
      return `L: ${fmt(d.length)} m`;
    case "opening":
    case "balcony":
    case "elev-balcony-move":
      return `offset: ${fmt(d.offset)} m`;
    case "plan-opening-resize":
    case "plan-balcony-resize":
    case "elev-balcony-resize":
      return `width: ${fmt(d.width)} m`;
    case "elev-opening-move":
      return `offset: ${fmt(d.offset)} m   sill: ${fmt(d.sill)} m`;
    case "elev-opening-resize":
      return `W×H: ${fmt(d.width)} × ${fmt(d.height)} m`;
    case "stair-resize":
      return `W×D: ${fmt(d.width)} × ${fmt(d.depth)} m`;
    case "stair-rotate":
      return `α: ${fmt(d.angleDeg, 1)}°`;
    case "elev-storey-translate":
      return `Δy: ${fmt(d.dy)} m`;
  }
}

export function StatusReadout({ cursorWorld, dragReadout }: Props) {
  if (!cursorWorld && !dragReadout) return null;
  return (
    <div className="status-readout" aria-live="polite">
      {cursorWorld ? (
        <div className="status-readout-line">
          X: {fmt(cursorWorld.x)} m   Y: {fmt(cursorWorld.y)} m
        </div>
      ) : null}
      {dragReadout ? (
        <div className="status-readout-line">{formatDragReadout(dragReadout)}</div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: 接到 DrawingSurface2D**

加 import：
```ts
import { StatusReadout } from "./canvas/StatusReadout";
```

在 `<ZoomControls .../>` 之后插入：
```tsx
<StatusReadout cursorWorld={cursorWorld} dragReadout={dragReadout} />
```

- [ ] **Step 3: 加 CSS**

在 `src/styles.css` 的 `.scale-ruler-label { ... }` 之后追加：

```css
.status-readout {
  position: absolute;
  bottom: 16px;
  left: 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 2px;
  pointer-events: none;
  font-size: 12px;
  color: #333;
  font-family: var(--font-mono, monospace);
}

.status-readout-line {
  white-space: nowrap;
}
```

- [ ] **Step 4: 跑测试 + 视觉验证**

```bash
npm test -- --run
```

Expected: 全绿。

```bash
npm run dev
```

- 鼠标在画布内移动时，左下角实时 X/Y 数值
- 鼠标移出画布：浮层消失（cursorWorld 为 null）
- 拖动墙端点：第二行出现 `L: x.xx m`
- 拖动楼梯角点：第二行出现 `W×D: ... × ... m`
- 拖动楼梯旋转手柄：第二行出现 `α: xx.x°`
- 拖动开洞 / 阳台：分别显示 offset / width

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/StatusReadout.tsx src/components/DrawingSurface2D.tsx src/styles.css
git commit -m "feat(2d): B 状态读数（左下角坐标 + 拖动实时数值）"
```

---

## Task 9: smartGuides 纯函数（TDD）

**Files:**
- Create: `src/__tests__/smartGuides.test.ts`
- Create: `src/geometry/smartGuides.ts`

- [ ] **Step 1: 写测试**

```ts
// src/__tests__/smartGuides.test.ts
import { describe, expect, it } from "vitest";
import { findAxisAlignedGuides, type Anchor } from "../geometry/smartGuides";

const TOL = 0.2;

describe("findAxisAlignedGuides", () => {
  it("空锚点返回空数组", () => {
    expect(findAxisAlignedGuides({ x: 1, y: 1 }, [], TOL)).toEqual([]);
  });

  it("单 X 轴命中", () => {
    const anchors: Anchor[] = [{ x: 2, y: 5, sourceId: "a" }];
    const result = findAxisAlignedGuides({ x: 2.05, y: 0 }, anchors, TOL);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ axis: "x", pos: 2 });
    expect(result[0].anchor.sourceId).toBe("a");
  });

  it("单 Y 轴命中", () => {
    const anchors: Anchor[] = [{ x: 99, y: 3, sourceId: "b" }];
    const result = findAxisAlignedGuides({ x: 0, y: 3.1 }, anchors, TOL);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ axis: "y", pos: 3 });
  });

  it("X+Y 同时命中两条 guide", () => {
    const anchors: Anchor[] = [
      { x: 2, y: 5, sourceId: "a" },
      { x: 99, y: 3, sourceId: "b" },
    ];
    const result = findAxisAlignedGuides({ x: 2.05, y: 3.1 }, anchors, TOL);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.axis).sort()).toEqual(["x", "y"]);
  });

  it("同轴多个候选 → 取最近的", () => {
    const anchors: Anchor[] = [
      { x: 2.0, y: 0, sourceId: "far" },
      { x: 2.18, y: 0, sourceId: "close" },
    ];
    const result = findAxisAlignedGuides({ x: 2.15, y: 100 }, anchors, TOL);
    expect(result).toHaveLength(1);
    expect(result[0].anchor.sourceId).toBe("close");
  });

  it("阈值边界：0.19 命中、0.21 不命中", () => {
    const anchors: Anchor[] = [{ x: 0, y: 0, sourceId: "z" }];
    expect(findAxisAlignedGuides({ x: 0.19, y: 100 }, anchors, TOL)).toHaveLength(1);
    expect(findAxisAlignedGuides({ x: 0.21, y: 100 }, anchors, TOL)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
npm test -- --run smartGuides
```

Expected: FAIL（找不到 `findAxisAlignedGuides`）。

- [ ] **Step 3: 实现**

```ts
// src/geometry/smartGuides.ts
import type { PlanProjection, PlanWallSegment } from "../projection/types";
import type { Point2D } from "../components/canvas/types";

export type Anchor = { x: number; y: number; sourceId: string };
export type GuideMatch = { axis: "x" | "y"; pos: number; anchor: Anchor };

export function findAxisAlignedGuides(
  cursor: Point2D,
  anchors: Anchor[],
  tolerance: number,
): GuideMatch[] {
  let bestX: { delta: number; anchor: Anchor } | null = null;
  let bestY: { delta: number; anchor: Anchor } | null = null;
  for (const a of anchors) {
    const dx = Math.abs(cursor.x - a.x);
    if (dx < tolerance && (bestX === null || dx < bestX.delta)) {
      bestX = { delta: dx, anchor: a };
    }
    const dy = Math.abs(cursor.y - a.y);
    if (dy < tolerance && (bestY === null || dy < bestY.delta)) {
      bestY = { delta: dy, anchor: a };
    }
  }
  const out: GuideMatch[] = [];
  if (bestX) out.push({ axis: "x", pos: bestX.anchor.x, anchor: bestX.anchor });
  if (bestY) out.push({ axis: "y", pos: bestY.anchor.y, anchor: bestY.anchor });
  return out;
}

/** 收集平面视图中可用作对齐的关键点（排除 sourceId 命中的元素自身）。 */
export function collectPlanAnchors(
  projection: PlanProjection,
  excludes: Set<string>,
): Anchor[] {
  const anchors: Anchor[] = [];
  const segByWallId = new Map<string, PlanWallSegment>();
  for (const wall of projection.wallSegments) {
    segByWallId.set(wall.wallId, wall);
    if (excludes.has(`wall:${wall.wallId}`)) continue;
    anchors.push({ x: wall.start.x, y: wall.start.y, sourceId: `wall-start:${wall.wallId}` });
    anchors.push({ x: wall.end.x, y: wall.end.y, sourceId: `wall-end:${wall.wallId}` });
  }
  for (const op of projection.openings) {
    if (excludes.has(`opening:${op.openingId}`)) continue;
    const seg = segByWallId.get(op.wallId);
    if (!seg) continue;
    const dx = seg.end.x - seg.start.x;
    const dy = seg.end.y - seg.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const t = (op.offset + op.width / 2) / len;
    anchors.push({
      x: seg.start.x + dx * t,
      y: seg.start.y + dy * t,
      sourceId: `opening:${op.openingId}`,
    });
  }
  for (const bal of projection.balconies) {
    if (excludes.has(`balcony:${bal.balconyId}`)) continue;
    const seg = segByWallId.get(bal.wallId);
    if (!seg) continue;
    const dx = seg.end.x - seg.start.x;
    const dy = seg.end.y - seg.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len;
    const uy = dy / len;
    // 沿墙线的两个内角（offset 起、offset+width 止）
    anchors.push({
      x: seg.start.x + ux * bal.offset,
      y: seg.start.y + uy * bal.offset,
      sourceId: `balcony-start:${bal.balconyId}`,
    });
    anchors.push({
      x: seg.start.x + ux * (bal.offset + bal.width),
      y: seg.start.y + uy * (bal.offset + bal.width),
      sourceId: `balcony-end:${bal.balconyId}`,
    });
  }
  for (const s of projection.stairs) {
    if (excludes.has(`stair:${s.storeyId}`)) continue;
    const cos = Math.cos(s.rotation);
    const sin = Math.sin(s.rotation);
    const w = s.rect.width;
    const d = s.rect.depth;
    const corners: Array<[number, number]> = [
      [-w / 2, -d / 2],
      [ w / 2, -d / 2],
      [ w / 2,  d / 2],
      [-w / 2,  d / 2],
    ];
    for (let i = 0; i < corners.length; i++) {
      const [lx, ly] = corners[i];
      anchors.push({
        x: s.center.x + lx * cos - ly * sin,
        y: s.center.y + lx * sin + ly * cos,
        sourceId: `stair-corner-${i}:${s.storeyId}`,
      });
    }
  }
  return anchors;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
npm test -- --run smartGuides
```

Expected: PASS（6 个用例）。

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/smartGuides.test.ts src/geometry/smartGuides.ts
git commit -m "feat(geometry): smart guides 锚点匹配 + collect 函数 + 单测"
```

---

## Task 10: SmartGuides 组件 + 接入并应用 snap

**Files:**
- Create: `src/components/canvas/SmartGuides.tsx`
- Modify: `src/components/DrawingSurface2D.tsx` (在 wall-endpoint / stair-resize case 中应用 guide snap；渲染 SmartGuides 组件)
- Modify: `src/styles.css` (加 .smart-guide-line 样式)

实现要点：smart guide 既要 (a) 在拖动时**修改候选位置**让元素吸附到 guide，又要 (b) **可视化**当前生效的 guide 线。两者由同一个 state `guideMatches` 维护：在 wall-endpoint / stair-resize 的 applyDrag case 里调用 `findAxisAlignedGuides`，把命中存到 state，应用 snap，渲染时由 SmartGuides 读取。

- [ ] **Step 1: 在 DrawingSurface2D 加 guideMatches state**

追加：
```ts
import { collectPlanAnchors, findAxisAlignedGuides, type GuideMatch } from "../geometry/smartGuides";

const [guideMatches, setGuideMatches] = useState<GuideMatch[]>([]);
```

`PLAN_ENDPOINT_THRESHOLD = 0.2` 已存在（第 29 行），复用作 guide tolerance。

- [ ] **Step 2: 在 wall-endpoint case 应用 guide snap**

现有 `case "wall-endpoint"` 在 `src/components/DrawingSurface2D.tsx:1678-1693`：

```ts
case "wall-endpoint": {
  const others = otherWallSegments(state.wallId);
  const candidate = { x: state.origPoint.x + dx, y: state.origPoint.y + dy };
  const endpointSnap = snapToEndpoint(candidate, others, PLAN_ENDPOINT_THRESHOLD);
  setActiveSnap(endpointSnap ?? null);
  const newPt = roundPointToMm(
    snapPlanPoint(candidate, others, {
      gridSize: PLAN_GRID_SIZE,
      endpointThreshold: PLAN_ENDPOINT_THRESHOLD,
    }),
  );
  const newStart = state.endpoint === "start" ? newPt : roundPointToMm(state.fixedPoint);
  const newEnd = state.endpoint === "end" ? newPt : roundPointToMm(state.fixedPoint);
  onProjectChange(moveWall(project, state.wallId, newStart, newEnd));
  break;
}
```

整段替换为：

```ts
case "wall-endpoint": {
  const others = otherWallSegments(state.wallId);
  const candidate = { x: state.origPoint.x + dx, y: state.origPoint.y + dy };
  const endpointSnap = snapToEndpoint(candidate, others, PLAN_ENDPOINT_THRESHOLD);
  setActiveSnap(endpointSnap ?? null);

  let resolved: Point2D;
  if (endpointSnap) {
    resolved = endpointSnap;
    setGuideMatches([]);
  } else if (planProjection) {
    const anchors = collectPlanAnchors(
      planProjection,
      new Set([`wall:${state.wallId}`]),
    );
    const matches = findAxisAlignedGuides(candidate, anchors, PLAN_ENDPOINT_THRESHOLD);
    setGuideMatches(matches);
    if (matches.length > 0) {
      let x = candidate.x;
      let y = candidate.y;
      for (const m of matches) {
        if (m.axis === "x") x = m.pos;
        if (m.axis === "y") y = m.pos;
      }
      resolved = { x, y };
    } else {
      resolved = snapPlanPoint(candidate, others, {
        gridSize: PLAN_GRID_SIZE,
        endpointThreshold: PLAN_ENDPOINT_THRESHOLD,
      });
    }
  } else {
    setGuideMatches([]);
    resolved = snapPlanPoint(candidate, others, {
      gridSize: PLAN_GRID_SIZE,
      endpointThreshold: PLAN_ENDPOINT_THRESHOLD,
    });
  }

  const newPt = roundPointToMm(resolved);
  const newStart = state.endpoint === "start" ? newPt : roundPointToMm(state.fixedPoint);
  const newEnd = state.endpoint === "end" ? newPt : roundPointToMm(state.fixedPoint);
  onProjectChange(moveWall(project, state.wallId, newStart, newEnd));

  const len = Math.hypot(newPt.x - state.fixedPoint.x, newPt.y - state.fixedPoint.y);
  setDragReadout({ kind: "wall-endpoint", length: roundToMm(len) });
  break;
}
```

注意：`setDragReadout` 这一行已在 Task 7 加过，本次替换需保留。如 Task 7 实施时把它放在了 `break` 之前但通过另一段代码计算 `len`，请改为上面一致的形式。

- [ ] **Step 3: 在 stair-resize case 应用 guide snap**

现有 `case "stair-resize"` 在 `src/components/DrawingSurface2D.tsx:1863-1906`：

```ts
case "stair-resize": {
  const minSize = 0.6;
  const mouseWorld = currentWorld;
  const newCenter: Point2D = {
    x: (state.worldAnchor.x + mouseWorld.x) / 2,
    y: (state.worldAnchor.y + mouseWorld.y) / 2,
  };
  // ... 其余几何 ...
}
```

整段替换为（仅前面加 4 行 + 把 `mouseWorld = currentWorld` 改为 `mouseWorld = adjusted`）：

```ts
case "stair-resize": {
  const minSize = 0.6;
  let adjusted: Point2D = currentWorld;
  if (planProjection) {
    const anchors = collectPlanAnchors(
      planProjection,
      new Set([`stair:${state.storeyId}`]),
    );
    const matches = findAxisAlignedGuides(currentWorld, anchors, PLAN_ENDPOINT_THRESHOLD);
    setGuideMatches(matches);
    if (matches.length > 0) {
      let x = currentWorld.x;
      let y = currentWorld.y;
      for (const m of matches) {
        if (m.axis === "x") x = m.pos;
        if (m.axis === "y") y = m.pos;
      }
      adjusted = { x, y };
    }
  } else {
    setGuideMatches([]);
  }
  const mouseWorld = adjusted;

  const newCenter: Point2D = {
    x: (state.worldAnchor.x + mouseWorld.x) / 2,
    y: (state.worldAnchor.y + mouseWorld.y) / 2,
  };
  const diagWorld: Point2D = {
    x: mouseWorld.x - state.worldAnchor.x,
    y: mouseWorld.y - state.worldAnchor.y,
  };
  const cosA = Math.cos(-state.origRotation);
  const sinA = Math.sin(-state.origRotation);
  const diagLocal: Point2D = {
    x: diagWorld.x * cosA - diagWorld.y * sinA,
    y: diagWorld.x * sinA + diagWorld.y * cosA,
  };
  let newWidth: number;
  let newDepth: number;
  switch (state.corner) {
    case "tr":
      newWidth = Math.max(minSize, diagLocal.x);
      newDepth = Math.max(minSize, diagLocal.y);
      break;
    case "tl":
      newWidth = Math.max(minSize, -diagLocal.x);
      newDepth = Math.max(minSize, diagLocal.y);
      break;
    case "bl":
      newWidth = Math.max(minSize, -diagLocal.x);
      newDepth = Math.max(minSize, -diagLocal.y);
      break;
    case "br":
      newWidth = Math.max(minSize, diagLocal.x);
      newDepth = Math.max(minSize, -diagLocal.y);
      break;
  }
  const newX = roundToMm(newCenter.x - newWidth / 2);
  const newY = roundToMm(newCenter.y - newDepth / 2);
  const w = roundToMm(newWidth);
  const d = roundToMm(newDepth);
  onProjectChange(updateStair(project, state.storeyId, { x: newX, y: newY, width: w, depth: d }));
  setDragReadout({ kind: "stair-resize", width: w, depth: d });
  break;
}
```

`setDragReadout` 这一行已在 Task 7 加过，请保留。这里使用 `currentWorld` 而非 `adjusted` 计算 anchor 匹配是 OK 的——锚点匹配只在乎候选位置，吸附后才进入几何计算。

- [ ] **Step 4: 其他 case 清空 guideMatches**

在 applyDrag 函数顶部（switch 之外）加一个分支判断：当前 kind 不是 wall-endpoint/stair-resize 时清空 guides。简单做法：在每个 **不应用 guide 的** case 末尾加 `setGuideMatches([]);` —— 或更简洁，在 switch 进入前先清空，应用 guide 的 case 再覆盖。

简洁版：

```ts
const applyDrag = (state: DragState, currentWorld: Point2D) => {
  // 默认清空，仅 wall-endpoint / stair-resize 会重新填
  if (state.kind !== "wall-endpoint" && state.kind !== "stair-resize") {
    setGuideMatches([]);
  }
  try {
    switch (state.kind) { ... }
  } ...
};
```

- [ ] **Step 5: 在 handlePointerUp 清空 guideMatches**

在 `setDragReadout(null);` 之后追加：
```ts
setGuideMatches([]);
```

- [ ] **Step 6: 写 SmartGuides 组件**

```tsx
// src/components/canvas/SmartGuides.tsx
import type { PointMapping, Viewport } from "./types";
import type { GuideMatch } from "../../geometry/smartGuides";

const EXTEND_M = 0.5;

type Props = {
  matches: GuideMatch[];
  cursorWorld: { x: number; y: number } | null;
  mapping: PointMapping;
  viewport: Viewport;
};

export function SmartGuides({ matches, cursorWorld, mapping, viewport }: Props) {
  if (matches.length === 0 || !cursorWorld) return null;
  const stroke = 1 / viewport.zoom;
  return (
    <g className="smart-guides" pointerEvents="none">
      {matches.map((m, i) => {
        if (m.axis === "x") {
          const minY = Math.min(cursorWorld.y, m.anchor.y) - EXTEND_M;
          const maxY = Math.max(cursorWorld.y, m.anchor.y) + EXTEND_M;
          const px = mapping.project({ x: m.pos, y: 0 }).x;
          const a = mapping.project({ x: m.pos, y: minY });
          const b = mapping.project({ x: m.pos, y: maxY });
          return (
            <line
              key={i}
              className="smart-guide-line"
              x1={px}
              x2={px}
              y1={a.y}
              y2={b.y}
              strokeWidth={stroke}
            />
          );
        }
        const minX = Math.min(cursorWorld.x, m.anchor.x) - EXTEND_M;
        const maxX = Math.max(cursorWorld.x, m.anchor.x) + EXTEND_M;
        const a = mapping.project({ x: minX, y: m.pos });
        const b = mapping.project({ x: maxX, y: m.pos });
        return (
          <line
            key={i}
            className="smart-guide-line"
            x1={a.x}
            x2={b.x}
            y1={a.y}
            y2={a.y}
            strokeWidth={stroke}
          />
        );
      })}
    </g>
  );
}
```

- [ ] **Step 7: 接到 DrawingSurface2D**

加 import：
```ts
import { SmartGuides } from "./canvas/SmartGuides";
```

在 `renderPlan(...)` 之后、`</svg>` 之前插入（仅在平面视图渲染）：

```tsx
{storeyId && planMapping ? (
  <SmartGuides
    matches={guideMatches}
    cursorWorld={cursorWorld}
    mapping={planMapping}
    viewport={viewport}
  />
) : null}
```

- [ ] **Step 8: 加 CSS**

在 `src/styles.css` 适当位置（`.snap-indicator` 附近）加：

```css
.smart-guide-line {
  stroke: #ff8a3d;
  stroke-dasharray: 4 3;
  fill: none;
  vector-effect: non-scaling-stroke;
}
```

- [ ] **Step 9: 跑测试 + 视觉验证**

```bash
npm test -- --run
npx tsc --noEmit
```

Expected: 全绿。

```bash
npm run dev
```

平面视图测试：
- 拖动一面墙的端点，靠近另一面墙的端点 → 端点 snap 命中（既有行为，无 guide 出现）
- 拖动墙端点到另一墙端点的同 X 或同 Y 附近（但不重合）→ 出现一条橙色虚线，端点吸附
- 拖动楼梯角点到任意墙端点的同 X/Y → guide 出现，角点吸附
- 拖动开洞 / 阳台 / 楼梯旋转手柄：不出现 guide（由 guideMatches 始终空）

立面视图：guide 不出现（planMapping 为 undefined → SmartGuides 不渲染）。

- [ ] **Step 10: Commit**

```bash
git add src/components/canvas/SmartGuides.tsx src/components/DrawingSurface2D.tsx src/styles.css
git commit -m "feat(2d): C smart guides — wall-endpoint / stair-resize 拖动时轴对齐吸附"
```

---

## Task 11: 端到端视觉回归 + 更新 spec 完成清单

**Files:**
- Modify: `docs/superpowers/specs/2026-04-27-2d-edit-panel-polish-design.md` (在末尾追加完成记录)

- [ ] **Step 1: 跑全部测试**

```bash
npm test -- --run
npx tsc --noEmit
```

Expected: 216 + 5(grid) + 8(ruler) + 6(guides) = 235 通过；tsc 0 错误。

- [ ] **Step 2: 启 dev server 跑完整 checklist**

```bash
npm run dev
```

按 spec 的"视觉验证"清单 + 上面各任务的视觉验证步骤回归。重点：
- 平面：A 网格 / B 状态读数 / C smart guides / D zoom 控件 / F 比例尺 全在
- 立面：A + B + D + F 在；C 不出现
- 屋顶：所有覆盖层都不显示
- 切换项目 / 视图：所有 state（cursorWorld、guideMatches、dragReadout）正常重置
- undo / redo 不影响覆盖层
- 多元素同时显示时网格不卡顿（zoom 到最低观察）

- [ ] **Step 3: 在 spec 末尾追加完成记录**

在 `docs/superpowers/specs/2026-04-27-2d-edit-panel-polish-design.md` 末尾追加：

```markdown
---

## 完成记录

实施时间：2026-04-27
分支：`feat/2d-edit-panel-polish`

实施情况：A / B / C / D / F 五个特性按 spec 完成。共新增 5 个组件、3 个纯函数、19 个单元测试。`DrawingSurface2D` 主体未重构。

发现 / 偏差：（如无可填"无"）
```

填一段简短的"发现 / 偏差"：实施中遇到的与 spec 不符之处或关键决策（若无可写"无"）。

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-27-2d-edit-panel-polish-design.md
git commit -m "docs(spec): 2D 编辑面板 polish 完成记录"
```

---

## 完成判定

- ✅ 全部测试通过（≥ 235）
- ✅ tsc 0 错误
- ✅ 平面 / 立面所有覆盖层视觉验证通过
- ✅ 5 个 commit（每个 Task 独立 commit）+ 1 个完成记录 commit + 1 个 spec commit = 共 12 个 commit
- ✅ DrawingSurface2D 行数增量 < 100（仅 state + props 透传）

不在范围（确认下一轮再做）：
- 键盘方向键 nudge
- 框选 / 多选
- 立面 smart guides
- 网格可见性跨会话持久化
