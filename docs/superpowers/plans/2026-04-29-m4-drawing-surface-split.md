# M4 DrawingSurface2D 拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `src/components/DrawingSurface2D.tsx`（2390 LOC）按 spec 的"drag machine 纯化 + 自然边界落到独立文件"策略，切成 8 个 `canvas/*` 子模块 + 1 个壳 + 1 个新测试文件，主入口 ≤ 400 LOC，dragMachine 100% transition 单测覆盖。

**Architecture:** 重构以**代码搬移**为主、**逻辑改造**仅在 dragMachine 一处。先把类型 / 工具 / render 三个无逻辑变化的层搬出去（commit 1-3），再把 hook（useViewport / useDragHandlers）抽出（commit 4-5），最后 dragMachine 走"先复制原样保留 setX 占位、再把 setX 改成 outcome 字段"两阶段（commit 6-7），新增 dragMachine 单测（commit 8），收尾（commit 9）。每步独立 commit，每步 `bun run test` + `bun run lint` + `bun run build` 全绿。

**Tech Stack:** TypeScript / React 19 / Vite / Vitest / bun

---

## Pre-flight

- [ ] **Verify clean working tree on `xzhih-dev` branch**

Run: `git status && git branch --show-current`
Expected: `On branch xzhih-dev` + `nothing to commit, working tree clean`

- [ ] **Baseline test run**

Run: `bun run test && bun run lint && bun run build`
Expected: all green. If anything fails, stop—fix baseline first.

- [ ] **Baseline LOC**

Run: `wc -l src/components/DrawingSurface2D.tsx`
Expected: 2390. Record this number—target is ≤ 400 at end.

---

## Task 1: 抽 dragState.ts（DragState union + handler 类型）

**Files:**
- Create: `src/components/canvas/dragState.ts`
- Modify: `src/components/DrawingSurface2D.tsx:53-274` (delete after extraction)
- Modify: `src/components/DrawingSurface2D.tsx:24-29` (add new import)

**Why first:** types-only 移动；没有逻辑变化、没有循环依赖风险，验证基础可行。

- [ ] **Step 1: 创建 `canvas/dragState.ts`**

把 `DrawingSurface2D.tsx:53-224` 的 `DragState` union 与 `226-274` 的 `PlanDragHandlers` / `ElevationDragHandlers` 类型搬过去。同时把已有的 `GuideMatch` 类型从 `geometry/smartGuides` re-export，方便下游 import 一处。

```ts
// src/components/canvas/dragState.ts
import type { PointerEvent } from "react";
import type { ElevationSide } from "../../projection/types";
import type { GuideMatch } from "../../geometry/smartGuides";
import type { Point2D, PointMapping } from "./types";

export type { GuideMatch };

export type DragState =
  | {
      kind: "wall-translate";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      wallId: string;
      origStart: Point2D;
      origEnd: Point2D;
    }
  | {
      kind: "wall-endpoint";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      wallId: string;
      endpoint: "start" | "end";
      origPoint: Point2D;
      fixedPoint: Point2D;
    }
  | {
      kind: "opening";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      openingWidth: number;
    }
  | {
      kind: "plan-opening-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      edge: "l" | "r";
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      origWidth: number;
      wallLen: number;
    }
  | {
      kind: "balcony";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      balconyWidth: number;
    }
  | {
      kind: "plan-balcony-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      edge: "l" | "r";
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      origWidth: number;
      wallLen: number;
    }
  | {
      kind: "elev-opening-move";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      origOffset: number;
      origSill: number;
      width: number;
      height: number;
      wallLen: number;
      storeyHeight: number;
      projSign: 1 | -1;
    }
  | {
      kind: "elev-opening-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      corner: "tl" | "tr" | "bl" | "br";
      origOffset: number;
      origSill: number;
      origWidth: number;
      origHeight: number;
      wallLen: number;
      storeyHeight: number;
      projSign: 1 | -1;
    }
  | {
      kind: "elev-balcony-move";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      origOffset: number;
      width: number;
      wallLen: number;
      projSign: 1 | -1;
    }
  | {
      kind: "elev-balcony-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      edge: "l" | "r";
      origOffset: number;
      origWidth: number;
      wallLen: number;
      projSign: 1 | -1;
    }
  | {
      kind: "stair-translate";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      storeyId: string;
      origX: number;
      origY: number;
    }
  | {
      kind: "stair-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      storeyId: string;
      corner: "bl" | "br" | "tr" | "tl";
      worldAnchor: Point2D;
      origRotation: number;
    }
  | {
      kind: "stair-rotate";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      storeyId: string;
      center: Point2D;
      initialMouseAngle: number;
      origRotation: number;
    }
  | {
      kind: "elev-storey-translate";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      storeyId: string;
      side: ElevationSide;
      origProject: import("../../domain/types").HouseProject;
    };

export type PlanDragHandlers = {
  onWallPointerDown: (event: PointerEvent<SVGElement>, wallId: string) => void;
  onOpeningPointerDown: (event: PointerEvent<SVGElement>, openingId: string) => void;
  onBalconyPointerDown: (event: PointerEvent<SVGElement>, balconyId: string) => void;
  onWallEndpointPointerDown: (
    event: PointerEvent<SVGElement>,
    wallId: string,
    endpoint: "start" | "end",
  ) => void;
  onOpeningEdgePointerDown: (
    event: PointerEvent<SVGElement>,
    openingId: string,
    edge: "l" | "r",
  ) => void;
  onBalconyEdgePointerDown: (
    event: PointerEvent<SVGElement>,
    balconyId: string,
    edge: "l" | "r",
  ) => void;
  onStairBodyPointerDown: (
    event: PointerEvent<SVGElement>,
    storeyId: string,
  ) => void;
  onStairCornerPointerDown: (
    event: PointerEvent<SVGElement>,
    storeyId: string,
    corner: "bl" | "br" | "tr" | "tl",
  ) => void;
  onStairRotatePointerDown: (
    event: PointerEvent<SVGElement>,
    storeyId: string,
  ) => void;
};

export type ElevationDragHandlers = {
  onStoreyPointerDown: (event: PointerEvent<SVGElement>, storeyId: string) => void;
  onOpeningPointerDown: (event: PointerEvent<SVGElement>, openingId: string) => void;
  onOpeningCornerPointerDown: (
    event: PointerEvent<SVGElement>,
    openingId: string,
    corner: "tl" | "tr" | "bl" | "br",
  ) => void;
  onBalconyPointerDown: (event: PointerEvent<SVGElement>, balconyId: string) => void;
  onBalconyEdgePointerDown: (
    event: PointerEvent<SVGElement>,
    balconyId: string,
    edge: "l" | "r",
  ) => void;
};
```

- [ ] **Step 2: 主文件删除原 type 定义并 import**

在 `DrawingSurface2D.tsx` 删除 `DragState` 定义（53-224）与 `PlanDragHandlers` / `ElevationDragHandlers`（226-274）。在 import 区追加：

```ts
import type {
  DragState,
  ElevationDragHandlers,
  PlanDragHandlers,
} from "./canvas/dragState";
```

注意：原文件 line 10 已 import `GuideMatch` from `../geometry/smartGuides`，**保留**——还有别处用到（applyDrag 闭包里用 `GuideMatch[]` 类型）。

- [ ] **Step 3: 验证**

Run: `bun run lint && bun run test && bun run build`
Expected: all green. 没有任何行为变化。

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/dragState.ts src/components/DrawingSurface2D.tsx
git commit -m "$(cat <<'EOF'
refactor(canvas): 抽 DragState union 与 *DragHandlers 类型到 dragState.ts

types-only 搬迁，零行为变化。M4 第一步。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 抽 renderUtils.ts（PointMapping / 几何 helper / 常量）

**Files:**
- Create: `src/components/canvas/renderUtils.ts`
- Modify: `src/components/DrawingSurface2D.tsx:31-45,276-484,495-615` (delete after extraction)

- [ ] **Step 1: 创建 `canvas/renderUtils.ts`**

搬以下内容（保留 export，逐项标注源行号）：

- 常量：`SURFACE_WIDTH=720` / `SURFACE_HEIGHT=520` / `SURFACE_PADDING=48` (`DrawingSurface2D.tsx:31-33`)
- 常量：`ELEVATION_SIDE_BY_VIEW` (`DrawingSurface2D.tsx:40-45`)
- 函数 `createPointMapping` (`DrawingSurface2D.tsx:276-299`)
- 函数 `eventToViewBoxPoint` (`DrawingSurface2D.tsx:301-318`)
- 函数 `computeSolidPanels` (`DrawingSurface2D.tsx:320-338`)
- 函数 `planBounds` (`DrawingSurface2D.tsx:340-360`)
- 函数 `unionBounds` (`DrawingSurface2D.tsx:362-369`)
- 函数 `elevationAxisToWorld` (`DrawingSurface2D.tsx:371-382`)
- 函数 `elevationBounds` (`DrawingSurface2D.tsx:384-422`)
- 函数 `openingLine` (`DrawingSurface2D.tsx:424-447`)
- 函数 `balconyPolygon` (`DrawingSurface2D.tsx:449-480`)
- 函数 `polyPoints` (`DrawingSurface2D.tsx:482-484`)
- 类型 `StairSymbolGeometry` (`DrawingSurface2D.tsx:486-493`)
- 函数 `buildStairSymbolGeometry` (`DrawingSurface2D.tsx:495-615`)

