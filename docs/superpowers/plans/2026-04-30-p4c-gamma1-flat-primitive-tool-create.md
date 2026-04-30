# P4C-γ1: 扁平 3D 原型 — 工具点击创建对象 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ToolPalette 选中工具后能在 2D 视图点击 / 操作创建新对象。覆盖最常用的 6 种工具：wall / door / window / opening / slab / roof。完成后用户可以从 0 搭出图里那栋房子的几何骨架。

**Architecture:** 写一个 `useCreateHandlers` hook 整合 tool-aware 点击逻辑。state 机种类少（wall-pending / slab-pending / idle），不复用 v1 dragMachine（那个是 P4C-γ2 的事）。Hook 返回 `(canvasClick handler, keyDown handler, previewElements)`，DrawingSurface2D 串进现有 SVG 事件流。

**Tech Stack:** TypeScript 5、React 19、vitest。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-flat-primitive-refactor-design.md` §5.1。

**关键决策：**
- 仅在 **plan 视图** 支持 tool create（slab 在 plan，opening 在 plan，wall 在 plan）。Elevation / roof view 的 tool create 留 polish phase。
- **Roof tool 简化**：activeTool="roof" 时 ToolPalette 出现一个 `+ 创建屋顶` 按钮（不是画布点击），点击 → 用所有 exterior 墙的 bbox + 顶层 storey 默认参数创建一个 default roof。
- **Slab 用 click-to-add-vertex + Enter 关闭** 流程。Escape 取消。
- **Opening 工具点击落在墙上时**才有效；落在空白 / 其他对象上忽略。点击位置算 wall-local offset。
- **Wall 工具**两次点击：第一次记起点，第二次创建墙（默认厚度 0.2、底锚点当前 storey、顶锚点下一 storey）。
- 不实现网格吸附 / 智能辅助线（v1 有；v2 这块也是 polish phase）。
- 不接通 stair / balcony / material 工具点击（这些低优先 + 涉及更多上下文，留作后续）。

---

## File Structure

新建：

- `src/components/canvas/useCreateHandlers.ts` — tool-aware 点击 hook
- `src/components/canvas/createPreview.tsx` — in-progress wall / slab 的 SVG 预览组件
- `src/__tests__/components/canvas/useCreateHandlers.test.tsx`

修改：

- `src/components/DrawingSurface2D.tsx` — 串通 useCreateHandlers，给 SVG 加 onClick + onKeyDown 路由
- `src/components/ToolPalette.tsx` — activeTool="roof" 时显示 "+ 创建屋顶" 按钮
- `src/styles.css` — preview 样式

不动：所有 v1 文件、v2 已落代码、PropertyPanel / 编辑器 / StoreysEditor、其他 components。

P4C-γ1 结束后：
- `bun run test` 全套绿（新增 ~10 测试，6 个 v1 UI 测试继续 skip）
- `bun run build` 全套绿
- 浏览器：选 wall 工具 → plan 视图点两下 → 创建一面墙；选 door 工具 → 点击现有墙 → 在该位置添加门；选 slab → 点击多个顶点 + 回车 → 创建 slab；选 roof → "+ 创建屋顶" → 默认 roof 出现

---

## Task 1: useCreateHandlers hook + state types

**Files:**
- Create: `src/components/canvas/useCreateHandlers.ts`
- Create: `src/components/canvas/createPreview.tsx`
- Create: `src/__tests__/components/canvas/useCreateHandlers.test.tsx`

### Step 1: Write the failing test

Create `src/__tests__/components/canvas/useCreateHandlers.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCreateHandlers } from "../../../components/canvas/useCreateHandlers";
import { createV2SampleProject } from "../../../domain/v2/sampleProject";
import { withSessionDefaults } from "../../../app/v2/projectReducer";

