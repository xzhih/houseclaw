# Wall Drawing Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user click two points in a 2D plan view to add a new wall to the active storey, completing step 1 of the feasibility doc's minimal closed loop (`在 1F 平面画矩形外墙`).

**Architecture:** Wall drawing is purely UI state — no new domain or reducer machinery beyond reusing `addWall`. Pending first-click coordinates live as `useState` inside `DrawingSurface2D`. The existing `createPointProjector` is upgraded to `createPointMapping(bounds): { project, unproject }` so screen coords can round-trip back to world coords. When `project.activeTool === "wall"`, the SVG's `pointerdown` is intercepted: the click is converted to a world point, snapped to grid + nearest endpoint, then either stashed as the pending start or paired with the previous pending start to call `addWall(project, draft)` and dispatch `replace-project`. Element-level click handlers (walls, openings, balconies) become no-ops in wall-tool mode so selection doesn't fire concurrently. Escape clears the pending point first, then deselects.

**Tech Stack:** React + TypeScript + Vitest + RTL. No new runtime dependencies.

**Out of scope:** door / window / opening / balcony creation tools (separate plan), drag-to-resize, drag-to-move, polyline / chained wall drawing, orthogonal lock (Shift), midpoint snap, undo/redo. Step 3 of the closed loop (`加新窗`) remains open after this plan.

---

## File Structure

**New:**
- `src/domain/walls.ts` — `nextWallId`, `createWallDraft`. Pure domain helpers; no React, no SVG.
- `src/geometry/snapping.ts` — `snapToGrid`, `snapToEndpoint`, `snapPlanPoint`. Pure 2D math.
- `src/__tests__/walls.test.ts` — unit tests for `nextWallId` and `createWallDraft`.
- `src/__tests__/snapping.test.ts` — unit tests for snap helpers.
- `src/__tests__/wallDrawing.test.tsx` — RTL integration test for the two-click drawing flow.

**Modified:**
- `src/components/DrawingSurface2D.tsx` — replace projector with mapping; add pending-point state; add SVG-level `onPointerDown`; gate child click handlers on `activeTool`; add tool-status banner.
- `src/styles.css` — pending-point dot + status banner styles.
- `src/__tests__/ui.test.tsx` — one new test for the wall-tool banner visibility.
- `docs/2026-04-26-implementation-status.md` — flip step 1 of the closed-loop checklist to ✅ and update the conclusion.

---

## Task 1: Wall Identifier and Draft Helpers

**Files:**
- Create: `src/domain/walls.ts`
- Create: `src/__tests__/walls.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/walls.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSampleProject } from "../domain/sampleProject";
import { createWallDraft, nextWallId } from "../domain/walls";

describe("wall identifiers", () => {
  it("returns wall-{storeyId}-1 when no slots are used", () => {
    expect(nextWallId(createSampleProject(), "1f")).toBe("wall-1f-1");
  });

  it("returns the lowest unused slot when other walls follow the pattern", () => {
    const project = createSampleProject();
    const seeded = {
      ...project,
      walls: [
        ...project.walls,
        { ...project.walls[0], id: "wall-1f-1" },
        { ...project.walls[0], id: "wall-1f-3" },
      ],
    };

    expect(nextWallId(seeded, "1f")).toBe("wall-1f-2");
  });

  it("ignores walls on other storeys when picking a slot", () => {
    const project = createSampleProject();
    const seeded = {
      ...project,
      walls: [...project.walls, { ...project.walls[0], id: "wall-2f-1", storeyId: "2f" }],
    };

    expect(nextWallId(seeded, "1f")).toBe("wall-1f-1");
  });
});

describe("wall draft", () => {
  it("builds a wall pinned to the storey height with the project default thickness and the first wall material", () => {
    const project = createSampleProject();
    const draft = createWallDraft(project, "1f", { x: 0, y: 0 }, { x: 4, y: 0 });

    expect(draft).toMatchObject({
      id: "wall-1f-1",
      storeyId: "1f",
      start: { x: 0, y: 0 },
      end: { x: 4, y: 0 },
      thickness: project.defaultWallThickness,
      height: 3.2,
      exterior: true,
      materialId: "mat-white-render",
    });
  });

  it("falls back to defaultStoreyHeight when the storey is missing", () => {
    const project = createSampleProject();
    const broken = { ...project, storeys: [] };
    const draft = createWallDraft(broken, "1f", { x: 0, y: 0 }, { x: 1, y: 0 });

    expect(draft.height).toBe(project.defaultStoreyHeight);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `bun run test -- src/__tests__/walls.test.ts`

Expected: fail with `Failed to resolve import "../domain/walls"`.

- [ ] **Step 3: Implement `walls.ts`**

Create `src/domain/walls.ts`:

```ts
import type { HouseProject, Point2, Wall } from "./types";