新文件头：

```ts
// src/components/canvas/renderUtils.ts
import { rotatePoint } from "../../domain/stairs";
import type { Point2, ViewId } from "../../domain/types";
import type {
  ElevationProjection,
  ElevationSide,
  PlanBalconyGlyph,
  PlanOpeningGlyph,
  PlanProjection,
  PlanStairSymbol,
  PlanWallSegment,
} from "../../projection/types";
import type { Bounds, Point2D, PointMapping } from "./types";

export const SURFACE_WIDTH = 720;
export const SURFACE_HEIGHT = 520;
export const SURFACE_PADDING = 48;

export const ELEVATION_SIDE_BY_VIEW: Partial<Record<ViewId, ElevationSide>> = {
  "elevation-front": "front",
  "elevation-back": "back",
  "elevation-left": "left",
  "elevation-right": "right",
};

// (search-paste 上面列出的 11 个函数 + StairSymbolGeometry 类型 — 全部 export)
```

`balconyPolygon` 在 `planBounds` 里被调用，所以两者顺序保持一致。注意函数都改成 `export function` 而非 `function`。

- [ ] **Step 2: 主文件删除并 import**

在 `DrawingSurface2D.tsx`：

1. 删除常量（31-33, 40-45）—— 但 `PLAN_GRID_SIZE` / `PLAN_ENDPOINT_THRESHOLD` / `DRAG_MOVE_THRESHOLD_WORLD` / `ENDPOINT_HANDLE_RADIUS`（35-38）**保留**（后续 task 处理）
2. 删除函数 276-484 + 486-615（含 `renderSelectableBalcony` 之前的全部 utility）
3. 加 import：

```ts
import {
  ELEVATION_SIDE_BY_VIEW,
  SURFACE_HEIGHT,
  SURFACE_PADDING,
  SURFACE_WIDTH,
  balconyPolygon,
  buildStairSymbolGeometry,
  computeSolidPanels,
  createPointMapping,
  elevationAxisToWorld,
  elevationBounds,
  eventToViewBoxPoint,
  openingLine,
  planBounds,
  polyPoints,
  unionBounds,
} from "./canvas/renderUtils";
```

`StairSymbolGeometry` 类型也需要 import（用在主文件 renderPlan 仍然在 main 里阶段）。

- [ ] **Step 3: 验证**

Run: `bun run lint && bun run test && bun run build`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/renderUtils.ts src/components/DrawingSurface2D.tsx
git commit -m "$(cat <<'EOF'
refactor(canvas): 抽 PointMapping / 几何 helper 到 renderUtils.ts

包含 createPointMapping / eventToViewBoxPoint / planBounds /
elevationBounds / balconyPolygon / buildStairSymbolGeometry 等
12 个纯函数与 SURFACE_*、ELEVATION_SIDE_BY_VIEW 常量。零行为变化。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 抽 renderPlan.tsx / renderElevation.tsx / renderRoofView.tsx

**Files:**
- Create: `src/components/canvas/renderPlan.tsx`
- Create: `src/components/canvas/renderElevation.tsx`
- Create: `src/components/canvas/renderRoofView.tsx`
- Modify: `src/components/DrawingSurface2D.tsx:617-1324` (delete after extraction)

- [ ] **Step 1: 创建 `canvas/renderPlan.tsx`**

把 `DrawingSurface2D.tsx:617-648` 的 `renderSelectableBalcony` + `650-1049` 的 `renderPlan` 整体搬过去。新文件头：

```tsx
// src/components/canvas/renderPlan.tsx
import type { KeyboardEvent, PointerEvent } from "react";
import type { ObjectSelection } from "../../domain/selection";
import { isSelected } from "../../domain/selection";
import { rotatePoint } from "../../domain/stairs";
import type { ToolId } from "../../domain/types";
import { slicePanelFootprint, type WallFootprint } from "../../geometry/wallNetwork";
import type { PlanProjection } from "../../projection/types";
import type { PlanDragHandlers } from "./dragState";
import {
  balconyPolygon,
  buildStairSymbolGeometry,
  computeSolidPanels,
  createPointMapping,
  openingLine,
  planBounds,
  polyPoints,
  unionBounds,
} from "./renderUtils";
import type { Point2D } from "./types";

const ENDPOINT_HANDLE_RADIUS = 7;

type OnSelect = (selection: ObjectSelection | undefined) => void;

function renderSelectableBalcony(
  balconyId: string,
  selected: boolean,
  onSelect: OnSelect,
  activeTool: ToolId,
  props: { className: string; points?: string; x?: number; y?: number; width?: number; height?: number },
  onPointerDown?: (event: PointerEvent<SVGElement>) => void,
) {
  // ... DrawingSurface2D.tsx:625-647 原封不动（OnSelect 替代 DrawingSurface2DProps["onSelect"]）
}

export function renderPlan(
  projection: PlanProjection,
  selection: ObjectSelection | undefined,
  onSelect: OnSelect,
  activeTool: ToolId,
  footprints: Map<string, WallFootprint>,
  snapHit: Point2D | null,
  handlers?: PlanDragHandlers,
  ghost?: PlanProjection,
) {
  // ... DrawingSurface2D.tsx:660-1048 原封不动
}
```

注意：原 `renderSelectableBalcony` 的参数类型 `DrawingSurface2DProps["onSelect"]` 需要替换为新定义的 `OnSelect`。`renderPlan` 同理（line 653）。`activeTool` 在 `renderSelectableBalcony` 中目前未使用——保留参数原样不动，未来可能需要。

- [ ] **Step 2: 创建 `canvas/renderElevation.tsx`**

把 `DrawingSurface2D.tsx:1051-1214` 搬过去。需 import 跟 renderSelectableBalcony 共用——把 helper **不** export，而是在 renderElevation.tsx 重新定义一份（YAGNI；activeTool 参数仍保留）。或者从 renderPlan.tsx export。**选 export**（避免重复代码）：在 renderPlan.tsx 把 `renderSelectableBalcony` 改成 `export`，renderElevation.tsx import。

```tsx
// src/components/canvas/renderElevation.tsx
import type { KeyboardEvent, PointerEvent } from "react";
import type { ObjectSelection } from "../../domain/selection";
import { isSelected } from "../../domain/selection";
import type { ToolId } from "../../domain/types";
import type {
  ElevationBalconyRect,
  ElevationProjection,
} from "../../projection/types";
import type { ElevationDragHandlers } from "./dragState";
import { renderSelectableBalcony } from "./renderPlan";
import { createPointMapping, elevationBounds } from "./renderUtils";

const ENDPOINT_HANDLE_RADIUS = 7;

export function renderElevation(
  projection: ElevationProjection,
  selection: ObjectSelection | undefined,
  onSelect: (selection: ObjectSelection | undefined) => void,
  activeTool: ToolId,
  handlers?: ElevationDragHandlers,
) {
  // ... DrawingSurface2D.tsx:1058-1213 原封不动
}
```

- [ ] **Step 3: 创建 `canvas/renderRoofView.tsx`**

把 `DrawingSurface2D.tsx:1216-1324` 搬过去。

```tsx
// src/components/canvas/renderRoofView.tsx
import type { ObjectSelection } from "../../domain/selection";
import { addRoof } from "../../domain/mutations";
import type { HouseProject } from "../../domain/types";
import { canBuildRoof } from "../../domain/views";
import { SURFACE_HEIGHT, SURFACE_PADDING, SURFACE_WIDTH } from "./renderUtils";

export function renderRoofView(
  project: HouseProject,
  onSelect: (sel: ObjectSelection | undefined) => void,
  onProjectChange: (project: HouseProject) => void,
) {
  // ... DrawingSurface2D.tsx:1221-1323 原封不动
}
```

- [ ] **Step 4: 主文件删除并 import**

`DrawingSurface2D.tsx`：

1. 删除 `renderSelectableBalcony` (617-648)、`renderPlan` (650-1049)、`renderElevation` (1051-1214)、`renderRoofView` (1216-1324)
2. 加 import：

```ts
import { renderPlan } from "./canvas/renderPlan";
import { renderElevation } from "./canvas/renderElevation";
import { renderRoofView } from "./canvas/renderRoofView";
```

