# Property Editing and Storey Height Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only `PropertyPanel` with selection-aware editable fields for walls / openings / balconies / storeys, and add a storey-height strip above the 2D drawing surface — closing steps 2, 4, and 6 of the feasibility doc's minimal verification loop (§14).

**Architecture:** Replace the loose `selectedObjectId: string | undefined` with a discriminated `Selection` union so the panel can branch by kind. Add `updateWall`, `updateBalcony`, `updateStorey` mutations alongside the existing `updateOpening`. A new `NumberField` component owns local input text + inline validation; on commit it tries the mutation in a try/catch and either dispatches `replace-project` or reports an error. Material application stops being hard-coded to `walls[0]` and follows the selected wall.

**Tech Stack:** React + TypeScript + Vitest + React Testing Library. No new runtime dependencies.

**Out of scope:** wall drawing tool, opening / door / balcony creation tools, undo/redo, drag-to-resize, drag-to-move. Those are separate plans.

---

## File Structure

**New:**
- `src/domain/selection.ts` — `Selection` discriminated union and `isSelected` helper.
- `src/components/NumberField.tsx` — single-input editor with inline error and commit-on-blur/Enter.
- `src/components/StoreyHeightStrip.tsx` — strip showing 1F/2F/3F heights, click-to-edit.
- `src/__tests__/selection.test.ts` — unit tests for `isSelected`.
- `src/__tests__/numberField.test.tsx` — RTL tests for `NumberField`.
- `src/__tests__/propertyEditing.test.tsx` — RTL tests for full edit flow (opening → wall → balcony → storey).

**Modified:**
- `src/domain/types.ts` — drop `selectedObjectId`, add `selection?: Selection`.
- `src/domain/mutations.ts` — add `updateWall`, `updateBalcony`, `updateStorey`.
- `src/domain/sampleProject.ts` — remove `selectedObjectId` field.
- `src/app/projectReducer.ts` — `select-object` → `select`; add `update-wall`, `update-balcony`, `update-storey`.
- `src/app/persistence.ts` — strip `selection` on export; tolerate but ignore `selectedObjectId` on import.
- `src/components/AppShell.tsx` — wire new dispatchers + `StoreyHeightStrip`.
- `src/components/DrawingSurface2D.tsx` — emit `Selection`; allow selecting walls in plans.
- `src/components/PropertyPanel.tsx` — branch by `selection.kind`; per-wall material picker.
- `src/__tests__/ui.test.tsx` — update existing selection assertion; add wall + balcony selection assertions.
- `src/__tests__/reducer.test.ts` — exercise the new actions.
- `src/__tests__/persistence.test.ts` — drop the `selectedObjectId: 42` test; add a tolerated-legacy test.
- `src/styles.css` — minimal style additions for `NumberField` and `StoreyHeightStrip`.

Each file has one responsibility; nothing else changes.

---

## Task 1: Selection Model

**Files:**
- Create: `src/domain/selection.ts`
- Create: `src/__tests__/selection.test.ts`
- Modify: `src/domain/types.ts`
- Modify: `src/domain/sampleProject.ts`
- Modify: `src/app/projectReducer.ts`
- Modify: `src/app/persistence.ts`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/components/DrawingSurface2D.tsx`
- Modify: `src/components/PropertyPanel.tsx`
- Modify: `src/__tests__/ui.test.tsx`
- Modify: `src/__tests__/reducer.test.ts`
- Modify: `src/__tests__/persistence.test.ts`

- [ ] **Step 1: Write the failing selection test**

Create `src/__tests__/selection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isSelected } from "../domain/selection";

