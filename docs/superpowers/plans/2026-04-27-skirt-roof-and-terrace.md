# 副披檐 + 退台楼板 + 灰瓦材质 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `SkirtRoof` (lean-to roof attached to a wall span), auto-generated terrace slabs at setbacks, and a gray-tile roof material — enabling the project to approximate Chinese-style 3-storey villas with a main gable roof + mid-level skirt roof + open terraces.

**Architecture:** New `SkirtRoof` entity stored in `project.skirts[]`, with parallel pipeline to existing roof: dedicated geometry (`skirtGeometry.ts`), 3D mesh builder (`createSkirtMeshes` in `threeScene.ts`), 2D plan + elevation renderers (existing `DrawingSurface2D` + `projection/elevation.ts`), property editor (in `PropertyPanel.tsx`), and tool-palette entry following the balcony add-flow pattern. Terrace slabs come from a one-line change in `buildHouseGeometry`: storey N>0 uses storey N-1's exterior ring as its slab outline.

**Tech Stack:** React + TypeScript, Three.js, Vite, Vitest + jsdom + @testing-library/react. Bun as package manager.

---

## Spec → Plan divergence

The brainstorm spec described skirt-add UI as "select 披檐 tool → hover wall → click". The actual codebase uses a different add pattern (visible in `ToolPalette.tsx` + `AppShell.handleAddComponent`): user clicks "+", picks component type, picks storey, system auto-picks an exterior wall via `pickTargetWall`. **This plan follows the codebase pattern** for consistency with wall/door/window/balcony/stair. The spec's hover-and-click UX is deferred (would require a different selection-mode tool, not in scope).

---

## File structure

**New files:**
- `src/geometry/skirtGeometry.ts` — pure geometry, builds `SkirtGeometry` from `SkirtRoof` + host `Wall`
- `src/__tests__/skirtGeometry.test.ts` — geometry unit tests