3. 删除 line 38 的 `ENDPOINT_HANDLE_RADIUS=7`（已挪进 renderPlan.tsx 与 renderElevation.tsx 各一份）
4. 删除现已未使用的 import：`isSelected`、`canBuildRoof`、`addRoof`、`slicePanelFootprint`、`WallFootprint`、`ElevationBalconyRect`、`PlanBalconyGlyph`、`PlanOpeningGlyph`、`PlanStairSymbol`、`PlanWallSegment`、`rotatePoint`、`StairSymbolGeometry`、`computeSolidPanels`、`balconyPolygon`、`buildStairSymbolGeometry`、`openingLine`、`polyPoints`。lint 会全部标红，逐一删除。
5. 保留 `addRoof` 因为 renderRoofView 移走了，但主文件不再 import addRoof。

- [ ] **Step 5: 验证**

Run: `bun run lint && bun run test && bun run build`
Expected: all green。`wc -l src/components/DrawingSurface2D.tsx` 应 ~1100。

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/renderPlan.tsx src/components/canvas/renderElevation.tsx src/components/canvas/renderRoofView.tsx src/components/DrawingSurface2D.tsx
git commit -m "$(cat <<'EOF'
refactor(canvas): 抽 renderPlan / renderElevation / renderRoofView 到独立文件

3 个 SVG 渲染函数原样搬出，signature 与行为零变化。
renderSelectableBalcony 由 renderPlan.tsx export 给 renderElevation.tsx 共用。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 抽 useViewport.ts

**Files:**
- Create: `src/components/canvas/useViewport.ts`
- Modify: `src/components/DrawingSurface2D.tsx` (替换 viewport state + wheel + 中键 pan 逻辑)

- [ ] **Step 1: 创建 `canvas/useViewport.ts`**

```ts
// src/components/canvas/useViewport.ts
import { useEffect, useRef, useState } from "react";
import type { PointerEvent, RefObject } from "react";
import { SURFACE_HEIGHT, SURFACE_WIDTH } from "./renderUtils";
import type { Viewport } from "./types";

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 8;
export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

export type ViewportPanHandlers = {
  onPointerDown: (event: PointerEvent<SVGSVGElement>) => boolean;
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: PointerEvent<SVGSVGElement>) => void;
};

export function useViewport(
  svgRef: RefObject<SVGSVGElement | null>,
  resetKey: string,
): {
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  isPanning: boolean;
  panHandlers: ViewportPanHandlers;
} {
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const panLastPos = useRef({ x: 0, y: 0 });
  const panPointerId = useRef<number | null>(null);

  useEffect(() => {
    setViewport(DEFAULT_VIEWPORT);
  }, [resetKey]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratioX = (event.clientX - rect.left) / rect.width;
      const ratioY = (event.clientY - rect.top) / rect.height;

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.005);
        setViewport((current) => {
          const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current.zoom * factor));
          const oldVbW = SURFACE_WIDTH / current.zoom;
          const oldVbH = SURFACE_HEIGHT / current.zoom;
          const cursorVbX = current.panX + ratioX * oldVbW;
          const cursorVbY = current.panY + ratioY * oldVbH;
          const newVbW = SURFACE_WIDTH / newZoom;
          const newVbH = SURFACE_HEIGHT / newZoom;
          return {
            zoom: newZoom,
            panX: cursorVbX - ratioX * newVbW,
            panY: cursorVbY - ratioY * newVbH,
          };
        });
        return;
      }

      setViewport((current) => ({
        zoom: current.zoom,
        panX: current.panX + event.deltaX / current.zoom,
        panY: current.panY + event.deltaY / current.zoom,
      }));
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [svgRef]);

  const panHandlers: ViewportPanHandlers = {
    onPointerDown: (event) => {
      // 返回 true 表示已处理（中键 pan 启动）
      if (event.button === 1 && svgRef.current) {
        event.preventDefault();
        event.stopPropagation();
        setIsPanning(true);
        panLastPos.current = { x: event.clientX, y: event.clientY };
        panPointerId.current = event.pointerId;
        svgRef.current.setPointerCapture(event.pointerId);
        return true;
      }
      return false;
    },
    onPointerMove: (event) => {
      if (!isPanning || event.pointerId !== panPointerId.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      setViewport((current) => {
        const dx = ((event.clientX - panLastPos.current.x) * SURFACE_WIDTH) / (rect.width * current.zoom);
        const dy = ((event.clientY - panLastPos.current.y) * SURFACE_HEIGHT) / (rect.height * current.zoom);
        return { ...current, panX: current.panX - dx, panY: current.panY - dy };
      });
      panLastPos.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event) => {
      if (event.pointerId !== panPointerId.current) return;
      setIsPanning(false);
      panPointerId.current = null;
      if (svgRef.current?.hasPointerCapture(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }
    },
  };

  return { viewport, setViewport, isPanning, panHandlers };
}
```

**注意 spec §3 与实际实现的差异**：实际实现把 viewport 读取吞进 hook（用 `setViewport(current => ...)` 函数式更新），不需要 caller 把 viewport 传回。比 spec 写的"onPointerMove 接受 (e, viewport, setViewport)"更干净。

`onPointerDown` 返回 boolean："已处理 / 未处理"，主文件只在未处理时走 hover 逻辑（实际上中键也不会同时触发别的逻辑，但保留这个语义更清晰）。

- [ ] **Step 2: 主文件改用 hook**

`DrawingSurface2D.tsx`：

1. 删除常量：`DEFAULT_VIEWPORT` (1326)、`ZOOM_MIN` (1327)、`ZOOM_MAX` (1328)
2. 删除组件内的：`viewport` / `isPanning` 两个 useState (1339-1340)、`panLastPos` / `panPointerId` 两个 useRef (1341-1342)、`useEffect` 重置 viewport (1350-1352)、`useEffect` wheel listener (1354-1393)
3. 删除 `handlePointerDown` 中的中键 pan 启动逻辑 (1434-1443)、`handlePointerMove` 中的 isPanning 分支 (2239-2247)、`handlePointerUp` 中的 panPointerId 释放 (2295-2300)
4. 在组件顶部加：

```tsx
const { viewport, setViewport, isPanning, panHandlers } = useViewport(
  svgRef,
  `${project.id}|${project.activeView}`,
);
```

5. `handlePointerDown` 简化为：

```tsx
const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
  panHandlers.onPointerDown(event);
};
```

6. `handlePointerMove` 在 dragState 与 hover 之间，把原 `if (isPanning && ...) {...}` 块替换为：

```tsx
panHandlers.onPointerMove(event);
if (isPanning) return;
```

7. `handlePointerUp` 在 dragState 分支后加 `panHandlers.onPointerUp(event);`，删除原 panPointerId 检查与 release。
8. 加 import：

```ts
import { useViewport } from "./canvas/useViewport";
```

删除原 import 列表中无用的 `useEffect` / `Viewport`（如果不再使用 `useEffect` 与 viewport 类型）。注意 `useState` 仍要 import（其他 state 还在），`useRef` 也仍要（svgRef）。

- [ ] **Step 3: 验证**

Run: `bun run lint && bun run test && bun run build`
Expected: all green.

- [ ] **Step 4: 手动验证 viewport 行为不退**

```bash
bun run dev
# 在浏览器：
# - wheel 滚动 → pan
# - Ctrl/Meta + wheel → zoom 围绕鼠标位置
# - 中键拖拽 → pan
# - 切 view (plan-1f → elevation-front) → viewport 重置为 default
# - 切 project (创建新 sample) → viewport 重置
```

如有任何回退，停下检查 panHandlers 的 viewport 闭包是否正确（hook 内 setViewport 用了函数式更新避免 stale closure）。

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/useViewport.ts src/components/DrawingSurface2D.tsx
git commit -m "$(cat <<'EOF'
refactor(canvas): 抽 useViewport hook

把 viewport state、wheel listener、中键 pan handlers 收拢；
切 project / view 时通过 resetKey 触发 useEffect 重置。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 抽 useDragHandlers.ts（14 个 begin* 工厂）

**Files:**
- Create: `src/components/canvas/useDragHandlers.ts`
- Modify: `src/components/DrawingSurface2D.tsx:1461-1851` (extract)

- [ ] **Step 1: 创建 `canvas/useDragHandlers.ts`**

把当前主组件的 `beginDragWith` / `beginElementDrag` 内部辅助 + 14 个 begin* handler 函数（`onWallElementPointerDown` 起到 `onElevationStoreyPointerDown` 止）整体搬到 hook。原 1461-1851 是 9 个 plan handler + 5 个 elevation handler 共 14 个，全部依赖 closure 变量：`project` / `storeyId` / `elevationSide` / `planMapping` / `elevationMapping` / `svgRef` / `setDragState`。