describe("selection helpers", () => {
  it("matches a selection by kind and id", () => {
    expect(isSelected({ kind: "wall", id: "wall-front-1f" }, "wall", "wall-front-1f")).toBe(true);
  });

  it("does not match a different id", () => {
    expect(isSelected({ kind: "wall", id: "wall-front-1f" }, "wall", "wall-back-1f")).toBe(false);
  });

  it("does not match a different kind", () => {
    expect(isSelected({ kind: "wall", id: "wall-front-1f" }, "opening", "wall-front-1f")).toBe(false);
  });

  it("treats undefined selection as not selected", () => {
    expect(isSelected(undefined, "wall", "wall-front-1f")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run: `bun run test -- src/__tests__/selection.test.ts`

Expected: fail with `Failed to resolve import "../domain/selection"`.

- [ ] **Step 3: Implement `selection.ts`**

Create `src/domain/selection.ts`:

```ts
export type Selection =
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "balcony"; id: string }
  | { kind: "storey"; id: string };

export type SelectionKind = Selection["kind"];

export function isSelected(
  selection: Selection | undefined,
  kind: SelectionKind,
  id: string,
): boolean {
  return selection?.kind === kind && selection.id === id;
}
```

- [ ] **Step 4: Replace `selectedObjectId` in `types.ts`**

In `src/domain/types.ts`, remove the line:

```ts
  selectedObjectId?: string;
```

and replace it with:

```ts
  selection?: Selection;
```

Also add the import at the top of the file:

```ts
import type { Selection } from "./selection";
```

- [ ] **Step 5: Drop `selectedObjectId` from sample project**

In `src/domain/sampleProject.ts`, the returned project literal already does not set `selectedObjectId` — verify with `grep selectedObjectId src/domain/sampleProject.ts`. If present, remove that line. No new field is added; `selection` is left unset (undefined).

- [ ] **Step 6: Update reducer to use `select`**

In `src/app/projectReducer.ts`:

```ts
import { applyWallMaterial, updateOpening } from "../domain/mutations";
import type { Selection } from "../domain/selection";
import type { HouseProject, Mode, Opening, ToolId, ViewId } from "../domain/types";

export type ProjectAction =
  | { type: "set-mode"; mode: Mode }
  | { type: "set-view"; viewId: ViewId }
  | { type: "set-tool"; toolId: ToolId }
  | { type: "select"; selection: Selection | undefined }
  | { type: "update-opening"; openingId: string; patch: Partial<Omit<Opening, "id" | "wallId">> }
  | { type: "apply-wall-material"; wallId: string; materialId: string }
  | { type: "replace-project"; project: HouseProject };

export function projectReducer(project: HouseProject, action: ProjectAction): HouseProject {
  if (action.type === "set-mode") {
    return { ...project, mode: action.mode };
  }

  if (action.type === "set-view") {
    return { ...project, activeView: action.viewId };
  }

  if (action.type === "set-tool") {
    return { ...project, activeTool: action.toolId };
  }

  if (action.type === "select") {
    return { ...project, selection: action.selection };
  }

  if (action.type === "update-opening") {
    return updateOpening(project, action.openingId, action.patch);
  }

  if (action.type === "apply-wall-material") {
    return applyWallMaterial(project, action.wallId, action.materialId);
  }

  return action.project;
}
```

- [ ] **Step 7: Strip `selection` from JSON, tolerate legacy `selectedObjectId`**

In `src/app/persistence.ts`:

Replace `withImportedDefaults` with:

```ts
function withImportedDefaults(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const project = { ...(value as ProjectJsonObject) };

  if (project.balconies === undefined) {
    project.balconies = [];
  }

  // Selection is transient; never honored on import.
  delete project.selection;
  delete project.selectedObjectId;

  return project;
}
```

Remove the `assertOptionalStringField(value, "selectedObjectId");` line.

Replace `exportProjectJson` with:

```ts
export function exportProjectJson(project: HouseProject): string {
  const { selection: _selection, ...rest } = project;
  return JSON.stringify(rest, null, 2);
}
```

Make sure the unused `_selection` is named with the leading underscore so TypeScript does not warn.

- [ ] **Step 8: Update `DrawingSurface2D` to emit `Selection`**

In `src/components/DrawingSurface2D.tsx`, change the import block to include `Selection`:

```ts
import type { Selection } from "../domain/selection";
import { isSelected } from "../domain/selection";
```

Replace `DrawingSurface2DProps`:

```ts
type DrawingSurface2DProps = {
  project: HouseProject;
  onSelect: (selection: Selection | undefined) => void;
};
```

In `renderPlan` and `renderElevation`, replace the `selectedObjectId: string | undefined` parameter with `selection: Selection | undefined`. Inside the body, update each `selected = selectedObjectId === foo.id` check:

For openings:

```ts
const selected = isSelected(selection, "opening", opening.openingId);
```

For balconies:

```ts
isSelected(selection, "balcony", balcony.balconyId),
```

Update each `onClick` / `onKeyDown` call site:

```ts
onClick={() => onSelect({ kind: "opening", id: opening.openingId })}
```

```ts
onClick={() => onSelect({ kind: "balcony", id: balcony.balconyId })}
```

Add wall selection in plans (so users can select walls). Inside `renderPlan`, replace the existing `<line key={wall.wallId} className="plan-wall" ...>` block with:

```ts
{projection.wallSegments.map((wall) => {
  const start = projectPoint(wall.start);
  const end = projectPoint(wall.end);
  const selected = isSelected(selection, "wall", wall.wallId);
  const className = selected ? "plan-wall is-selected" : "plan-wall";

  return (
    <line
      key={wall.wallId}
      role="button"
      tabIndex={0}
      aria-label={`选择墙 ${wall.wallId}`}
      aria-pressed={selected}
      className={className}
      x1={start.x}
      y1={start.y}
      x2={end.x}
      y2={end.y}
      strokeWidth={Math.max(wall.thickness * 20, 6)}
      onClick={() => onSelect({ kind: "wall", id: wall.wallId })}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect({ kind: "wall", id: wall.wallId });
        }
      }}
    />
  );
})}
```

Update `DrawingSurface2D`'s body `renderPlan(projection, project.selection, onSelect)` and `renderElevation(...)` calls accordingly.

Add a click-on-empty-space deselect: wrap the surface `<svg>` content with a transparent background rect that calls `onSelect(undefined)`:

```tsx
<svg viewBox={`0 0 ${SURFACE_WIDTH} ${SURFACE_HEIGHT}`} role="group" aria-label="当前 2D 结构视图">
  <rect
    className="surface-grid"
    x="0"
    y="0"
    width={SURFACE_WIDTH}
    height={SURFACE_HEIGHT}
    onClick={() => onSelect(undefined)}
  />
  {storeyId
    ? renderPlan(projectPlanView(project, storeyId), project.selection, onSelect)
    : elevationSide
      ? renderElevation(projectElevationView(project, elevationSide), project.selection, onSelect)
      : renderRoofPlaceholder()}
</svg>
```

- [ ] **Step 9: Update `PropertyPanel` to read `Selection` (still read-only at this task)**

This task only swaps the lookup. Editing arrives in Task 4. In `src/components/PropertyPanel.tsx`:

```tsx
import type { HouseProject, OpeningType } from "../domain/types";
import { materialCatalog } from "../materials/catalog";

const OPENING_LABELS: Record<OpeningType, string> = {
  door: "门",
  window: "窗",
  void: "开孔",
};

type PropertyPanelProps = {
  project: HouseProject;
  onApplyWallMaterial: (wallId: string, materialId: string) => void;
};

const wallMaterials = materialCatalog.filter((material) => material.kind === "wall");

export function PropertyPanel({ project, onApplyWallMaterial }: PropertyPanelProps) {
  const selection = project.selection;
  const selectedOpening =
    selection?.kind === "opening"
      ? project.openings.find((opening) => opening.id === selection.id)
      : undefined;
  const targetWallId =
    selection?.kind === "wall" ? selection.id : project.walls[0]?.id;
  const targetWall = project.walls.find((wall) => wall.id === targetWallId);

  return (
    <aside className="property-panel" aria-label="Properties">
      <h2>属性</h2>
      {selectedOpening ? (
        <dl className="property-list">
          <div>
            <dt>类型</dt>
            <dd>{OPENING_LABELS[selectedOpening.type]}</dd>
          </div>
          <div>
            <dt>{selectedOpening.type === "window" ? "窗宽" : "宽度"}</dt>
            <dd>{selectedOpening.width.toFixed(2)} m</dd>
          </div>
          <div>
            <dt>高度</dt>
            <dd>{selectedOpening.height.toFixed(2)} m</dd>
          </div>
          <div>
            <dt>离地高度</dt>
            <dd>{selectedOpening.sillHeight.toFixed(2)} m</dd>
          </div>
        </dl>
      ) : (
        <p className="panel-placeholder">选择门、窗或开孔查看属性。</p>
      )}
      <section className="material-catalog" aria-labelledby="material-catalog-heading">
        <h3 id="material-catalog-heading">材质库</h3>
        <div className="material-list">
          {wallMaterials.map((material) => (
            <button
              aria-pressed={targetWall?.materialId === material.id}
              className="material-swatch"
              disabled={!targetWall}
              key={material.id}
              onClick={() => targetWall && onApplyWallMaterial(targetWall.id, material.id)}
              type="button"
            >
              <span aria-hidden="true" className="material-swatch-color" style={{ backgroundColor: material.color }} />
              <span>{material.name}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
```

- [ ] **Step 10: Update `AppShell` for the new dispatcher name**

In `src/components/AppShell.tsx`:

Replace:

```ts
import type { Mode, ToolId, ViewId } from "../domain/types";
```

with:

```ts
import type { Selection } from "../domain/selection";
import type { Mode, ToolId, ViewId } from "../domain/types";
```

Replace:

```ts
const selectObject = (objectId: string | undefined) => dispatch({ type: "select-object", objectId });
```

with:

```ts
const select = (selection: Selection | undefined) => dispatch({ type: "select", selection });
```

Replace:

```tsx
<DrawingSurface2D project={project} onSelectObject={selectObject} />
```

with:

```tsx
<DrawingSurface2D project={project} onSelect={select} />
```

- [ ] **Step 11: Update existing tests**

In `src/__tests__/persistence.test.ts`, replace:

```ts
  it("rejects invalid optional selected object values", () => {
    expectInvalidProjectJson({ ...createSampleProject(), selectedObjectId: 42 });
  });
```

with:

```ts
  it("ignores legacy selectedObjectId fields on import", () => {
    const json = JSON.stringify({ ...createSampleProject(), selectedObjectId: "legacy" });
    const restored = importProjectJson(json);

    expect("selectedObjectId" in restored).toBe(false);
    expect(restored.selection).toBeUndefined();
  });

  it("strips runtime selection from exported JSON", () => {
    const project = { ...createSampleProject(), selection: { kind: "wall" as const, id: "wall-front-1f" } };
    const json = exportProjectJson(project);

    expect(JSON.parse(json).selection).toBeUndefined();
  });
```

If `exportProjectJson` is not yet imported in that file, add it to the import line.

In `src/__tests__/reducer.test.ts`, replace any reference to `select-object` with the new shape (likely none — verify with `grep select-object src/__tests__`). Add a test:

```ts
  it("stores selection through the select action", () => {
    const project = projectReducer(createSampleProject(), {
      type: "select",
      selection: { kind: "wall", id: "wall-front-1f" },
    });

    expect(project.selection).toEqual({ kind: "wall", id: "wall-front-1f" });
  });
```

In `src/__tests__/ui.test.tsx`, the existing assertion `screen.getByRole("button", { name: "选择开孔 window-front-1f" })` keeps working (the aria-label is unchanged). No change needed.

- [ ] **Step 12: Run tests**

Run: `bun run test`

Expected: all 56 tests pass (previous 54 + new selection test + new reducer test + the rewritten persistence tests).

If any test fails, do not edit unrelated code — debug the specific failure.

- [ ] **Step 13: Run the build**

Run: `bun run build`

Expected: TypeScript compiles cleanly, `vite build` succeeds.

- [ ] **Step 14: Commit**

```bash
git add src/domain/selection.ts src/domain/types.ts src/domain/sampleProject.ts \
  src/app/projectReducer.ts src/app/persistence.ts \
  src/components/AppShell.tsx src/components/DrawingSurface2D.tsx src/components/PropertyPanel.tsx \
  src/__tests__/selection.test.ts src/__tests__/persistence.test.ts src/__tests__/reducer.test.ts src/__tests__/ui.test.tsx
git commit -m "feat: typed Selection replaces selectedObjectId"
```

---

## Task 2: Wall, Balcony, and Storey Mutations

**Files:**
- Modify: `src/domain/mutations.ts`
- Modify: `src/app/projectReducer.ts`
- Modify: `src/__tests__/constraints.test.ts`
- Modify: `src/__tests__/reducer.test.ts`

- [ ] **Step 1: Write failing mutation tests**

In `src/__tests__/constraints.test.ts`, append:

```ts
  it("updates a wall thickness through updateWall", () => {
    const project = updateWall(createSampleProject(), "wall-front-1f", { thickness: 0.3 });
    expect(project.walls.find((wall) => wall.id === "wall-front-1f")!.thickness).toBe(0.3);
  });

  it("rejects updateWall when the new thickness is non-positive", () => {
    expect(() => updateWall(createSampleProject(), "wall-front-1f", { thickness: 0 })).toThrow(
      /thickness/,
    );
  });

  it("updates a balcony depth through updateBalcony", () => {
    const project = updateBalcony(createSampleProject(), "balcony-front-2f", { depth: 1.5 });
    expect(project.balconies.find((balcony) => balcony.id === "balcony-front-2f")!.depth).toBe(1.5);
  });

  it("updates a storey label through updateStorey without touching height", () => {
    const project = updateStorey(createSampleProject(), "1f", { label: "一层" });
    const storey = project.storeys.find((candidate) => candidate.id === "1f")!;
    expect(storey.label).toBe("一层");
    expect(storey.height).toBe(3.2);
    expect(project.storeys.map((s) => s.elevation)).toEqual([0, 3.2, 6.4]);
  });

  it("propagates a height change in updateStorey through wall heights and elevations", () => {
    const project = updateStorey(createSampleProject(), "1f", { height: 3.5 });

    expect(project.storeys.map((storey) => ({ id: storey.id, elevation: storey.elevation, height: storey.height }))).toEqual([
      { id: "1f", elevation: 0, height: 3.5 },
      { id: "2f", elevation: 3.5, height: 3.2 },
      { id: "3f", elevation: 6.7, height: 3.2 },
    ]);
    expect(project.walls.find((wall) => wall.id === "wall-front-1f")!.height).toBe(3.5);
  });
```

Add to the imports at the top of the file:

```ts
import { addOpening, setStoreyHeight, updateBalcony, updateStorey, updateWall } from "../domain/mutations";
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `bun run test -- src/__tests__/constraints.test.ts`

Expected: fail because `updateWall`, `updateBalcony`, `updateStorey` are not exported.

- [ ] **Step 3: Implement the new mutations**

Replace `src/domain/mutations.ts` with:

```ts
import { storeyTop } from "./measurements";
import { assertValidProject } from "./constraints";
import type { Balcony, HouseProject, Opening, Storey, Wall } from "./types";

export type OpeningPatch = Partial<Omit<Opening, "id" | "wallId">>;
export type WallPatch = Partial<Omit<Wall, "id" | "storeyId" | "start" | "end">>;
export type BalconyPatch = Partial<Omit<Balcony, "id" | "storeyId" | "attachedWallId">>;
export type StoreyPatch = Partial<Omit<Storey, "id" | "elevation">>;

type UnsafeOpeningPatch = OpeningPatch & Partial<Pick<Opening, "id" | "wallId">>;

export function addWall(project: HouseProject, wall: Wall): HouseProject {
  return assertValidProject({
    ...project,
    walls: [...project.walls, wall],
  });
}

export function addOpening(project: HouseProject, opening: Opening): HouseProject {
  return assertValidProject({
    ...project,
    openings: [...project.openings, opening],
  });
}

export function updateOpening(project: HouseProject, openingId: string, patch: OpeningPatch): HouseProject {
  const { id: _ignoredId, wallId: _ignoredWallId, ...allowedPatch } = patch as UnsafeOpeningPatch;

  return assertValidProject({
    ...project,
    openings: project.openings.map((opening) => (opening.id === openingId ? { ...opening, ...allowedPatch } : opening)),
  });
}

export function updateWall(project: HouseProject, wallId: string, patch: WallPatch): HouseProject {
  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) => (wall.id === wallId ? { ...wall, ...patch } : wall)),
  });
}

export function updateBalcony(project: HouseProject, balconyId: string, patch: BalconyPatch): HouseProject {
  return assertValidProject({
    ...project,
    balconies: project.balconies.map((balcony) =>
      balcony.id === balconyId ? { ...balcony, ...patch } : balcony,
    ),
  });
}

export function updateStorey(project: HouseProject, storeyId: string, patch: StoreyPatch): HouseProject {
  if (patch.height !== undefined) {
    if (!Number.isFinite(patch.height) || patch.height <= 0) {
      throw new Error(`Storey ${storeyId} height must be positive.`);
    }
  }

  let nextElevation = 0;
  const storeys = project.storeys.map((storey) => {
    const next: Storey = {
      ...storey,
      ...(storey.id === storeyId ? patch : {}),
      elevation: nextElevation,
    };
    nextElevation = storeyTop(nextElevation, next.height);
    return next;
  });

  const heightChanged = patch.height !== undefined;
  const walls = heightChanged
    ? project.walls.map((wall) => (wall.storeyId === storeyId ? { ...wall, height: patch.height! } : wall))
    : project.walls;

  return assertValidProject({ ...project, storeys, walls });
}

export function setStoreyHeight(project: HouseProject, storeyId: string, height: number): HouseProject {
  return updateStorey(project, storeyId, { height });
}

export function applyWallMaterial(project: HouseProject, wallId: string, materialId: string): HouseProject {
  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) => (wall.id === wallId ? { ...wall, materialId } : wall)),
  });
}
```

Note: `setStoreyHeight` becomes a thin wrapper around `updateStorey` so the existing test on `setStoreyHeight` keeps passing.

- [ ] **Step 4: Add reducer actions**

In `src/app/projectReducer.ts`, expand the action union and handlers:

```ts
import {
  applyWallMaterial,
  updateBalcony,
  updateOpening,
  updateStorey,
  updateWall,
  type BalconyPatch,
  type OpeningPatch,
  type StoreyPatch,
  type WallPatch,
} from "../domain/mutations";
import type { Selection } from "../domain/selection";
import type { HouseProject, Mode, ToolId, ViewId } from "../domain/types";

