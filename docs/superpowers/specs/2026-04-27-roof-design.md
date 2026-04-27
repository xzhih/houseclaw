# Roof Modeling — Design Spec

**Date:** 2026-04-27
**Branch:** `feat-roof`
**Status:** approved (awaiting plan)

## 1. Goal

Replace the flat 0.2m placeholder slab on top of the building with a real,
editable pitched roof. Day 1 covers the most common villa silhouettes —
gable / hip / shed / half-hip — for buildings whose top storey is an
axis-aligned rectangle of exactly 4 exterior walls.

## 2. Shape Language

The user model is **per-edge eave / gable choice**:

- Each of the 4 top-storey exterior walls is tagged either `eave` (slopes
  inward) or `gable` (vertical wall extends up to the ridge).
- A single global pitch and a single global overhang apply to all eaves.
- Interior ridges and hips are auto-derived from the edge tags.

This covers (by edge composition):

| eaves | gables | shape          |
| ----- | ------ | -------------- |
| 1     | 3      | shed           |
| 2 opp | 2      | gable (双坡)   |
| 2 adj | 2      | corner-slope (uncommon, supported) |
| 3     | 1      | half-hip / Dutch |
| 4     | 0      | hip (四坡)     |
| 0     | 4      | invalid (UI prevents) |

## 3. Data Model

```ts
// src/domain/types.ts

export type Point3 = { x: number; y: number; z: number };

export type RoofEdgeKind = "eave" | "gable";

export type Roof = {
  /** wallId → role for this top-storey wall.
   *  Keys must be the 4 exterior walls of the top storey. */
  edges: Record<string, RoofEdgeKind>;
  /** Radians. Shared by all eaves. Valid range [5°, 60°]. */
  pitch: number;
  /** Meters. Outward expansion of all 4 outline edges. Range [0, 2]. */
  overhang: number;
  materialId: string;
};

export type HouseProject = {
  // ... existing fields
  roof?: Roof;
};
```

```ts
// src/domain/selection.ts (additions)
| { kind: "roof" }
| { kind: "roof-edge"; wallId: string }
```

### Validation invariants (when `roof` is defined)

- `pitch ∈ [5° in radians, 60° in radians]` (i.e. `[π/36, π/3]`).
- `overhang ∈ [0, 2]`.
- `materialId` resolves to a `Material` in the project.
- After applying the **edge-resolution rule** below, at least one of the
  top-storey walls must resolve to `"eave"`. Otherwise the roof is dropped
  by persistence and treated as `undefined` at runtime.

### Edge-resolution rule (used by geometry, persistence, and UI)

For each of the top storey's 4 exterior walls, the wall's roof role is:

- `edges[wallId]` if that key is present and equals `"eave"` or `"gable"`,
- `"gable"` otherwise (covers stale keys, missing keys, unknown values).

This means `edges` may legitimately omit walls (they default to `gable`),
and may carry stale keys for walls that no longer exist (they're ignored).
The roof remains valid as long as ≥1 of the current 4 walls resolves to
eave.

## 4. Geometry Derivation

### New module

```ts
// src/geometry/roofGeometry.ts

export type RoofPanel = {
  /** Convex polygon of 3 or 4 Point3 vertices. CCW when viewed from outside
   *  (i.e. above and away from the building center). */
  vertices: Point3[];
  materialId: string; // from roof.materialId
};

export type RoofGable = {
  /** Vertical triangular extension above the wall top, up to the ridge.
   *  3 Point3 vertices, CCW from outside. */
  vertices: Point3[];
  wallId: string; // material resolved from this wall
};

export type RoofGeometry = {
  panels: RoofPanel[];
  gables: RoofGable[];
};

export function buildRoofGeometry(
  topStorey: Storey,
  exteriorRing: Point2[], // top-storey exterior outline (no overhang yet)
  walls: Wall[],          // 4 exterior walls in the order matching exteriorRing edges
  roof: Roof,
): RoofGeometry | undefined; // returns undefined if precondition fails
```

### Precondition

- `walls.length === 4`, all `exterior === true`.
- Wall segments form a closed axis-aligned rectangle.
- After applying the edge-resolution rule from §3, at least one wall
  resolves to `"eave"`.

If any check fails → return `undefined`. The 3D scene renders no roof; the
2D roof view shows a "屋顶建模需要顶层为 4 面轴对齐外墙" hint.

### Algorithm

After the edge-resolution rule produces 1–4 eave assignments, dispatch on
the eave count and adjacency: 1 / 2-opp / 2-adj / 3 / 4. Each case is a
small closed-form routine using the rectangle's footprint width `W` (along
the world x-axis) and depth `D` (along the world y-axis), plus `tan(pitch)`
and `overhang`. No numerical solving, no clipping libraries.

For each case the routine emits:

- One `RoofPanel` per eave wall (3 or 4 verts each).
- One `RoofGable` per gable wall (3 verts each).