```ts
// src/components/canvas/useDragHandlers.ts
import type { PointerEvent, RefObject } from "react";
import { wallLength } from "../../domain/measurements";
import { rotatePoint } from "../../domain/stairs";
import type { HouseProject } from "../../domain/types";
import { elevationOffsetSign } from "../../projection/elevation";
import type { ElevationSide } from "../../projection/types";
import type {
  DragState,
  ElevationDragHandlers,
  PlanDragHandlers,
} from "./dragState";
import type { Point2D, PointMapping } from "./types";
import { eventToViewBoxPoint } from "./renderUtils";

/** 共享 helper：把 pointer 事件的 client 坐标 unproject 到 world 坐标。
 *  既给 useDragHandlers 内部用，也 export 给主组件 handlePointerMove 用。 */
export function eventToWorldWith(
  svg: SVGSVGElement | null,
  event: { clientX: number; clientY: number },
  mapping: PointMapping,
): Point2D | undefined {
  if (!svg) return undefined;
  const vb = eventToViewBoxPoint(svg, event.clientX, event.clientY);
  return mapping.unproject(vb);
}

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
} {
  const { project, storeyId, elevationSide, planMapping, elevationMapping, svgRef, setDragState } = args;

  const beginDragWith = (
    event: PointerEvent<SVGElement>,
    mapping: PointMapping | undefined,
    factory: (
      pointerId: number,
      startWorld: Point2D,
      mapping: PointMapping,
    ) => DragState | undefined,
  ) => {
    if (project.activeTool !== "select") return;
    if (event.button !== 0) return;
    if (!svgRef.current || !mapping) return;
    const startWorld = eventToWorldWith(svgRef.current, event, mapping);
    if (!startWorld) return;
    const next = factory(event.pointerId, startWorld, mapping);
    if (!next) return;
    event.stopPropagation();
    svgRef.current.setPointerCapture(event.pointerId);
    setDragState(next);
  };

  const beginElementDrag = (
    event: PointerEvent<SVGElement>,
    factory: (
      pointerId: number,
      startWorld: Point2D,
      mapping: PointMapping,
    ) => DragState | undefined,
  ) => beginDragWith(event, planMapping, factory);

  // === plan handlers ===
  // 9 个 begin* —— 主文件 1493-1696 原封不动搬过来，依赖通过 args 闭包。
  const onWallPointerDown: PlanDragHandlers["onWallPointerDown"] = (event, wallId) => {
    if (storeyId === undefined) return;
    const wall = project.walls.find((c) => c.id === wallId);
    if (!wall) return;
    beginElementDrag(event, (pointerId, startWorld, mapping) => ({
      kind: "wall-translate",
      pointerId, startWorld, mapping, moved: false,
      wallId, origStart: wall.start, origEnd: wall.end,
    }));
  };

  // ... onOpeningPointerDown / onBalconyPointerDown / onWallEndpointPointerDown /
  //     onOpeningEdgePointerDown / onBalconyEdgePointerDown /
  //     onStairBodyPointerDown / onStairCornerPointerDown / onStairRotatePointerDown
  //     —— 全部按 DrawingSurface2D.tsx:1509-1696 原封不动复制

  const planHandlers: PlanDragHandlers = {
    onWallPointerDown,
    onOpeningPointerDown,
    onBalconyPointerDown,
    onWallEndpointPointerDown,
    onOpeningEdgePointerDown,
    onBalconyEdgePointerDown,
    onStairBodyPointerDown,
    onStairCornerPointerDown,
    onStairRotatePointerDown,
  };

  // === elevation handlers ===
  // 5 个 —— 主文件 1710-1844 原封不动搬过来
  const onStoreyPointerDown: ElevationDragHandlers["onStoreyPointerDown"] = (event, bandStoreyId) => {
    if (!elevationSide) return;
    if (!project.storeys.some((s) => s.id === bandStoreyId)) return;
    beginDragWith(event, elevationMapping, (pointerId, startWorld, mapping) => ({
      kind: "elev-storey-translate",
      pointerId, startWorld, mapping, moved: false,
      storeyId: bandStoreyId, side: elevationSide, origProject: project,
    }));
  };

  // ... onOpeningPointerDown / onOpeningCornerPointerDown / onBalconyPointerDown / onBalconyEdgePointerDown
  //     —— 按 DrawingSurface2D.tsx:1710-1825 原封不动

  const elevationHandlers: ElevationDragHandlers = {
    onStoreyPointerDown,
    onOpeningPointerDown,
    onOpeningCornerPointerDown,
    onBalconyPointerDown,
    onBalconyEdgePointerDown,
  };

  return { planHandlers, elevationHandlers };
}
```

**关键搬迁约定**：每个 begin* 函数体一字不改，闭包变量 `project`/`storeyId`/etc 都通过 args 已在 hook 顶部解构。`onElevationOpeningCornerPointerDown` 中的 `effectiveCorner` 镜像逻辑、`onElevationBalconyEdgePointerDown` 中的 `effectiveEdge` 镜像逻辑保留。

- [ ] **Step 2: 主文件删除并 import**

`DrawingSurface2D.tsx`：

1. 删除主文件 `eventToWorldWith` 闭包定义 (1445-1452) —— 改用 useDragHandlers 导出的同名函数（注意签名不同：导出的版本第一参数是 `SVGSVGElement | null`，主文件调用处需要传 `svgRef.current`）
2. 删除 `beginDragWith` (1461-1482)、`beginElementDrag` (1484-1491)
3. 删除 14 个 begin* 函数（1493-1844）
4. 删除 `planDragHandlers` 与 `elevationDragHandlers` object literals (1698-1851)
5. 加 import + 调用：

```ts
import { eventToWorldWith, useDragHandlers } from "./canvas/useDragHandlers";

// 组件内部：
const { planHandlers, elevationHandlers } = useDragHandlers({
  project,
  storeyId,
  elevationSide,
  planMapping,
  elevationMapping,
  svgRef,
  setDragState,
});
```

6. 主文件 `handlePointerMove` 现在的两处 `eventToWorldWith(event, mapping)` 调用改为 `eventToWorldWith(svgRef.current, event, mapping)`（line ~2226 的 dragState 分支 + line ~2255 的 hover 分支）
7. JSX 中原 `planDragHandlers` / `elevationDragHandlers` 引用改为 `planHandlers` / `elevationHandlers`（搜索替换）
8. 删除主文件无用 import：`wallLength`、`rotatePoint`、`elevationOffsetSign`、`ElevationSide`（如已不再使用）

- [ ] **Step 3: 验证**

Run: `bun run lint && bun run test && bun run build`
Expected: all green.

- [ ] **Step 4: 手动验证拖拽 begin 行为不退**

```bash
bun run dev
# plan-1f：点击各种元素发起拖拽，确认能开始（pointer 进入 dragState）
# - 拖墙体、墙端点、洞口、洞口边沿、阳台、阳台边沿、楼梯体、楼梯角点、楼梯旋转手柄
# elevation-front：
# - 拖楼层带、洞口、洞口角点、阳台、阳台边沿
```

具体 drag 计算行为属于 dragMachine task；这一步只确认 begin 不回退（pointerCapture、dragState 进入状态正确）。

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/useDragHandlers.ts src/components/DrawingSurface2D.tsx
git commit -m "$(cat <<'EOF'
refactor(canvas): 抽 useDragHandlers hook

把 14 个 begin* drag-factory 收拢；闭包依赖通过 args 注入。
beginDragWith / beginElementDrag 辅助一并搬入。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 抽 dragMachine.ts —— 第一阶段（搬代码、保留 setX 占位）

**Files:**
- Create: `src/components/canvas/dragMachine.ts`
- Modify: `src/components/DrawingSurface2D.tsx:1862-2222` (替换为 dragMachine 调用)

**关键**：此 task 只做"代码搬家 + 接口外形"，**不**改成纯函数。applyDrag 接受 setX callbacks 作为参数，行为 1:1 等价。下一 task 才把 setX 改成 outcome 字段。这种两阶段法把"代码移动出错"和"接口改造出错"分开，每一步都能独立验证。

- [ ] **Step 1: 创建 `canvas/dragMachine.ts` 第一形态**