const FALLBACK_WALL_MATERIAL = "mat-white-render";

function pickWallMaterialId(project: HouseProject): string {
  const walls = project.materials.filter((material) => material.kind === "wall");
  return walls[0]?.id ?? project.materials[0]?.id ?? FALLBACK_WALL_MATERIAL;
}

export function nextWallId(project: HouseProject, storeyId: string): string {
  const prefix = `wall-${storeyId}-`;
  const usedSlots = new Set<number>();
  for (const wall of project.walls) {
    if (!wall.id.startsWith(prefix)) continue;
    const suffix = Number(wall.id.slice(prefix.length));
    if (Number.isInteger(suffix) && suffix > 0) usedSlots.add(suffix);
  }

  let slot = 1;
  while (usedSlots.has(slot)) slot += 1;
  return `${prefix}${slot}`;
}

export function createWallDraft(
  project: HouseProject,
  storeyId: string,
  start: Point2,
  end: Point2,
): Wall {
  const storey = project.storeys.find((candidate) => candidate.id === storeyId);
  return {
    id: nextWallId(project, storeyId),
    storeyId,
    start,
    end,
    thickness: project.defaultWallThickness,
    height: storey?.height ?? project.defaultStoreyHeight,
    exterior: true,
    materialId: pickWallMaterialId(project),
  };
}
```

- [ ] **Step 4: Verify tests pass**

Run: `bun run test -- src/__tests__/walls.test.ts`

Expected: all five tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/walls.ts src/__tests__/walls.test.ts
git commit -m "feat: add wall id and draft helpers"
```

---

## Task 2: Snap Helpers

**Files:**
- Create: `src/geometry/snapping.ts`
- Create: `src/__tests__/snapping.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/snapping.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { snapPlanPoint, snapToEndpoint, snapToGrid } from "../geometry/snapping";

describe("snapToGrid", () => {
  it("rounds both coordinates to the nearest grid cell", () => {
    expect(snapToGrid({ x: 1.234, y: 5.6789 }, 0.1)).toEqual({ x: 1.2, y: 5.7 });
  });

  it("snaps to integer cells when grid is 1", () => {
    expect(snapToGrid({ x: 0.6, y: -1.1 }, 1)).toEqual({ x: 1, y: -1 });
  });

  it("returns the input unchanged when grid size is 0 or negative", () => {
    expect(snapToGrid({ x: 1.234, y: 5.6789 }, 0)).toEqual({ x: 1.234, y: 5.6789 });
    expect(snapToGrid({ x: 1.234, y: 5.6789 }, -0.5)).toEqual({ x: 1.234, y: 5.6789 });
  });
});

describe("snapToEndpoint", () => {
  const walls = [
    { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    { start: { x: 10, y: 0 }, end: { x: 10, y: 8 } },
  ];

  it("returns the nearest endpoint when within threshold", () => {
    expect(snapToEndpoint({ x: 9.95, y: 0.05 }, walls, 0.2)).toEqual({ x: 10, y: 0 });
  });

  it("returns undefined when no endpoint is within threshold", () => {
    expect(snapToEndpoint({ x: 5, y: 5 }, walls, 0.2)).toBeUndefined();
  });

  it("returns undefined for an empty wall list", () => {
    expect(snapToEndpoint({ x: 0, y: 0 }, [], 0.2)).toBeUndefined();
  });
});

describe("snapPlanPoint", () => {
  const walls = [{ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }];

  it("prefers an endpoint snap over a grid snap when both are available", () => {
    expect(snapPlanPoint({ x: 9.93, y: 0.04 }, walls, { gridSize: 0.1, endpointThreshold: 0.2 })).toEqual({
      x: 10,
      y: 0,
    });
  });

  it("falls back to grid snap when no endpoint is in range", () => {
    expect(snapPlanPoint({ x: 4.236, y: 5.612 }, walls, { gridSize: 0.1, endpointThreshold: 0.2 })).toEqual({
      x: 4.2,
      y: 5.6,
    });
  });

  it("returns the input unchanged when both snaps are disabled", () => {
    expect(snapPlanPoint({ x: 4.236, y: 5.612 }, walls, { gridSize: 0, endpointThreshold: 0 })).toEqual({
      x: 4.236,
      y: 5.612,
    });
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `bun run test -- src/__tests__/snapping.test.ts`

Expected: fail with `Failed to resolve import "../geometry/snapping"`.

- [ ] **Step 3: Implement `snapping.ts`**

Create `src/geometry/snapping.ts`:

```ts
import type { Point2 } from "../domain/types";