Eave bottom z = `topStorey.elevation + topStorey.height` (wall top).
Eave outer line is the wall's outer-edge line, expanded outward by
`overhang`. Slope rises inward at angle `pitch`.

### Wiring

- `geometry/types.ts` → add `roof?: RoofGeometry` to `HouseGeometry`.
- `geometry/houseGeometry.ts` → delete `buildRoofPlaceholder` and its call.
  When `project.roof` is defined and precondition passes, populate
  `houseGeometry.roof` via `buildRoofGeometry`. Otherwise leave it undefined
  — **no fallback placeholder**.

## 5. Editing UX

### Roof view tab (existing)

The `"roof"` view ID already exists. Replace the
`renderRoofPlaceholder` body in `DrawingSurface2D.tsx`:

- If `canBuildRoof(project)` is false → show centered hint
  "屋顶建模需要顶层为 4 面轴对齐外墙".
- If true and `project.roof === undefined` → show top-storey outline
  (read-only style) plus a centered button `[+ 添加屋顶]`.
- If true and `project.roof` defined → render the editor (below).

### Editor canvas

Top-storey outline drawn as 4 distinct edges:

- **eave edges**: solid colored stroke + inward-pointing diagonal hatching
  (visual cue for slope direction).
- **gable edges**: dashed stroke + small vertical-bar icon at midpoint.

Click handling:

- Click on an edge → selection becomes `{ kind: "roof-edge", wallId }`.
- Click inside the outline (away from edges) → selection becomes
  `{ kind: "roof" }`.

### Property panel additions

`PropertyPanel.tsx` gains two new selection cases:

**`{ kind: "roof" }`:**

- 坡度 (pitch): number input in degrees, clamped 5–60.
- 出檐 (overhang): meters, clamped 0–2.
- 材质: dropdown of materials with `kind === "roof"`.
- `[移除屋顶]` button (red secondary; no confirm — undo handles regret).

**`{ kind: "roof-edge", wallId }`:**

- 边类型: shows current label, plus button `切换为 gable / 切换为 eave`.
- The button is disabled (with tooltip "至少需要一条檐边") when the
  current edge is `eave` and it is the only `eave` in `roof.edges`.
- Below the toggle, the same pitch / overhang / material fields as
  the roof-level panel (for editing convenience without re-selecting).

### Default new-roof values

When the user clicks `[+ 添加屋顶]`:

- Compute each wall's length. Pick the **two longest** walls as `eave`,
  remaining two as `gable`. Tie-breaking when all 4 are equal length
  (square footprint): take exterior-ring edges 0 and 2 as eaves
  (i.e. opposite pair, deterministic).
- `pitch = degToRad(30)`.
- `overhang = 0.6`.
- `materialId` = first `Material` with `kind === "roof"`; if none exists,
  fall back to first material id.

### `canBuildRoof(project)` helper

Add to `src/domain/views.ts`:

```ts
export function canBuildRoof(project: HouseProject): boolean;
```

Returns true iff top storey has exactly 4 exterior walls forming an
axis-aligned rectangle. Used by the UI to gate the "add roof" button and
by mutations to refuse `addRoof` when impossible.

## 6. Mutations

```ts
// src/domain/mutations.ts (additions)

export function addRoof(project: HouseProject): HouseProject;
// throws if !canBuildRoof(project) or project.roof already exists.

export function removeRoof(project: HouseProject): HouseProject;
// no-op if project.roof === undefined.

export function updateRoof(
  project: HouseProject,
  patch: Partial<Pick<Roof, "pitch" | "overhang" | "materialId">>,
): HouseProject;
// throws if no roof; clamps pitch/overhang to valid ranges.

export function toggleRoofEdge(
  project: HouseProject,
  wallId: string,
): HouseProject;
// flips eave ↔ gable; throws when the flip would leave 0 effective eaves
// (UI must disable the button in that case to avoid the throw).
```

### Storey-mutation interactions

`addStorey`, `duplicateStorey`, and `removeStorey` (when removing the top
storey) **clear `project.roof`**. The new top storey rarely has the same
4-wall structure, so wallId references would dangle. The user re-adds the
roof after the new top is shaped how they want.

## 7. 3D Rendering

`src/rendering/threeScene.ts` gets a `createRoofMeshes(project, geometry)`
that mirrors `createSlabMeshes`:

- For each `RoofPanel`: build a `THREE.BufferGeometry` from `vertices`
  via fan triangulation from `vertices[0]` (always convex, 3–4 verts).
  Use `roof.materialId` to resolve the material.
- For each `RoofGable`: same approach, but resolve the material from
  `walls.find((w) => w.id === gable.wallId).materialId`.
- Compute per-face normals so lighting reads correctly on sloped panels.
- Plug into `meshes`, `materials`, and `collidables` arrays alongside
  walls / slabs / etc.

