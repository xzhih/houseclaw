# P4B: 扁平 3D 原型 — 2D 投影显示 + 选中态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 2D 视图（plan / elevation / roof view）接通 v2 投影。**P4B 只做显示和点击选中**，所有拖拽编辑、工具点击交互都还是 inert（保留 v2 mutations 给 P4C）。完成后用户能在浏览器 2D 模式下切换 plan-1f / plan-2f / elevation-front 等视图，看到 v2 sample 的几何投影，点击对象会高亮。

**Architecture:** in-place 重写 `src/components/canvas/render{Plan,Elevation,RoofView}.tsx` 让它们消费 v2 投影类型；in-place 重写 `DrawingSurface2D.tsx` orchestrator；`ToolPalette` 调整工具列表（删 skirt、添加 slab/roof，按钮 inert）；`AppShell` 在 2D 模式下渲染 DrawingSurface2D + ToolPalette + ViewTabs；`renderUtils.ts` 的 bounds 计算函数适配 v2 类型。

**Tech Stack:** TypeScript 5、React 19、SVG（DrawingSurface2D 用纯 SVG，不引 Canvas）、vitest。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-flat-primitive-refactor-design.md` §3、§5.1。

**关键决策：**
- **不接通 dragMachine / useDragHandlers**（v1 那 1100 LOC 的拖拽编辑机器留 P4C 适配 v2 mutations）—— P4B 的 SVG 只接 click 事件 → dispatch select。pan/zoom（pointerDown + drag）保留，因为它纯视觉、不依赖 mutations。
- **edge kind 视觉笔触**（roof view 的 eave / gable / hip 用粗线/细线/点划线区分）**先简化**为统一线宽 + 颜色编码（eave 黑实线、gable 灰细线、hip 蓝点划线 via `stroke-dasharray`）。完整笔触系统留 v2.1 polish。
- **smartGuides / SmartGuides** P4B 暂不显示（v1 用来辅助拖拽，P4B 没拖拽就不需要）。
- **重新启用** P4A 期间 skip 掉的 `propertyEditing.test.tsx` / `elevationAdd.test.tsx` 等 v1 UI 测试 —— P4B 不接通这些功能，所以它们继续 skip。P4C 才会一并打开。

---

## File Structure

修改（in-place）：

- `src/components/canvas/renderPlan.tsx` — 消费 `PlanProjectionV2`，删 skirts，加 slab outline 渲染
- `src/components/canvas/renderElevation.tsx` — 消费 `ElevationProjectionV2`，删 skirts，加 slabLines 渲染，按 depth 排序绘制
- `src/components/canvas/renderRoofView.tsx` — 消费 `RoofViewProjectionV2`，多 polygon + edge stroke + ridge lines
- `src/components/canvas/renderUtils.ts` — bounds/mapping helpers 适配 v2 类型
- `src/components/DrawingSurface2D.tsx` — 全面重写为 v2 orchestrator + select-only click handler
- `src/components/ToolPalette.tsx` — tools 列表调整：skirt 出 → slab + roof 入，按钮 inert
- `src/components/AppShell.tsx` — 2D 模式渲染 DrawingSurface2D + ToolPalette + ViewTabs (现在只渲染 Preview3D + 占位)
- `src/components/ViewTabs.tsx` — 适配 v2 storeys / view ids
- `src/components/canvas/SmartGuides.tsx` — 暂时返回 null（P4B 无拖拽就无 guides）

不动：v1 投影 (`src/projection/*.ts`) 但**它们成为孤儿**（不再被 import）。所有 v2 已落代码（domain/v2、geometry/v2、projection/v2、rendering/v2）字面零修改。

P4B 结束后：
- `bun run test` 全套绿（继续 skip 现有 6 个 v1 UI 测试）
- `bun run build` 全绿
- `bun run dev` 浏览器 2D 模式可见 v2 sample 的 plan-1f / plan-2f / elevation-front / etc / roof view，点击对象 → SVG 高亮

---

## Task 1: renderPlan v2

**Files:**
- Modify: `src/components/canvas/renderPlan.tsx`
- Modify: `src/components/canvas/renderUtils.ts` (adapt `planBounds` to v2)

The v1 `renderPlan.tsx` (457 LOC) consumes `PlanProjection` from `../../projection/types`. v2 has `PlanProjectionV2` from `../../projection/v2/types` with these key differences:
- `PlanProjectionV2` adds `slabOutlines: PlanSlabOutline[]` (new)
- v1 `skirts: PlanSkirtRect[]` is REMOVED in v2
- `PlanStairSymbolV2` has `stairId` (was `storeyId` in v1)
- `cutZ` and `storeyId` are top-level fields (informational; render layer uses for label)
- All other field shapes (wallSegments / openings / balconies) are name-compatible

Approach: read v1 `renderPlan.tsx`, change imports to v2, drop the skirt rendering block, add a slab-outline rendering block (light fill or dashed inner outline), update `PlanStairSymbol` field references. `renderUtils.ts`'s `planBounds(projection)` needs to also account for slab polygons in addition to walls.

- [ ] **Step 1: Read v1 renderPlan.tsx to understand structure**

Read `src/components/canvas/renderPlan.tsx` end-to-end.

- [ ] **Step 2: Apply edits to renderPlan.tsx**

Major edits:

**Edit 2a — Replace import.** Find:

```typescript
import type {
  PlanBalconyGlyph,
  PlanOpeningGlyph,
  PlanProjection,
  PlanSkirtRect,
  PlanStairSymbol,
  PlanWallSegment,
} from "../../projection/types";
```

Replace with:

```typescript
import type {
  PlanBalconyGlyphV2,
  PlanOpeningGlyphV2,
  PlanProjectionV2,
  PlanSlabOutline,
  PlanStairSymbolV2,
  PlanWallSegmentV2,
} from "../../projection/v2/types";
```

**Edit 2b — Update prop type and any local references.** Anywhere `PlanProjection` appears in props or signatures, replace with `PlanProjectionV2`. Same for `PlanWallSegment` → `PlanWallSegmentV2`, `PlanOpeningGlyph` → `PlanOpeningGlyphV2`, `PlanBalconyGlyph` → `PlanBalconyGlyphV2`, `PlanStairSymbol` → `PlanStairSymbolV2`.

**Edit 2c — Update PlanStairSymbol references.** Where v1 read `stair.storeyId`, change to `stair.stairId`.

**Edit 2d — Delete skirt rendering block.** Find the section that iterates `projection.skirts` and renders `PlanSkirtRect[]`. Remove it. Also remove any imports of `PlanSkirtRect`.

**Edit 2e — Add slab outline rendering.** After the wall segments rendering block, add a new section that iterates `projection.slabOutlines: PlanSlabOutline[]`. Each slab has `outline: Point2[]`, `holes: Point2[][]`, `role: "floor" | "intermediate"`. Render the outline as a `<path>` with `fill="rgba(189, 189, 189, 0.15)"` for floor role, dashed stroke for intermediate. Holes render as inner `<path>` cutouts (use SVG `fill-rule="evenodd"` or path even-odd subpath direction).

Suggested SVG snippet for the slab block:

```tsx
{projection.slabOutlines.map((slab) => {
  const outerD = slabPolygonToPath(slab.outline.map(mapping.project));
  const holesD = slab.holes
    .map((hole) => slabPolygonToPath(hole.map(mapping.project)))
    .join(" ");
  return (
    <path
      key={`slab-${slab.slabId}`}
      d={`${outerD} ${holesD}`}
      fillRule="evenodd"
      fill={slab.role === "floor" ? "rgba(189, 189, 189, 0.15)" : "transparent"}
      stroke="rgba(0, 0, 0, 0.3)"
      strokeWidth={1}
      strokeDasharray={slab.role === "intermediate" ? "4 4" : undefined}
      pointerEvents="none"
    />
  );
})}
```

(Helper `slabPolygonToPath` constructs an SVG path string from a polygon. If a similar helper exists in renderUtils, reuse it; otherwise inline a small one.)

**Edit 2f — Update click handler dispatch.** Wherever the v1 code calls `onSelect({ kind: "skirt", skirtId })`, remove that branch. Add `onSelect({ kind: "slab", slabId })` for click on slab outlines (skip in P4B if it's tricky to add; slab selection comes in P4C).

- [ ] **Step 3: Apply edits to renderUtils.ts**

The v1 `planBounds(projection: PlanProjection)` function reads `projection.wallSegments` etc. for the bbox.

**Edit 3a — Update import.** At the top:

```typescript
import type {
  ElevationProjection,
  ElevationSide,
  PlanBalconyGlyph,
  PlanOpeningGlyph,
  PlanProjection,
  PlanStairSymbol,
  PlanWallSegment,
} from "../../projection/types";
```

Replace with:

```typescript
import type {
  ElevationProjectionV2,
  ElevationSide,
  PlanBalconyGlyphV2,
  PlanOpeningGlyphV2,
  PlanProjectionV2,
  PlanSlabOutline,
  PlanStairSymbolV2,
  PlanWallSegmentV2,
} from "../../projection/v2/types";
```

**Edit 3b — Update `planBounds(projection: PlanProjection)`** signature and body to take `PlanProjectionV2`. The body iterates wallSegments + balconies + stairs + slabs (now) — include slab.outline + slab.holes points in the bbox iteration. Drop skirt iteration.

**Edit 3c — Update `elevationBounds(projection: ElevationProjection)`** to `ElevationProjectionV2`. Iterate wallBands + slabLines + roofPolygons (note v2 has roofPolygons array, not optional roof + skirts). Drop skirt iteration.

- [ ] **Step 4: Run build**

Run: `bun run build`
Expected: tsc errors will surface from DrawingSurface2D.tsx (which still imports v1). For now, focus on getting renderPlan.tsx + renderUtils.ts to compile in isolation.

If errors appear in DrawingSurface2D.tsx that block this task, **stop here and report PARTIAL** — Task 4 will fix DrawingSurface2D.

If errors are inside renderPlan.tsx or renderUtils.ts, fix them before commit.

- [ ] **Step 5: Run tests**

Run: `bun run test`
Expected: existing tests + 6 skipped still pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/canvas/renderPlan.tsx src/components/canvas/renderUtils.ts
git commit -m "feat(canvas): renderPlan + renderUtils consume v2 projection"
```

(Note: T4 will fix any DrawingSurface2D-side compile errors that this task introduces.)

---

## Task 2: renderElevation v2

**Files:**
- Modify: `src/components/canvas/renderElevation.tsx`

The v1 `renderElevation.tsx` (177 LOC) consumes `ElevationProjection`. v2 `ElevationProjectionV2`:
- Adds `slabLines: ElevationSlabLine[]` (new — horizontal lines per slab top)
- Adds `depth` field on every projected element (for back-to-front sort)
- Drops `skirts`
- `roofPolygons` is now an array, not optional, with each polygon carrying `roofId` and `kind: "panel" | "gable"` and `depth`

Approach: read v1, replace imports + types, drop skirt block, add slab line rendering, sort all renderables by depth descending so back-most paints first (occluded by closer objects).

- [ ] **Step 1: Read v1 renderElevation.tsx**

Read `src/components/canvas/renderElevation.tsx`.

- [ ] **Step 2: Apply edits**

**Edit 2a — Replace import.** Update from `projection/types` to `projection/v2/types`. Replace `ElevationProjection` → `ElevationProjectionV2`, `ElevationOpeningRect` → `ElevationOpeningRectV2`, `ElevationBalconyRect` → `ElevationBalconyRectV2`, `ElevationWallBand` → `ElevationWallBandV2`, `ElevationRoofPolygon` → `ElevationRoofPolygonV2`.

**Edit 2b — Drop skirt rendering block.**

**Edit 2c — Sort wall bands by depth descending** before rendering, so back walls paint first and front walls overlay them:

```tsx
const sortedBands = [...projection.wallBands].sort((a, b) => b.depth - a.depth);
```

Use `sortedBands` in the existing wall-band map.

**Edit 2d — Render `slabLines`.** After the wall band block, add:

```tsx
{projection.slabLines.map((line) => {
  const a = mapping.project({ x: line.start.x, y: line.start.y });
  const b = mapping.project({ x: line.end.x, y: line.end.y });
  return (
    <line
      key={`slab-${line.slabId}`}
      x1={a.x} y1={a.y} x2={b.x} y2={b.y}
      stroke="rgba(0, 0, 0, 0.4)"
      strokeWidth={1}
      pointerEvents="none"
    />
  );
})}
```

**Edit 2e — `roofPolygons` is now an iterable array** (not `roof? + skirts?`). Replace any v1 conditional `roof &&` access with a single iteration of `projection.roofPolygons`. Keep the `kind` distinction for visual style (e.g. roof panels filled solid, gables outlined).

- [ ] **Step 3: Run build**

Run: `bun run build`
Expected: still has DrawingSurface2D errors (T4 fixes them). renderElevation.tsx itself should compile.

- [ ] **Step 4: Commit**

```bash
git add src/components/canvas/renderElevation.tsx
git commit -m "feat(canvas): renderElevation consumes v2 projection (depth-sorted)"
```

---

## Task 3: renderRoofView v2

**Files:**
- Modify: `src/components/canvas/renderRoofView.tsx`

The v1 file (115 LOC) consumes the v1 roof view shape. v2 has `RoofViewProjectionV2` from `../../projection/v2/types`:
- `polygons: RoofViewPolygon[]` (multi-roof; v1 was singleton)
- Each polygon has `vertices`, `edges: RoofViewEdgeStroke[]`, `ridgeLines: RoofViewRidgeLine[]`
- Each edge has `kind: "eave" | "gable" | "hip"`

For visual differentiation in P4B (simplified — full styling polish in v2.1):
- `eave`: black solid stroke, width 2
- `gable`: gray solid stroke, width 1
- `hip`: blue stroke with dasharray "6 4", width 1

Approach: read v1, fully rewrite to consume v2 multi-polygon shape, add edge kind branching, add ridge line rendering as gray dashed.

- [ ] **Step 1: Read v1 renderRoofView.tsx**

- [ ] **Step 2: Replace the file with this exact content**

```typescript
import type { RoofViewEdgeStroke, RoofViewPolygon, RoofViewProjectionV2 } from "../../projection/v2/types";
import type { Point2D, PointMapping } from "./types";

type RenderRoofViewProps = {
  projection: RoofViewProjectionV2;
  mapping: PointMapping;
  selectedRoofId?: string;
  onSelectRoof?: (roofId: string) => void;
};

function strokeStyleForEdgeKind(kind: RoofViewEdgeStroke["kind"]): {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
} {
  if (kind === "eave") return { stroke: "#222", strokeWidth: 2 };
  if (kind === "gable") return { stroke: "#888", strokeWidth: 1 };
  // hip
  return { stroke: "#3b82f6", strokeWidth: 1, strokeDasharray: "6 4" };
}

function pathD(points: Point2D[]): string {
  if (points.length === 0) return "";
  const head = `M ${points[0].x} ${points[0].y}`;
  const tail = points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
  return `${head} ${tail} Z`;
}

export function renderRoofView({
  projection,
  mapping,
  selectedRoofId,
  onSelectRoof,
}: RenderRoofViewProps): JSX.Element {
  return (
    <g className="roof-view-layer">
      {projection.polygons.map((poly: RoofViewPolygon) => {
        const projected = poly.vertices.map(mapping.project);
        const isSelected = poly.roofId === selectedRoofId;
        return (
          <g key={`roof-${poly.roofId}`} className="roof-view-polygon">
            {/* Outline fill (light gray, click target) */}
            <path
              d={pathD(projected)}
              fill={isSelected ? "rgba(96, 165, 250, 0.25)" : "rgba(220, 220, 220, 0.4)"}
              stroke="none"
              onClick={() => onSelectRoof?.(poly.roofId)}
              style={{ cursor: onSelectRoof ? "pointer" : "default" }}
            />
            {/* Per-edge stroke with kind-specific style */}
            {poly.edges.map((edge, i) => {
              const a = mapping.project(edge.from);
              const b = mapping.project(edge.to);
              const style = strokeStyleForEdgeKind(edge.kind);
              return (
                <line
                  key={`edge-${i}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.strokeDasharray}
                  pointerEvents="none"
                />
              );
            })}
            {/* Ridge lines (dashed gray) */}
            {poly.ridgeLines.map((ridge, i) => {
              const a = mapping.project(ridge.from);
              const b = mapping.project(ridge.to);
              return (
                <line
                  key={`ridge-${i}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="#666"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  pointerEvents="none"
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
```

**Note:** This file uses `JSX.Element` return type — if your TypeScript config doesn't expose JSX globals, change to `React.ReactElement`. Confirm by inspecting other canvas/render*.tsx files for the convention they use.

- [ ] **Step 3: Update `renderUtils.ts` to add `roofViewBounds` helper**

Append to `src/components/canvas/renderUtils.ts`:

```typescript
import type { RoofViewProjectionV2 } from "../../projection/v2/types";

export function roofViewBounds(projection: RoofViewProjectionV2): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of projection.polygons) {
    for (const v of poly.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}
```

- [ ] **Step 4: Run build**

Run: `bun run build`
Expected: still has DrawingSurface2D errors (T4 fixes). renderRoofView.tsx + renderUtils.ts compile cleanly.

- [ ] **Step 5: Commit**

```bash
git add src/components/canvas/renderRoofView.tsx src/components/canvas/renderUtils.ts
git commit -m "feat(canvas): renderRoofView consumes v2 (multi-roof + edge kinds)"
```

---

## Task 4: DrawingSurface2D v2 orchestrator + select-only handlers

**Files:**
- Modify: `src/components/DrawingSurface2D.tsx`
- Modify (or remove unused imports): `src/components/canvas/SmartGuides.tsx` may need to render null for now

Replace the v1 orchestration logic with v2. **Drop dragMachine / useDragHandlers** — those reference v1 mutations and live in `src/components/canvas/{dragMachine,dragState,useDragHandlers}.ts`. They stay in repo for P4C revival but DrawingSurface2D no longer imports them.

For pan/zoom (`useViewport`): keep as-is (it's pure visual, doesn't depend on project shape).

For click-to-select: implement directly in DrawingSurface2D as a simple `onClick` on each renderable.

The new DrawingSurface2D receives a v2 `ProjectStateV2` plus `onSelect: (selection: SelectionV2) => void`.

- [ ] **Step 1: Replace `src/components/DrawingSurface2D.tsx` with this content**

```typescript
import { useRef, type PointerEvent } from "react";
import type { ProjectStateV2, SelectionV2 } from "../app/v2/projectReducer";
import { projectElevationV2 } from "../projection/v2/elevation";
import { projectPlanV2 } from "../projection/v2/plan";
import { projectRoofViewV2 } from "../projection/v2/roofView";
import { GridOverlay } from "./canvas/GridOverlay";
import { ScaleRuler } from "./canvas/ScaleRuler";
import { ZoomControls } from "./canvas/ZoomControls";
import {
  ELEVATION_SIDE_BY_VIEW,
  SURFACE_HEIGHT,
  SURFACE_WIDTH,
  createPointMapping,
  elevationBounds,
  planBounds,
  roofViewBounds,
} from "./canvas/renderUtils";
import { renderElevation } from "./canvas/renderElevation";
import { renderPlan } from "./canvas/renderPlan";
import { renderRoofView } from "./canvas/renderRoofView";
import { DEFAULT_VIEWPORT, useViewport } from "./canvas/useViewport";

type DrawingSurface2DProps = {
  project: ProjectStateV2;
  onSelect: (selection: SelectionV2) => void;
};

function planStoreyIdFromView(viewId: string, storeys: { id: string }[]): string | undefined {
  if (!viewId.startsWith("plan-")) return undefined;
  const id = viewId.slice("plan-".length);
  return storeys.find((s) => s.id === id)?.id;
}

export function DrawingSurface2D({ project, onSelect }: DrawingSurface2DProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { viewport, setViewport, isPanning, panHandlers } = useViewport(
    svgRef,
    `${project.id}|${project.activeView}`,
  );

  // Decide which projection to render based on activeView.
  const planStoreyId = planStoreyIdFromView(project.activeView, project.storeys);
  const elevationSide = ELEVATION_SIDE_BY_VIEW[project.activeView as keyof typeof ELEVATION_SIDE_BY_VIEW];
  const isRoofView = project.activeView === "roof";

  let body: React.ReactElement;
  if (planStoreyId) {
    const projection = projectPlanV2(project, planStoreyId);
    const mapping = createPointMapping(planBounds(projection));
    body = renderPlan({
      projection,
      mapping,
      selection: project.selection,
      onSelect,
    });
  } else if (elevationSide) {
    const projection = projectElevationV2(project, elevationSide);
    const mapping = createPointMapping(elevationBounds(projection));
    body = renderElevation({
      projection,
      mapping,
      selection: project.selection,
      onSelect,
    });
  } else if (isRoofView) {
    const projection = projectRoofViewV2(project);
    const mapping = createPointMapping(roofViewBounds(projection));
    body = renderRoofView({
      projection,
      mapping,
      selectedRoofId:
        project.selection?.kind === "roof" ? project.selection.roofId : undefined,
      onSelectRoof: (roofId) => onSelect({ kind: "roof", roofId }),
    });
  } else {
    body = (
      <text x={SURFACE_WIDTH / 2} y={SURFACE_HEIGHT / 2} textAnchor="middle" fill="#888">
        无视图
      </text>
    );
  }

  return (
    <div className="drawing-surface" aria-label="2D drawing surface">
      <svg
        ref={svgRef}
        width={SURFACE_WIDTH}
        height={SURFACE_HEIGHT}
        viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
        onPointerDown={panHandlers.onPointerDown}
        onPointerMove={panHandlers.onPointerMove}
        onPointerUp={panHandlers.onPointerUp}
        onClick={(event) => {
          // Click on empty SVG background → deselect.
          if (event.target === event.currentTarget) onSelect(undefined);
        }}
        style={{ cursor: isPanning ? "grabbing" : "grab", background: "#fafafa" }}
      >
        <GridOverlay viewport={viewport} />
        {body}
        <ScaleRuler viewport={viewport} />
      </svg>
      <ZoomControls
        viewport={viewport}
        defaultViewport={DEFAULT_VIEWPORT}
        onChange={setViewport}
      />
    </div>
  );
}
```

**Note on render*-tsx prop signatures:** They likely take `{ projection, mapping, selection, onSelect }`. Inspect each render file's prop signature after Tasks 1-3 land and adjust accordingly. The pattern above assumes selection is the v2 SelectionV2 union.

- [ ] **Step 2: Update render*.tsx prop signatures (if needed)**

After Tasks 1-3 complete, the render*.tsx files have v2 prop types but they may not all accept `selection` and `onSelect`. Modify their signatures to match the call site above. Specifically:
- `renderPlan({ projection, mapping, selection, onSelect })`
- `renderElevation({ projection, mapping, selection, onSelect })`
- `renderRoofView({ projection, mapping, selectedRoofId, onSelectRoof })` (already specified)

If renderPlan currently receives `selection: ObjectSelection` (v1), change the type to `selection: SelectionV2` from `app/v2/projectReducer`.

- [ ] **Step 3: Make SmartGuides.tsx render null**

`src/components/canvas/SmartGuides.tsx` is no longer used by DrawingSurface2D (no drag = no guides). Either delete the file or replace its body with `export function SmartGuides() { return null; }`. Choose delete unless it'd break some test.

(If deleting, also remove imports from anywhere else in the codebase via grep. If replacing, keep its export shape.)

- [ ] **Step 4: Run build**

```bash
bun run build
```

Expected: tsc errors should be down to zero or only in AppShell.tsx (T6 fixes). If errors remain in DrawingSurface2D or render*.tsx, fix them before commit.

- [ ] **Step 5: Run tests**

```bash
bun run test
```

Expected: all tests + 6 skipped pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/DrawingSurface2D.tsx src/components/canvas/SmartGuides.tsx
git commit -m "feat(components): DrawingSurface2D consumes v2 projections (select-only)"
```

---

## Task 5: ToolPalette v2

**Files:**
- Modify: `src/components/ToolPalette.tsx`

The v1 ToolPalette renders buttons for the tool ids `select | wall | door | window | opening | balcony | stair | skirt | material`. v2 changes:
- Drop `skirt`
- Add `slab` and `roof` (mutually exclusive — `roof` here means "create v2 Roof", different from the v1 singleton)

In P4B, **buttons are inert** (clicking dispatches `set-tool` but nothing happens beyond UI state — actual tool drag interaction is P4C).

- [ ] **Step 1: Read v1 ToolPalette.tsx**

- [ ] **Step 2: Apply edits**

**Edit 2a — Update the tool id list / type**:

If v1 has a `TOOLS = ["select", "wall", ...]` array literal, replace `"skirt"` with `"slab"` and append `"roof"`:

```typescript
const TOOLS = ["select", "wall", "door", "window", "opening", "balcony", "stair", "slab", "roof", "material"] as const;
```

Update labels:
- `slab`: "楼板"
- `roof`: "屋顶"
- `skirt` (removed): N/A

**Edit 2b — If the prop type referenced v1's `ToolId` from `domain/types`**, change to a generic string union or import from v2 reducer:

```typescript
import type { ToolIdV2 } from "../app/v2/projectReducer";
```

(If the prop is just `activeTool: string` with `onChange: (id: string) => void`, no change needed.)

- [ ] **Step 3: Run build**

```bash
bun run build
```

Expected: clean (or only AppShell errors remain).

- [ ] **Step 4: Commit**

```bash
git add src/components/ToolPalette.tsx
git commit -m "feat(components): ToolPalette v2 (skirt → slab + roof)"
```

---

## Task 6: AppShell 2D mode wiring + ViewTabs

**Files:**
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/ViewTabs.tsx`
- Modify: `src/components/ElevationSideTabs.tsx`

The current minimal AppShell renders `Preview3D` in 3D mode and a placeholder in 2D mode. P4B replaces the 2D placeholder with a real layout: `ViewTabs` (top), `DrawingSurface2D` (center), `ToolPalette` (right side).

`ViewTabs` lets the user switch among `plan-1f / plan-2f / elevation-front / ... / roof`. v2 storeys + activeView field drive this.

- [ ] **Step 1: Read v1 ViewTabs.tsx + ElevationSideTabs.tsx**

- [ ] **Step 2: Adapt ViewTabs.tsx**

ViewTabs currently expects v1 view ids. The view ids are strings in v2 too. Adjust the prop type to take `ProjectStateV2` (or just storeys + activeView + onChange).

```typescript
import type { ProjectStateV2 } from "../app/v2/projectReducer";

type ViewTabsProps = {
  project: ProjectStateV2;
  onChange: (viewId: string) => void;
};

export function ViewTabs({ project, onChange }: ViewTabsProps) {
  const planTabs = project.storeys.map((s) => ({
    id: `plan-${s.id}`,
    label: s.label,
  }));
  return (
    <div className="view-tabs" role="tablist">
      {planTabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={project.activeView === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      <button
        role="tab"
        aria-selected={project.activeView.startsWith("elevation-")}
        onClick={() => onChange("elevation-front")}
      >
        立面
      </button>
      <button
        role="tab"
        aria-selected={project.activeView === "roof"}
        onClick={() => onChange("roof")}
      >
        屋顶
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Adapt ElevationSideTabs.tsx**

When activeView is one of `elevation-{front,back,left,right}`, show this component to switch among the 4 sides. Adjust prop types similarly to ViewTabs.

- [ ] **Step 4: Update AppShell.tsx**

Replace the WIP placeholder for `mode === "2d"` with a real 2D layout:

```typescript
import { useReducer } from "react";
import { withSessionDefaults, projectReducerV2, type ProjectStateV2 } from "../app/v2/projectReducer";
import { createV2SampleProject } from "../domain/v2/sampleProject";
import { Preview3D } from "./Preview3D";
import { DrawingSurface2D } from "./DrawingSurface2D";
import { ToolPalette } from "./ToolPalette";
import { ViewTabs } from "./ViewTabs";
import { ElevationSideTabs } from "./ElevationSideTabs";

function init(): ProjectStateV2 {
  return withSessionDefaults(createV2SampleProject());
}

export function AppShell() {
  const [project, dispatch] = useReducer(projectReducerV2, undefined, init);
  const isElevation = project.activeView.startsWith("elevation-");

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
          <div className="editor-2d">
            <ViewTabs
              project={project}
              onChange={(viewId) => dispatch({ type: "set-view", viewId })}
            />
            {isElevation ? (
              <ElevationSideTabs
                activeView={project.activeView}
                onChange={(viewId) => dispatch({ type: "set-view", viewId })}
              />
            ) : null}
            <div className="editor-2d-body">
              <DrawingSurface2D
                project={project}
                onSelect={(selection) => dispatch({ type: "select", selection })}
              />
              <ToolPalette
                activeTool={project.activeTool}
                onChange={(toolId) => dispatch({ type: "set-tool", toolId })}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Add CSS for `.editor-2d` and `.editor-2d-body`**

Append to `src/styles.css`:

```css

/* P4B: 2D editor layout */
.editor-2d {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fafafa;
}
.editor-2d-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.view-tabs {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid #ddd;
  background: white;
}
.view-tabs button {
  padding: 4px 12px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
}
.view-tabs button[aria-selected="true"] {
  border-color: #999;
  background: #f0f0f0;
}
```

- [ ] **Step 6: Run build**

```bash
bun run build
```

Expected: green (or only known issues).

- [ ] **Step 7: Run tests**

```bash
bun run test
```

Expected: all tests + 6 skipped pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/AppShell.tsx src/components/ViewTabs.tsx src/components/ElevationSideTabs.tsx src/styles.css
git commit -m "feat(components): AppShell 2D mode + ViewTabs + ElevationSideTabs (v2)"
```

---

## Task 7: Final sweep + browser smoke

**Files:** None (verification only).

- [ ] **Step 1: Full test suite**

```bash
bun run test
```

Expected: all tests + 6 skipped pass.

- [ ] **Step 2: Build**

```bash
bun run build
```

Expected: tsc + vite green.

- [ ] **Step 3: Diff stat**

```bash
git diff [previous-commit]..HEAD --stat
```

Expected: ~10-12 files modified (5 in canvas/, DrawingSurface2D, ToolPalette, AppShell, ViewTabs, ElevationSideTabs, styles.css).

- [ ] **Step 4: Manual smoke**

Start `bun run dev` (or use the existing server). User opens browser:
- 3D mode: still works (P4A regression check)
- 2D mode → plan-1f: see the v2 sample's plan view (8x6 rectangle, 4 walls, slab fill, opening glyphs, stair symbol)
- 2D mode → plan-2f: same outline (since same walls span both storeys)
- 2D mode → elevation-front: see front facade with slab horizontal + roof gable triangle visible
- 2D mode → roof: see the roof outline with edge strokes (eave thick, gable thin)
- Click on a wall in plan view: SVG element highlights (selection color)

---

## Done Criteria

- `bun run test` 全套绿
- `bun run build` 全套绿
- 浏览器 2D 模式可见 plan-1f / plan-2f / elevation-front 等视图，至少能切换 ViewTabs，DrawingSurface2D 显示 v2 sample 投影
- v1 + 已落 v2 代码（domain/v2、geometry/v2、projection/v2、rendering/v2）零修改

## P4B 不做（明确边界）

- 拖拽编辑（dragMachine / useDragHandlers）→ P4C
- v2 mutations 集成 → P4C
- PropertyPanel → P4C
- Storey 列表编辑器 → P4C
- 工具栏点击产生新对象（"画墙"工具 click → 创建 wall）→ P4C
- Edge kind 完整笔触系统（粗实线 / 细线 / 点划线高质量样式）→ v2.1 polish
- SmartGuides 重启用 → P4C 拖拽时
- 重启用 P4A 期间 skip 的 6 个测试 → P4C 编辑层接通后

## 风险

1. **prop signature 不一致**：renderPlan/Elevation/RoofView 的 prop shape 必须与 DrawingSurface2D 调用点一致。Task 4 Step 2 显式提醒检查。
2. **selection 类型不匹配**：v1 用 `ObjectSelection`，v2 用 `SelectionV2`。所有传 selection 的地方必须切换。
3. **roof view 视觉 polish 不足**：edge kind 用颜色而非笔触区分会显得简陋，但 P4B 不投入这块。后续 v2.1。