type WallSegment = { start: Point2; end: Point2 };

export function snapToGrid(point: Point2, gridSize: number): Point2 {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return point;
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}

export function snapToEndpoint(
  point: Point2,
  walls: readonly WallSegment[],
  threshold: number,
): Point2 | undefined {
  if (walls.length === 0 || !Number.isFinite(threshold) || threshold <= 0) return undefined;

  let best: { point: Point2; distance: number } | undefined;
  for (const wall of walls) {
    for (const endpoint of [wall.start, wall.end]) {
      const dx = point.x - endpoint.x;
      const dy = point.y - endpoint.y;
      const distance = Math.hypot(dx, dy);
      if (distance > threshold) continue;
      if (!best || distance < best.distance) best = { point: endpoint, distance };
    }
  }

  return best?.point;
}

export type SnapOptions = {
  gridSize: number;
  endpointThreshold: number;
};

export function snapPlanPoint(
  point: Point2,
  walls: readonly WallSegment[],
  options: SnapOptions,
): Point2 {
  const endpoint = snapToEndpoint(point, walls, options.endpointThreshold);
  if (endpoint) return endpoint;
  return snapToGrid(point, options.gridSize);
}
```

- [ ] **Step 4: Verify tests pass**

Run: `bun run test -- src/__tests__/snapping.test.ts`

Expected: all nine tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/snapping.ts src/__tests__/snapping.test.ts
git commit -m "feat: add grid and endpoint snapping helpers"
```

---

## Task 3: Refactor Coordinate Mapping to Expose the Inverse

**Files:**
- Modify: `src/components/DrawingSurface2D.tsx`

This task is a pure refactor. After it, no behavior changes; tests still pass. The motivation is to make screen→world coordinate conversion possible (Task 4 needs it).

- [ ] **Step 1: Replace `createPointProjector` with `createPointMapping`**

In `src/components/DrawingSurface2D.tsx`, find:

```ts
type ProjectPoint = (point: { x: number; y: number }) => { x: number; y: number };

function createPointProjector(bounds: Bounds): ProjectPoint {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(
    (SURFACE_WIDTH - SURFACE_PADDING * 2) / width,
    (SURFACE_HEIGHT - SURFACE_PADDING * 2) / height,
  );
  const contentWidth = width * scale;
  const contentHeight = height * scale;
  const offsetX = (SURFACE_WIDTH - contentWidth) / 2;
  const offsetY = (SURFACE_HEIGHT - contentHeight) / 2;

  return (point) => ({
    x: offsetX + (point.x - bounds.minX) * scale,
    y: SURFACE_HEIGHT - offsetY - (point.y - bounds.minY) * scale,
  });
}
```

Replace with:

```ts
type Point2D = { x: number; y: number };

type PointMapping = {
  project: (point: Point2D) => Point2D;
  unproject: (point: Point2D) => Point2D;
};

function createPointMapping(bounds: Bounds): PointMapping {
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const scale = Math.min(
    (SURFACE_WIDTH - SURFACE_PADDING * 2) / width,
    (SURFACE_HEIGHT - SURFACE_PADDING * 2) / height,
  );
  const contentWidth = width * scale;
  const contentHeight = height * scale;
  const offsetX = (SURFACE_WIDTH - contentWidth) / 2;
  const offsetY = (SURFACE_HEIGHT - contentHeight) / 2;

  return {
    project: (point) => ({
      x: offsetX + (point.x - bounds.minX) * scale,
      y: SURFACE_HEIGHT - offsetY - (point.y - bounds.minY) * scale,
    }),
    unproject: (point) => ({
      x: bounds.minX + (point.x - offsetX) / scale,
      y: bounds.minY + (SURFACE_HEIGHT - point.y - offsetY) / scale,
    }),
  };
}
```

- [ ] **Step 2: Update all call sites**

Find every call to `createPointProjector(...)` in this file and replace. Each call site previously assigned to a variable named `projectPoint` (or similar) and used it as `projectPoint(somePoint)`. Now it returns a mapping object — destructure or use `.project`.

In `renderPlan(projection, selection, onSelect)`, change:

```ts
  const projectPoint = createPointProjector(planBounds(projection));
```

to:

```ts
  const { project: projectPoint } = createPointMapping(planBounds(projection));
```

In `renderElevation(projection, selection, onSelect)`, change:

```ts
  const projectPoint = createPointProjector(elevationBounds(projection));
```

to:

```ts
  const { project: projectPoint } = createPointMapping(elevationBounds(projection));
```

(Both sites use the projector identically downstream; the destructuring rename keeps the variable name `projectPoint` unchanged so the rest of the function bodies need no edits.)

- [ ] **Step 3: Verify the full test suite still passes**

Run: `bun run test`

Expected: all tests pass with no behavioral change. (The previous test count carries over.)

- [ ] **Step 4: Verify the build still succeeds**

Run: `bun run build`

Expected: `tsc --noEmit && vite build` succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/DrawingSurface2D.tsx
git commit -m "refactor: expose unproject in DrawingSurface2D coordinate mapping"
```

---

## Task 4: Wall Drawing State and Click Flow

**Files:**
- Modify: `src/components/DrawingSurface2D.tsx`
- Modify: `src/styles.css`
- Create: `src/__tests__/wallDrawing.test.tsx`

This is the meat of the plan. The DrawingSurface picks up two clicks while `activeTool === "wall"`, snaps each click, and on the second click dispatches `replace-project` with `addWall(project, draft)`.

- [ ] **Step 1: Write the failing integration test**

Create `src/__tests__/wallDrawing.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../App";

const SURFACE_WIDTH = 720;
const SURFACE_HEIGHT = 520;

function stubSvgGeometry() {
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  const originalGetScreenCTM = (SVGGraphicsElement.prototype as { getScreenCTM?: unknown }).getScreenCTM;

  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: SURFACE_WIDTH,
      bottom: SURFACE_HEIGHT,
      width: SURFACE_WIDTH,
      height: SURFACE_HEIGHT,
      toJSON() {
        return {};
      },
    } as DOMRect;
  };

  (SVGGraphicsElement.prototype as { getScreenCTM?: unknown }).getScreenCTM = function getScreenCTM() {
    return null;
  };

  return () => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    if (originalGetScreenCTM === undefined) {
      delete (SVGGraphicsElement.prototype as { getScreenCTM?: unknown }).getScreenCTM;
    } else {
      (SVGGraphicsElement.prototype as { getScreenCTM?: unknown }).getScreenCTM = originalGetScreenCTM;
    }
  };
}