```ts
// src/components/canvas/dragMachine.ts
import { wallLength } from "../../domain/measurements";
import { moveWall, translateStorey, updateBalcony, updateOpening, updateStair } from "../../domain/mutations";
import type { HouseProject } from "../../domain/types";
import { collectPlanAnchors, findAxisAlignedGuides, type GuideMatch } from "../../geometry/smartGuides";
import { snapPlanPoint, snapToEndpoint } from "../../geometry/snapping";
import type { PlanProjection } from "../../projection/types";
import type { DragState } from "./dragState";
import type { DragReadout, Point2D } from "./types";

const PLAN_GRID_SIZE = 0.1;
const PLAN_ENDPOINT_THRESHOLD = 0.2;
export const DRAG_MOVE_THRESHOLD_WORLD = 0.04;

export type WallSegment = { start: Point2D; end: Point2D };

export type DragMachineSinks = {
  onProjectChange: (project: HouseProject) => void;
  setActiveSnap: (snap: Point2D | null) => void;
  setGuideMatches: (matches: GuideMatch[]) => void;
  setDragReadout: (readout: DragReadout | null) => void;
};

export type DragContext = {
  project: HouseProject;
  planProjection?: PlanProjection;
  otherWallSegmentsExclude: (excludeWallId?: string) => WallSegment[];
};

const snapToGrid = (value: number) => Math.round(value / PLAN_GRID_SIZE) * PLAN_GRID_SIZE;
const roundToMm = (value: number) => Math.round(value * 1000) / 1000;
const roundPointToMm = (point: Point2D): Point2D => ({
  x: roundToMm(point.x),
  y: roundToMm(point.y),
});
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * 第一阶段：sinks 回调注入；行为与原组件 applyDrag 完全等价。
 * 后续 task 7 把 sinks 折叠为 DragOutcome 返回值。
 */
export function applyDrag(
  state: DragState,
  currentWorld: Point2D,
  ctx: DragContext,
  sinks: DragMachineSinks,
): void {
  const { project, planProjection, otherWallSegmentsExclude } = ctx;
  const { onProjectChange, setActiveSnap, setGuideMatches, setDragReadout } = sinks;
  const dx = currentWorld.x - state.startWorld.x;
  const dy = currentWorld.y - state.startWorld.y;

  if (state.kind !== "wall-endpoint" && state.kind !== "stair-resize") {
    setGuideMatches([]);
  }

  try {
    switch (state.kind) {
      // ↓ DrawingSurface2D.tsx:1872-2217 全部 case 一字不改搬过来
      // - "wall-translate"、"wall-endpoint"、"opening"/"balcony"、
      //   "plan-opening-resize"/"plan-balcony-resize"、
      //   "elev-opening-move"、"elev-opening-resize"、
      //   "elev-balcony-move"、"elev-balcony-resize"、
      //   "stair-translate"、"stair-resize"、"stair-rotate"、
      //   "elev-storey-translate"
      // 把所有 onProjectChange / setActiveSnap / setGuideMatches / setDragReadout
      // 调用保留原样（已通过 sinks 注入）；otherWallSegments 改用 otherWallSegmentsExclude
    }
  } catch {
    // invalid move — keep last valid state
  }
}

export function selectionOnClick(state: DragState): import("../../domain/selection").ObjectSelection | undefined {
  switch (state.kind) {
    case "wall-translate":
      return { kind: "wall", id: state.wallId };
    case "opening":
    case "elev-opening-move":
      return { kind: "opening", id: state.openingId };
    case "balcony":
    case "elev-balcony-move":
      return { kind: "balcony", id: state.balconyId };
    case "stair-translate":
      return { kind: "stair", id: state.storeyId };
    case "elev-storey-translate":
      return { kind: "storey", id: state.storeyId };
    default:
      return undefined;
  }
}
```

**搬迁细节**：

- 原 applyDrag (1862-2222) 内部调用了 `otherWallSegments(state.wallId)` (1873)、`otherWallSegments(state.wallId)` (1906) 两次——参数名换为 `otherWallSegmentsExclude`，函数体内调用同。
- `planProjection` 在 `case "wall-endpoint"` 与 `case "stair-resize"` 分别检查使用——通过 ctx 注入。
- `DRAG_MOVE_THRESHOLD_WORLD` export 出去给主文件用（原值 0.04）；`PLAN_GRID_SIZE` / `PLAN_ENDPOINT_THRESHOLD` 留 module 内部。

- [ ] **Step 2: 主文件改用 applyDrag（第一阶段，仍传 sinks）**

`DrawingSurface2D.tsx`：

1. 删除常量：`PLAN_GRID_SIZE` / `PLAN_ENDPOINT_THRESHOLD` / `DRAG_MOVE_THRESHOLD_WORLD` (35-37)
2. 删除 `snapToGrid` / `roundToMm` / `roundPointToMm` 闭包（1454-1459）、`otherWallSegments` 闭包 (1853-1858)、`clamp` 闭包 (1860)、整个 `applyDrag` 闭包定义 (1862-2222)
3. 加 import：

```ts
import {
  DRAG_MOVE_THRESHOLD_WORLD,
  applyDrag,
  selectionOnClick,
} from "./canvas/dragMachine";
```

4. 在 `handlePointerMove` 内 dragState 分支替换原 `applyDrag(dragState, currentWorld);` 为：

```tsx
const otherWallSegmentsExclude = (excludeWallId?: string) =>
  storeyId === undefined ? [] : project.walls
    .filter((w) => w.storeyId === storeyId && w.id !== excludeWallId)
    .map((w) => ({ start: w.start, end: w.end }));

applyDrag(
  dragState,
  currentWorld,
  { project, planProjection, otherWallSegmentsExclude },
  { onProjectChange, setActiveSnap, setGuideMatches, setDragReadout },
);
```

5. 删除 `handlePointerMove` 与 `handlePointerUp` 中无用的删除 import：`snapPlanPoint` / `snapToEndpoint` / `collectPlanAnchors` / `findAxisAlignedGuides` / `wallLength`（如还在主文件 import 列表里且不再使用）/ `moveWall` / `translateStorey` / `updateBalcony` / `updateOpening` / `updateStair`

- [ ] **Step 3: 验证**

Run: `bun run lint && bun run test && bun run build`
Expected: all green.

- [ ] **Step 4: 手动验证全 13 transition 不退**

```bash
bun run dev
# plan-1f：拖墙体（grid + endpoint snap）、墙端点（snap + guide）、
#         洞口/阳台移动 + resize、楼梯 translate / resize / rotate
# elevation-front：洞口 move/resize、阳台 move/resize、楼层带 translate
```

每条 transition 至少触发一次。如有任何回退，停下检查搬迁的代码段。

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/dragMachine.ts src/components/DrawingSurface2D.tsx
git commit -m "$(cat <<'EOF'
refactor(canvas): 抽 dragMachine.ts —— 第一阶段（sinks 回调注入）

applyDrag 整体搬出，行为等价；sinks (onProjectChange/setActiveSnap/
setGuideMatches/setDragReadout) 经参数注入。selectionOnClick 也搬过。
下一步：sinks → DragOutcome 返回值。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: dragMachine 第二阶段 —— sinks 折叠为 DragOutcome

**Files:**
- Modify: `src/components/canvas/dragMachine.ts`
- Modify: `src/components/DrawingSurface2D.tsx`

- [ ] **Step 1: 改造 applyDrag 签名**

`canvas/dragMachine.ts`：

1. 加类型：

```ts
export type DragOutcome = {
  project: HouseProject;
  activeSnap: Point2D | null;
  guideMatches: GuideMatch[];
  dragReadout: DragReadout | null;
};
```

2. 删除 `DragMachineSinks` 类型与 `sinks` 参数。

3. 改 applyDrag 签名 + 函数体策略：

```ts
export function applyDrag(
  state: DragState,
  currentWorld: Point2D,
  ctx: DragContext,
): DragOutcome | null {
  const { project, planProjection, otherWallSegmentsExclude } = ctx;
  const dx = currentWorld.x - state.startWorld.x;
  const dy = currentWorld.y - state.startWorld.y;

  // 可变累加：每个 case 自己设置/覆盖
  let nextProject = project;
  let activeSnap: Point2D | null = null;
  let guideMatches: GuideMatch[] = [];
  let dragReadout: DragReadout | null = null;

  // 原 "if (state.kind !== 'wall-endpoint' && state.kind !== 'stair-resize') setGuideMatches([])"
  // 已自然由初始化 guideMatches=[] 表达；wall-endpoint / stair-resize 自己会覆盖。

  try {
    switch (state.kind) {
      case "wall-translate": {
        // ... 原逻辑
        // 把 setActiveSnap(snapHit) 改成 activeSnap = snapHit;
        // 把 onProjectChange(moveWall(...)) 改成 nextProject = moveWall(...);
        // 把 setDragReadout({ kind: "wall-translate", ... }) 改成 dragReadout = { kind: "wall-translate", ... };
        break;
      }
      case "wall-endpoint": {
        // ... 原逻辑
        // 把 setGuideMatches(matches) 改成 guideMatches = matches;
        // 把 setGuideMatches([]) 改成 guideMatches = [];
        // 其余 setX 同上模式替换
        break;
      }
      // ... 其他 11 个 case 同样模式：setX → 局部变量赋值
      //
      // 关键："return" 语句（min-size 等拒绝）→ 改成 return null（caller 视为本帧无效）
      //   - case "opening" / "balcony": "if (len === 0) return;" → return null
      //   - case "plan-opening-resize" / "plan-balcony-resize": "if (newWidth < minSize) return;" → return null
      //   - case "elev-opening-resize": "if (newWidth < minSize || newHeight < minSize) return;" → return null
      //   - case "elev-balcony-resize": "if (newWidth < minSize) return;" → return null
      //
      // case "stair-resize" 内部 setGuideMatches(matches) → guideMatches = matches; setGuideMatches([]) → guideMatches = [];
    }
  } catch {
    return null;
  }

  return { project: nextProject, activeSnap, guideMatches, dragReadout };
}
```