export type ProjectAction =
  | { type: "set-mode"; mode: Mode }
  | { type: "set-view"; viewId: ViewId }
  | { type: "set-tool"; toolId: ToolId }
  | { type: "select"; selection: Selection | undefined }
  | { type: "update-opening"; openingId: string; patch: OpeningPatch }
  | { type: "update-wall"; wallId: string; patch: WallPatch }
  | { type: "update-balcony"; balconyId: string; patch: BalconyPatch }
  | { type: "update-storey"; storeyId: string; patch: StoreyPatch }
  | { type: "apply-wall-material"; wallId: string; materialId: string }
  | { type: "replace-project"; project: HouseProject };

export function projectReducer(project: HouseProject, action: ProjectAction): HouseProject {
  switch (action.type) {
    case "set-mode":
      return { ...project, mode: action.mode };
    case "set-view":
      return { ...project, activeView: action.viewId };
    case "set-tool":
      return { ...project, activeTool: action.toolId };
    case "select":
      return { ...project, selection: action.selection };
    case "update-opening":
      return updateOpening(project, action.openingId, action.patch);
    case "update-wall":
      return updateWall(project, action.wallId, action.patch);
    case "update-balcony":
      return updateBalcony(project, action.balconyId, action.patch);
    case "update-storey":
      return updateStorey(project, action.storeyId, action.patch);
    case "apply-wall-material":
      return applyWallMaterial(project, action.wallId, action.materialId);
    case "replace-project":
      return action.project;
  }
}
```

- [ ] **Step 5: Add reducer tests for the new actions**

In `src/__tests__/reducer.test.ts`, append:

```ts
  it("updates a wall thickness through update-wall", () => {
    const project = projectReducer(createSampleProject(), {
      type: "update-wall",
      wallId: "wall-front-1f",
      patch: { thickness: 0.3 },
    });

    expect(project.walls.find((wall) => wall.id === "wall-front-1f")!.thickness).toBe(0.3);
  });

  it("updates a balcony depth through update-balcony", () => {
    const project = projectReducer(createSampleProject(), {
      type: "update-balcony",
      balconyId: "balcony-front-2f",
      patch: { depth: 1.5 },
    });

    expect(project.balconies.find((balcony) => balcony.id === "balcony-front-2f")!.depth).toBe(1.5);
  });

  it("updates a storey height through update-storey and renormalizes elevations", () => {
    const project = projectReducer(createSampleProject(), {
      type: "update-storey",
      storeyId: "1f",
      patch: { height: 3.5 },
    });

    expect(project.storeys.map((storey) => storey.elevation)).toEqual([0, 3.5, 6.7]);
  });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun run test -- src/__tests__/constraints.test.ts src/__tests__/reducer.test.ts`

Expected: all tests in both files pass.

- [ ] **Step 7: Run the full suite**

Run: `bun run test`

Expected: all tests pass.

- [ ] **Step 8: Run the build**

Run: `bun run build`

Expected: success.

- [ ] **Step 9: Commit**

```bash
git add src/domain/mutations.ts src/app/projectReducer.ts src/__tests__/constraints.test.ts src/__tests__/reducer.test.ts
git commit -m "feat: add update-wall, update-balcony, update-storey mutations"
```

---

## Task 3: NumberField Component

**Files:**
- Create: `src/components/NumberField.tsx`
- Create: `src/__tests__/numberField.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing NumberField tests**