describe("Wall drawing tool", () => {
  let restoreGeometry: () => void;

  beforeEach(() => {
    restoreGeometry = stubSvgGeometry();
  });

  afterEach(() => {
    restoreGeometry();
  });

  it("adds a new wall after two clicks while the wall tool is active", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "墙" }));

    const surface = screen.getByRole("group", { name: "当前 2D 结构视图" });
    fireEvent.pointerDown(surface, { clientX: 120, clientY: 460 });
    fireEvent.pointerDown(surface, { clientX: 280, clientY: 460 });

    expect(screen.getByRole("button", { name: "选择墙 wall-1f-1" })).toBeInTheDocument();
  });

  it("cancels the pending wall when the user presses Escape", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "墙" }));

    const surface = screen.getByRole("group", { name: "当前 2D 结构视图" });
    fireEvent.pointerDown(surface, { clientX: 120, clientY: 460 });

    surface.focus();
    await user.keyboard("{Escape}");

    fireEvent.pointerDown(surface, { clientX: 280, clientY: 460 });

    expect(screen.queryByRole("button", { name: "选择墙 wall-1f-1" })).not.toBeInTheDocument();
  });

  it("ignores wall-tool clicks in elevation views", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "墙" }));
    await user.click(screen.getByRole("button", { name: "正面" }));

    const surface = screen.getByRole("group", { name: "当前 2D 结构视图" });
    fireEvent.pointerDown(surface, { clientX: 120, clientY: 260 });
    fireEvent.pointerDown(surface, { clientX: 280, clientY: 260 });

    expect(screen.queryByRole("button", { name: /选择墙 wall-1f-1/ })).not.toBeInTheDocument();
  });

  it("does not select existing walls when wall tool is active", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "墙" }));

    const existing = screen.getByRole("button", { name: "选择墙 wall-front-1f" });
    await user.click(existing);

    expect(existing).toHaveAttribute("aria-pressed", "false");
  });
});
```

The `stubSvgGeometry` helper sets `getBoundingClientRect` to a 720×520 rect and forces `getScreenCTM` to return `null` so the production code falls through to the identity branch (clientX/Y === viewBox-X/Y). Tests don't depend on JSDOM's incomplete SVG matrix support.

- [ ] **Step 2: Run the failing tests**

Run: `bun run test -- src/__tests__/wallDrawing.test.tsx`

Expected: fail because the wall tool currently does nothing on clicks.

- [ ] **Step 3: Add the pending-point state, the drawing handler, and the gating logic to `DrawingSurface2D`**

Open `src/components/DrawingSurface2D.tsx`. Apply the changes below.

**3a. Add imports near the top of the file** (alongside the existing imports):

```tsx
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { addWall } from "../domain/mutations";
import { createWallDraft } from "../domain/walls";
import { snapPlanPoint } from "../geometry/snapping";
```

If `KeyboardEvent` is already imported, merge into the existing line rather than duplicating.

**3b. Add a new prop and constants** — extend `DrawingSurface2DProps`:

```tsx
type DrawingSurface2DProps = {
  project: HouseProject;
  onSelect: (selection: ObjectSelection | undefined) => void;
  onProjectChange: (project: HouseProject) => void;
};
```

Add module-level constants near the existing `SURFACE_WIDTH` block:

```tsx
const PLAN_GRID_SIZE = 0.1;
const PLAN_ENDPOINT_THRESHOLD = 0.2;
```

**3c. Add a screen-event-to-world helper** below the existing `createPointMapping`:

```tsx
function eventToViewBoxPoint(svg: SVGSVGElement, clientX: number, clientY: number): Point2D {
  const ctm = typeof svg.getScreenCTM === "function" ? svg.getScreenCTM() : null;
  if (ctm) {
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const transformed = point.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  }
  const rect = svg.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return {
      x: ((clientX - rect.left) * SURFACE_WIDTH) / rect.width,
      y: ((clientY - rect.top) * SURFACE_HEIGHT) / rect.height,
    };
  }
  return { x: clientX, y: clientY };
}
```

The fallback chain — CTM, then `getBoundingClientRect`-based rescale, then identity — keeps production correct under real CTMs while letting the JSDOM-stubbed tests use viewBox-equivalent coords.

**3d. Replace the body of `DrawingSurface2D` to wire pending state + the SVG `onPointerDown`**:

Find the existing component:

```tsx
export function DrawingSurface2D({ project, onSelect }: DrawingSurface2DProps) {
  const storeyId = PLAN_STOREY_BY_VIEW[project.activeView];
  const elevationSide = ELEVATION_SIDE_BY_VIEW[project.activeView];

  return (
    <section className="drawing-surface" aria-label="2D drawing surface">
      <svg viewBox={`0 0 ${SURFACE_WIDTH} ${SURFACE_HEIGHT}`} role="group" aria-label="当前 2D 结构视图">
        ...
      </svg>
    </section>
  );
}
```

Replace with:

```tsx
export function DrawingSurface2D({ project, onSelect, onProjectChange }: DrawingSurface2DProps) {
  const storeyId = PLAN_STOREY_BY_VIEW[project.activeView];
  const elevationSide = ELEVATION_SIDE_BY_VIEW[project.activeView];
  const wallToolActive = project.activeTool === "wall" && storeyId !== undefined;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [pendingStart, setPendingStart] = useState<Point2D | undefined>(undefined);

  useEffect(() => {
    setPendingStart(undefined);
  }, [project.activeView, project.activeTool]);

  const planSegments = storeyId
    ? project.walls.filter((wall) => wall.storeyId === storeyId).map((wall) => ({ start: wall.start, end: wall.end }))
    : [];

  const planMapping = storeyId
    ? createPointMapping(planBounds(projectPlanView(project, storeyId)))
    : undefined;

  const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (!wallToolActive || !storeyId || !svgRef.current || !planMapping) return;

    event.preventDefault();
    event.stopPropagation();

    const viewBoxPoint = eventToViewBoxPoint(svgRef.current, event.clientX, event.clientY);
    const worldRaw = planMapping.unproject(viewBoxPoint);
    const snapped = snapPlanPoint(worldRaw, planSegments, {
      gridSize: PLAN_GRID_SIZE,
      endpointThreshold: PLAN_ENDPOINT_THRESHOLD,
    });

    if (!pendingStart) {
      setPendingStart(snapped);
      return;
    }

    if (snapped.x === pendingStart.x && snapped.y === pendingStart.y) {
      // Two identical clicks would create a zero-length wall — ignore the second.
      return;
    }

    try {
      const next = addWall(project, createWallDraft(project, storeyId, pendingStart, snapped));
      onProjectChange(next);
    } finally {
      setPendingStart(undefined);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (pendingStart) {
      setPendingStart(undefined);
      return;
    }
    onSelect(undefined);
  };

  const pendingMarker =
    pendingStart && planMapping ? planMapping.project(pendingStart) : undefined;

  return (
    <section className="drawing-surface" aria-label="2D drawing surface">
      {wallToolActive ? (
        <p className="surface-banner" role="status">
          墙工具：点击两点画墙；按 Esc 取消
        </p>
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SURFACE_WIDTH} ${SURFACE_HEIGHT}`}
        role="group"
        aria-label="当前 2D 结构视图"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
      >
        <rect
          className="surface-grid"
          x="0"
          y="0"
          width={SURFACE_WIDTH}
          height={SURFACE_HEIGHT}
          onClick={() => {
            if (wallToolActive) return;
            onSelect(undefined);
          }}
        />
        {storeyId
          ? renderPlan(projectPlanView(project, storeyId), project.selection, onSelect, project.activeTool)
          : elevationSide
            ? renderElevation(projectElevationView(project, elevationSide), project.selection, onSelect, project.activeTool)
            : renderRoofPlaceholder()}
        {pendingMarker ? (
          <circle
            className="wall-pending-marker"
            cx={pendingMarker.x}
            cy={pendingMarker.y}
            r={6}
          />
        ) : null}
      </svg>
    </section>
  );
}
```

Note three structural changes:
1. The previous `tabIndex={-1}` + `onKeyDown` on the `<svg>` (added in Task 1's Escape fix) is preserved and extended — Escape now clears the pending start before falling through to deselect.
2. The surface-grid `<rect>` no-ops in wall mode so it doesn't consume the click before the SVG-level `onPointerDown`.
3. `renderPlan` and `renderElevation` now receive `project.activeTool` so they can gate their child handlers.

**3e. Update `renderPlan` and `renderElevation` to accept and respect `activeTool`**:

Find each function signature:

```tsx
function renderPlan(projection: PlanProjection, selectedObjectId: string | undefined, onSelect: DrawingSurface2DProps["onSelect"]) {
```

Change to:

```tsx
function renderPlan(
  projection: PlanProjection,
  selection: ObjectSelection | undefined,
  onSelect: DrawingSurface2DProps["onSelect"],
  activeTool: ToolId,
) {
```

(The signature already uses `selection: ObjectSelection | undefined` after Task 1; if your local file still says `selectedObjectId` then a previous task is missing — stop and escalate.)

Inside the function body, every `onClick` that calls `onSelect(...)` becomes:

```tsx
onClick={(event) => {
  if (activeTool === "wall") {
    event.stopPropagation();
    return;
  }
  onSelect({ kind: "wall", id: wall.wallId });
}}
```

And every `onKeyDown` early-bails when the wall tool is active:

```tsx
onKeyDown={(event) => {
  if (activeTool === "wall") return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onSelect({ kind: "wall", id: wall.wallId });
  }
}}
```

Apply the same `activeTool === "wall"` early-return to opening and balcony click + keyboard handlers in both `renderPlan` and `renderElevation` (the elevation surface only matters if/when wall-mode is repurposed; for now it stays consistent so child clicks never select while a tool is active).

`renderElevation`'s signature changes the same way. Body adjustments are identical.

Also update the call sites at the bottom of `DrawingSurface2D` (already shown in 3d above) to pass `project.activeTool`.

**3f. Add `Point2D` import** if it isn't already in scope. The local `Point2D` type defined inside this file (in Task 3's refactor) is already available as a local type alias.

**3g. Add `ObjectSelection` and `ToolId` to imports** if not already imported:

```tsx
import type { HouseProject, ToolId } from "../domain/types";
```

(`HouseProject` is already imported; just merge `ToolId` in. `ObjectSelection` was added in Task 1 of the prior plan and should already be present.)

- [ ] **Step 4: Add the third prop wiring in `AppShell`**

Open `src/components/AppShell.tsx`. Find the existing `<DrawingSurface2D project={project} onSelect={select} />` line. Replace with:

```tsx
<DrawingSurface2D
  project={project}
  onSelect={select}
  onProjectChange={(next) => dispatch({ type: "replace-project", project: next })}
/>
```

(The same `(next) => dispatch({ type: "replace-project", project: next })` lambda is also passed to `PropertyPanel` already; reusing it inline is fine — extracting a named callback would tighten things but is not required.)

- [ ] **Step 5: Add styles for the pending marker and the banner**

Append to `src/styles.css`:

```css
.surface-banner {
  margin: 0 0 8px;
  padding: 6px 12px;
  background: #1f6f5b;
  color: #fffdf8;
  border-radius: 6px;
  font-size: 0.85rem;
}

.wall-pending-marker {
  fill: #c75300;
  stroke: #ffffff;
  stroke-width: 2;
  pointer-events: none;
}
```

- [ ] **Step 6: Run the wall drawing tests**

Run: `bun run test -- src/__tests__/wallDrawing.test.tsx`

Expected: all four tests pass.

- [ ] **Step 7: Run the full suite**

Run: `bun run test`

Expected: all tests pass.

- [ ] **Step 8: Run the build**

Run: `bun run build`

Expected: success.

- [ ] **Step 9: Commit**

```bash
git add src/components/DrawingSurface2D.tsx src/components/AppShell.tsx src/styles.css src/__tests__/wallDrawing.test.tsx
git commit -m "feat: add two-click wall drawing tool"
```

---

## Task 5: Tool Banner Test, Status Doc, and Final Verification

**Files:**
- Modify: `src/__tests__/ui.test.tsx`
- Modify: `docs/2026-04-26-implementation-status.md`

- [ ] **Step 1: Add a banner-visibility UI test**

Append to `src/__tests__/ui.test.tsx` (inside the existing `describe("HouseClaw UI", …)` block):

```tsx
  it("shows a wall-tool banner only while the wall tool is active in a plan view", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText("墙工具：点击两点画墙；按 Esc 取消")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "墙" }));
    expect(screen.getByText("墙工具：点击两点画墙；按 Esc 取消")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "正面" }));
    expect(screen.queryByText("墙工具：点击两点画墙；按 Esc 取消")).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the new test**

Run: `bun run test -- src/__tests__/ui.test.tsx`

Expected: the banner test passes alongside the existing UI tests.

- [ ] **Step 3: Update the status doc**

In `docs/2026-04-26-implementation-status.md`, find the section 2 table (`## 2. 可行性文档第 14 节最小闭环检查`) and update the row for step 1:

| Step | Status |
|---|---|
| 1 1F 平面画矩形 | ✅ |

Update the conclusion paragraph at the end of section 2. The previous text said "8 步现在 6 步走通". Replace with:

> **结论：8 步现在 7 步走通**。剩余 1 步（在墙上添加新窗）由后续 opening-drawing 计划覆盖；本期已交付画墙工具，闭环验收只差最后一项。

Make NO other changes to the doc.

- [ ] **Step 4: Run the full suite**

Run: `bun run test`

Expected: all tests pass.

- [ ] **Step 5: Run the build**

Run: `bun run build`

Expected: success.

- [ ] **Step 6: Boot the dev server in the background and confirm it serves**

Run, in background:

```bash
bun run dev -- --host 127.0.0.1 --port 5174 > /tmp/houseclaw-dev.log 2>&1 &
DEV_PID=$!
echo "$DEV_PID"
```

Wait `sleep 3`, then `curl -fsS http://127.0.0.1:5174/ | head -c 200` and confirm the response contains `<div id="root">`. Kill via `kill $DEV_PID`.

If the curl fails or the HTML doesn't include `<div id="root">`, STOP and report BLOCKED.

- [ ] **Step 7: Commit**

```bash
git add src/__tests__/ui.test.tsx docs/2026-04-26-implementation-status.md
git commit -m "feat: surface wall-tool banner and update closed-loop status"
```

---

## Self-Review Notes

Spec coverage:

- Step 1 of the closed loop (`在 1F 平面画矩形外墙`) — Tasks 1, 2, 3, 4 build the wall-drawing primitive; Task 5 documents.
- Selection + tool gating — Task 4 step 3e.
- Escape cancel — Task 4 step 3d (extends the existing handler).
- Snap to grid + endpoint — Task 2.
- Persistence — no change needed; new walls flow through `addWall` → `replace-project` → existing JSON pipeline.

Placeholder scan: every step shows actual code, exact paths, and concrete test assertions. No "similar to" or "fill in" lines.

Type consistency:

- `Point2D` is the type alias inside `DrawingSurface2D.tsx` for `{ x: number; y: number }`. The domain layer uses `Point2`; both shapes are structurally identical and interchange via type assertion-free destructure.
- `nextWallId(project, storeyId)`, `createWallDraft(project, storeyId, start, end)`, and `snapPlanPoint(point, walls, options)` keep their parameter names consistent across tasks.
- `ToolId` from `domain/types.ts` is reused; no new tool kinds added.
- The `ObjectSelection` shape from the prior plan is unchanged.

Known follow-ups (NOT in this plan):

- Door / window / opening tools (closes step 3 of the closed loop).
- Wall midpoint snap, axis lock (Shift), polyline mode (chained drawing).
- Drag-to-resize / drag-to-move existing walls.
- Undo/redo across `replace-project` dispatches.
- Honor `Wall.exterior` more meaningfully (interior walls today are visually identical).