**逐 case 改造对照**（按 `DrawingSurface2D.tsx` 旧行号 → dragMachine 新行号）：

| Case | 旧 setX 调用 | 新写法 |
|------|-----------|--------|
| wall-translate | `setActiveSnap(snapHit)` | `activeSnap = snapHit;` |
| wall-translate | `onProjectChange(moveWall(...))` | `nextProject = moveWall(...);` |
| wall-translate | `setDragReadout({ kind: "wall-translate", ... })` | `dragReadout = { kind: "wall-translate", ... };` |
| wall-endpoint | `setActiveSnap(endpointSnap ?? null)` | `activeSnap = endpointSnap ?? null;` |
| wall-endpoint | `setGuideMatches(matches)` | `guideMatches = matches;` |
| wall-endpoint | `setGuideMatches([])` (3 处) | `guideMatches = [];` |
| wall-endpoint | `onProjectChange(moveWall(...))` | `nextProject = moveWall(...);` |
| wall-endpoint | `setDragReadout(...)` | `dragReadout = ...;` |
| opening / balcony | `if (len === 0) return;` | `return null;` |
| opening / balcony | `onProjectChange(updateOpening(...))` 或 updateBalcony | `nextProject = updateOpening/Balcony(...);` |
| opening / balcony | `setDragReadout(...)` | `dragReadout = ...;` |
| plan-opening-resize / plan-balcony-resize | `if (len === 0) return;` | `return null;` |
| 同上 | `if (newWidth < minSize) return;` | `return null;` |
| 同上 | onProjectChange + setDragReadout | nextProject + dragReadout |
| elev-opening-move | `onProjectChange(updateOpening(...))` + `setDragReadout(...)` | `nextProject = ...;` + `dragReadout = ...;` |
| elev-opening-resize | `if (newWidth < minSize \|\| newHeight < minSize) return;` | `return null;` |
| 同上 | onProjectChange + setDragReadout | nextProject + dragReadout |
| elev-balcony-move / elev-balcony-resize | 同上模式 | 同上 |
| 同上 | `if (newWidth < minSize) return;` (resize) | `return null;` |
| stair-translate | `onProjectChange(updateStair(...))` | `nextProject = updateStair(...);` |
| stair-resize | `setGuideMatches(matches)` | `guideMatches = matches;` |
| stair-resize | `setGuideMatches([])` | `guideMatches = [];` |
| stair-resize | `onProjectChange(updateStair(...))` + `setDragReadout(...)` | `nextProject = ...;` + `dragReadout = ...;` |
| stair-rotate | `onProjectChange(updateStair(...))` + `setDragReadout(...)` | 同上 |
| elev-storey-translate | `onProjectChange(translateStorey(...))` + `setDragReadout(...)` | 同上 |

- [ ] **Step 2: 主文件改用 outcome 返回值**

`DrawingSurface2D.tsx`：

1. 改 `handlePointerMove` 内 dragState 分支：

```tsx
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

  const otherWallSegmentsExclude = (excludeWallId?: string) =>
    storeyId === undefined ? [] : project.walls
      .filter((w) => w.storeyId === storeyId && w.id !== excludeWallId)
      .map((w) => ({ start: w.start, end: w.end }));

  const outcome = applyDrag(
    dragState,
    currentWorld,
    { project, planProjection, otherWallSegmentsExclude },
  );
  if (!outcome) return;
  onProjectChange(outcome.project);
  setActiveSnap(outcome.activeSnap);
  setGuideMatches(outcome.guideMatches);
  setDragReadout(outcome.dragReadout);
  return;
}
```

2. 加 import `DragOutcome` 如果别处需要（一般不用，只在 dragMachine 内部）。

3. `eventToWorldWith` 已在 Task 5 中由 useDragHandlers.ts export，主文件已 import 并按 `eventToWorldWith(svgRef.current, event, mapping)` 调用。本 task 无需变更。

- [ ] **Step 3: 验证**

Run: `bun run lint && bun run test && bun run build`
Expected: all green.

- [ ] **Step 4: 手动验证 13 transition 全部不退**

逐项过：plan-1f wall-translate（grid 吸附 / endpoint snap）、wall-endpoint（snap + guide）、opening drag + 2 resize、balcony drag + 2 resize、stair translate / 4 corners resize / rotate；elevation-front opening move / 4 corners resize、balcony move / 2 edges resize、整层 translate。任意一个 min-size violation（拖太小）应被忽略不更新（确认 readout 与 project 同时不变）。

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/dragMachine.ts src/components/canvas/useDragHandlers.ts src/components/DrawingSurface2D.tsx
git commit -m "$(cat <<'EOF'
refactor(canvas): dragMachine 第二阶段 —— sinks 折叠为 DragOutcome 返回值

applyDrag 改成纯函数：(state, world, ctx) → DragOutcome | null。
min-size 拒绝路径返回 null（替代原 return; 的 setX 沉默丢弃）。
eventToWorldWith 作为 helper 由 useDragHandlers 导出共用。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 新增 dragMachine.test.ts

**Files:**
- Create: `src/__tests__/dragMachine.test.ts`

- [ ] **Step 1: 准备 fixture**

```ts
// src/__tests__/dragMachine.test.ts
import { describe, expect, it } from "vitest";
import { applyDrag, selectionOnClick, type DragContext } from "../components/canvas/dragMachine";
import type { DragState } from "../components/canvas/dragState";
import type { PointMapping } from "../components/canvas/types";
import type { HouseProject } from "../domain/types";
import { projectPlanView } from "../projection/plan";

const MAPPING: PointMapping = {
  project: (p) => p,
  unproject: (p) => p,
  scale: 1,
};

function fixture(): HouseProject {
  return {
    schemaVersion: 1,
    id: "p",
    name: "fx",
    unitSystem: "metric",
    defaultWallThickness: 0.2,
    defaultStoreyHeight: 3,
    mode: "2d",
    activeView: "plan-1f",
    activeTool: "select",
    storeys: [
      { id: "1f", label: "1F", elevation: 0, height: 3, slabThickness: 0.2 },
    ],
    materials: [
      { id: "m-wall", name: "墙", color: "#fff", kind: "wall" },
      { id: "m-frame", name: "frame", color: "#ccc", kind: "frame" },
      { id: "m-rail", name: "rail", color: "#888", kind: "railing" },
    ],
    walls: [
      // 矩形：4 面墙构成 4x3 房间
      { id: "w-s", storeyId: "1f", start: { x: 0, y: 0 }, end: { x: 4, y: 0 }, thickness: 0.2, height: 3, exterior: true, materialId: "m-wall" },
      { id: "w-e", storeyId: "1f", start: { x: 4, y: 0 }, end: { x: 4, y: 3 }, thickness: 0.2, height: 3, exterior: true, materialId: "m-wall" },
      { id: "w-n", storeyId: "1f", start: { x: 4, y: 3 }, end: { x: 0, y: 3 }, thickness: 0.2, height: 3, exterior: true, materialId: "m-wall" },
      { id: "w-w", storeyId: "1f", start: { x: 0, y: 3 }, end: { x: 0, y: 0 }, thickness: 0.2, height: 3, exterior: true, materialId: "m-wall" },
    ],
    openings: [
      { id: "o1", wallId: "w-s", type: "window", offset: 1.0, sillHeight: 1.0, width: 1.0, height: 1.2, frameMaterialId: "m-frame" },
    ],
    balconies: [
      { id: "b1", storeyId: "1f", attachedWallId: "w-s", offset: 0.5, width: 1.5, depth: 1.0, slabThickness: 0.15, railingHeight: 1.0, materialId: "m-wall", railingMaterialId: "m-rail" },
    ],
    skirts: [],
  };
}

function ctxFor(project: HouseProject): DragContext {
  const planProjection = projectPlanView(project, "1f");
  return {
    project,
    planProjection,
    otherWallSegmentsExclude: (exclude) => project.walls
      .filter((w) => w.storeyId === "1f" && w.id !== exclude)
      .map((w) => ({ start: w.start, end: w.end })),
  };
}
```

- [ ] **Step 2: 写测试 —— wall-translate**