Create `src/__tests__/numberField.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NumberField } from "../components/NumberField";

describe("NumberField", () => {
  it("renders the label, current value, and unit", () => {
    render(<NumberField label="厚度" value={0.24} onCommit={() => undefined} />);

    const input = screen.getByLabelText("厚度") as HTMLInputElement;
    expect(input.value).toBe("0.24");
    expect(screen.getByText("m")).toBeInTheDocument();
  });

  it("commits on blur when the user types a valid value", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(() => undefined);

    render(<NumberField label="厚度" value={0.24} onCommit={onCommit} />);

    const input = screen.getByLabelText("厚度");
    await user.clear(input);
    await user.type(input, "0.3");
    await user.tab();

    expect(onCommit).toHaveBeenCalledWith(0.3);
  });

  it("commits on Enter without submitting an enclosing form", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(() => undefined);

    render(<NumberField label="厚度" value={0.24} onCommit={onCommit} />);

    const input = screen.getByLabelText("厚度");
    await user.clear(input);
    await user.type(input, "0.4{Enter}");

    expect(onCommit).toHaveBeenCalledWith(0.4);
  });

  it("shows the error returned by onCommit", async () => {
    const user = userEvent.setup();

    render(<NumberField label="厚度" value={0.24} onCommit={() => "厚度太薄"} />);

    const input = screen.getByLabelText("厚度");
    await user.clear(input);
    await user.type(input, "0.01");
    await user.tab();

    expect(screen.getByRole("alert")).toHaveTextContent("厚度太薄");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects non-numeric input without calling onCommit", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    render(<NumberField label="厚度" value={0.24} onCommit={onCommit} />);

    const input = screen.getByLabelText("厚度");
    await user.clear(input);
    await user.type(input, "abc");
    await user.tab();

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("必须是数字");
  });

  it("resets the displayed text when the value prop changes after a successful commit", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<NumberField label="厚度" value={0.24} onCommit={() => undefined} />);

    const input = screen.getByLabelText("厚度") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "0.3");
    await user.tab();

    rerender(<NumberField label="厚度" value={0.3} onCommit={() => undefined} />);

    expect(input.value).toBe("0.3");
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `bun run test -- src/__tests__/numberField.test.tsx`

Expected: fail with `Failed to resolve import "../components/NumberField"`.

- [ ] **Step 3: Implement `NumberField`**

Create `src/components/NumberField.tsx`:

```tsx
import { useEffect, useId, useState, type KeyboardEvent } from "react";