Elevation views (`projection/elevation.ts`) already project the actual 3D
geometry onto each side. Once the roof meshes exist, elevations pick up
roof silhouettes and gable triangles automatically — **no change needed
in the elevation projection code**.

### Known visual limitation

Gable triangle textures don't UV-continuously extend the wall texture
beneath. For solid-color or smooth-gradient materials, the seam is
invisible. For repeating tiled textures (e.g. brick), there will be a
visible reset at the wall-top line. Acceptable for day 1.

## 8. Persistence

`src/app/persistence.ts` — `validateProject` already exists; add
`validateRoof(rawRoof, walls, materials)`:

- If absent → keep absent.
- If present and any of these fail → drop the roof field but keep loading
  the project:
  - `pitch` not finite or outside `[π/36, π/3]`
  - `overhang` not finite or outside `[0, 2]`
  - `materialId` doesn't resolve
  - `edges` is not a `Record<string, "eave" | "gable">`
  - Applying the §3 edge-resolution rule against the current top-storey
    walls yields 0 effective eaves (e.g. all entries reference walls that
    no longer exist).

JSON import/export round-trips the `roof` field unchanged.

## 9. Defaults & Migration

- **New blank project**: `roof === undefined`. 3D shows building with
  open top. User clicks `[+ 添加屋顶]` to put one on.
- **Sample project** (`createSampleProject`): ships with default roof —
  long edges (front/back, length 10) as eaves, short edges (left/right,
  length 8) as gables, pitch 30°, overhang 0.6m, roof material from
  catalog. So opening the default sample looks complete in 3D.
- **Old localStorage projects**: have no `roof` field → load with
  `roof === undefined`. No data migration; user opts in by adding a roof.

## 10. Test Plan

| File | New cases | Notes |
| ---- | --------- | ----- |
| `src/__tests__/roofGeometry.test.ts` (new) | 5 | One per case (1 / 2-opp / 2-adj / 3 / 4 eaves). Asserts panel count, ridge height = expected closed-form value, every panel has at least one vertex at z = wall-top. |
| `src/__tests__/mutations.test.ts` | 6 | `addRoof` (success + throws when !canBuildRoof), `removeRoof`, `updateRoof` (clamps), `toggleRoofEdge` (refuses last eave), storey mutations clear roof. |
| `src/__tests__/ui.test.tsx` | 4 | Roof view: add roof, toggle edge, pitch input updates state, last-eave toggle disabled. |
| `src/__tests__/persistence.test.ts` | 2 | Roof round-trips JSON; out-of-range pitch causes roof drop while project still loads. |
| `src/__tests__/sampleProject.test.ts` (new or addition) | 1 | Sample project ships with the documented default roof. |

Total: **18 new vitest cases**.

## 11. Files Touched

**New**
- `src/geometry/roofGeometry.ts`
- `src/__tests__/roofGeometry.test.ts`
- `src/__tests__/sampleProject.test.ts` (only if not already present)

**Modified**
- `src/domain/types.ts` — `Point3`, `Roof`, `RoofEdgeKind`, `HouseProject.roof`
- `src/domain/selection.ts` — `roof` and `roof-edge` variants
- `src/domain/views.ts` — `canBuildRoof`
- `src/domain/sampleProject.ts` — default roof on sample
- `src/domain/mutations.ts` — `addRoof` / `removeRoof` / `updateRoof` / `toggleRoofEdge`; clear roof in `addStorey` / `duplicateStorey` / `removeStorey`
- `src/geometry/types.ts` — `HouseGeometry.roof`
- `src/geometry/houseGeometry.ts` — delete `buildRoofPlaceholder` use, wire `buildRoofGeometry`
- `src/geometry/slabGeometry.ts` — delete `buildRoofPlaceholder` (no longer called); leave `kind: "roof"` SlabKind alone or also clean up if unused elsewhere
- `src/components/DrawingSurface2D.tsx` — replace `renderRoofPlaceholder`; roof-view edge rendering & click handling
- `src/components/PropertyPanel.tsx` — roof and roof-edge selection forms
- `src/rendering/threeScene.ts` — `createRoofMeshes`
- `src/app/persistence.ts` — `validateRoof`
- `src/styles.css` — `.roof-edge--eave`, `.roof-edge--gable`, `.roof-edge-toggle`, etc.
- `src/__tests__/mutations.test.ts`, `src/__tests__/ui.test.tsx`, `src/__tests__/persistence.test.ts` — new cases

## 12. Out of Scope (Day 1)

- Non-rectangular top storey (L / T / pentagon) — defer to future expansion (would need straight-skeleton).
- Non-axis-aligned rectangles (rotated buildings) — small extension via local-frame transform; defer.
- Per-edge pitch — possible future upgrade; data shape promotes to `pitches: number[]` cleanly.
- Dormers, chimneys, skylights — out.
- Eave fascia / soffit detail — no separate geometry; visually rolled into the panels.
- Texture continuity wall→gable — accepted seam.