**Modified files:**
- `src/materials/catalog.ts` — add `mat-gray-tile`
- `src/domain/types.ts` — add `SkirtRoof`, `skirts` field on `HouseProject`, `"skirt"` in `ToolId`
- `src/domain/selection.ts` — add `{ kind: "skirt"; id }` variant
- `src/domain/drafts.ts` — add `createSkirtDraft`, `findSkirtInsertionCenter`, `nextSkirtId`
- `src/domain/mutations.ts` — add `addSkirt`, `updateSkirt`, `removeSkirt`, `SkirtPatch`
- `src/domain/sampleProject.ts` — add `skirts: []`
- `src/app/persistence.ts` — schema for `skirts`
- `src/geometry/types.ts` — add `SkirtGeometry` to `HouseGeometry`
- `src/geometry/houseGeometry.ts` — invoke `buildSkirtGeometry` per skirt; pass per-storey outline source for terrace slab
- `src/geometry/slabGeometry.ts` — accept optional `outlineWalls` param to override outline source (so houseGeometry can pass N-1's walls for non-bottom storeys)
- `src/rendering/threeScene.ts` — `createSkirtMeshes`
- `src/projection/types.ts` — add `skirts?: ElevationRoofPolygon[]` to `ElevationProjection`
- `src/projection/elevation.ts` — project skirt panels into elevation 2D; also export skirt-bounds for plan view
- `src/projection/plan.ts` — add `skirts: PlanSkirtRect[]` to `PlanProjection` for plan-view rendering
- `src/components/DrawingSurface2D.tsx` — render skirt rects in plan view + skirt polygons in elevation; selection + click handlers
- `src/components/PropertyPanel.tsx` — `SkirtEditor` (with material swatch grid)
- `src/components/ToolPalette.tsx` — add `"skirt"` to `ADD_OPTIONS`
- `src/components/AppShell.tsx` — handle `toolId === "skirt"` in `handleAddComponent`
- `src/styles.css` — `.plan-skirt`, `.elevation-roof--skirt-panel`, `.elevation-roof--skirt-cap` styles

**Test additions:**
- `src/__tests__/skirtGeometry.test.ts` (new)
- `src/__tests__/slabGeometry.test.ts` — terrace case
- `src/__tests__/mutations.test.ts` — addSkirt/updateSkirt/removeSkirt + constraint failures
- `src/__tests__/persistence.test.ts` — skirt round-trip + invalid-drop
- `src/__tests__/projection.test.ts` — plan + elevation skirt projections
- `src/__tests__/ui.test.tsx` — toolbar entry, add flow, property panel, delete

---

## Slice 1: 灰瓦材质

### Task 1: Add gray-tile material to catalog

**Files:**
- Modify: `src/materials/catalog.ts`
- Test: `src/__tests__/sampleProject.test.ts` (existing, will continue passing)

- [ ] **Step 1: Add the catalog entry**

Edit `src/materials/catalog.ts` — add a new entry after `mat-clay-tile`:

```ts
  {
    id: "mat-gray-tile",
    name: "灰瓦",
    kind: "roof",
    // 深灰小青瓦，中式坡屋顶常见
    color: "#3a3f43",
  },
```

- [ ] **Step 2: Run tests to confirm no regression**

Run: `bun run test`
Expected: 286 tests pass, no failures.

- [ ] **Step 3: Commit**

```bash
git add src/materials/catalog.ts
git commit -m "feat(materials): 加灰瓦 mat-gray-tile (kind=roof)"
```

---

## Slice 2: 数据模型 + 持久化

### Task 2: Add `SkirtRoof` type + `skirts` field + `"skirt"` tool

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/sampleProject.ts`

- [ ] **Step 1: Add `SkirtRoof` type and update `HouseProject` + `ToolId`**

Edit `src/domain/types.ts`:

In `ToolId`, add `"skirt"`:
```ts
export type ToolId =
  | "select"
  | "wall"
  | "door"
  | "window"
  | "opening"
  | "balcony"
  | "stair"
  | "skirt"
  | "material";
```

Add the `SkirtRoof` type after `Roof`:
```ts
export type SkirtRoof = {
  id: string;
  /** Host exterior wall this skirt attaches to. */
  hostWallId: string;
  /** Distance along host wall from wall.start, meters. */
  offset: number;
  /** Width along the wall, meters. */
  width: number;
  /** Outward perpendicular distance to the eave line (excluding overhang). */
  depth: number;
  /** World-z of the high (wall-attached) edge, meters. */
  elevation: number;
  /** Slope in radians; valid range [π/36, π/3]. */
  pitch: number;
  /** Eave overhang on both ends along wall and outward beyond depth, meters. */
  overhang: number;
  materialId: string;
};
```

Update `HouseProject` to include `skirts`:
```ts
export type HouseProject = {
  ...existing fields...
  balconies: Balcony[];
  roof?: Roof;
  skirts: SkirtRoof[];
};
```

- [ ] **Step 2: Update sampleProject to include `skirts: []`**

Edit `src/domain/sampleProject.ts` — in the returned object, add `skirts: []` next to `balconies`:

```ts
  return {
    ...existing
    balconies,
    roof,
    skirts: [],
  };
```

- [ ] **Step 3: Run tests, expect TypeScript errors (skirts missing in test fixtures)**

Run: `bun run lint`
Expected: failures in test fixture files that construct HouseProject literals without `skirts`.

- [ ] **Step 4: Fix any test-fixture construction sites by adding `skirts: []`**

Search for `walls:` followed by HouseProject literals in test files and fix as needed:

Run: `grep -rn "balconies: \[\]" src/__tests__/ src/domain/ src/test/`

For each match that's part of a `HouseProject` literal, add `skirts: []` after `balconies: []`. Also check `src/domain/persistence.ts` if it constructs defaults.

- [ ] **Step 5: Confirm types check + tests pass**

Run: `bun run lint && bun run test`
Expected: `tsc` clean, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/domain/sampleProject.ts src/__tests__/ src/domain/ src/test/
git commit -m "feat(types): SkirtRoof 类型 + project.skirts + ToolId skirt"
```

### Task 3: Add `"skirt"` selection variant

**Files:**
- Modify: `src/domain/selection.ts`

- [ ] **Step 1: Add the variant**

Edit `src/domain/selection.ts`:

```ts
export type ObjectSelection =
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "balcony"; id: string }
  | { kind: "storey"; id: string }
  | { kind: "stair"; id: string }
  | { kind: "skirt"; id: string }
  | { kind: "roof" }
  | { kind: "roof-edge"; wallId: string };
```

- [ ] **Step 2: Run tests**

Run: `bun run lint && bun run test`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/domain/selection.ts
git commit -m "feat(selection): 加 skirt 选择类型"
```

### Task 4: Mutation `addSkirt` + draft helper

**Files:**
- Modify: `src/domain/drafts.ts`
- Modify: `src/domain/mutations.ts`
- Modify: `src/__tests__/mutations.test.ts`

- [ ] **Step 1: Write failing test for addSkirt**

Add to `src/__tests__/mutations.test.ts` (in an appropriate `describe` or new):

```ts
import { addSkirt } from "../domain/mutations";
import { createSampleProject } from "../domain/sampleProject";

describe("addSkirt", () => {
  it("adds a skirt to the given wall with default geometry", () => {
    const project = createSampleProject();
    const wall = project.walls.find((w) => w.id === "wall-front-2f")!;
    const next = addSkirt(project, wall.id);
    expect(next.skirts).toHaveLength(1);
    const skirt = next.skirts[0];
    expect(skirt.hostWallId).toBe(wall.id);
    expect(skirt.materialId).toBe("mat-gray-tile");
    expect(skirt.depth).toBeGreaterThan(0);
    expect(skirt.pitch).toBeGreaterThan(0);
    expect(skirt.elevation).toBeGreaterThan(0);
  });

  it("rejects when hostWallId does not exist", () => {
    const project = createSampleProject();
    expect(() => addSkirt(project, "wall-nonexistent")).toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL (`addSkirt` not exported)**

Run: `bunx vitest run src/__tests__/mutations.test.ts -t "addSkirt"`
Expected: FAIL — `addSkirt is not a function` or import error.

- [ ] **Step 3: Add `createSkirtDraft` to drafts.ts**

Add at the bottom of `src/domain/drafts.ts`:

```ts
import type { SkirtRoof } from "./types";

const SKIRT_DEFAULTS = {
  depth: 1.0,
  pitch: Math.PI / 6,
  overhang: 0.3,
};

function nextSkirtId(project: HouseProject, hostWallId: string): string {
  let n = 1;
  while (project.skirts.some((s) => s.id === `skirt-${hostWallId}-${n}`)) n += 1;
  return `skirt-${hostWallId}-${n}`;
}

function pickRoofMaterialId(project: HouseProject): string {
  const gray = project.materials.find((m) => m.id === "mat-gray-tile");
  if (gray) return gray.id;
  const anyRoof = project.materials.find((m) => m.kind === "roof");
  return anyRoof?.id ?? project.materials[0].id;
}

export function createSkirtDraft(
  project: HouseProject,
  hostWall: Wall,
): SkirtRoof {
  const storey = project.storeys.find((s) => s.id === hostWall.storeyId);
  if (!storey) throw new Error(`Storey ${hostWall.storeyId} not found`);
  return {
    id: nextSkirtId(project, hostWall.id),
    hostWallId: hostWall.id,
    offset: 0,
    width: wallLength(hostWall),
    depth: SKIRT_DEFAULTS.depth,
    elevation: storey.elevation + storey.height,
    pitch: SKIRT_DEFAULTS.pitch,
    overhang: SKIRT_DEFAULTS.overhang,
    materialId: pickRoofMaterialId(project),
  };
}
```

(If `wallLength` isn't already imported, add `import { wallLength } from "./measurements";` at the top.)

- [ ] **Step 4: Add `addSkirt` mutation**

Add to `src/domain/mutations.ts` (after `addBalcony` or similar):

```ts
import { createSkirtDraft } from "./drafts";
import type { SkirtRoof } from "./types";

export function addSkirt(project: HouseProject, hostWallId: string): HouseProject {
  const wall = project.walls.find((w) => w.id === hostWallId);
  if (!wall) throw new Error(`Wall ${hostWallId} not found`);
  if (!wall.exterior) throw new Error(`Skirt must attach to an exterior wall`);
  const skirt = createSkirtDraft(project, wall);
  return { ...project, skirts: [...project.skirts, skirt] };
}
```

- [ ] **Step 5: Run test, expect PASS**

Run: `bunx vitest run src/__tests__/mutations.test.ts -t "addSkirt"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/drafts.ts src/domain/mutations.ts src/__tests__/mutations.test.ts
git commit -m "feat(mutations): addSkirt + createSkirtDraft"
```

### Task 5: Mutation `updateSkirt`

**Files:**
- Modify: `src/domain/mutations.ts`
- Modify: `src/__tests__/mutations.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/__tests__/mutations.test.ts`:

```ts
describe("updateSkirt", () => {
  it("applies a patch and validates ranges", () => {
    let project = createSampleProject();
    project = addSkirt(project, "wall-front-2f");
    const id = project.skirts[0].id;
    const next = updateSkirt(project, id, { depth: 1.5, pitch: Math.PI / 4 });
    expect(next.skirts[0].depth).toBeCloseTo(1.5);
    expect(next.skirts[0].pitch).toBeCloseTo(Math.PI / 4);
  });

  it("rejects pitch out of range", () => {
    let project = createSampleProject();
    project = addSkirt(project, "wall-front-2f");
    const id = project.skirts[0].id;
    expect(() => updateSkirt(project, id, { pitch: Math.PI })).toThrow();
  });

  it("rejects offset+width exceeding wall length", () => {
    let project = createSampleProject();
    project = addSkirt(project, "wall-front-2f");
    const id = project.skirts[0].id;
    expect(() => updateSkirt(project, id, { offset: 8, width: 5 })).toThrow();
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `bunx vitest run src/__tests__/mutations.test.ts -t "updateSkirt"`
Expected: FAIL — `updateSkirt is not a function`.

- [ ] **Step 3: Implement `updateSkirt` + `SkirtPatch`**

Add to `src/domain/mutations.ts`:

```ts
import { wallLength } from "./measurements";

export type SkirtPatch = Partial<Omit<SkirtRoof, "id" | "hostWallId">>;

const SKIRT_LIMITS = {
  width: { min: 0.3 },
  depth: { min: 0.3, max: 4 },
  overhang: { min: 0.05, max: 1.5 },
  pitch: { min: Math.PI / 36, max: Math.PI / 3 },
};

export function updateSkirt(
  project: HouseProject,
  id: string,
  patch: SkirtPatch,
): HouseProject {
  const idx = project.skirts.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error(`Skirt ${id} not found`);
  const current = project.skirts[idx];
  const merged: SkirtRoof = { ...current, ...patch };

  const wall = project.walls.find((w) => w.id === merged.hostWallId);
  if (!wall) throw new Error(`Host wall ${merged.hostWallId} not found`);
  const wlen = wallLength(wall);
  const storey = project.storeys.find((s) => s.id === wall.storeyId);
  if (!storey) throw new Error(`Storey ${wall.storeyId} not found`);

  if (merged.offset < 0) throw new Error("offset 不能为负");
  if (merged.width < SKIRT_LIMITS.width.min) throw new Error("宽度过小");
  if (merged.offset + merged.width > wlen + 1e-6) throw new Error("披檐超出墙长");
  if (merged.depth < SKIRT_LIMITS.depth.min || merged.depth > SKIRT_LIMITS.depth.max) {
    throw new Error("外伸深度超出范围");
  }
  if (merged.overhang < SKIRT_LIMITS.overhang.min || merged.overhang > SKIRT_LIMITS.overhang.max) {
    throw new Error("出檐超出范围");
  }
  if (merged.pitch < SKIRT_LIMITS.pitch.min || merged.pitch > SKIRT_LIMITS.pitch.max) {
    throw new Error("坡度超出范围");
  }
  if (merged.elevation <= storey.elevation || merged.elevation > storey.elevation + storey.height + 1e-6) {
    throw new Error("挂接高度必须在所属楼层范围内");
  }

  const skirts = [...project.skirts];
  skirts[idx] = merged;
  return { ...project, skirts };
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `bunx vitest run src/__tests__/mutations.test.ts -t "updateSkirt"`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/domain/mutations.ts src/__tests__/mutations.test.ts
git commit -m "feat(mutations): updateSkirt + 范围验证"
```

### Task 6: Mutation `removeSkirt`

**Files:**
- Modify: `src/domain/mutations.ts`
- Modify: `src/__tests__/mutations.test.ts`

- [ ] **Step 1: Write failing test**

Add to `src/__tests__/mutations.test.ts`:

```ts
describe("removeSkirt", () => {
  it("removes the skirt and clears matching selection", () => {
    let project = createSampleProject();
    project = addSkirt(project, "wall-front-2f");
    const id = project.skirts[0].id;
    project = { ...project, selection: { kind: "skirt", id } };
    const next = removeSkirt(project, id);
    expect(next.skirts).toHaveLength(0);
    expect(next.selection).toBeUndefined();
  });

  it("preserves other selections", () => {
    let project = createSampleProject();
    project = addSkirt(project, "wall-front-2f");
    const id = project.skirts[0].id;
    project = { ...project, selection: { kind: "wall", id: "wall-front-1f" } };
    const next = removeSkirt(project, id);
    expect(next.selection).toEqual({ kind: "wall", id: "wall-front-1f" });
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `bunx vitest run src/__tests__/mutations.test.ts -t "removeSkirt"`
Expected: FAIL — `removeSkirt is not a function`.

- [ ] **Step 3: Implement `removeSkirt`**

Add to `src/domain/mutations.ts`:

```ts
export function removeSkirt(project: HouseProject, id: string): HouseProject {
  const skirts = project.skirts.filter((s) => s.id !== id);
  if (skirts.length === project.skirts.length) return project;
  const selection =
    project.selection?.kind === "skirt" && project.selection.id === id
      ? undefined
      : project.selection;
  return { ...project, skirts, selection };
}
```

- [ ] **Step 4: Run tests**

Run: `bunx vitest run src/__tests__/mutations.test.ts -t "removeSkirt"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/mutations.ts src/__tests__/mutations.test.ts
git commit -m "feat(mutations): removeSkirt + 选区清理"
```

### Task 7: Persistence schema for `skirts`

**Files:**
- Modify: `src/app/persistence.ts`
- Modify: `src/__tests__/persistence.test.ts`

- [ ] **Step 1: Inspect current persistence approach**

Run: `grep -n "skirts\|roof\|balcony" src/app/persistence.ts | head -20`

Read the file to understand serialization + validation pattern.

- [ ] **Step 2: Write failing test**

Add to `src/__tests__/persistence.test.ts`:

```ts
import { exportProjectJson, importProjectJson } from "../app/persistence";
import { addSkirt } from "../domain/mutations";

describe("skirts persistence", () => {
  it("round-trips skirts through export → import", () => {
    let project = createSampleProject();
    project = addSkirt(project, "wall-front-2f");
    const json = exportProjectJson(project);
    const restored = importProjectJson(json);
    expect(restored.skirts).toHaveLength(1);
    expect(restored.skirts[0].hostWallId).toBe("wall-front-2f");
  });

  it("defaults skirts to [] when missing in legacy projects", () => {
    const project = createSampleProject();
    const json = exportProjectJson(project);
    const parsed = JSON.parse(json);
    delete parsed.skirts;
    const restored = importProjectJson(JSON.stringify(parsed));
    expect(restored.skirts).toEqual([]);
  });

  it("drops skirts pointing at non-existent walls", () => {
    let project = createSampleProject();
    project = addSkirt(project, "wall-front-2f");
    const json = exportProjectJson(project);
    const parsed = JSON.parse(json);
    parsed.skirts[0].hostWallId = "wall-bogus";
    const restored = importProjectJson(JSON.stringify(parsed));
    expect(restored.skirts).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test, expect FAIL**

Run: `bunx vitest run src/__tests__/persistence.test.ts -t "skirts persistence"`
Expected: FAIL.

- [ ] **Step 4: Update persistence**

Edit `src/app/persistence.ts`:
- Include `skirts` in the serialized payload (already happens automatically if using `JSON.stringify(project)`; verify).
- In the validator/deserialize step:
  - Default missing `skirts` to `[]`
  - For each skirt, verify `hostWallId` exists in walls; verify ranges (use the same limits as `SKIRT_LIMITS` in mutations — extract to a shared file `src/domain/skirtLimits.ts` if re-used)
  - Drop invalid skirts

Sketch:
```ts
function validateSkirts(raw: unknown, walls: Wall[]): SkirtRoof[] {
  if (!Array.isArray(raw)) return [];
  const wallIds = new Set(walls.map((w) => w.id));
  return raw.filter((s): s is SkirtRoof => {
    if (typeof s?.id !== "string") return false;
    if (!wallIds.has(s.hostWallId)) return false;
    if (typeof s.offset !== "number" || s.offset < 0) return false;
    if (typeof s.width !== "number" || s.width < 0.3) return false;
    if (typeof s.depth !== "number" || s.depth < 0.3 || s.depth > 4) return false;
    if (typeof s.pitch !== "number" || s.pitch < Math.PI / 36 || s.pitch > Math.PI / 3) return false;
    if (typeof s.overhang !== "number" || s.overhang < 0.05 || s.overhang > 1.5) return false;
    if (typeof s.elevation !== "number") return false;
    if (typeof s.materialId !== "string") return false;
    return true;
  });
}
```

Wire into existing `deserialize`/`parseProject` after walls are validated.

- [ ] **Step 5: Run tests**

Run: `bunx vitest run src/__tests__/persistence.test.ts`
Expected: all tests pass including new skirt cases.

- [ ] **Step 6: Commit**

```bash
git add src/app/persistence.ts src/__tests__/persistence.test.ts
git commit -m "feat(persistence): 序列化/校验 skirts，缺失字段默认 []"
```

---

## Slice 3: 几何

### Task 8: `buildSkirtGeometry` (panel + 2 end caps)

**Files:**
- Create: `src/geometry/skirtGeometry.ts`
- Create: `src/__tests__/skirtGeometry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/skirtGeometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildSkirtGeometry } from "../geometry/skirtGeometry";
import type { SkirtRoof, Wall } from "../domain/types";

const HOST_WALL: Wall = {
  id: "wall-host",
  storeyId: "1f",
  start: { x: 0, y: 0 },
  end: { x: 10, y: 0 },          // along +x; outward normal is +y (using wall.right convention)
  thickness: 0.24,
  height: 3,
  exterior: true,
  materialId: "mat-white-render",
};

function makeSkirt(overrides: Partial<SkirtRoof> = {}): SkirtRoof {
  return {
    id: "skirt-1",
    hostWallId: HOST_WALL.id,
    offset: 0,
    width: 10,
    depth: 1.0,
    elevation: 3.0,
    pitch: Math.PI / 6,
    overhang: 0.3,
    materialId: "mat-gray-tile",
    ...overrides,
  };
}

describe("buildSkirtGeometry", () => {
  it("emits a 4-vertex panel + 2 end caps", () => {
    const geom = buildSkirtGeometry(makeSkirt(), HOST_WALL);
    expect(geom.panel.vertices).toHaveLength(4);
    expect(geom.endCaps).toHaveLength(2);
    expect(geom.endCaps[0].vertices).toHaveLength(3);
    expect(geom.endCaps[1].vertices).toHaveLength(3);
  });

  it("anchor edge sits at elevation, eave edge sits lower by depth*tan(pitch) + overhang*tan(pitch)", () => {
    const geom = buildSkirtGeometry(makeSkirt(), HOST_WALL);
    const zs = geom.panel.vertices.map((v) => v.z);
    const high = Math.max(...zs);
    const low = Math.min(...zs);
    expect(high).toBeCloseTo(3.0);
    const drop = (1.0 + 0.3) * Math.tan(Math.PI / 6);
    expect(low).toBeCloseTo(3.0 - drop);
  });

  it("anchor edge spans wall direction with overhang on both ends", () => {
    const geom = buildSkirtGeometry(makeSkirt(), HOST_WALL);
    // Wall is along +x from x=0 to x=10. Anchor line should span x=[-0.3, 10.3] with overhang.
    const anchorVerts = geom.panel.vertices.filter((v) => v.z > 2.99);
    const xs = anchorVerts.map((v) => v.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-0.3);
    expect(xs[xs.length - 1]).toBeCloseTo(10.3);
  });

  it("eave edge offset outward by depth+overhang along wall normal (+y for this host wall)", () => {
    const geom = buildSkirtGeometry(makeSkirt(), HOST_WALL);
    const eaveVerts = geom.panel.vertices.filter((v) => v.z < 3.0);
    for (const v of eaveVerts) {
      expect(v.y).toBeCloseTo(1.3);
    }
  });

  it("end cap at offset side has W-vertex (wall, low) at host start + overhang anchor x, low z", () => {
    const geom = buildSkirtGeometry(makeSkirt(), HOST_WALL);
    const startCap = geom.endCaps[0];
    const ws = startCap.vertices.filter((v) => v.y === 0); // on wall plane
    expect(ws.length).toBeGreaterThan(0);
  });

  it("partial-width skirt with offset > 0", () => {
    const geom = buildSkirtGeometry(makeSkirt({ offset: 2, width: 4 }), HOST_WALL);
    const anchorVerts = geom.panel.vertices.filter((v) => v.z > 2.99);
    const xs = anchorVerts.map((v) => v.x).sort((a, b) => a - b);
    // Anchor spans [offset - overhang, offset + width + overhang] = [1.7, 6.3]
    expect(xs[0]).toBeCloseTo(1.7);
    expect(xs[xs.length - 1]).toBeCloseTo(6.3);
  });
});
```

- [ ] **Step 2: Run tests, expect FAIL (module not found)**

Run: `bunx vitest run src/__tests__/skirtGeometry.test.ts`
Expected: FAIL — `Cannot find module '../geometry/skirtGeometry'`.

- [ ] **Step 3: Implement `buildSkirtGeometry`**

Create `src/geometry/skirtGeometry.ts`:

```ts
import type { Point3, SkirtRoof, Wall } from "../domain/types";

export type SkirtGeometry = {
  skirtId: string;
  panel: { vertices: Point3[] };  // 4 verts CCW from outside: A0, A1, E1, E0
  endCaps: { vertices: Point3[] }[];  // 2 triangles, each 3 verts
  materialId: string;
};

/**
 * Build lean-to skirt roof geometry for the given SkirtRoof on its host Wall.
 *
 * Convention:
 *  û = host wall unit direction (start → end)
 *  n̂ = host wall outward unit normal (right side of û in plan; +90° CCW rotation of û)
 *  Anchor line sits on wall at z=elevation, spanning [offset - overhang, offset + width + overhang]
 *  Eave line sits at distance (depth + overhang) outward, at z = elevation - (depth+overhang)*tan(pitch)
 *  Panel: 4-vertex trapezoid (here a parallelogram since both edges have equal extent)
 *  End caps: vertical triangles at each short end (gable-style flush cut)
 */
export function buildSkirtGeometry(skirt: SkirtRoof, hostWall: Wall): SkirtGeometry {
  const dx = hostWall.end.x - hostWall.start.x;
  const dy = hostWall.end.y - hostWall.start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    throw new Error(`Cannot build skirt on zero-length wall ${hostWall.id}`);
  }
  const ux = dx / len;
  const uy = dy / len;
  // Outward normal = û rotated +90° CCW (gives right side, matching wall.right convention).
  const nx = -uy;
  const ny = ux;

  const drop = (skirt.depth + skirt.overhang) * Math.tan(skirt.pitch);
  const a0Along = skirt.offset - skirt.overhang;
  const a1Along = skirt.offset + skirt.width + skirt.overhang;
  const eaveOut = skirt.depth + skirt.overhang;

  const A0: Point3 = {
    x: hostWall.start.x + ux * a0Along,
    y: hostWall.start.y + uy * a0Along,
    z: skirt.elevation,
  };
  const A1: Point3 = {
    x: hostWall.start.x + ux * a1Along,
    y: hostWall.start.y + uy * a1Along,
    z: skirt.elevation,
  };
  const E0: Point3 = {
    x: A0.x + nx * eaveOut,
    y: A0.y + ny * eaveOut,
    z: skirt.elevation - drop,
  };
  const E1: Point3 = {
    x: A1.x + nx * eaveOut,
    y: A1.y + ny * eaveOut,
    z: skirt.elevation - drop,
  };

  // Panel CCW from outside (looking down the slope from outside the building):
  // A0 → A1 along anchor, then A1 → E1 down to eave, E1 → E0 along eave, E0 → A0 back up.
  const panel = { vertices: [A0, A1, E1, E0] };

  // End caps: vertical triangles in the wall-perpendicular plane, closing the gap
  // between the slope and the lower elevation. W is on wall plane (no n̂ offset)
  // at z = E.z, directly "below" A in the slope sense.
  const W0: Point3 = { x: A0.x, y: A0.y, z: E0.z };
  const W1: Point3 = { x: A1.x, y: A1.y, z: E1.z };

  // CCW from outside the cap: at offset-side, looking from -û direction toward +û,
  // outward is +û direction. Triangle (W0, A0, E0) winds CCW as seen from -û.
  // At +width side, outward is -û direction; triangle (A1, W1, E1) winds CCW.
  const endCaps = [
    { vertices: [W0, A0, E0] },
    { vertices: [A1, W1, E1] },
  ];

  return { skirtId: skirt.id, panel, endCaps, materialId: skirt.materialId };
}
```

- [ ] **Step 4: Run tests, expect PASS**

Run: `bunx vitest run src/__tests__/skirtGeometry.test.ts`
Expected: PASS for all 6 cases.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/skirtGeometry.ts src/__tests__/skirtGeometry.test.ts
git commit -m "feat(geometry): buildSkirtGeometry + 单测"
```

### Task 9: Wire `SkirtGeometry` into `HouseGeometry`

**Files:**
- Modify: `src/geometry/types.ts`
- Modify: `src/geometry/houseGeometry.ts`

- [ ] **Step 1: Add to `HouseGeometry` type**

Edit `src/geometry/types.ts`:

```ts
import type { SkirtGeometry } from "./skirtGeometry";

export type HouseGeometry = {
  ...existing
  roof?: RoofGeometry;
  skirts: SkirtGeometry[];
};
```

- [ ] **Step 2: Build skirts in `buildHouseGeometry`**

Edit `src/geometry/houseGeometry.ts`:

Add import at top:
```ts
import { buildSkirtGeometry } from "./skirtGeometry";
```

Inside `buildHouseGeometry`, after building `roof`, add:
```ts
  const skirts = project.skirts.flatMap((skirt) => {
    const wall = project.walls.find((w) => w.id === skirt.hostWallId);
    if (!wall) return [];
    return [buildSkirtGeometry(skirt, wall)];
  });
```

In the `return` object, add `skirts`:
```ts
  return {
    ...existing
    roof,
    skirts,
  };
```

- [ ] **Step 3: Run tests**

Run: `bun run test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/geometry/types.ts src/geometry/houseGeometry.ts
git commit -m "feat(geometry): HouseGeometry.skirts + buildHouseGeometry 接入"
```

### Task 10: 退台楼板 — `buildSlabGeometry` accepts override outline source

**Files:**
- Modify: `src/geometry/slabGeometry.ts`
- Modify: `src/geometry/houseGeometry.ts`
- Modify: `src/__tests__/slabGeometry.test.ts`

- [ ] **Step 1: Write failing test for terrace slab**

Add to `src/__tests__/slabGeometry.test.ts`:

```ts
describe("buildSlabGeometry — terrace via outline override", () => {
  it("uses overrideOutlineWalls when provided (storey N>0 sees N-1's footprint)", () => {
    const lowerWalls: Wall[] = [
      { id: "lw-1", storeyId: "1f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "lw-2", storeyId: "1f", start: { x: 10, y: 0 }, end: { x: 10, y: 8 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "lw-3", storeyId: "1f", start: { x: 10, y: 8 }, end: { x: 0, y: 8 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "lw-4", storeyId: "1f", start: { x: 0, y: 8 }, end: { x: 0, y: 0 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
    ];
    const upperWalls: Wall[] = [
      { id: "uw-1", storeyId: "2f", start: { x: 2, y: 2 }, end: { x: 8, y: 2 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "uw-2", storeyId: "2f", start: { x: 8, y: 2 }, end: { x: 8, y: 6 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "uw-3", storeyId: "2f", start: { x: 8, y: 6 }, end: { x: 2, y: 6 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
      { id: "uw-4", storeyId: "2f", start: { x: 2, y: 6 }, end: { x: 2, y: 2 }, thickness: 0.24, height: 3, exterior: true, materialId: "m" },
    ];

    const upperStorey: Storey = { id: "2f", label: "2F", elevation: 3, height: 3, slabThickness: 0.18 };

    const allWalls = [...lowerWalls, ...upperWalls];
    const footprints = new Map();
    for (const fp of buildWallNetwork(lowerWalls)) footprints.set(fp.wallId, fp);
    for (const fp of buildWallNetwork(upperWalls)) footprints.set(fp.wallId, fp);

    const slab = buildSlabGeometry(upperStorey, allWalls, footprints, "mat-gray-stone", undefined, lowerWalls);
    expect(slab).toBeDefined();
    // Outline should be the lower (10x8) ring, not the upper (6x4) ring.
    const xs = slab!.outline.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(8);
  });
});
```

(Adjust imports — add `buildWallNetwork` import and `Wall`/`Storey` types as needed.)

- [ ] **Step 2: Run test, expect FAIL (signature mismatch)**

Run: `bunx vitest run src/__tests__/slabGeometry.test.ts -t "terrace"`
Expected: FAIL — type error or unexpected outline.

- [ ] **Step 3: Add `outlineWalls` parameter to `buildSlabGeometry`**

Edit `src/geometry/slabGeometry.ts`:

```ts
export function buildSlabGeometry(
  storey: Storey,
  walls: Wall[],
  footprintIndex: Map<string, FootprintQuad>,
  materialId: string,
  customHole?: Point2[],
  outlineWalls?: Wall[],  // new: when provided, use these walls' exterior ring as outline
): SlabGeometry | undefined {
  const wallsForOutline = outlineWalls ?? walls.filter((wall) => wall.storeyId === storey.id);
  const outline = buildExteriorRing(wallsForOutline, footprintIndex);
  if (!outline) return undefined;

  const hole = customHole ?? (storey.stair ? holeFromOpening(storey.stair) : undefined);

  return {
    storeyId: storey.id,
    kind: "floor",
    outline: insetRing(outline, FACADE_INSET),
    hole,
    topY: storey.elevation,
    thickness: storey.slabThickness,
    materialId,
  };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `bunx vitest run src/__tests__/slabGeometry.test.ts -t "terrace"`
Expected: PASS.

- [ ] **Step 5: Use override in `buildHouseGeometry`**

Edit `src/geometry/houseGeometry.ts`:

Replace the slab-building loop:
```ts
  const slabs: SlabGeometry[] = [];
  for (const storey of project.storeys) {
    const slab = buildSlabGeometry(
      storey,
      project.walls,
      footprints,
      SLAB_MATERIAL_ID,
      slabHoleByStorey.get(storey.id),
    );
    if (slab) slabs.push(slab);
  }
```

with:
```ts
  const slabs: SlabGeometry[] = [];
  for (let i = 0; i < sortedStoreys.length; i += 1) {
    const storey = sortedStoreys[i];
    const lowerStorey = i > 0 ? sortedStoreys[i - 1] : undefined;
    const outlineWalls = lowerStorey
      ? project.walls.filter((w) => w.storeyId === lowerStorey.id)
      : undefined;
    const slab = buildSlabGeometry(
      storey,
      project.walls,
      footprints,
      SLAB_MATERIAL_ID,
      slabHoleByStorey.get(storey.id),
      outlineWalls,
    );
    if (slab) slabs.push(slab);
  }
```

- [ ] **Step 6: Run all tests**

Run: `bun run test`
Expected: all pass; sample project's slabs unchanged (all storeys same footprint), terrace test passes.

- [ ] **Step 7: Commit**

```bash
git add src/geometry/slabGeometry.ts src/geometry/houseGeometry.ts src/__tests__/slabGeometry.test.ts
git commit -m "feat(geometry): 退台楼板 — N>0 storey 用 N-1 walls 做 outline"
```

---

## Slice 4: 3D rendering

### Task 11: `createSkirtMeshes` in threeScene

**Files:**
- Modify: `src/rendering/threeScene.ts`

- [ ] **Step 1: Add `createSkirtMeshes` function**

Edit `src/rendering/threeScene.ts`:

Add after `createRoofMeshes` (around line 670):

```ts
function buildSkirtPanelMesh(panel: { vertices: Point3[] }, material: THREE.Material): THREE.Mesh {
  const positions: number[] = [];
  for (let i = 1; i < panel.vertices.length - 1; i += 1) {
    const a = panel.vertices[0];
    const b = panel.vertices[i];
    const c = panel.vertices[i + 1];
    positions.push(a.x, a.z, planYToSceneZ(a.y));
    positions.push(b.x, b.z, planYToSceneZ(b.y));
    positions.push(c.x, c.z, planYToSceneZ(c.y));
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return new THREE.Mesh(geom, material);
}

function createSkirtMeshes(project: HouseProject, geometry: HouseGeometry) {
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.Material[] = [];
  if (geometry.skirts.length === 0) return { meshes, materials };

  const panelCache = new Map<string, THREE.Material>();
  const capCache = new Map<string, THREE.Material>();

  for (const skirt of geometry.skirts) {
    let panelMat = panelCache.get(skirt.materialId);
    if (!panelMat) {
      panelMat = createRoofPanelMaterial(project, skirt.materialId);
      panelCache.set(skirt.materialId, panelMat);
      materials.push(panelMat);
    }
    meshes.push(buildSkirtPanelMesh(skirt.panel, panelMat));

    // End caps use the host wall's material for visual continuity (matches gable convention).
    const hostWall = project.walls.find((w) => w.id === extractHostWallIdFromSkirtId(skirt.skirtId, project));
    const capMatId = hostWall?.materialId ?? "";
    let capMat = capCache.get(capMatId);
    if (!capMat) {
      capMat = createRoofGableMaterial(project, capMatId);
      capCache.set(capMatId, capMat);
      materials.push(capMat);
    }
    for (const cap of skirt.endCaps) {
      meshes.push(buildSkirtPanelMesh(cap, capMat));
    }
  }
  return { meshes, materials };
}

// SkirtGeometry doesn't carry hostWallId; recover it via project.skirts lookup.
function extractHostWallIdFromSkirtId(skirtId: string, project: HouseProject): string | undefined {
  return project.skirts.find((s) => s.id === skirtId)?.hostWallId;
}
```

- [ ] **Step 2: Wire into `mountHouseScene`**

In `mountHouseScene`, near the existing `createRoofMeshes` line (~716):

```ts
  const { meshes: roofMeshes, materials: roofMaterials } = createRoofMeshes(project, houseGeometry);
  const { meshes: skirtMeshes, materials: skirtMaterials } = createSkirtMeshes(project, houseGeometry);
```

Update the combined arrays (~758):
```ts
  const meshes = [...wallMeshes, ...balconyMeshes, ...slabMeshes, ...stairMeshes, ...roofMeshes, ...skirtMeshes];
  const materials = [...wallMaterials, ...balconyMaterials, ...slabMaterials, ...stairMaterials, ...roofMaterials, ...skirtMaterials];
```

Update `collidables` (~780):
```ts
  const collidables: THREE.Object3D[] = [...wallMeshes, ...slabMeshes, ...balconyMeshes, ...stairMeshes, ...roofMeshes, ...skirtMeshes, ground];
```

- [ ] **Step 3: Sanity-check via tests + dev server**

Run: `bun run test && bun run lint`
Expected: clean.

Manual check (optional): start dev server, add a skirt to sample, switch to 3D, see skirt mesh.

- [ ] **Step 4: Commit**

```bash
git add src/rendering/threeScene.ts
git commit -m "feat(3d): createSkirtMeshes 接入 threeScene"
```

---

## Slice 5: 2D plan rendering

### Task 12: Plan-view skirt projection type + projection

**Files:**
- Modify: `src/projection/types.ts`
- Modify: `src/projection/plan.ts`

- [ ] **Step 1: Add `PlanSkirtRect` type**

Edit `src/projection/types.ts`:

```ts
export type PlanSkirtRect = {
  skirtId: string;
  hostWallId: string;
  /** 4 vertices of the plan-view rectangle (CCW), already in plan space. */
  vertices: Point2[];
};

export type PlanProjection = {
  ...existing
  skirts: PlanSkirtRect[];
};
```

- [ ] **Step 2: Project skirts in `projectPlanView`**

Edit `src/projection/plan.ts`:

Add a helper that uses `buildSkirtGeometry` to derive plan-view footprint:

```ts
import { buildSkirtGeometry } from "../geometry/skirtGeometry";

function planSkirtRects(project: HouseProject): PlanSkirtRect[] {
  return project.skirts.flatMap((skirt) => {
    const wall = project.walls.find((w) => w.id === skirt.hostWallId);
    if (!wall) return [];
    const geom = buildSkirtGeometry(skirt, wall);
    // Use panel's 4 vertices projected to (x, y) plan space (drop z).
    const verts = geom.panel.vertices.map((v) => ({ x: v.x, y: v.y }));
    return [{ skirtId: skirt.id, hostWallId: skirt.hostWallId, vertices: verts }];
  });
}
```

In the projection's return object, include `skirts: planSkirtRects(project)`. Filter to only include skirts whose hostWall is on the queried storey:

```ts
  const skirts = planSkirtRects(project).filter((rect) => {
    const wall = project.walls.find((w) => w.id === rect.hostWallId);
    return wall?.storeyId === storeyId;
  });
```

- [ ] **Step 3: Add a smoke test**

Add to `src/__tests__/projection.test.ts`:

```ts
describe("plan view — skirts", () => {
  it("includes skirts for the queried storey only", () => {
    let project = createSampleProject();
    project = addSkirt(project, "wall-front-2f");
    const plan2f = projectPlanView(project, "2f");
    expect(plan2f.skirts).toHaveLength(1);
    expect(plan2f.skirts[0].hostWallId).toBe("wall-front-2f");
    const plan1f = projectPlanView(project, "1f");
    expect(plan1f.skirts).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `bunx vitest run src/__tests__/projection.test.ts -t "plan view — skirts"`
Expected: PASS.

Run: `bun run test`
Expected: all 290+ tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/projection/types.ts src/projection/plan.ts src/__tests__/projection.test.ts
git commit -m "feat(projection): plan view 包含 skirts"
```

### Task 13: Render skirts in plan view

**Files:**
- Modify: `src/components/DrawingSurface2D.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add CSS for plan skirts**

Append to `src/styles.css`:

```css
.plan-skirt {
  fill: rgba(58, 63, 67, 0.25);    /* gray tile, semi-transparent */
  stroke: #3a3f43;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
  cursor: pointer;
}

.plan-skirt.is-selected {
  stroke: #c75300;
  stroke-width: 2.5;
  stroke-dasharray: none;
  filter: drop-shadow(0 0 3px rgba(199, 83, 0, 0.7));
}
```

- [ ] **Step 2: Render skirts in `renderPlan`**

In `src/components/DrawingSurface2D.tsx`, locate `renderPlan` (search for `function renderPlan`).

In the JSX returned by `renderPlan`, add — after the wall segments but before stair symbols, or wherever logical:

```tsx
      {projection.skirts.map((rect) => {
        const points = rect.vertices
          .map((v) => {
            const p = projectPoint(v);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        const selected = isSelected(selection, "skirt", rect.skirtId);
        return (
          <polygon
            key={rect.skirtId}
            className={`plan-skirt${selected ? " is-selected" : ""}`}
            points={points}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ kind: "skirt", id: rect.skirtId });
            }}
          />
        );
      })}
```

(Confirm `projectPoint` is the local mapping fn already used for wall/balcony rendering. Read `renderPlan` first to identify the correct projector name.)

- [ ] **Step 3: Run tests + manual check**

Run: `bun run test && bun run lint`
Expected: clean.

Manual: add skirt via dev tools console (`window` doesn't expose state so this requires UI; defer manual test until Slice 7).

- [ ] **Step 4: Commit**

```bash
git add src/components/DrawingSurface2D.tsx src/styles.css
git commit -m "feat(2d-plan): 渲染 skirts + 选中态"
```

---

## Slice 6: 2D elevation rendering

### Task 14: Elevation projection of skirts

**Files:**
- Modify: `src/projection/types.ts`
- Modify: `src/projection/elevation.ts`

- [ ] **Step 1: Add `skirts` to ElevationProjection**

Edit `src/projection/types.ts`:

```ts
export type ElevationProjection = {
  ...existing
  roof?: ElevationRoofPolygon[];
  skirts?: ElevationRoofPolygon[];  // panel + caps from each visible skirt
};
```

- [ ] **Step 2: Project skirts in `projectElevationView`**

Edit `src/projection/elevation.ts`:

Add helper near `projectRoofToElevation`:

```ts
import { buildSkirtGeometry } from "../geometry/skirtGeometry";

function projectSkirtsToElevation(
  project: HouseProject,
  side: ElevationSide,
): ElevationRoofPolygon[] {
  const projectVert = (v: Point3): Point2 => ({ x: projectAxis(v, side), y: v.z });
  const result: ElevationRoofPolygon[] = [];
  for (const skirt of project.skirts) {
    const wall = project.walls.find((w) => w.id === skirt.hostWallId);
    if (!wall) continue;
    const geom = buildSkirtGeometry(skirt, wall);
    result.push({ kind: "panel", vertices: geom.panel.vertices.map(projectVert) });
    for (const cap of geom.endCaps) {
      result.push({ kind: "gable", vertices: cap.vertices.map(projectVert) });
    }
  }
  return result;
}
```

In `projectElevationView`'s return, add:
```ts
  const skirts = projectSkirtsToElevation(project, side);

  return {
    ...
    roof,
    skirts: skirts.length > 0 ? skirts : undefined,
    ...
  };
```

- [ ] **Step 3: Write failing test**

Add to `src/__tests__/projection.test.ts`:

```ts
describe("elevation — skirts", () => {
  it("includes skirt polygons in front elevation when skirt is on a front wall", () => {
    let project = createSampleProject();
    project = addSkirt(project, "wall-front-2f");
    const front = projectElevationView(project, "front");
    expect(front.skirts).toBeDefined();
    expect(front.skirts!.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `bunx vitest run src/__tests__/projection.test.ts -t "elevation — skirts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/projection/types.ts src/projection/elevation.ts src/__tests__/projection.test.ts
git commit -m "feat(projection): elevation 包含 skirts 投影"
```

### Task 15: Render skirts in elevation view + bounds

**Files:**
- Modify: `src/components/DrawingSurface2D.tsx`

- [ ] **Step 1: Include skirt verts in `elevationBounds`**

Edit `src/components/DrawingSurface2D.tsx` — in `elevationBounds`, after the `projection.roof` block:

```ts
  if (projection.skirts) {
    for (const poly of projection.skirts) {
      for (const v of poly.vertices) {
        xValues.push(v.x);
        yValues.push(v.y);
      }
    }
  }
```

- [ ] **Step 2: Render skirts in `renderElevation`**

In `renderElevation`, after the existing roof polygons block (where `projection.roof?.map(...)` is), add:

```tsx
      {projection.skirts?.map((poly, index) => {
        const points = poly.vertices
          .map((v) => {
            const p = projectPoint(v);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={`skirt-${poly.kind}-${index}`}
            className={`elevation-roof elevation-roof--${poly.kind === "panel" ? "panel" : "gable"}`}
            points={points}
          />
        );
      })}
```

(Reuses existing `.elevation-roof--panel` / `.elevation-roof--gable` styles. If skirts should look different from main roof, add separate classes — but for phase 1, sharing is fine.)

- [ ] **Step 3: Run tests**

Run: `bun run test && bun run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/DrawingSurface2D.tsx
git commit -m "feat(2d-elev): 渲染 skirts polygon + bounds 纳入"
```

---

## Slice 7: PropertyPanel + 工具栏

### Task 16: Add 「披檐」 to ToolPalette

**Files:**
- Modify: `src/components/ToolPalette.tsx`

- [ ] **Step 1: Add the option**

Edit `src/components/ToolPalette.tsx`:

```ts
const ADD_OPTIONS: AddOption[] = [
  { id: "wall", label: "墙" },
  { id: "door", label: "门" },
  { id: "window", label: "窗" },
  { id: "opening", label: "开孔" },
  { id: "balcony", label: "阳台" },
  { id: "stair", label: "楼梯" },
  { id: "skirt", label: "披檐" },
];
```

- [ ] **Step 2: Run tests**

Run: `bun run test && bun run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ToolPalette.tsx
git commit -m "feat(ui): ToolPalette 加披檐入口"
```

### Task 17: Wire `"skirt"` add in AppShell

**Files:**
- Modify: `src/components/AppShell.tsx`

- [ ] **Step 1: Handle `toolId === "skirt"` in `handleAddComponent`**

Edit `src/components/AppShell.tsx`:

Add an import:
```ts
import { addSkirt } from "../domain/mutations";
```

Inside `handleAddComponent`, after the `if (toolId === "stair") { ... return; }` block but before `pickTargetWall`, add:

```ts
      if (toolId === "skirt") {
        const wall = pickTargetWall(project, storeyId, elevationSide);
        if (!wall) {
          setAddError("当前楼层没有可附着的外墙,先添加一面墙。");
          return;
        }
        const next = addSkirt(project, wall.id);
        const newSkirt = next.skirts[next.skirts.length - 1];
        dispatch({ type: "replace-project", project: next });
        dispatch({ type: "select", selection: { kind: "skirt", id: newSkirt.id } });
        return;
      }
```

- [ ] **Step 2: Run tests**

Run: `bun run test && bun run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/AppShell.tsx
git commit -m "feat(ui): AppShell 处理 skirt 添加 + 自动选中"
```

### Task 18: SkirtEditor in PropertyPanel

**Files:**
- Modify: `src/components/PropertyPanel.tsx`

- [ ] **Step 1: Add `SkirtEditor` component**

Edit `src/components/PropertyPanel.tsx`:

Add to imports:
```ts
import { addSkirt, removeSkirt, updateSkirt, type SkirtPatch } from "../domain/mutations";
```

(Or just adjust existing mutation import statement to include `removeSkirt`, `updateSkirt`, `SkirtPatch`.)

Add the editor function (after `RoofEdgeEditor`):

```tsx
function SkirtEditor({ project, id, onProjectChange }: EditorProps) {
  const skirt = project.skirts.find((s) => s.id === id);
  if (!skirt) return null;
  const roofMaterials = project.materials.filter((m) => m.kind === "roof");
  const pitchDeg = Math.round((skirt.pitch * 180) / Math.PI);

  const apply = (patch: SkirtPatch): string | undefined =>
    commit(onProjectChange, patch, (final) => updateSkirt(project, id, final));

  return (
    <>
      <section className="property-section" aria-labelledby="skirt-heading">
        <h3 id="skirt-heading">披檐 · {skirt.id}</h3>
        <MmField label="起点偏移" value={skirt.offset} min={0} onCommit={(offset) => apply({ offset })} />
        <MmField label="宽度" value={skirt.width} min={0.3} onCommit={(width) => apply({ width })} />
        <MmField label="外伸深度" value={skirt.depth} min={0.3} max={4} onCommit={(depth) => apply({ depth })} />
        <MmField label="挂接高度" value={skirt.elevation} onCommit={(elevation) => apply({ elevation })} />
        <NumberField
          label="坡度"
          value={pitchDeg}
          step={1}
          min={5}
          max={60}
          unit="°"
          onCommit={(deg) => apply({ pitch: (deg * Math.PI) / 180 })}
        />
        <MmField label="出檐" value={skirt.overhang} step={50} min={0.05} max={1.5} onCommit={(overhang) => apply({ overhang })} />
      </section>
      <section className="material-catalog" aria-labelledby="skirt-material-heading">
        <h3 id="skirt-material-heading">材质</h3>
        <div className="material-list">
          {roofMaterials.map((material) => (
            <button
              aria-pressed={skirt.materialId === material.id}
              className="material-swatch"
              key={material.id}
              onClick={() => apply({ materialId: material.id })}
              type="button"
            >
              <span aria-hidden="true" className="material-swatch-color" style={{ backgroundColor: material.color }} />
              <span>{material.name}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Render `SkirtEditor` for the `skirt` selection**

In the `PropertyPanel` return JSX, add (next to the other editor renders):

```tsx
      {selection?.kind === "skirt" ? (
        <SkirtEditor project={project} id={selection.id} onProjectChange={onProjectChange} />
      ) : null}
```

- [ ] **Step 3: Make `skirt` deletable**

Update `isDeletable` to include skirt:

```ts
  const isDeletable =
    selection?.kind === "wall" ||
    selection?.kind === "opening" ||
    selection?.kind === "balcony" ||
    selection?.kind === "stair" ||
    selection?.kind === "skirt" ||
    (selection?.kind === "storey" && project.storeys.length > 1);
```

- [ ] **Step 4: Wire delete handler**

Locate `onDeleteSelection` in `AppShell.tsx` (the function passed to PropertyPanel). Add a branch for `"skirt"`:

```ts
    if (selection.kind === "skirt") {
      dispatch({ type: "replace-project", project: removeSkirt(project, selection.id) });
      return;
    }
```

(Place near the existing balcony/stair delete branches.) Add `removeSkirt` to imports.

- [ ] **Step 5: Run tests + type check**

Run: `bun run test && bun run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/PropertyPanel.tsx src/components/AppShell.tsx
git commit -m "feat(ui): SkirtEditor + 删除接入"
```

### Task 19: UI tests for end-to-end skirt flow

**Files:**
- Modify: `src/__tests__/ui.test.tsx`

- [ ] **Step 1: Add UI test**

Add to `src/__tests__/ui.test.tsx` (in an appropriate `describe`):

```ts
describe("skirt roof", () => {
  it("ToolPalette has 添加披檐 entry", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "添加" }));
    expect(screen.getByRole("menuitem", { name: "添加披檐" })).toBeInTheDocument();
  });

  it("adding a skirt selects it and surfaces SkirtEditor with material swatches", async () => {
    const user = userEvent.setup();
    render(<App />);
    // Switch to 1F to ensure storey exists; sample default is plan-1f.
    await user.click(screen.getByRole("button", { name: "添加" }));
    await user.click(screen.getByRole("menuitem", { name: "添加披檐" }));
    // If storey sub-menu appears, pick 1F.
    const oneF = screen.queryByRole("menuitem", { name: "1F" });
    if (oneF) await user.click(oneF);
    // SkirtEditor heading visible.
    expect(await screen.findByRole("heading", { name: /披檐/ })).toBeInTheDocument();
    // Material swatches: 灰瓦 should be aria-pressed (default chosen).
    const grayTile = screen.getByRole("button", { name: "灰瓦" });
    expect(grayTile).toHaveAttribute("aria-pressed", "true");
  });

  it("changing pitch via SkirtEditor accepts the value", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "添加" }));
    await user.click(screen.getByRole("menuitem", { name: "添加披檐" }));
    const oneF = screen.queryByRole("menuitem", { name: "1F" });
    if (oneF) await user.click(oneF);
    const pitchField = await screen.findByRole("spinbutton", { name: /坡度/ });
    await user.clear(pitchField);
    await user.type(pitchField, "20");
    await user.tab();
    expect((pitchField as HTMLInputElement).value).toBe("20");
  });
});
```

- [ ] **Step 2: Run UI tests**

Run: `bunx vitest run src/__tests__/ui.test.tsx -t "skirt roof"`
Expected: PASS for all 3.

- [ ] **Step 3: Run full suite**

Run: `bun run test`
Expected: all tests pass (~295+).

Run: `bun run lint`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/ui.test.tsx
git commit -m "test(ui): skirt 端到端流程"
```

---

## Final verification

### Task 20: Manual smoke + commit summary

- [ ] **Step 1: Visual smoke test**

```bash
bun run dev
```

Open the printed URL in a browser. Steps:
1. In default sample, click "+" → "添加披檐" → pick 1F. A skirt should appear on a front 1F wall in plan view; SkirtEditor should be visible right side.
2. Switch to 3D — skirt panel + caps render with gray tile material.
3. Switch to 正视 (front elevation) — skirt projects as polygon at 1F wallTop level.
4. PropertyPanel: change depth to 1500mm, pitch to 25°, watch updates in 3D.
5. Hit Backspace → skirt removed.
6. (Setback test) Modify 2F walls in 1F-plan to be smaller (e.g., move via property panel widthExtent), switch to 3D — 1F top should expose a terrace surface (slab extends to 1F's footprint where 2F doesn't cover).

Note any issues — fix-forward via additional small commits.

- [ ] **Step 2: Stop dev server**

```bash
pkill -f "vite"
```

- [ ] **Step 3: Confirm branch state**

```bash
git status
git log --oneline -25
```

Branch should have ~14 commits added on top of the spec commit.

---

## Known limitations (post-implementation)

- Skirt elevation is a free number (not snapped to storey-top); user-error possible. UI clamping/snap could be added later.
- Setback terrace doesn't auto-create parapet/railing; user places Balcony segments per edge if needed.
- Cantilever (upper > lower) shrinks slab to lower footprint — known limitation per spec.
- 2D plan view shows skirt as a flat tinted rectangle without slope direction indicator. Phase 2 polish.