describe("useCreateHandlers — wall tool", () => {
  it("first click in wall tool records the start point (idle → wall-pending)", () => {
    const project = withSessionDefaults({ ...createV2SampleProject() });
    project.activeTool = "wall";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 1, y: 1 }, undefined));
    expect(result.current.state.kind).toBe("wall-pending");
    if (result.current.state.kind === "wall-pending") {
      expect(result.current.state.firstPoint).toEqual({ x: 1, y: 1 });
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("second click dispatches add-wall and resets to idle", () => {
    const project = withSessionDefaults({ ...createV2SampleProject() });
    project.activeTool = "wall";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 1, y: 1 }, undefined));
    act(() => result.current.handleCanvasClick({ x: 5, y: 1 }, undefined));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "add-wall",
        wall: expect.objectContaining({
          start: { x: 1, y: 1 },
          end: { x: 5, y: 1 },
        }),
      }),
    );
    expect(result.current.state.kind).toBe("idle");
  });

  it("Escape during wall-pending cancels back to idle", () => {
    const project = withSessionDefaults({ ...createV2SampleProject() });
    project.activeTool = "wall";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 1, y: 1 }, undefined));
    act(() => result.current.handleKeyDown("Escape"));
    expect(result.current.state.kind).toBe("idle");
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("useCreateHandlers — opening tools", () => {
  it("clicking on a wall in door mode dispatches add-opening with door type", () => {
    const project = withSessionDefaults({ ...createV2SampleProject() });
    project.activeTool = "door";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    // Hit on w-front at x=3 along the wall (wall is from (0,0) to (8,0))
    act(() => result.current.handleCanvasClick({ x: 3, y: 0 }, { kind: "wall", wallId: "w-front" }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "add-opening",
        opening: expect.objectContaining({
          wallId: "w-front",
          type: "door",
          offset: expect.any(Number),
        }),
      }),
    );
  });

  it("clicking on empty space in door mode is a no-op", () => {
    const project = withSessionDefaults({ ...createV2SampleProject() });
    project.activeTool = "door";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 100, y: 100 }, undefined));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("useCreateHandlers — slab tool", () => {
  it("accumulates polygon vertices and Enter dispatches add-slab", () => {
    const project = withSessionDefaults({ ...createV2SampleProject() });
    project.activeTool = "slab";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 0, y: 0 }, undefined));
    act(() => result.current.handleCanvasClick({ x: 4, y: 0 }, undefined));
    act(() => result.current.handleCanvasClick({ x: 4, y: 4 }, undefined));
    act(() => result.current.handleCanvasClick({ x: 0, y: 4 }, undefined));
    expect(result.current.state.kind).toBe("slab-pending");
    act(() => result.current.handleKeyDown("Enter"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "add-slab",
        slab: expect.objectContaining({
          polygon: [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 4 },
            { x: 0, y: 4 },
          ],
        }),
      }),
    );
    expect(result.current.state.kind).toBe("idle");
  });

  it("Enter with fewer than 3 vertices is a no-op", () => {
    const project = withSessionDefaults({ ...createV2SampleProject() });
    project.activeTool = "slab";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 0, y: 0 }, undefined));
    act(() => result.current.handleCanvasClick({ x: 4, y: 0 }, undefined));
    act(() => result.current.handleKeyDown("Enter"));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("useCreateHandlers — select tool (no-op)", () => {
  it("does not intercept clicks in select mode", () => {
    const project = withSessionDefaults({ ...createV2SampleProject() });
    project.activeTool = "select";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    expect(result.current.handleCanvasClick({ x: 1, y: 1 }, undefined)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
```

### Step 2: Run test (expect FAIL)

```bash
bun run test src/__tests__/components/canvas/useCreateHandlers.test.tsx
```

### Step 3: Implement `src/components/canvas/useCreateHandlers.ts`

Create with this exact content:

```typescript
import { useState, useCallback } from "react";
import type { ProjectActionV2, ProjectStateV2, SelectionV2 } from "../../app/v2/projectReducer";
import type { Anchor, OpeningType, Point2 } from "../../domain/v2/types";

export type CreateState =
  | { kind: "idle" }
  | { kind: "wall-pending"; firstPoint: Point2 }
  | { kind: "slab-pending"; vertices: Point2[] };

export type HitObject = SelectionV2;

type UseCreateHandlersArgs = {
  project: ProjectStateV2;
  storeyId: string | undefined;
  dispatch: (action: ProjectActionV2) => void;
};

export type UseCreateHandlersResult = {
  state: CreateState;
  /** Returns true if the hook handled the click (caller should not also dispatch select). */
  handleCanvasClick: (world: Point2, hit: HitObject | undefined) => boolean;
  handleKeyDown: (key: string) => void;
};

const DEFAULT_WALL_THICKNESS = 0.2;
const DEFAULT_OPENING_WIDTH = 1.0;
const DEFAULT_OPENING_HEIGHT = 1.4;
const DEFAULT_OPENING_SILL = 0.9;
const DEFAULT_DOOR_HEIGHT = 2.1;
const DEFAULT_DOOR_SILL = 0;
const DEFAULT_SLAB_THICKNESS = 0.18;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
}

function nextStoreyAbove(project: ProjectStateV2, storeyId: string): string | undefined {
  const sorted = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const idx = sorted.findIndex((s) => s.id === storeyId);
  if (idx === -1 || idx === sorted.length - 1) return undefined;
  return sorted[idx + 1].id;
}

function defaultMaterialId(project: ProjectStateV2, kind: "wall" | "frame" | "decor" | "roof"): string {
  const m = project.materials.find((mat) => mat.kind === kind);
  return m?.id ?? project.materials[0]?.id ?? "mat-fallback";
}

function projectPointOntoWall(
  project: ProjectStateV2,
  wallId: string,
  point: Point2,
): { offset: number; wallLength: number } | undefined {
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall) return undefined;
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return undefined;
  const ux = dx / len;
  const uy = dy / len;
  const px = point.x - wall.start.x;
  const py = point.y - wall.start.y;
  const t = px * ux + py * uy;
  return { offset: Math.max(0, Math.min(len, t)), wallLength: len };
}

export function useCreateHandlers({
  project,
  storeyId,
  dispatch,
}: UseCreateHandlersArgs): UseCreateHandlersResult {
  const [state, setState] = useState<CreateState>({ kind: "idle" });

  const tool = project.activeTool;

  const handleCanvasClick = useCallback(
    (world: Point2, _hit: HitObject | undefined): boolean => {
      const hit = _hit;
      if (tool === "select" || tool === "material") return false;

      // Tool routing
      if (tool === "wall") {
        if (state.kind === "idle") {
          setState({ kind: "wall-pending", firstPoint: world });
          return true;
        }
        if (state.kind === "wall-pending") {
          if (!storeyId) {
            setState({ kind: "idle" });
            return true;
          }
          const upperId = nextStoreyAbove(project, storeyId);
          const bottom: Anchor = { kind: "storey", storeyId, offset: 0 };
          const top: Anchor = upperId
            ? { kind: "storey", storeyId: upperId, offset: 0 }
            : { kind: "absolute", z: (project.storeys.find((s) => s.id === storeyId)?.elevation ?? 0) + 3 };
          dispatch({
            type: "add-wall",
            wall: {
              id: generateId("w"),
              start: state.firstPoint,
              end: world,
              thickness: DEFAULT_WALL_THICKNESS,
              bottom,
              top,
              exterior: true,
              materialId: defaultMaterialId(project, "wall"),
            },
          });
          setState({ kind: "idle" });
          return true;
        }
      }

      if (tool === "door" || tool === "window" || tool === "opening") {
        if (!hit || hit.kind !== "wall") return true; // consume but no-op
        const proj = projectPointOntoWall(project, hit.wallId, world);
        if (!proj) return true;
        const type: OpeningType = tool === "door" ? "door" : tool === "window" ? "window" : "void";
        const width = Math.min(DEFAULT_OPENING_WIDTH, Math.max(0.4, proj.wallLength - 0.4));
        const height = type === "door" ? DEFAULT_DOOR_HEIGHT : DEFAULT_OPENING_HEIGHT;
        const sill = type === "door" ? DEFAULT_DOOR_SILL : DEFAULT_OPENING_SILL;
        const offset = Math.max(0.1, Math.min(proj.wallLength - width - 0.1, proj.offset - width / 2));
        dispatch({
          type: "add-opening",
          opening: {
            id: generateId(`o-${type}`),
            wallId: hit.wallId,
            type,
            offset,
            sillHeight: sill,
            width,
            height,
            frameMaterialId: defaultMaterialId(project, "frame"),
          },
        });
        return true;
      }

      if (tool === "slab") {
        if (!storeyId) return true;
        const vertices = state.kind === "slab-pending" ? [...state.vertices, world] : [world];
        setState({ kind: "slab-pending", vertices });
        return true;
      }

      // tool === "roof" — handled via ToolPalette button, not canvas click
      // tool === "balcony" / "stair" — not implemented in P4C-γ1 (defer to polish)

      return false;
    },
    [tool, state, storeyId, project, dispatch],
  );

  const handleKeyDown = useCallback(
    (key: string): void => {
      if (key === "Escape") {
        setState({ kind: "idle" });
        return;
      }
      if (key === "Enter") {
        if (state.kind === "slab-pending" && state.vertices.length >= 3 && storeyId) {
          dispatch({
            type: "add-slab",
            slab: {
              id: generateId("slab"),
              polygon: state.vertices,
              top: { kind: "storey", storeyId, offset: 0 },
              thickness: DEFAULT_SLAB_THICKNESS,
              materialId: defaultMaterialId(project, "decor"),
            },
          });
          setState({ kind: "idle" });
        }
        return;
      }
    },
    [state, storeyId, project, dispatch],
  );

  return { state, handleCanvasClick, handleKeyDown };
}
```

### Step 4: Implement `src/components/canvas/createPreview.tsx`

Create with this exact content:

```typescript
import type { CreateState } from "./useCreateHandlers";
import type { Point2D, PointMapping } from "./types";

type CreatePreviewProps = {
  state: CreateState;
  mapping: PointMapping;
  cursorWorld?: Point2D;
};

export function CreatePreview({ state, mapping, cursorWorld }: CreatePreviewProps) {
  if (state.kind === "wall-pending" && cursorWorld) {
    const a = mapping.project(state.firstPoint);
    const b = mapping.project(cursorWorld);
    return (
      <line
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke="#3b82f6"
        strokeWidth={2}
        strokeDasharray="4 4"
        pointerEvents="none"
      />
    );
  }

  if (state.kind === "slab-pending") {
    const points = state.vertices.map(mapping.project);
    if (points.length < 1) return null;
    const lineSegments = points.slice(1).map((p, i) => {
      const prev = points[i];
      return <line key={i} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y} stroke="#3b82f6" strokeWidth={1.5} pointerEvents="none" />;
    });
    const dots = points.map((p, i) => (
      <circle key={`v-${i}`} cx={p.x} cy={p.y} r={3} fill="#3b82f6" pointerEvents="none" />
    ));
    return (
      <g>
        {lineSegments}
        {dots}
      </g>
    );
  }

  return null;
}
```

### Step 5: Run tests + build

```bash
bun run test src/__tests__/components/canvas/useCreateHandlers.test.tsx
bun run build
```

Expected: 9 tests pass, build green.

### Step 6: Commit

```bash
git add src/components/canvas/useCreateHandlers.ts src/components/canvas/createPreview.tsx src/__tests__/components/canvas/useCreateHandlers.test.tsx
git commit -m "feat(canvas): useCreateHandlers hook + CreatePreview SVG"
```

## Context

- **Working directory:** `/Users/zero/code/houseclaw`
- **Branch:** `main`
- **Previous commit (BASE):** `ceb0778` (P4C-β final)

## Strict isolation

This task touches ONLY:
- `src/components/canvas/useCreateHandlers.ts` (create)
- `src/components/canvas/createPreview.tsx` (create)
- `src/__tests__/components/canvas/useCreateHandlers.test.tsx` (create)

NO modifications to other files. DrawingSurface2D will integrate the hook in Task 2.

## Self-Review

- 9 tests pass?
- `bun run build` green?
- Only 3 files touched?
- Commit message exact: `feat(canvas): useCreateHandlers hook + CreatePreview SVG`?

## Report

Status, what implemented, test results, files changed, commit SHA, concerns.

---

## Task 2: DrawingSurface2D 接通 useCreateHandlers + 鼠标移动跟踪

**Files:**
- Modify: `src/components/DrawingSurface2D.tsx`

### Step 1: Read current `src/components/DrawingSurface2D.tsx`

### Step 2: Apply edits

**Edit 2a — Add imports:**

```typescript
import { useState } from "react";
import { useCreateHandlers } from "./canvas/useCreateHandlers";
import { CreatePreview } from "./canvas/createPreview";
import type { Point2D } from "./canvas/types";
```

(`useState` may already be imported.)

**Edit 2b — Inside `DrawingSurface2D` body, after `useViewport` hook**, add:

```typescript
const [cursorWorld, setCursorWorld] = useState<Point2D | null>(null);

const planStoreyId = planStoreyIdFromView(project.activeView, project.storeys);
const createHandlers = useCreateHandlers({
  project,
  storeyId: planStoreyId,
  dispatch: (action) => {
    // The DrawingSurface2D doesn't own dispatch — caller does. Wire via a callback.
    // ... we need to rethink this — see Edit 2c.
  },
});
```

**Wait — DrawingSurface2D doesn't currently take a `dispatch` prop.** It takes `onSelect` only. We need to add `dispatch` to its prop signature.

**Edit 2c — Update prop signature:**

Find:
```typescript
type DrawingSurface2DProps = {
  project: ProjectStateV2;
  onSelect: (selection: SelectionV2) => void;
};
```

Replace with:
```typescript
import type { ProjectActionV2, ProjectStateV2, SelectionV2 } from "../app/v2/projectReducer";

type DrawingSurface2DProps = {
  project: ProjectStateV2;
  onSelect: (selection: SelectionV2) => void;
  dispatch: (action: ProjectActionV2) => void;
};
```

**Edit 2d — Use the dispatch in the useCreateHandlers call:**

```typescript
const createHandlers = useCreateHandlers({
  project,
  storeyId: planStoreyId,
  dispatch,
});
```

**Edit 2e — Update the SVG `onClick` handler** to route through createHandlers BEFORE selection:

Find the existing onClick:
```typescript
        onClick={(event) => {
          if (event.target === event.currentTarget) onSelect(undefined);
        }}
```

Replace with:
```typescript
        onPointerMove={(event) => {
          panHandlers.onPointerMove(event);
          // Track cursor in world coords for create previews
          if (planStoreyId) {
            // We need the planMapping to unproject — only available after createPointMapping
            // Skip if mapping not yet computed (handled below).
          }
        }}
        onClick={(event) => {
          // If create handler consumed the click, don't deselect.
          // Determine click hit: if event.target is an SVG element with data-kind/data-id, use that.
          // For P4C-γ1, hit detection is simplified: click on plan only, hit info derived from event.target dataset.
          const target = event.target as SVGElement;
          const hitKind = target.getAttribute("data-kind");
          const hitId = target.getAttribute("data-id");
          let hit: SelectionV2 = undefined;
          if (hitKind === "wall" && hitId) hit = { kind: "wall", wallId: hitId };
          // Compute world point. For now, use the cursor's world position (set by onPointerMove).
          if (cursorWorld) {
            const handled = createHandlers.handleCanvasClick(cursorWorld, hit);
            if (handled) return;
          }
          // Fallback: if click on empty SVG background, deselect.
          if (event.target === event.currentTarget) onSelect(undefined);
        }}
        onKeyDown={(event) => {
          createHandlers.handleKeyDown(event.key);
        }}
        tabIndex={0}
```

Notice we added `tabIndex={0}` to the SVG so it can receive keyboard focus + key events.

**Edit 2f — Track cursor in world coordinates.** This requires `planMapping` (or `elevationMapping` etc.) which is computed deeper in the function. Restructure: extract the mapping computation up so we can use it in the pointermove handler. Specifically, after the body computation that produces `body`, the mapping should be exposed. Easiest:

Lift the `mapping` computation to a const `const currentMapping: PointMapping | undefined = ...` and use it in `onPointerMove`:

```typescript
let body: React.ReactElement;
let currentMapping: PointMapping | undefined = undefined;
if (planStoreyId) {
  const projection = projectPlanV2(project, planStoreyId);
  currentMapping = createPointMapping(planBounds(projection));
  body = renderPlan({ ... });
} else if ...
```

Then in `onPointerMove`:

```typescript
onPointerMove={(event) => {
  panHandlers.onPointerMove(event);
  if (currentMapping && svgRef.current) {
    const ctm = svgRef.current.getScreenCTM();
    if (ctm) {
      const pt = svgRef.current.createSVGPoint();
      pt.x = event.clientX;
      pt.y = event.clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      setCursorWorld(currentMapping.unproject({ x: transformed.x, y: transformed.y }));
    }
  }
}}
```

**Edit 2g — Render CreatePreview inside the SVG**, alongside `body`:

```typescript
<svg ... >
  <GridOverlay ... />
  {body}
  {currentMapping ? (
    <CreatePreview
      state={createHandlers.state}
      mapping={currentMapping}
      cursorWorld={cursorWorld ?? undefined}
    />
  ) : null}
  <ScaleRuler ... />
</svg>
```

**Edit 2h — Add `data-kind` and `data-id` attributes to renderPlan's wall segments + opening glyphs** so the click handler can identify hits.

Open `src/components/canvas/renderPlan.tsx`. Find the wall rendering loop. Add `data-kind="wall" data-id={wallSeg.wallId}` to the wall element. Same for openings if needed (door tool needs to hit walls; opening on opening doesn't make sense).

Specifically, find wall rendering like:
```tsx
<rect ... />
```

Change to:
```tsx
<rect data-kind="wall" data-id={wallSeg.wallId} ... />
```

(Adjust to match the actual shape used.)

### Step 3: Run build + tests

```bash
bun run build
bun run test
```

Expected: green.

### Step 4: Commit

```bash
git add src/components/DrawingSurface2D.tsx src/components/canvas/renderPlan.tsx
git commit -m "feat(canvas): DrawingSurface2D wires useCreateHandlers + cursor tracking"
```

## Context

- **Working directory:** `/Users/zero/code/houseclaw`
- **Branch:** `main`
- **Previous commit (BASE):** `[T1 commit]`

## Strict isolation

This task touches:
- `src/components/DrawingSurface2D.tsx` (modify)
- `src/components/canvas/renderPlan.tsx` (add data-kind/data-id attributes)

NO modifications to other files.

## Self-Review

- DrawingSurface2D compiles and renders without errors?
- Click on a wall in plan view (wall tool inactive) still selects?
- Activate wall tool → 2 clicks creates a wall?
- `bun run build` green?
- `bun run test` green?

## Report

Status, what implemented, test results, files changed, commit SHA.

---

## Task 3: AppShell wires dispatch into DrawingSurface2D

**Files:**
- Modify: `src/components/AppShell.tsx`

DrawingSurface2D now requires a `dispatch` prop. AppShell currently passes only `project` and `onSelect`. Add `dispatch={dispatch}`.

### Step 1: Apply edit

In `src/components/AppShell.tsx`, find:

```tsx
              <DrawingSurface2D
                project={project}
                onSelect={(selection) => dispatch({ type: "select", selection })}
              />
```

Replace with:

```tsx
              <DrawingSurface2D
                project={project}
                onSelect={(selection) => dispatch({ type: "select", selection })}
                dispatch={dispatch}
              />
```

### Step 2: Run build + tests

```bash
bun run build
bun run test
```

Expected: green.

### Step 3: Commit

```bash
git add src/components/AppShell.tsx
git commit -m "feat(components): AppShell passes dispatch to DrawingSurface2D"
```

## Self-Review

- 1 file touched?
- `bun run build` green?
- Commit message exact?

## Report

Status, what implemented, files changed, commit SHA.

---

## Task 4: Roof tool — "+ 创建屋顶" button in ToolPalette

**Files:**
- Modify: `src/components/ToolPalette.tsx`

When `activeTool === "roof"`, show a `+ 创建屋顶` button. Clicking it dispatches `add-roof` with a default Roof shape derived from the project's exterior wall bbox + top storey base + default pitch/overhang.

### Step 1: Update `src/components/ToolPalette.tsx`

The current ToolPalette is small (~42 LOC). It probably renders a list of tool buttons. Add:
- A `dispatch` and `project` prop (currently only takes `activeTool` + `onChange`)
- When `activeTool === "roof"`, render a "+ 创建屋顶" button below the tool list. Click handler creates and dispatches the roof.

**Edit 1a — Update prop signature:**

```typescript
import type { ProjectActionV2, ProjectStateV2 } from "../app/v2/projectReducer";

type ToolPaletteProps = {
  project: ProjectStateV2;
  activeTool: string;
  onChange: (toolId: string) => void;
  dispatch: (action: ProjectActionV2) => void;
};
```

**Edit 1b — Add a helper function in the component (or above) to build a default roof:**

```typescript
function buildDefaultRoof(project: ProjectStateV2) {
  const exterior = project.walls.filter((w) => w.exterior);
  if (exterior.length === 0) return undefined;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of exterior) {
    for (const p of [w.start, w.end]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const overhang = 0.5;
  const polygon = [
    { x: minX - overhang, y: minY - overhang },
    { x: maxX + overhang, y: minY - overhang },
    { x: maxX + overhang, y: maxY + overhang },
    { x: minX - overhang, y: maxY + overhang },
  ];
  // Top storey for base anchor
  const topStorey = [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
  if (!topStorey) return undefined;
  // Pick first roof material, fallback to first material
  const roofMaterial = project.materials.find((m) => m.kind === "roof") ?? project.materials[0];
  return {
    id: `roof-${Date.now().toString(36)}`,
    polygon,
    base: { kind: "storey" as const, storeyId: topStorey.id, offset: 0 },
    edges: ["eave", "gable", "eave", "gable"] as Array<"eave" | "gable" | "hip">,
    pitch: Math.PI / 6,
    overhang,
    materialId: roofMaterial.id,
  };
}
```

**Edit 1c — In the JSX, after the tool list buttons, conditionally render:**

```tsx
{activeTool === "roof" ? (
  <button
    type="button"
    className="tool-action-button"
    onClick={() => {
      const roof = buildDefaultRoof(project);
      if (roof) dispatch({ type: "add-roof", roof });
    }}
  >
    + 创建屋顶
  </button>
) : null}
```

### Step 2: Update `src/components/AppShell.tsx`

The ToolPalette call needs the new `project` and `dispatch` props:

Find:
```tsx
              <ToolPalette
                activeTool={project.activeTool}
                onChange={(toolId) => dispatch({ type: "set-tool", toolId })}
              />
```

Replace with:
```tsx
              <ToolPalette
                project={project}
                activeTool={project.activeTool}
                onChange={(toolId) => dispatch({ type: "set-tool", toolId })}
                dispatch={dispatch}
              />
```

### Step 3: Append CSS

Append to `src/styles.css`:

```css

/* P4C-γ1: Tool action button (e.g. "+ 创建屋顶") */
.tool-action-button {
  margin-top: 12px;
  padding: 6px 12px;
  border: 1px solid #3b82f6;
  background: #eff6ff;
  color: #1e40af;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9em;
}
.tool-action-button:hover {
  background: #dbeafe;
}
```

### Step 4: Run build + tests

```bash
bun run build
bun run test
```

Expected: green.

### Step 5: Commit

```bash
git add src/components/ToolPalette.tsx src/components/AppShell.tsx src/styles.css
git commit -m "feat(components): roof tool 'add roof' button"
```

## Self-Review

- 3 files touched?
- `bun run build` green?
- Commit message exact?

## Report

Status, what implemented, files changed, commit SHA.

---

## Task 5: Final sweep + browser smoke

### Step 1: Full test

```bash
bun run test
```

Expected: all tests + 6 skipped pass.

### Step 2: Build

```bash
bun run build
```

Expected: green.

### Step 3: File count

```bash
git diff [P4C-β-final]..HEAD --stat
```

Expected: ~6 files modified/added.

### Step 4: Manual smoke

User opens browser:
- 2D mode plan-1f
- Click "wall" tool button → tool active
- Click two points on canvas → see preview line during second-point hover, click → wall created
- Click "door" tool → click on existing wall → door appears at click position (offset rounded to wall geometry)
- Click "slab" tool → click 4 corners → press Enter → slab created
- Click "roof" tool → "+ 创建屋顶" button appears in toolbar → click → default roof appears at top storey + bbox of exterior walls
- All operations reflect in 3D preview when switching back

---

## Done Criteria

- `bun run test` 全套绿
- `bun run build` 全套绿
- 浏览器：5 种 tool（wall / door / window / opening / slab / roof）创建流程都跑通
- v1 + 已落 v2 代码（domain/v2、geometry/v2、projection/v2、rendering/v2）字面零修改

## P4C-γ1 不做（明确边界）

- 拖拽编辑（move wall endpoint, drag opening, etc.）→ P4C-γ2
- Stair / balcony tool create → 后续 polish（涉及更多上下文）
- Material 工具（涂刷模式）→ 后续 polish
- 网格吸附 / smart guides → 后续 polish
- 重启用 6 个 v1 UI skip 测试 → P4C-γ3
- Elevation / roof view 的 tool create → polish

## 风险

1. **DrawingSurface2D 的 hit detection 用 data-kind/data-id 属性**，依赖 renderPlan 等组件加上这些 attribute。如果 attribute 漏加 → 点击落空 / 错误。Task 2 specifically 要求 renderPlan 加上。
2. **cursor world tracking** 仅在 plan 视图 work。Elevation / roof view 的 mapping 不同，需要单独处理 — 留 polish。
3. **mutation 抛错 → React 渲染崩溃**：当前 try-catch 只在 NumberField onCommit；create flow 直接 dispatch 没包装。Manual smoke 要测："创建一个会撞 assertValidProject 的对象"会不会崩浏览器。如果会，加 try-catch。