```ts
describe("applyDrag wall-translate", () => {
  const baseWall = { id: "w-s", origStart: { x: 0, y: 0 }, origEnd: { x: 4, y: 0 } };

  function dragWall(currentWorld: { x: number; y: number }) {
    const project = fixture();
    const state: DragState = {
      kind: "wall-translate",
      pointerId: 1,
      startWorld: { x: 2, y: 0 },
      moved: true,
      mapping: MAPPING,
      wallId: "w-s",
      origStart: baseWall.origStart,
      origEnd: baseWall.origEnd,
    };
    return applyDrag(state, currentWorld, ctxFor(project));
  }

  it("snaps to grid when no nearby endpoint snap", () => {
    const out = dragWall({ x: 2.07, y: 0.43 });
    expect(out).not.toBeNull();
    expect(out!.activeSnap).toBeNull();
    const wall = out!.project.walls.find((w) => w.id === "w-s")!;
    // dx=0.07 → snapToGrid=0.1；dy=0.43 → 0.4
    expect(wall.start).toEqual({ x: 0.1, y: 0.4 });
    expect(wall.end).toEqual({ x: 4.1, y: 0.4 });
    expect(out!.dragReadout).toEqual({ kind: "wall-translate", dx: 0.1, dy: 0.4 });
  });

  it("snaps start to other-wall endpoint when within threshold", () => {
    // 移到接近 w-w (0,3) 的位置：current world 让 origStart (0,0) → 接近 (0,3)
    // dx=0, dy=2.95 -> candStart=(0,2.95)，距离 w-w 端点 (0,3) 0.05 < 0.2 阈值
    const out = dragWall({ x: 2, y: 2.95 });
    expect(out).not.toBeNull();
    expect(out!.activeSnap).toEqual({ x: 0, y: 3 });
    const wall = out!.project.walls.find((w) => w.id === "w-s")!;
    expect(wall.start).toEqual({ x: 0, y: 3 });
  });
});
```

- [ ] **Step 3: 写测试 —— wall-endpoint（snap + guide）**

```ts
describe("applyDrag wall-endpoint", () => {
  it("snaps to other-wall endpoint", () => {
    const project = fixture();
    const state: DragState = {
      kind: "wall-endpoint",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      wallId: "w-s",
      endpoint: "start",
      origPoint: { x: 0, y: 0 },
      fixedPoint: { x: 4, y: 0 },
    };
    // 拖到 (0.05, 2.95) — 距 w-n 端点 (0,3) 0.07 < 阈值
    const out = applyDrag(state, { x: 0.05, y: 2.95 }, ctxFor(project));
    expect(out).not.toBeNull();
    expect(out!.activeSnap).toEqual({ x: 0, y: 3 });
    expect(out!.guideMatches).toEqual([]);
    const wall = out!.project.walls.find((w) => w.id === "w-s")!;
    expect(wall.start).toEqual({ x: 0, y: 3 });
  });

  it("falls back to grid when no snap and no guide match", () => {
    const project = fixture();
    const state: DragState = {
      kind: "wall-endpoint",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      wallId: "w-s",
      endpoint: "start",
      origPoint: { x: 0, y: 0 },
      fixedPoint: { x: 4, y: 0 },
    };
    // 离任何端点 / 轴向 anchor 都很远
    const out = applyDrag(state, { x: 1.55, y: 1.55 }, ctxFor(project));
    expect(out).not.toBeNull();
    expect(out!.activeSnap).toBeNull();
    // 落到 grid (1.6, 1.6) 或类似，具体取决于 snapPlanPoint 实现
  });
});
```

- [ ] **Step 4: 写测试 —— opening drag 与 plan-opening-resize**