type NumberFieldProps = {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  onCommit: (next: number) => string | undefined;
};

export function NumberField({
  label,
  value,
  step = 0.05,
  min,
  max,
  unit = "m",
  onCommit,
}: NumberFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [text, setText] = useState(() => String(value));
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setText(String(value));
    setError(undefined);
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    const parsed = Number(trimmed);

    if (trimmed === "" || !Number.isFinite(parsed)) {
      setError(`${label} 必须是数字`);
      return;
    }
    if (min !== undefined && parsed < min) {
      setError(`${label} 不能小于 ${min}`);
      return;
    }
    if (max !== undefined && parsed > max) {
      setError(`${label} 不能大于 ${max}`);
      return;
    }

    const remoteError = onCommit(parsed);
    if (remoteError) {
      setError(remoteError);
      return;
    }
    setError(undefined);
    setText(String(parsed));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      (event.currentTarget as HTMLInputElement).blur();
    }
  };

  return (
    <div className="number-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="number-field-row">
        <input
          id={inputId}
          type="number"
          step={step}
          min={min}
          max={max}
          value={text}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
        <span className="number-field-unit">{unit}</span>
      </div>
      {error ? (
        <p className="number-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Add minimal styles**

Append to `src/styles.css`:

```css
.number-field {
  display: grid;
  gap: 4px;
  margin-bottom: 8px;
}

.number-field label {
  font-size: 0.85rem;
  color: #4b5562;
}

.number-field-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px;
  align-items: center;
}

.number-field input {
  border: 1px solid #c8c1b8;
  border-radius: 4px;
  padding: 4px 6px;
  background: #ffffff;
  font: inherit;
  width: 100%;
}

.number-field input[aria-invalid="true"] {
  border-color: #b94a48;
}

.number-field-unit {
  color: #65717d;
  font-size: 0.85rem;
}

.number-field-error {
  margin: 0;
  font-size: 0.8rem;
  color: #b94a48;
}
```

- [ ] **Step 5: Run the NumberField tests**

Run: `bun run test -- src/__tests__/numberField.test.tsx`

Expected: all six tests pass.

- [ ] **Step 6: Run the build**

Run: `bun run build`

Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/components/NumberField.tsx src/__tests__/numberField.test.tsx src/styles.css
git commit -m "feat: add NumberField with inline validation"
```

---

## Task 4: Selection-Aware PropertyPanel

**Files:**
- Modify: `src/components/PropertyPanel.tsx`
- Modify: `src/components/AppShell.tsx`
- Create: `src/__tests__/propertyEditing.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing property-editing tests**

Create `src/__tests__/propertyEditing.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("PropertyPanel editing", () => {
  it("commits an opening width edit and updates the elevation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正面" }));
    const opening = screen.getByRole("button", { name: "选择开孔 window-front-1f" });
    opening.focus();
    await user.keyboard("{Enter}");

    const widthField = screen.getByLabelText("窗宽") as HTMLInputElement;
    await user.clear(widthField);
    await user.type(widthField, "2.0");
    await user.tab();

    expect(widthField.value).toBe("2");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects an opening width that exceeds the wall and surfaces the error", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正面" }));
    const opening = screen.getByRole("button", { name: "选择开孔 window-front-1f" });
    opening.focus();
    await user.keyboard("{Enter}");

    const widthField = screen.getByLabelText("窗宽") as HTMLInputElement;
    await user.clear(widthField);
    await user.type(widthField, "999");
    await user.tab();

    expect(screen.getByRole("alert")).toHaveTextContent(/exceeds wall/);
  });

  it("edits a wall's thickness from a plan selection", async () => {
    const user = userEvent.setup();
    render(<App />);

    const wall = screen.getByRole("button", { name: "选择墙 wall-front-1f" });
    wall.focus();
    await user.keyboard("{Enter}");

    const thickness = screen.getByLabelText("墙厚") as HTMLInputElement;
    await user.clear(thickness);
    await user.type(thickness, "0.3");
    await user.tab();

    expect(thickness.value).toBe("0.3");
  });

  it("applies a material to the selected wall, not always to walls[0]", async () => {
    const user = userEvent.setup();
    render(<App />);

    const wall = screen.getByRole("button", { name: "选择墙 wall-right-1f" });
    wall.focus();
    await user.keyboard("{Enter}");

    const grayStone = screen.getByRole("button", { name: "灰色石材" });
    await user.click(grayStone);

    expect(grayStone).toHaveAttribute("aria-pressed", "true");
  });

  it("edits a balcony depth from the front elevation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正面" }));
    const balcony = screen.getByRole("button", { name: "选择阳台 balcony-front-2f" });
    balcony.focus();
    await user.keyboard("{Enter}");

    const depth = screen.getByLabelText("进深") as HTMLInputElement;
    await user.clear(depth);
    await user.type(depth, "1.5");
    await user.tab();

    expect(depth.value).toBe("1.5");
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `bun run test -- src/__tests__/propertyEditing.test.tsx`

Expected: fail because `墙厚`, `进深`, `窗宽` (as inputs) and the wall-selection role do not exist yet.

- [ ] **Step 3: Rewrite PropertyPanel**

Replace `src/components/PropertyPanel.tsx` with:

```tsx
import { NumberField } from "./NumberField";
import {
  updateBalcony,
  updateOpening,
  updateStorey,
  updateWall,
  type BalconyPatch,
  type OpeningPatch,
  type StoreyPatch,
  type WallPatch,
} from "../domain/mutations";
import { wallLength } from "../domain/measurements";
import type { HouseProject, OpeningType } from "../domain/types";
import { materialCatalog } from "../materials/catalog";

const OPENING_LABELS: Record<OpeningType, string> = {
  door: "门",
  window: "窗",
  void: "开孔",
};

const wallMaterials = materialCatalog.filter((material) => material.kind === "wall");

type PropertyPanelProps = {
  project: HouseProject;
  onApplyWallMaterial: (wallId: string, materialId: string) => void;
  onProjectChange: (project: HouseProject) => void;
};

function tryMutate(fn: () => HouseProject): HouseProject | string {
  try {
    return fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function commit<T>(
  current: HouseProject,
  mutate: (next: HouseProject) => HouseProject,
  onProjectChange: (project: HouseProject) => void,
  patch: T,
  build: (patch: T) => HouseProject,
): string | undefined {
  const result = tryMutate(() => build(patch));
  if (typeof result === "string") return result;
  onProjectChange(result);
  return undefined;
}

export function PropertyPanel({ project, onApplyWallMaterial, onProjectChange }: PropertyPanelProps) {
  const selection = project.selection;
  const targetWall =
    selection?.kind === "wall"
      ? project.walls.find((wall) => wall.id === selection.id)
      : undefined;

  return (
    <aside className="property-panel" aria-label="Properties">
      <h2>属性</h2>
      {!selection ? <p className="panel-placeholder">选择墙、门、窗、开孔、阳台或楼层查看属性。</p> : null}

      {selection?.kind === "opening" ? renderOpeningEditor(project, selection.id, onProjectChange) : null}
      {selection?.kind === "wall" ? renderWallEditor(project, selection.id, onProjectChange) : null}
      {selection?.kind === "balcony" ? renderBalconyEditor(project, selection.id, onProjectChange) : null}
      {selection?.kind === "storey" ? renderStoreyEditor(project, selection.id, onProjectChange) : null}

      <section className="material-catalog" aria-labelledby="material-catalog-heading">
        <h3 id="material-catalog-heading">材质库</h3>
        <p className="material-target">
          {targetWall ? `应用到：${targetWall.id}` : "选择一面墙后应用材质。"}
        </p>
        <div className="material-list">
          {wallMaterials.map((material) => (
            <button
              aria-pressed={targetWall?.materialId === material.id}
              className="material-swatch"
              disabled={!targetWall}
              key={material.id}
              onClick={() => targetWall && onApplyWallMaterial(targetWall.id, material.id)}
              type="button"
            >
              <span aria-hidden="true" className="material-swatch-color" style={{ backgroundColor: material.color }} />
              <span>{material.name}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function renderOpeningEditor(
  project: HouseProject,
  openingId: string,
  onProjectChange: (project: HouseProject) => void,
) {
  const opening = project.openings.find((candidate) => candidate.id === openingId);
  if (!opening) return null;

  const widthLabel = opening.type === "window" ? "窗宽" : "宽度";
  const apply = (patch: OpeningPatch) =>
    commit(project, (next) => next, onProjectChange, patch, (final) => updateOpening(project, openingId, final));

  return (
    <section className="property-section" aria-labelledby="opening-heading">
      <h3 id="opening-heading">{OPENING_LABELS[opening.type]} · {opening.id}</h3>
      <NumberField label={widthLabel} value={opening.width} min={0.01} onCommit={(width) => apply({ width })} />
      <NumberField label="高度" value={opening.height} min={0.01} onCommit={(height) => apply({ height })} />
      <NumberField label="离地高度" value={opening.sillHeight} min={0} onCommit={(sillHeight) => apply({ sillHeight })} />
      <NumberField label="距墙起点" value={opening.offset} min={0} onCommit={(offset) => apply({ offset })} />
    </section>
  );
}

function renderWallEditor(
  project: HouseProject,
  wallId: string,
  onProjectChange: (project: HouseProject) => void,
) {
  const wall = project.walls.find((candidate) => candidate.id === wallId);
  if (!wall) return null;

  const apply = (patch: WallPatch) =>
    commit(project, (next) => next, onProjectChange, patch, (final) => updateWall(project, wallId, final));

  return (
    <section className="property-section" aria-labelledby="wall-heading">
      <h3 id="wall-heading">墙 · {wall.id}</h3>
      <dl className="property-list">
        <div>
          <dt>墙长</dt>
          <dd>{wallLength(wall).toFixed(2)} m</dd>
        </div>
      </dl>
      <NumberField label="墙厚" value={wall.thickness} min={0.05} onCommit={(thickness) => apply({ thickness })} />
      <NumberField label="墙高" value={wall.height} min={0.5} onCommit={(height) => apply({ height })} />
    </section>
  );
}

function renderBalconyEditor(
  project: HouseProject,
  balconyId: string,
  onProjectChange: (project: HouseProject) => void,
) {
  const balcony = project.balconies.find((candidate) => candidate.id === balconyId);
  if (!balcony) return null;

  const apply = (patch: BalconyPatch) =>
    commit(project, (next) => next, onProjectChange, patch, (final) => updateBalcony(project, balconyId, final));

  return (
    <section className="property-section" aria-labelledby="balcony-heading">
      <h3 id="balcony-heading">阳台 · {balcony.id}</h3>
      <NumberField label="宽度" value={balcony.width} min={0.3} onCommit={(width) => apply({ width })} />
      <NumberField label="进深" value={balcony.depth} min={0.3} onCommit={(depth) => apply({ depth })} />
      <NumberField label="距墙起点" value={balcony.offset} min={0} onCommit={(offset) => apply({ offset })} />
      <NumberField label="栏杆高度" value={balcony.railingHeight} min={0.3} onCommit={(railingHeight) => apply({ railingHeight })} />
      <NumberField label="楼板厚度" value={balcony.slabThickness} min={0.05} onCommit={(slabThickness) => apply({ slabThickness })} />
    </section>
  );
}

function renderStoreyEditor(
  project: HouseProject,
  storeyId: string,
  onProjectChange: (project: HouseProject) => void,
) {
  const storey = project.storeys.find((candidate) => candidate.id === storeyId);
  if (!storey) return null;

  const apply = (patch: StoreyPatch) =>
    commit(project, (next) => next, onProjectChange, patch, (final) => updateStorey(project, storeyId, final));

  return (
    <section className="property-section" aria-labelledby="storey-heading">
      <h3 id="storey-heading">楼层 · {storey.label}</h3>
      <NumberField label="层高" value={storey.height} min={2} onCommit={(height) => apply({ height })} />
      <NumberField label="楼板厚度" value={storey.slabThickness} min={0.05} onCommit={(slabThickness) => apply({ slabThickness })} />
    </section>
  );
}
```

Note: `commit` is a small generic that pipes the result of a mutation through `onProjectChange`, returning the error string for `NumberField` to display. The first argument and the second `mutate` parameter are kept for clarity even though `mutate` is currently the identity — leaving room for a future undo wrapper without changing call sites.

- [ ] **Step 4: Wire `onProjectChange` in AppShell**

In `src/components/AppShell.tsx`, replace:

```tsx
            <PropertyPanel project={project} onApplyWallMaterial={applyWallMaterial} />
```

with:

```tsx
            <PropertyPanel
              project={project}
              onApplyWallMaterial={applyWallMaterial}
              onProjectChange={(next) => dispatch({ type: "replace-project", project: next })}
            />
```

- [ ] **Step 5: Add minimal property-section styles**

Append to `src/styles.css`:

```css
.property-section {
  border-top: 1px solid #ded8cf;
  padding-top: 12px;
  margin-top: 12px;
}

.property-section h3 {
  font-size: 0.95rem;
  margin: 0 0 8px;
}

.material-target {
  margin: 4px 0 8px;
  color: #65717d;
  font-size: 0.85rem;
}
```

- [ ] **Step 6: Run the property editing tests**

Run: `bun run test -- src/__tests__/propertyEditing.test.tsx`

Expected: all five tests pass.

- [ ] **Step 7: Run the full suite**

Run: `bun run test`

Expected: all tests pass. The legacy "applies a wall material from the catalog" test still passes because its first wall is `wall-front-1f` and the new code falls back to that wall when nothing is selected via the `targetWall` logic… **wait, the new code requires a wall selection to enable buttons.** Re-read the legacy test:

```tsx
const whiteRender = screen.getByRole("button", { name: "白色外墙涂料" });
expect(whiteRender).toHaveAttribute("aria-pressed", "true");
```

That assumes the panel pre-selects `walls[0]`. The rewrite disables material buttons when no wall is selected. Update the legacy test in `src/__tests__/ui.test.tsx`:

Change:

```tsx
  it("applies a wall material from the catalog", async () => {
    const user = userEvent.setup();
    render(<App />);

    const whiteRender = screen.getByRole("button", { name: "白色外墙涂料" });
    const grayStone = screen.getByRole("button", { name: "灰色石材" });

    expect(whiteRender).toHaveAttribute("aria-pressed", "true");
    expect(grayStone).toHaveAttribute("aria-pressed", "false");

    await user.click(grayStone);

    expect(grayStone).toHaveAttribute("aria-pressed", "true");
    expect(whiteRender).toHaveAttribute("aria-pressed", "false");
  });
```

to:

```tsx
  it("applies a wall material from the catalog after selecting a wall", async () => {
    const user = userEvent.setup();
    render(<App />);

    const wall = screen.getByRole("button", { name: "选择墙 wall-front-1f" });
    wall.focus();
    await user.keyboard("{Enter}");

    const whiteRender = screen.getByRole("button", { name: "白色外墙涂料" });
    const grayStone = screen.getByRole("button", { name: "灰色石材" });

    expect(whiteRender).toHaveAttribute("aria-pressed", "true");
    expect(grayStone).toHaveAttribute("aria-pressed", "false");

    await user.click(grayStone);

    expect(grayStone).toHaveAttribute("aria-pressed", "true");
    expect(whiteRender).toHaveAttribute("aria-pressed", "false");
  });
```

The "shows a reusable material catalog" test (which only checks names exist) is unaffected.

- [ ] **Step 8: Run the full suite again**

Run: `bun run test`

Expected: all tests pass.

- [ ] **Step 9: Run the build**

Run: `bun run build`

Expected: success.

- [ ] **Step 10: Commit**

```bash
git add src/components/PropertyPanel.tsx src/components/AppShell.tsx src/__tests__/propertyEditing.test.tsx src/__tests__/ui.test.tsx src/styles.css
git commit -m "feat: editable selection-aware property panel"
```

---

## Task 5: Storey Height Strip

**Files:**
- Create: `src/components/StoreyHeightStrip.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/styles.css`
- Modify: `src/__tests__/ui.test.tsx`

- [ ] **Step 1: Write failing storey strip tests**

Append to `src/__tests__/ui.test.tsx`:

```tsx
  it("shows the storey height strip in 2D mode with current values", () => {
    render(<App />);

    expect(screen.getByRole("group", { name: "楼层高度" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1F · 3.20 m" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "2F · 3.20 m" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "3F · 3.20 m" })).toHaveAttribute("aria-pressed", "false");
  });

  it("selects a storey from the height strip and surfaces the editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "2F · 3.20 m" }));

    expect(screen.getByRole("button", { name: "2F · 3.20 m" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("层高")).toBeInTheDocument();
  });

  it("commits a storey height change and renormalizes the strip labels", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "1F · 3.20 m" }));

    const heightField = screen.getByLabelText("层高") as HTMLInputElement;
    await user.clear(heightField);
    await user.type(heightField, "3.5");
    await user.tab();

    expect(screen.getByRole("button", { name: "1F · 3.50 m" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2F · 3.20 m" })).toBeInTheDocument();
  });

  it("hides the storey strip in 3D mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "3D" }));

    expect(screen.queryByRole("group", { name: "楼层高度" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `bun run test -- src/__tests__/ui.test.tsx`

Expected: fail because the strip does not exist.

- [ ] **Step 3: Implement `StoreyHeightStrip`**

Create `src/components/StoreyHeightStrip.tsx`:

```tsx
import type { Selection } from "../domain/selection";
import { isSelected } from "../domain/selection";
import type { Storey } from "../domain/types";

type StoreyHeightStripProps = {
  storeys: Storey[];
  selection: Selection | undefined;
  onSelectStorey: (storeyId: string) => void;
};

export function StoreyHeightStrip({ storeys, selection, onSelectStorey }: StoreyHeightStripProps) {
  return (
    <div className="storey-strip" role="group" aria-label="楼层高度">
      {storeys.map((storey) => {
        const selected = isSelected(selection, "storey", storey.id);
        return (
          <button
            key={storey.id}
            type="button"
            className={selected ? "storey-pill is-selected" : "storey-pill"}
            aria-pressed={selected}
            onClick={() => onSelectStorey(storey.id)}
          >
            {storey.label} · {storey.height.toFixed(2)} m
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Wire strip into AppShell**

In `src/components/AppShell.tsx`, replace the 2D `<section>` block with:

```tsx
      {project.mode === "2d" ? (
        <section className="workspace workspace-2d" aria-label="2D workspace">
          <StoreyHeightStrip
            storeys={project.storeys}
            selection={project.selection}
            onSelectStorey={(storeyId) => select({ kind: "storey", id: storeyId })}
          />
          <div className="workspace-grid">
            <ToolPalette activeTool={project.activeTool} onToolChange={setTool} />
            <DrawingSurface2D project={project} onSelect={select} />
            <PropertyPanel
              project={project}
              onApplyWallMaterial={applyWallMaterial}
              onProjectChange={(next) => dispatch({ type: "replace-project", project: next })}
            />
          </div>
        </section>
      ) : (
        <section className="workspace workspace-3d" aria-label="3D workspace">
          <Preview3D project={project} />
        </section>
      )}
```

Add the import at the top of `AppShell.tsx`:

```tsx
import { StoreyHeightStrip } from "./StoreyHeightStrip";
```

- [ ] **Step 5: Adjust styles**

Append to `src/styles.css`:

```css
.workspace-2d {
  display: grid;
  grid-template-rows: auto 1fr;
}

.workspace-grid {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) 280px;
  min-height: 0;
}

.storey-strip {
  display: flex;
  gap: 8px;
  padding: 10px 20px;
  background: #ebe4d8;
  border-bottom: 1px solid #d5cec4;
}

.storey-pill {
  border: 1px solid #c8c1b8;
  background: #fffaf2;
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
  font: inherit;
}

.storey-pill[aria-pressed="true"] {
  background: #1f6f5b;
  border-color: #1f6f5b;
  color: #fffdf8;
}
```

If the existing `.workspace` rule uses `grid-template-columns: 120px minmax(0, 1fr) 240px;`, the new `.workspace-grid` rule supersedes it for 2D layout. Leave the existing `.workspace` rule alone — it still applies to the 3D workspace.

- [ ] **Step 6: Run the storey strip tests**

Run: `bun run test -- src/__tests__/ui.test.tsx`

Expected: the four new strip tests pass alongside the existing UI tests.

- [ ] **Step 7: Run the full suite**

Run: `bun run test`

Expected: all tests pass.

- [ ] **Step 8: Run the build**

Run: `bun run build`

Expected: success.

- [ ] **Step 9: Commit**

```bash
git add src/components/StoreyHeightStrip.tsx src/components/AppShell.tsx src/styles.css src/__tests__/ui.test.tsx
git commit -m "feat: storey height strip in 2D workspace"
```

---

## Task 6: Manual Smoke Verification

**Files:**
- Modify: `docs/2026-04-26-implementation-status.md` (mark closed loop steps that now work)

- [ ] **Step 1: Run the full automated suite**

Run: `bun run test`

Expected: all tests pass.

- [ ] **Step 2: Run the build**

Run: `bun run build`

Expected: success.

- [ ] **Step 3: Start the dev server**

Run: `bun run dev -- --host 127.0.0.1`

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 4: Manual smoke walk**

In the browser, verify:

1. Click `2F` button in the storey strip → its pill shows aria-pressed; the property panel shows the storey editor with `层高 = 3.20`.
2. Type `3.4` into 层高 → blur. The pill label updates to `2F · 3.40 m`. 3F's pill stays at `3.20 m`. The 1F pill stays at `3.20 m`.
3. Switch to `正面`. Click `选择开孔 window-front-1f`. Edit `窗宽` to `2.0` → blur. The window in the SVG rect resizes.
4. Edit `窗宽` to `999` → blur. Inline error appears under the field; the SVG does not change.
5. Click on `wall-right-1f` in the `1F` plan. The property panel shows wall editor with `墙厚 0.24`. Edit to `0.30` → blur. The plan SVG line gets thicker.
6. Click `灰色石材` in the material catalog. The wall changes color in 3D after switching to `3D`.
7. Click `导出 JSON`. The downloaded file should not contain `selection` or `selectedObjectId` keys.

If any step fails, fix and re-run the failing automated test or add one if the failure was not covered.

- [ ] **Step 5: Update the status doc**

In `docs/2026-04-26-implementation-status.md`, update the table in section 2 "可行性文档第 14 节最小闭环检查":

| Step | Status |
|---|---|
| 2 输入墙厚和层高 | ✅ |
| 4 立面改离地高度 | ✅ |
| 6 给外墙换材质 | ✅ |

Also update the conclusion "8 步只有 3 步真正可走通" to "8 步现在 6 步走通；剩余 2 步（画矩形外墙、加新窗）由后续 wall-drawing 计划覆盖。"

- [ ] **Step 6: Commit the doc update**

```bash
git add docs/2026-04-26-implementation-status.md
git commit -m "docs: mark editable closed-loop steps complete"
```

---

## Self-Review Notes

Spec coverage (against V2 roadmap Phase 1):

- 1.2 Selection upgrade — Task 1.
- 1.3 PropertyPanel editable — Tasks 2, 3, 4.
- 1.5 Storey height UI — Task 5.
- 1.4 Wall drawing — explicitly out of scope; deferred to a future plan.
- 1.1 Multi-opening fix — already landed before this plan.
- 1.6 Opening overlap rejection — already landed before this plan.

Placeholder scan: every step shows the actual code or test it requires. No "TBD", "fill in", or "similar to Task N" references remain.

Type consistency:

- `Selection` is defined once in `selection.ts` and consumed identically everywhere.
- `WallPatch`, `BalconyPatch`, `OpeningPatch`, `StoreyPatch` are exported from `mutations.ts` and used by both the reducer and the property panel.
- `NumberField`'s `onCommit: (next: number) => string | undefined` matches every call site.

Known follow-ups (not in this plan):

- Wall drawing tool (Phase 1.4) — separate plan.
- Door / window / opening / balcony creation tools — separate plan.
- Undo / redo — separate plan; the `commit` indirection in `PropertyPanel` is intentionally reserved for it.
- Roof model and geometry — V2 roadmap Phase 3.
- 3D OrbitControls and screenshots — V2 roadmap Phase 2.