```ts
describe("applyDrag opening", () => {
  function openingState(currentWorld: { x: number; y: number }, startWorld = { x: 1.5, y: 0 }): DragState {
    return {
      kind: "opening",
      pointerId: 1,
      startWorld,
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 4, y: 0 },
      origOffset: 1.0,
      openingWidth: 1.0,
    };
  }

  it("rounds offset to grid along wall axis", () => {
    const project = fixture();
    const out = applyDrag(openingState({ x: 1.57, y: 0 }), { x: 1.57, y: 0 }, ctxFor(project));
    // 沿 w-s 方向 (1,0)，offsetDelta = 0.07，origOffset+0.07=1.07 → grid → 1.1
    expect(out).not.toBeNull();
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    expect(op.offset).toBeCloseTo(1.1, 5);
    expect(out!.dragReadout).toEqual({ kind: "opening", offset: 1.1 });
  });

  it("clamps to wall length", () => {
    const project = fixture();
    // 拖到极远右
    const out = applyDrag(openingState({ x: 100, y: 0 }), { x: 100, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    // wallLen=4, openingWidth=1 → max offset=3
    expect(op.offset).toBe(3.0);
  });

  it("clamps offset >= 0", () => {
    const project = fixture();
    const out = applyDrag(openingState({ x: -100, y: 0 }), { x: -100, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    expect(op.offset).toBe(0);
  });
});

describe("applyDrag plan-opening-resize", () => {
  function resizeState(edge: "l" | "r"): DragState {
    return {
      kind: "plan-opening-resize",
      pointerId: 1,
      startWorld: { x: 1.5, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      edge,
      wallStart: { x: 0, y: 0 },
      wallEnd: { x: 4, y: 0 },
      origOffset: 1.0,
      origWidth: 1.0,
      wallLen: 4,
    };
  }

  it("right edge grows width", () => {
    const project = fixture();
    const out = applyDrag(resizeState("r"), { x: 1.85, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    // along=0.35; newWidth=1+0.35=1.35 → grid → 1.4
    expect(op.width).toBeCloseTo(1.4, 5);
  });

  it("returns null when below minSize=0.05", () => {
    const project = fixture();
    // edge=r 缩小，使 newWidth = 1 - 0.96 = 0.04 < 0.05
    const out = applyDrag(resizeState("r"), { x: 0.54, y: 0 }, ctxFor(project));
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 5: 写测试 —— balcony drag + plan-balcony-resize**

镜像 opening：相同 4 测试，把 kind 改成 `"balcony"` 与 `"plan-balcony-resize"`，把 `openingId` 换成 `balconyId`、`openingWidth` 换成 `balconyWidth`、`origOffset=0.5`、`origWidth=1.5`、minSize 改为 `0.3`。

- [ ] **Step 6: 写测试 —— elev-opening-move / elev-opening-resize**

```ts
describe("applyDrag elev-opening-move", () => {
  it("clamps offset to [0, wallLen-width] and rounds to grid", () => {
    const project = fixture();
    const state: DragState = {
      kind: "elev-opening-move",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      origOffset: 1.0,
      origSill: 1.0,
      width: 1.0,
      height: 1.2,
      wallLen: 4,
      storeyHeight: 3,
      projSign: 1,
    };
    // dx=0.55, dy=0.27 → newOffset=1.55→1.6, newSill=1.27→1.3
    const out = applyDrag(state, { x: 0.55, y: 0.27 }, ctxFor(project));
    expect(out).not.toBeNull();
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    expect(op.offset).toBeCloseTo(1.6, 5);
    expect(op.sillHeight).toBeCloseTo(1.3, 5);
  });

  it("respects projSign mirror for back/left elevations", () => {
    const project = fixture();
    const state: DragState = {
      kind: "elev-opening-move",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      origOffset: 1.0,
      origSill: 1.0,
      width: 1.0,
      height: 1.2,
      wallLen: 4,
      storeyHeight: 3,
      projSign: -1,  // mirror
    };
    const out = applyDrag(state, { x: 0.55, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    const op = out!.project.openings.find((o) => o.id === "o1")!;
    // dx=0.55 * projSign=-1 → -0.55, newOffset=1-0.55=0.45 → grid 0.5
    expect(op.offset).toBeCloseTo(0.5, 5);
  });
});

describe("applyDrag elev-opening-resize", () => {
  it("returns null when newWidth < minSize", () => {
    const project = fixture();
    const state: DragState = {
      kind: "elev-opening-resize",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      openingId: "o1",
      corner: "tr",
      origOffset: 1.0,
      origSill: 1.0,
      origWidth: 1.0,
      origHeight: 1.2,
      wallLen: 4,
      storeyHeight: 3,
      projSign: 1,
    };
    // corner=tr：newWidth = origWidth + dxOffset = 1 + (-0.96) = 0.04 < 0.05
    const out = applyDrag(state, { x: -0.96, y: 0 }, ctxFor(project));
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 7: 写测试 —— elev-balcony-move / elev-balcony-resize**

镜像 elev-opening 的 2 测试：测 clamp 与 minSize=0.3 拒绝。

- [ ] **Step 8: 写测试 —— stair-translate / stair-resize / stair-rotate**

```ts
describe("applyDrag stair", () => {
  function projectWithStair(): HouseProject {
    const p = fixture();
    return {
      ...p,
      storeys: [
        { ...p.storeys[0], stair: { x: 1, y: 1, width: 1.5, depth: 1, shape: "straight", treadDepth: 0.25, bottomEdge: "+y", materialId: "m-wall", rotation: 0 } },
        { id: "2f", label: "2F", elevation: 3.2, height: 3, slabThickness: 0.2 },
      ],
    };
  }

  it("translate snaps x/y to grid", () => {
    const project = projectWithStair();
    const state: DragState = {
      kind: "stair-translate",
      pointerId: 1,
      startWorld: { x: 1.7, y: 1.5 },
      moved: true,
      mapping: MAPPING,
      storeyId: "1f",
      origX: 1, origY: 1,
    };
    // dx=0.07, dy=0.13 → newX=1.1, newY=1.1
    const out = applyDrag(state, { x: 1.77, y: 1.63 }, ctxFor(project));
    expect(out).not.toBeNull();
    const stair = out!.project.storeys[0].stair!;
    expect(stair.x).toBeCloseTo(1.1, 5);
    expect(stair.y).toBeCloseTo(1.1, 5);
  });

  it("rotate updates rotation field; angle wraps to (-π, π]", () => {
    const project = projectWithStair();
    const center = { x: 1.75, y: 1.5 };
    const state: DragState = {
      kind: "stair-rotate",
      pointerId: 1,
      startWorld: { x: center.x + 1, y: center.y },  // 角度 0
      moved: true,
      mapping: MAPPING,
      storeyId: "1f",
      center,
      initialMouseAngle: 0,
      origRotation: 0,
    };
    // 旋转到 (center, center+1) → 角度 π/2
    const out = applyDrag(state, { x: center.x, y: center.y + 1 }, ctxFor(project));
    expect(out).not.toBeNull();
    const stair = out!.project.storeys[0].stair!;
    expect(stair.rotation).toBeCloseTo(Math.PI / 2, 5);
  });
});
```

stair-resize 写一个 happy path：corner=tr 拖到（origX+w+0.5, origY+d+0.5），expect 新 width/depth 增长 ~0.5；不深究 4 corner 全部排列（spec coverage 已达"happy + 至少一个边界"）。

- [ ] **Step 9: 写测试 —— elev-storey-translate**

```ts
describe("applyDrag elev-storey-translate", () => {
  it("front side: dx → world dx, dy=0", () => {
    const project = fixture();
    const state: DragState = {
      kind: "elev-storey-translate",
      pointerId: 1,
      startWorld: { x: 0, y: 0 },
      moved: true,
      mapping: MAPPING,
      storeyId: "1f",
      side: "front",
      origProject: project,
    };
    const out = applyDrag(state, { x: 0.55, y: 0 }, ctxFor(project));
    expect(out).not.toBeNull();
    expect(out!.dragReadout).toEqual({ kind: "elev-storey-translate", dy: 0.6 });
    // 验证至少一面墙的 x 变了 +0.6（grid 吸附 0.55→0.6）
  });
});
```

- [ ] **Step 10: 写测试 —— selectionOnClick**

```ts
describe("selectionOnClick", () => {
  it.each([
    ["wall-translate",        { wallId: "w-s" },     { kind: "wall",    id: "w-s" }],
    ["opening",               { openingId: "o1" },   { kind: "opening", id: "o1" }],
    ["elev-opening-move",     { openingId: "o1" },   { kind: "opening", id: "o1" }],
    ["balcony",               { balconyId: "b1" },   { kind: "balcony", id: "b1" }],
    ["elev-balcony-move",     { balconyId: "b1" },   { kind: "balcony", id: "b1" }],
    ["stair-translate",       { storeyId: "1f" },    { kind: "stair",   id: "1f"  }],
    ["elev-storey-translate", { storeyId: "1f" },    { kind: "storey",  id: "1f"  }],
  ] as const)("kind=%s -> %o", (kind, payload, expected) => {
    const state = { kind, pointerId: 1, startWorld: { x: 0, y: 0 }, moved: false, mapping: MAPPING, ...payload } as unknown as DragState;
    expect(selectionOnClick(state)).toEqual(expected);
  });

  it.each([
    "wall-endpoint",
    "plan-opening-resize",
    "plan-balcony-resize",
    "elev-opening-resize",
    "elev-balcony-resize",
    "stair-resize",
    "stair-rotate",
  ] as const)("returns undefined for resize/rotate handle %s", (kind) => {
    const state = { kind, pointerId: 1, startWorld: { x: 0, y: 0 }, moved: false, mapping: MAPPING } as unknown as DragState;
    expect(selectionOnClick(state)).toBeUndefined();
  });
});
```

- [ ] **Step 11: 跑测试**

Run: `bun test src/__tests__/dragMachine.test.ts`
Expected: all pass.

如有失败，**优先怀疑 fixture 数据不符合 mutation 内部 invariant**（M3 的 assertValidProject 会拒绝），调 fixture 让墙/洞口/阳台合法。

- [ ] **Step 12: 跑全套**

Run: `bun run lint && bun run test && bun run build`
Expected: all green.

- [ ] **Step 13: Commit**

```bash
git add src/__tests__/dragMachine.test.ts
git commit -m "$(cat <<'EOF'
test(canvas): dragMachine.test.ts 覆盖 13 transitions + selectionOnClick

每个 transition 至少 happy + 边界（min-size 拒绝、wallLen 截断、grid 吸附）。
projSign 镜像、guide 命中、endpoint snap 各覆盖。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 收尾 —— LOC 验证 + 手动 walkthrough

- [ ] **Step 1: LOC check**

Run: `wc -l src/components/DrawingSurface2D.tsx src/components/canvas/*.ts src/components/canvas/*.tsx`
Expected:
- `DrawingSurface2D.tsx` ≤ 400 LOC
- `canvas/dragState.ts` ≤ 200
- `canvas/dragMachine.ts` ≤ 450
- `canvas/useDragHandlers.ts` ≤ 320
- `canvas/useViewport.ts` ≤ 90
- `canvas/renderUtils.ts` ≤ 350
- `canvas/renderPlan.tsx` ≤ 460
- `canvas/renderElevation.tsx` ≤ 200
- `canvas/renderRoofView.tsx` ≤ 130

如 `DrawingSurface2D.tsx` > 400，看是否有可继续拆出的小函数（projection setup 闭包、planFootprints 计算等可成独立 helper 文件）。

- [ ] **Step 2: 手动 walkthrough（spec 验收 6 项）**

```bash
bun run dev
```

逐项过：

1. **plan-1f**：拖墙体（grid 吸附 / endpoint snap）、拖墙端点（snap + guide）、拖洞口移动 + 边沿、拖阳台 + 边沿、楼梯 translate / 4 corner resize / rotate
2. **elevation-front**：拖洞口 move / 4 corner resize、拖阳台 move / 2 edge resize、拖整层 translate
3. **工具切到 wall**：grid + endpoint snap 不退（点击空白起绘制）
4. **键盘 Esc** → ambientSelect 触发；**Delete** → 删除（M1 已覆盖，回归即可）
5. **wheel pan / Ctrl+wheel zoom / 中键拖拽 pan**
6. **JSON 导入导出 round-trip**（菜单 → 导出 → 重新导入 → 项目无回退）

如有任何回退，回看相关 task 的实现。

- [ ] **Step 3: 最终 lint / test / build 三连**

Run: `bun run lint && bun run test && bun run build`
Expected: all green.

- [ ] **Step 4: 路线图标注**

修改 `docs/2026-04-28-iteration-friction-roadmap.md` M4 小节末尾添加：

```markdown
状态：✅ 已合并 @ <commit-sha-after-step-5-commit>
```

(`<commit-sha>` 是 step 5 commit 后的 HEAD sha；step 5 完成后回填。)

- [ ] **Step 5: Commit roadmap status**

```bash
git add docs/2026-04-28-iteration-friction-roadmap.md
git commit -m "$(cat <<'EOF'
docs(roadmap): M4 标记完成

DrawingSurface2D 拆分落地：8 个 canvas/* 子模块 + 测试，主文件 ≤ 400 LOC。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

注意 step 4 写入的 commit sha 应该是 step 8 task 的 commit（dragMachine.test.ts）或者 step 9 task 的某个早期 step；**实际写入时用当前 HEAD 的 short sha**。

---

## Done Criteria（spec 对照）

1. ✅ `bun run lint` + `bun run test` + `bun run build` 全绿
2. ✅ `wc -l src/components/DrawingSurface2D.tsx` ≤ 400；`canvas/*.tsx` 单文件 ≤ 600
3. ✅ `dragMachine.test.ts` 覆盖 13 transition + selectionOnClick
4. ✅ 验收 walkthrough 6 项手动通过
5. ✅ 加新构件场景未来再发生时，`DrawingSurface2D.tsx` 改动 ≤ 1 处（dragState 加 variant），其余落到 `dragMachine.ts` / `useDragHandlers.ts` / `renderPlan.tsx` 三个独立文件
