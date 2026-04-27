# Roof Modeling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat 0.2m roof placeholder with a real, editable pitched roof — gable / hip / shed / half-hip — for axis-aligned rectangular top storeys.

**Architecture:** Per-edge eave/gable choice on the 4 top exterior walls + single global pitch + single global overhang. Geometry is computed by a pure function that hardcodes the 5 valid eave-count cases; the resulting `RoofGeometry` flows through `HouseGeometry` into the existing Three.js scene. Editing happens in the existing `"roof"` view tab.

**Tech Stack:** TypeScript, React, Vite, Vitest + jsdom, Three.js, @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-04-27-roof-design.md`

---

## File Structure

**New files**
- `src/geometry/roofGeometry.ts` — pure function `buildRoofGeometry` + the `RoofGeometry`, `RoofPanel`, `RoofGable` types.
- `src/__tests__/roofGeometry.test.ts` — geometry tests (5 case configurations).
- `src/__tests__/sampleProject.test.ts` — assertion that the sample ships with default roof.

**Modified files**
- `src/domain/types.ts` — add `Point3`, `RoofEdgeKind`, `Roof`, `HouseProject.roof`.
- `src/domain/selection.ts` — add `roof` and `roof-edge` selection variants.
- `src/domain/views.ts` — add `canBuildRoof`.
- `src/domain/sampleProject.ts` — sample project ships with default roof.
- `src/domain/mutations.ts` — add `addRoof` / `removeRoof` / `updateRoof` / `toggleRoofEdge`; clear `roof` from `addStorey` / `duplicateStorey` / `removeStorey`.
- `src/domain/constraints.ts` — pass through `roof` field unchanged (no new validation here; persistence handles it).
- `src/geometry/types.ts` — add `roof?: RoofGeometry` to `HouseGeometry`; re-export `RoofGeometry` types.
- `src/geometry/houseGeometry.ts` — drop `buildRoofPlaceholder` call; wire `buildRoofGeometry`.
- `src/geometry/slabGeometry.ts` — delete `buildRoofPlaceholder` (no other callers).
- `src/components/DrawingSurface2D.tsx` — replace `renderRoofPlaceholder`; render the roof editor (or hint / add-button) in the `"roof"` view; click handling for edges and roof body.
- `src/components/PropertyPanel.tsx` — `roof` and `roof-edge` selection forms.
- `src/components/AppShell.tsx` — wire roof mutations into the reducer + handlers.
- `src/rendering/threeScene.ts` — `createRoofMeshes`.
- `src/app/persistence.ts` — `assertRoofShape` + drop-on-failure logic in import path.
- `src/styles.css` — `.roof-edge--eave`, `.roof-edge--gable`, etc.
- `src/__tests__/mutations.test.ts`, `src/__tests__/ui.test.tsx`, `src/__tests__/persistence.test.ts` — new cases.

---

## Task 1: Add `Point3` and roof types

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/selection.ts`

- [ ] **Step 1: Add `Point3`, `RoofEdgeKind`, `Roof` types and `roof?` on `HouseProject`**

In `src/domain/types.ts`, after the existing `Point2` declaration, add:

```ts
export type Point3 = {
  x: number;
  y: number;
  z: number;
};
```

Then add (e.g. above `MaterialKind`):

```ts
export type RoofEdgeKind = "eave" | "gable";

export type Roof = {
  /** wallId → role for that top-storey wall. Missing or stale keys default
   *  to "gable" at render/validation time (see edge-resolution rule). */
  edges: Record<string, RoofEdgeKind>;
  /** Radians. Shared by all eaves. Valid range [π/36, π/3]. */
  pitch: number;
  /** Meters. Outward expansion of all 4 outline edges. Range [0, 2]. */
  overhang: number;
  materialId: string;
};
```

Add `roof?: Roof;` to `HouseProject` (after `balconies: Balcony[];`).

- [ ] **Step 2: Add roof-related selection variants**

In `src/domain/selection.ts`, extend the union:

```ts
export type ObjectSelection =
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "balcony"; id: string }
  | { kind: "storey"; id: string }
  | { kind: "stair"; id: string }
  | { kind: "roof" }
  | { kind: "roof-edge"; wallId: string };
```

`isSelected` is now insufficient for the `roof` / `roof-edge` variants (they don't have an `id` field of the same shape). Leave `isSelected` as is — call sites that need to compare these variants will use direct shape checks (added in later tasks).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no new type errors).

- [ ] **Step 4: Commit**

```bash
git add src/domain/types.ts src/domain/selection.ts
git commit -m "feat(roof): add Roof, Point3, and roof selection variants"
```

---

## Task 2: `canBuildRoof` helper

**Files:**
- Modify: `src/domain/views.ts`
- Modify: `src/__tests__/projection.test.ts` (or create `src/__tests__/views.test.ts` if more natural — pick whichever tests `views.ts` already has; create one if none).

- [ ] **Step 1: Find or create the test file for `views.ts`**

Run: `grep -l "planStoreyIdFromView" src/__tests__/`

If a file exists, append to it. Otherwise, create `src/__tests__/views.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { canBuildRoof, planStoreyIdFromView } from "../domain/views";
import { createSampleProject } from "../domain/sampleProject";

describe("planStoreyIdFromView", () => {
  it("returns the encoded storey id when it matches", () => {
    const project = createSampleProject();
    expect(planStoreyIdFromView("plan-2f", project.storeys)).toBe("2f");
  });
  it("returns undefined for non-plan views", () => {
    const project = createSampleProject();
    expect(planStoreyIdFromView("roof", project.storeys)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Write failing tests for `canBuildRoof`**

Append to the same test file:

```ts
describe("canBuildRoof", () => {
  it("returns true for the rectangular sample top storey", () => {
    const project = createSampleProject();
    expect(canBuildRoof(project)).toBe(true);
  });

  it("returns false when the top storey has fewer than 4 exterior walls", () => {
    const project = createSampleProject();
    const top = project.storeys[project.storeys.length - 1];
    const walls = project.walls.filter(
      (wall) => !(wall.storeyId === top.id && wall.id === `wall-front-${top.id}`),
    );
    expect(canBuildRoof({ ...project, walls })).toBe(false);
  });

  it("returns false when the top storey is not axis-aligned", () => {
    const project = createSampleProject();
    const top = project.storeys[project.storeys.length - 1];
    const walls = project.walls.map((wall) => {
      if (wall.storeyId !== top.id) return wall;
      // Skew the front-right corner by 0.5m in y so the rectangle becomes a quadrilateral.
      if (wall.id === `wall-front-${top.id}`) return { ...wall, end: { x: 10, y: 0.5 } };
      if (wall.id === `wall-right-${top.id}`) return { ...wall, start: { x: 10, y: 0.5 } };
      return wall;
    });
    expect(canBuildRoof({ ...project, walls })).toBe(false);
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

Run: `npx vitest run src/__tests__/views.test.ts`
Expected: FAIL with "canBuildRoof is not exported".

- [ ] **Step 4: Implement `canBuildRoof`**

Append to `src/domain/views.ts`:

```ts
import type { HouseProject } from "./types";

const RECT_TOL = 0.005;

/**
 * True iff the top storey has exactly 4 exterior walls forming an
 * axis-aligned rectangle (each wall horizontal or vertical, 4 distinct
 * corner points sharing exactly two x-values and two y-values).
 */
export function canBuildRoof(project: HouseProject): boolean {
  if (project.storeys.length === 0) return false;
  const top = [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
  const walls = project.walls.filter(
    (wall) => wall.storeyId === top.id && wall.exterior,
  );
  if (walls.length !== 4) return false;

  const xs = new Set<number>();
  const ys = new Set<number>();
  for (const wall of walls) {
    const dx = Math.abs(wall.end.x - wall.start.x);
    const dy = Math.abs(wall.end.y - wall.start.y);
    if (dx > RECT_TOL && dy > RECT_TOL) return false; // not axis-aligned
    xs.add(roundTo(wall.start.x, RECT_TOL));
    xs.add(roundTo(wall.end.x, RECT_TOL));
    ys.add(roundTo(wall.start.y, RECT_TOL));
    ys.add(roundTo(wall.end.y, RECT_TOL));
  }
  return xs.size === 2 && ys.size === 2;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
```

You'll also need to add the `Storey` import alongside the existing one — adjust the existing `import type { Storey } from "./types";` to also pull in `HouseProject`:

```ts
import type { HouseProject, Storey } from "./types";
```

(Remove the duplicate import line if you accidentally added two.)

- [ ] **Step 5: Run tests — verify they pass**

Run: `npx vitest run src/__tests__/views.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/views.ts src/__tests__/views.test.ts
git commit -m "feat(roof): canBuildRoof checks top storey is axis-aligned rectangle"
```

---

## Task 3: Roof geometry — case 1 (single eave / shed)

**Files:**
- Create: `src/geometry/roofGeometry.ts`
- Create: `src/__tests__/roofGeometry.test.ts`

This task delivers the type definitions, the precondition checks, and the simplest case. Subsequent tasks add more cases.

- [ ] **Step 1: Write the failing test for shed (1 eave + 3 gables)**

Create `src/__tests__/roofGeometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildRoofGeometry } from "../geometry/roofGeometry";
import type { Roof, Storey, Wall } from "../domain/types";

const TOP: Storey = {
  id: "top",
  label: "TOP",
  elevation: 0,
  height: 3,
  slabThickness: 0.18,
};

// Rectangle 10 x 8, walls in CCW order: front (y=0) → right (x=10) → back (y=8) → left (x=0).
function rectWalls(): Wall[] {
  const base = {
    storeyId: "top",
    thickness: 0.24,
    height: 3,
    exterior: true as const,
    materialId: "mat-wall",
  };
  return [
    { ...base, id: "w-front", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } },
    { ...base, id: "w-right", start: { x: 10, y: 0 }, end: { x: 10, y: 8 } },
    { ...base, id: "w-back", start: { x: 10, y: 8 }, end: { x: 0, y: 8 } },
    { ...base, id: "w-left", start: { x: 0, y: 8 }, end: { x: 0, y: 0 } },
  ];
}

const RECT_RING = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 8 },
  { x: 0, y: 8 },
];

const PITCH = Math.PI / 6; // 30°
const OVERHANG = 0.6;
const WALL_TOP = TOP.elevation + TOP.height;

describe("buildRoofGeometry — shed (1 eave + 3 gables)", () => {
  const roof: Roof = {
    edges: { "w-front": "eave", "w-right": "gable", "w-back": "gable", "w-left": "gable" },
    pitch: PITCH,
    overhang: OVERHANG,
    materialId: "mat-roof",
  };

  it("emits 1 panel and 3 gables", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    expect(geom).toBeDefined();
    expect(geom.panels).toHaveLength(1);
    expect(geom.gables).toHaveLength(3);
  });

  it("the panel rises from front-eave (z = wall-top) to back-gable (z = wall-top + (D + 2*overhang)*tan)", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const panel = geom.panels[0];
    const minZ = Math.min(...panel.vertices.map((v) => v.z));
    const maxZ = Math.max(...panel.vertices.map((v) => v.z));
    const expectedRise = (8 + 2 * OVERHANG) * Math.tan(PITCH);
    expect(minZ).toBeCloseTo(WALL_TOP);
    expect(maxZ).toBeCloseTo(WALL_TOP + expectedRise);
  });

  it("returns undefined when no edge resolves to eave", () => {
    const allGable: Roof = {
      ...roof,
      edges: { "w-front": "gable", "w-right": "gable", "w-back": "gable", "w-left": "gable" },
    };
    expect(buildRoofGeometry(TOP, RECT_RING, rectWalls(), allGable)).toBeUndefined();
  });

  it("returns undefined when walls.length !== 4", () => {
    expect(buildRoofGeometry(TOP, RECT_RING, rectWalls().slice(0, 3), roof)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/__tests__/roofGeometry.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement types + shed case**

Create `src/geometry/roofGeometry.ts`:

```ts
import type { Point2, Point3, Roof, Storey, Wall } from "../domain/types";

export type RoofPanel = {
  /** Convex polygon, 3 or 4 Point3 vertices, CCW from outside. */
  vertices: Point3[];
  materialId: string;
};

export type RoofGable = {
  /** Vertical triangular extension above the wall top. 3 Point3 vertices, CCW from outside. */
  vertices: Point3[];
  wallId: string;
};

export type RoofGeometry = {
  panels: RoofPanel[];
  gables: RoofGable[];
};

type ResolvedEdge = {
  wallId: string;
  side: "front" | "right" | "back" | "left"; // canonical role on axis-aligned rect
  kind: "eave" | "gable";
};

const RECT_TOL = 0.005;

export function buildRoofGeometry(
  topStorey: Storey,
  exteriorRing: Point2[],
  walls: Wall[],
  roof: Roof,
): RoofGeometry | undefined {
  const resolved = resolveEdges(walls, exteriorRing, roof);
  if (!resolved) return undefined;
  if (!resolved.some((e) => e.kind === "eave")) return undefined;

  const wallTopZ = topStorey.elevation + topStorey.height;
  const rect = bbox(exteriorRing);
  if (!rect) return undefined;
  const outer = expandRect(rect, roof.overhang);
  const slope = Math.tan(roof.pitch);

  // Dispatch by eave count + adjacency.
  const eaveCount = resolved.filter((e) => e.kind === "eave").length;
  switch (eaveCount) {
    case 1:
      return buildShed(resolved, outer, wallTopZ, slope, roof.materialId);
    default:
      // Other cases added in later tasks.
      return undefined;
  }
}

function resolveEdges(walls: Wall[], ring: Point2[], roof: Roof): ResolvedEdge[] | undefined {
  if (walls.length !== 4) return undefined;
  if (!walls.every((w) => w.exterior)) return undefined;

  // Identify which side of the rectangle each wall is on.
  const rect = bbox(ring);
  if (!rect) return undefined;

  const sided = walls.map<ResolvedEdge | undefined>((w) => {
    const side = sideOfWall(w, rect);
    if (!side) return undefined;
    const tag = roof.edges[w.id];
    return { wallId: w.id, side, kind: tag === "eave" ? "eave" : "gable" };
  });

  if (sided.some((s) => !s)) return undefined;
  // Ensure all 4 sides represented exactly once.
  const sides = new Set(sided.map((s) => s!.side));
  if (sides.size !== 4) return undefined;
  return sided as ResolvedEdge[];
}

type Rect = { xMin: number; xMax: number; yMin: number; yMax: number };

function bbox(ring: Point2[]): Rect | undefined {
  if (ring.length < 4) return undefined;
  const xs = ring.map((p) => p.x);
  const ys = ring.map((p) => p.y);
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  };
}

function expandRect(r: Rect, overhang: number): Rect {
  return {
    xMin: r.xMin - overhang,
    xMax: r.xMax + overhang,
    yMin: r.yMin - overhang,
    yMax: r.yMax + overhang,
  };
}

function sideOfWall(wall: Wall, rect: Rect): ResolvedEdge["side"] | undefined {
  const horizontal = Math.abs(wall.end.y - wall.start.y) < RECT_TOL;
  const vertical = Math.abs(wall.end.x - wall.start.x) < RECT_TOL;
  if (horizontal === vertical) return undefined;
  if (horizontal) {
    if (Math.abs(wall.start.y - rect.yMin) < RECT_TOL) return "front";
    if (Math.abs(wall.start.y - rect.yMax) < RECT_TOL) return "back";
    return undefined;
  }
  if (Math.abs(wall.start.x - rect.xMax) < RECT_TOL) return "right";
  if (Math.abs(wall.start.x - rect.xMin) < RECT_TOL) return "left";
  return undefined;
}

/**
 * Shed (1 eave): the eave's outer line is the low edge; the slope rises
 * across the full footprint to the opposite gable wall, where it terminates
 * in a triangle. Side gables are right triangles climbing the slope.
 */
function buildShed(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): RoofGeometry {
  const eave = edges.find((e) => e.kind === "eave")!;
  const opposite = edges.find((e) => e.side === oppositeSide(eave.side))!;
  const sides = edges.filter((e) => e !== eave && e !== opposite);

  // Pick the local frame: u runs along the eave, v points from eave inward.
  const { u0, u1, v0, v1 } = eaveAxes(eave.side, outer);
  // Width along u, depth along v.
  const W = Math.abs(u1 - u0);
  const D = Math.abs(v1 - v0);
  const peakRise = D * slope;

  // Panel: 4 vertices, low side at v0 (outer eave edge), high side at v1.
  const panelLow0 = liftToWorld(eave.side, outer, u0, v0, wallTopZ);
  const panelLow1 = liftToWorld(eave.side, outer, u1, v0, wallTopZ);
  const panelHigh1 = liftToWorld(eave.side, outer, u1, v1, wallTopZ + peakRise);
  const panelHigh0 = liftToWorld(eave.side, outer, u0, v1, wallTopZ + peakRise);

  const panel: RoofPanel = {
    vertices: [panelLow0, panelLow1, panelHigh1, panelHigh0],
    materialId,
  };

  // Opposite gable: full triangle from outer corners up to ridge — we render it
  // along the inner wall line (use the ring's xMin/xMax/yMin/yMax UNshrunk so
  // the gable triangle sits flush with the wall, not floating at the overhang).
  // For day 1 we accept that gables sit at the outer rect, since the rendering
  // looks continuous as long as wall material matches; this keeps the math
  // single-frame.
  const gables: RoofGable[] = [];
  gables.push({
    wallId: opposite.wallId,
    vertices: triangleAlong(opposite.side, outer, wallTopZ, peakRise, "full"),
  });
  for (const side of sides) {
    gables.push({
      wallId: side.wallId,
      vertices: triangleAlong(side.side, outer, wallTopZ, peakRise, side.side === sides[0].side ? "rising-from-eave-side" : "rising-from-eave-side"),
    });
    // Both side gables are right triangles rising from eave to opposite. The helper handles direction.
  }

  return { panels: [panel], gables };
}

function oppositeSide(side: ResolvedEdge["side"]): ResolvedEdge["side"] {
  switch (side) {
    case "front": return "back";
    case "back": return "front";
    case "left": return "right";
    case "right": return "left";
  }
}

/**
 * For each side, return the parametric axes u (along the side) and v (inward).
 * u0..u1 spans the full outer rect along the side; v0..v1 runs from the side
 * inward to the opposite side.
 */
function eaveAxes(side: ResolvedEdge["side"], outer: Rect) {
  switch (side) {
    case "front": return { u0: outer.xMin, u1: outer.xMax, v0: outer.yMin, v1: outer.yMax };
    case "back":  return { u0: outer.xMax, u1: outer.xMin, v0: outer.yMax, v1: outer.yMin };
    case "left":  return { u0: outer.yMin, u1: outer.yMax, v0: outer.xMin, v1: outer.xMax };
    case "right": return { u0: outer.yMax, u1: outer.yMin, v0: outer.xMax, v1: outer.xMin };
  }
}

function liftToWorld(
  side: ResolvedEdge["side"],
  _outer: Rect,
  u: number,
  v: number,
  z: number,
): Point3 {
  switch (side) {
    case "front":
    case "back":
      return { x: u, y: v, z };
    case "left":
    case "right":
      return { x: v, y: u, z };
  }
}

/**
 * Build the gable triangle for a given side. `mode === "full"` means the
 * triangle apex is at the side's midpoint at peak height (used for the
 * gable wall opposite the eave in shed). `mode === "rising-from-eave-side"`
 * means the triangle has its high vertex at the end nearer the opposite side.
 *
 * The triangle's base sits at z = wallTopZ along the side; the apex is at
 * z = wallTopZ + apexRise.
 */
function triangleAlong(
  side: ResolvedEdge["side"],
  outer: Rect,
  wallTopZ: number,
  apexRise: number,
  mode: "full" | "rising-from-eave-side",
): Point3[] {
  const { u0, u1 } = eaveAxes(side, outer);
  const baseStart = liftToWorld(side, outer, u0, sideV(side, outer), wallTopZ);
  const baseEnd = liftToWorld(side, outer, u1, sideV(side, outer), wallTopZ);
  if (mode === "full") {
    const mid = (u0 + u1) / 2;
    const apex = liftToWorld(side, outer, mid, sideV(side, outer), wallTopZ + apexRise);
    return [baseStart, baseEnd, apex];
  }
  // rising-from-eave-side: apex is at the u1 end (the end nearest the
  // opposite/peak side, by convention from eaveAxes ordering).
  const apex = liftToWorld(side, outer, u1, sideV(side, outer), wallTopZ + apexRise);
  return [baseStart, baseEnd, apex];
}

function sideV(side: ResolvedEdge["side"], outer: Rect): number {
  switch (side) {
    case "front": return outer.yMin;
    case "back":  return outer.yMax;
    case "left":  return outer.xMin;
    case "right": return outer.xMax;
  }
}
```

NB: the shed-side-gable handling is approximate — it places the apex at one end of the side, which is correct for a true shed (slope monotonically rises front→back). Validate with the tests.

- [ ] **Step 4: Run tests — verify pass**

Run: `npx vitest run src/__tests__/roofGeometry.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/geometry/roofGeometry.ts src/__tests__/roofGeometry.test.ts
git commit -m "feat(roof): roofGeometry types + shed (1-eave) case"
```

---

## Task 4: Roof geometry — case 2-opp (gable / 双坡)

**Files:**
- Modify: `src/geometry/roofGeometry.ts`
- Modify: `src/__tests__/roofGeometry.test.ts`

- [ ] **Step 1: Write the failing test for traditional gable**

Append to `src/__tests__/roofGeometry.test.ts`:

```ts
describe("buildRoofGeometry — gable (2 opposite eaves)", () => {
  const roof: Roof = {
    edges: { "w-front": "eave", "w-back": "eave", "w-left": "gable", "w-right": "gable" },
    pitch: PITCH,
    overhang: OVERHANG,
    materialId: "mat-roof",
  };

  it("emits 2 panels and 2 gables", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    expect(geom.panels).toHaveLength(2);
    expect(geom.gables).toHaveLength(2);
  });

  it("ridge sits at half-depth height = ((D + 2*overhang) / 2) * tan(pitch)", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const ridgeZ = Math.max(...geom.panels.flatMap((p) => p.vertices.map((v) => v.z)));
    const expected = WALL_TOP + ((8 + 2 * OVERHANG) / 2) * Math.tan(PITCH);
    expect(ridgeZ).toBeCloseTo(expected);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/__tests__/roofGeometry.test.ts -t "gable"`
Expected: FAIL (currently returns undefined).

- [ ] **Step 3: Add `buildGable2Opp` and dispatch**

In `src/geometry/roofGeometry.ts`, add to the switch and define the helper:

```ts
case 2: {
  const eaves = resolved.filter((e) => e.kind === "eave");
  if (eaves[0].side === oppositeSide(eaves[1].side)) {
    return buildGable2Opp(resolved, outer, wallTopZ, slope, roof.materialId);
  }
  // 2-adjacent handled in a later task.
  return undefined;
}
```

```ts
function buildGable2Opp(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): RoofGeometry {
  const eaves = edges.filter((e) => e.kind === "eave");
  const eaveA = eaves[0];
  const eaveB = eaves[1];
  const gables = edges.filter((e) => e.kind === "gable");

  // Compute axes from eaveA's perspective — depth (eave→eave) and ridge along
  // the gable side direction. Use the bbox to derive width W and depth D.
  // For the 2-opp case both eaves are parallel so geometry is symmetric.
  const fullDepth =
    eaveA.side === "front" || eaveA.side === "back"
      ? outer.yMax - outer.yMin
      : outer.xMax - outer.xMin;
  const halfDepth = fullDepth / 2;
  const ridgeZ = wallTopZ + halfDepth * slope;

  const panels: RoofPanel[] = [];
  for (const eave of [eaveA, eaveB]) {
    const { u0, u1 } = eaveAxes(eave.side, outer);
    const eaveV = sideV(eave.side, outer);
    const ridgeV = midV(eave.side, outer);
    const lo0 = liftToWorld(eave.side, outer, u0, eaveV, wallTopZ);
    const lo1 = liftToWorld(eave.side, outer, u1, eaveV, wallTopZ);
    const hi1 = liftToWorld(eave.side, outer, u1, ridgeV, ridgeZ);
    const hi0 = liftToWorld(eave.side, outer, u0, ridgeV, ridgeZ);
    panels.push({ vertices: [lo0, lo1, hi1, hi0], materialId });
  }

  const result: RoofGable[] = [];
  for (const g of gables) {
    result.push({
      wallId: g.wallId,
      vertices: triangleAlong(g.side, outer, wallTopZ, ridgeZ - wallTopZ, "full"),
    });
  }
  return { panels, gables: result };
}

function midV(side: ResolvedEdge["side"], outer: Rect): number {
  switch (side) {
    case "front":
    case "back":
      return (outer.yMin + outer.yMax) / 2;
    case "left":
    case "right":
      return (outer.xMin + outer.xMax) / 2;
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `npx vitest run src/__tests__/roofGeometry.test.ts`
Expected: PASS (6 tests total: 4 from Task 3 + 2 from this task).

- [ ] **Step 5: Commit**

```bash
git add src/geometry/roofGeometry.ts src/__tests__/roofGeometry.test.ts
git commit -m "feat(roof): gable (2-opposite-eave) case"
```

---

## Task 5: Roof geometry — case 4 (hip / 四坡)

**Files:**
- Modify: `src/geometry/roofGeometry.ts`
- Modify: `src/__tests__/roofGeometry.test.ts`

- [ ] **Step 1: Write the failing test for hip**

Append to `src/__tests__/roofGeometry.test.ts`:

```ts
describe("buildRoofGeometry — hip (4 eaves)", () => {
  const roof: Roof = {
    edges: { "w-front": "eave", "w-back": "eave", "w-left": "eave", "w-right": "eave" },
    pitch: PITCH,
    overhang: OVERHANG,
    materialId: "mat-roof",
  };

  it("emits 4 panels and 0 gables", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    expect(geom.panels).toHaveLength(4);
    expect(geom.gables).toHaveLength(0);
  });

  it("ridge height = (min(W, D) / 2) * tan(pitch) above wall top", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const ridgeZ = Math.max(...geom.panels.flatMap((p) => p.vertices.map((v) => v.z)));
    // Outer rect is (10+2*0.6) x (8+2*0.6) = 11.2 x 9.2; min half = 4.6.
    const expected = WALL_TOP + 4.6 * Math.tan(PITCH);
    expect(ridgeZ).toBeCloseTo(expected);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/__tests__/roofGeometry.test.ts -t "hip"`
Expected: FAIL.

- [ ] **Step 3: Add `buildHip4` and dispatch**

In `src/geometry/roofGeometry.ts`, add:

```ts
case 4:
  return buildHip4(resolved, outer, wallTopZ, slope, roof.materialId);
```

```ts
function buildHip4(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): RoofGeometry {
  const W = outer.xMax - outer.xMin;
  const D = outer.yMax - outer.yMin;
  const halfMin = Math.min(W, D) / 2;
  const ridgeZ = wallTopZ + halfMin * slope;

  // Inset the hip apex points: ridge is along the longer axis, of length
  // |W - D|, centered.
  const cx = (outer.xMin + outer.xMax) / 2;
  const cy = (outer.yMin + outer.yMax) / 2;
  const ridgeAlongX = W >= D;
  const ridgeHalfLen = Math.abs(W - D) / 2;

  const apexA: Point3 = ridgeAlongX
    ? { x: cx - ridgeHalfLen, y: cy, z: ridgeZ }
    : { x: cx, y: cy - ridgeHalfLen, z: ridgeZ };
  const apexB: Point3 = ridgeAlongX
    ? { x: cx + ridgeHalfLen, y: cy, z: ridgeZ }
    : { x: cx, y: cy + ridgeHalfLen, z: ridgeZ };

  // Helpers for the 4 outer corners (bottom-z = wall top).
  const c00: Point3 = { x: outer.xMin, y: outer.yMin, z: wallTopZ };
  const c10: Point3 = { x: outer.xMax, y: outer.yMin, z: wallTopZ };
  const c11: Point3 = { x: outer.xMax, y: outer.yMax, z: wallTopZ };
  const c01: Point3 = { x: outer.xMin, y: outer.yMax, z: wallTopZ };

  const panels: RoofPanel[] = [];
  for (const e of edges) {
    let verts: Point3[];
    switch (e.side) {
      case "front":
        verts = ridgeAlongX
          ? [c00, c10, apexB, apexA]                // long-side trapezoid
          : [c00, c10, apexA];                      // short-side triangle
        break;
      case "back":
        verts = ridgeAlongX
          ? [c11, c01, apexA, apexB]
          : [c11, c01, apexB];
        break;
      case "right":
        verts = ridgeAlongX
          ? [c10, c11, apexB]                        // short-side triangle
          : [c10, c11, apexB, apexA];                // long-side trapezoid
        break;
      case "left":
        verts = ridgeAlongX
          ? [c01, c00, apexA]
          : [c01, c00, apexA, apexB];
        break;
    }
    panels.push({ vertices: verts, materialId });
  }

  return { panels, gables: [] };
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `npx vitest run src/__tests__/roofGeometry.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/geometry/roofGeometry.ts src/__tests__/roofGeometry.test.ts
git commit -m "feat(roof): hip (4-eave) case"
```

---

## Task 6: Roof geometry — case 3 (half-hip / Dutch)

**Files:**
- Modify: `src/geometry/roofGeometry.ts`
- Modify: `src/__tests__/roofGeometry.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe("buildRoofGeometry — half-hip (3 eaves + 1 gable)", () => {
  const roof: Roof = {
    edges: { "w-front": "eave", "w-right": "eave", "w-back": "eave", "w-left": "gable" },
    pitch: PITCH,
    overhang: OVERHANG,
    materialId: "mat-roof",
  };

  it("emits 3 panels and 1 gable", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    expect(geom.panels).toHaveLength(3);
    expect(geom.gables).toHaveLength(1);
  });

  it("ridge sits at half-depth (along the eave-eave-axis) of the rectangle", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const ridgeZ = Math.max(...geom.panels.flatMap((p) => p.vertices.map((v) => v.z)));
    // Outer y dimension = 8 + 2*0.6 = 9.2 → half = 4.6.
    const expected = WALL_TOP + 4.6 * Math.tan(PITCH);
    expect(ridgeZ).toBeCloseTo(expected);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/__tests__/roofGeometry.test.ts -t "half-hip"`
Expected: FAIL.

- [ ] **Step 3: Add `buildHalfHip3` and dispatch**

In `src/geometry/roofGeometry.ts`:

```ts
case 3:
  return buildHalfHip3(resolved, outer, wallTopZ, slope, roof.materialId);
```

```ts
function buildHalfHip3(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): RoofGeometry {
  const gable = edges.find((e) => e.kind === "gable")!;
  const eaves = edges.filter((e) => e.kind === "eave");
  // The two eaves OPPOSITE in pair are perpendicular to the gable's axis;
  // they create the central ridge that runs from the gable wall toward the
  // opposite eave (which has a hipped end).
  const oppToGable = eaves.find((e) => e.side === oppositeSide(gable.side))!;
  const sideEaves = eaves.filter((e) => e !== oppToGable);

  // Depth = perpendicular distance across the two side eaves.
  const sideAxisHorizontal = sideEaves[0].side === "front" || sideEaves[0].side === "back";
  const fullDepth = sideAxisHorizontal
    ? outer.yMax - outer.yMin
    : outer.xMax - outer.xMin;
  const halfDepth = fullDepth / 2;
  const ridgeZ = wallTopZ + halfDepth * slope;

  // Ridge endpoints in plan: starts at gable wall midpoint, ends at the
  // hip-meeting point (halfDepth in from the opposite-to-gable side).
  const ridgeAtGable: Point3 = ridgePointAtSide(gable.side, outer, ridgeZ);
  const ridgeHipApex: Point3 = ridgeHipApexPoint(oppToGable.side, outer, halfDepth, ridgeZ);

  const panels: RoofPanel[] = [];
  // Two side-eave panels (trapezoids): from outer eave edge up to the ridge.
  for (const e of sideEaves) {
    const { u0, u1 } = eaveAxes(e.side, outer);
    const eaveV = sideV(e.side, outer);
    // u0 is at the gable end (per eaveAxes ordering), u1 is at the
    // opposite-to-gable end where the hip starts.
    const lo0 = liftToWorld(e.side, outer, u0, eaveV, wallTopZ);
    const lo1 = liftToWorld(e.side, outer, u1, eaveV, wallTopZ);
    panels.push({
      vertices: [lo0, lo1, ridgeHipApex, ridgeAtGable],
      materialId,
    });
  }
  // One opposite-to-gable triangle panel (the hipped end).
  {
    const e = oppToGable;
    const { u0, u1 } = eaveAxes(e.side, outer);
    const eaveV = sideV(e.side, outer);
    const lo0 = liftToWorld(e.side, outer, u0, eaveV, wallTopZ);
    const lo1 = liftToWorld(e.side, outer, u1, eaveV, wallTopZ);
    panels.push({
      vertices: [lo0, lo1, ridgeHipApex],
      materialId,
    });
  }

  return {
    panels,
    gables: [
      { wallId: gable.wallId, vertices: triangleAlong(gable.side, outer, wallTopZ, ridgeZ - wallTopZ, "full") },
    ],
  };
}

function ridgePointAtSide(side: ResolvedEdge["side"], outer: Rect, z: number): Point3 {
  const cx = (outer.xMin + outer.xMax) / 2;
  const cy = (outer.yMin + outer.yMax) / 2;
  switch (side) {
    case "front": return { x: cx, y: outer.yMin, z };
    case "back":  return { x: cx, y: outer.yMax, z };
    case "left":  return { x: outer.xMin, y: cy, z };
    case "right": return { x: outer.xMax, y: cy, z };
  }
}

function ridgeHipApexPoint(
  oppSide: ResolvedEdge["side"],
  outer: Rect,
  halfDepth: number,
  z: number,
): Point3 {
  const cx = (outer.xMin + outer.xMax) / 2;
  const cy = (outer.yMin + outer.yMax) / 2;
  // Hip apex sits on the rect's central axis, halfDepth in from oppSide.
  switch (oppSide) {
    case "front": return { x: cx, y: outer.yMin + halfDepth, z };
    case "back":  return { x: cx, y: outer.yMax - halfDepth, z };
    case "left":  return { x: outer.xMin + halfDepth, y: cy, z };
    case "right": return { x: outer.xMax - halfDepth, y: cy, z };
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `npx vitest run src/__tests__/roofGeometry.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/geometry/roofGeometry.ts src/__tests__/roofGeometry.test.ts
git commit -m "feat(roof): half-hip (3-eave) case"
```

---

## Task 7: Roof geometry — case 2-adj (corner-slope)

**Files:**
- Modify: `src/geometry/roofGeometry.ts`
- Modify: `src/__tests__/roofGeometry.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```ts
describe("buildRoofGeometry — corner slope (2 adjacent eaves)", () => {
  const roof: Roof = {
    edges: { "w-front": "eave", "w-right": "eave", "w-back": "gable", "w-left": "gable" },
    pitch: PITCH,
    overhang: OVERHANG,
    materialId: "mat-roof",
  };

  it("emits 2 panels and 2 gables", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    expect(geom.panels).toHaveLength(2);
    expect(geom.gables).toHaveLength(2);
  });

  it("highest point sits at the corner of the two gables (apex)", () => {
    const geom = buildRoofGeometry(TOP, RECT_RING, rectWalls(), roof)!;
    const apexZ = Math.max(...geom.panels.flatMap((p) => p.vertices.map((v) => v.z)));
    // Apex = the back-left outer corner; rises by min(W, D) of the slope coming
    // from each adjacent eave. With pitches equal, it's whichever eave's plane
    // wins at that corner. Outer rect 11.2 x 9.2; the SE-eaves push the BL
    // corner up by (W) along front-eave and (D) along right-eave; min wins.
    // For (front+right) eaves and BL corner = (xMin, yMax): front plane
    // height = (yMax - yMin) * tan = 9.2 * tan; right plane = (xMax - xMin)
    // * tan = 11.2 * tan; min = 9.2 * tan ≈ 5.31m.
    const expected = WALL_TOP + 9.2 * Math.tan(PITCH);
    expect(apexZ).toBeCloseTo(expected);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/__tests__/roofGeometry.test.ts -t "corner slope"`
Expected: FAIL.

- [ ] **Step 3: Add `buildCornerSlope2Adj` and dispatch**

In `src/geometry/roofGeometry.ts`, modify the case-2 branch:

```ts
case 2: {
  const eaves = resolved.filter((e) => e.kind === "eave");
  if (eaves[0].side === oppositeSide(eaves[1].side)) {
    return buildGable2Opp(resolved, outer, wallTopZ, slope, roof.materialId);
  }
  return buildCornerSlope2Adj(resolved, outer, wallTopZ, slope, roof.materialId);
}
```

```ts
function buildCornerSlope2Adj(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): RoofGeometry {
  const eaves = edges.filter((e) => e.kind === "eave");
  const gables = edges.filter((e) => e.kind === "gable");

  // Identify the shared corner of the two eaves (the "low corner") and the
  // opposite "high corner" (where the two gables meet).
  const W = outer.xMax - outer.xMin;
  const D = outer.yMax - outer.yMin;
  const eaveSides = new Set(eaves.map((e) => e.side));
  const lowCorner: Point3 = {
    x: eaveSides.has("right") ? outer.xMax : outer.xMin,
    y: eaveSides.has("back")  ? outer.yMax : outer.yMin,
    z: wallTopZ,
  };
  const highCorner: Point3 = {
    x: eaveSides.has("right") ? outer.xMin : outer.xMax,
    y: eaveSides.has("back")  ? outer.yMin : outer.yMax,
    z: wallTopZ + Math.min(W, D) * slope,
  };

  // Hip line goes from lowCorner to wherever the two eave planes equalize and
  // exit the rectangle. When pitches are equal, hip is at 45° in plan.
  // The hip ends at one of the gable walls (whichever is reached first based
  // on min(W, D)).
  const hipExit: Point3 = (() => {
    if (W <= D) {
      // hip exits the gable wall opposite the right/left eave (i.e. at x = highCorner.x)
      return {
        x: highCorner.x,
        y: lowCorner.y + (eaveSides.has("front") ? +W : -W),
        z: wallTopZ + W * slope,
      };
    }
    return {
      x: lowCorner.x + (eaveSides.has("right") ? -D : +D),
      y: highCorner.y,
      z: wallTopZ + D * slope,
    };
  })();

  // Panel for each eave: trapezoid (low edge along the eave, high edge
  // along the hip + opposite gable wall).
  const panels: RoofPanel[] = [];
  for (const e of eaves) {
    const eaveV = sideV(e.side, outer);
    const { u0, u1 } = eaveAxes(e.side, outer);
    const lo0 = liftToWorld(e.side, outer, u0, eaveV, wallTopZ);
    const lo1 = liftToWorld(e.side, outer, u1, eaveV, wallTopZ);
    // The two "high" vertices are: the corner shared with the OTHER eave's
    // gable (highCorner side) and the hip exit point. Order CCW.
    panels.push({ vertices: [lo0, lo1, hipExit, highCorner], materialId });
  }

  // Each gable wall extends vertically up to the eave plane on its inner side.
  // Both gables become trapezoidal-ish triangles whose apex is highCorner and
  // whose other top vertex follows the hip exit.
  const result: RoofGable[] = [];
  for (const g of gables) {
    const eaveV = sideV(g.side, outer);
    const { u0, u1 } = eaveAxes(g.side, outer);
    const baseStart = liftToWorld(g.side, outer, u0, eaveV, wallTopZ);
    const baseEnd = liftToWorld(g.side, outer, u1, eaveV, wallTopZ);
    // Apex z follows the slope from the lowCorner side.
    result.push({ wallId: g.wallId, vertices: [baseStart, baseEnd, highCorner] });
  }

  return { panels, gables: result };
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `npx vitest run src/__tests__/roofGeometry.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add src/geometry/roofGeometry.ts src/__tests__/roofGeometry.test.ts
git commit -m "feat(roof): corner-slope (2-adjacent-eave) case"
```

---

## Task 8: Roof mutations

**Files:**
- Modify: `src/domain/mutations.ts`
- Modify: `src/__tests__/mutations.test.ts`

- [ ] **Step 1: Write the failing tests for `addRoof` / `removeRoof` / `updateRoof` / `toggleRoofEdge` and the storey-clears-roof rule**

Append to `src/__tests__/mutations.test.ts`:

```ts
import {
  addRoof,
  removeRoof,
  updateRoof,
  toggleRoofEdge,
} from "../domain/mutations";

describe("addRoof", () => {
  it("creates a default roof with the two longest walls as eaves", () => {
    const project = createSampleProject();
    const stripped = { ...project, roof: undefined };
    const next = addRoof(stripped);
    expect(next.roof).toBeDefined();
    const top = next.storeys[next.storeys.length - 1];
    const topWalls = next.walls.filter((w) => w.storeyId === top.id && w.exterior);
    const eaves = topWalls.filter((w) => next.roof!.edges[w.id] === "eave");
    expect(eaves).toHaveLength(2);
    // Sample top is 10x8 → front + back are eaves (length 10).
    expect(eaves.map((w) => w.id).sort()).toEqual([`wall-back-${top.id}`, `wall-front-${top.id}`]);
    expect(next.roof!.pitch).toBeCloseTo(Math.PI / 6);
    expect(next.roof!.overhang).toBeCloseTo(0.6);
  });

  it("throws when a roof already exists", () => {
    const project = addRoof({ ...createSampleProject(), roof: undefined });
    expect(() => addRoof(project)).toThrow();
  });

  it("throws when canBuildRoof is false", () => {
    const project = createSampleProject();
    const top = project.storeys[project.storeys.length - 1];
    const walls = project.walls.filter(
      (w) => !(w.storeyId === top.id && w.id === `wall-front-${top.id}`),
    );
    expect(() => addRoof({ ...project, walls, roof: undefined })).toThrow();
  });
});

describe("removeRoof", () => {
  it("clears project.roof", () => {
    const project = createSampleProject();
    const next = removeRoof(project);
    expect(next.roof).toBeUndefined();
  });
  it("is a no-op when no roof exists", () => {
    const project = { ...createSampleProject(), roof: undefined };
    expect(removeRoof(project)).toBe(project);
  });
});

describe("updateRoof", () => {
  it("clamps pitch into [π/36, π/3]", () => {
    const project = createSampleProject();
    const upper = updateRoof(project, { pitch: Math.PI }); // 180° → clamp
    expect(upper.roof!.pitch).toBeCloseTo(Math.PI / 3);
    const lower = updateRoof(project, { pitch: 0 });
    expect(lower.roof!.pitch).toBeCloseTo(Math.PI / 36);
  });
  it("clamps overhang into [0, 2]", () => {
    const project = createSampleProject();
    expect(updateRoof(project, { overhang: -1 }).roof!.overhang).toBe(0);
    expect(updateRoof(project, { overhang: 5 }).roof!.overhang).toBe(2);
  });
});

describe("toggleRoofEdge", () => {
  it("flips eave ↔ gable", () => {
    const project = createSampleProject();
    const top = project.storeys[project.storeys.length - 1];
    const wallId = `wall-front-${top.id}`;
    const before = project.roof!.edges[wallId];
    const next = toggleRoofEdge(project, wallId);
    expect(next.roof!.edges[wallId]).not.toBe(before);
  });

  it("throws when flipping the last eave to gable", () => {
    const project = createSampleProject();
    const top = project.storeys[project.storeys.length - 1];
    // Force only one eave on front:
    const front = `wall-front-${top.id}`;
    const project1 = {
      ...project,
      roof: {
        ...project.roof!,
        edges: {
          [front]: "eave" as const,
          [`wall-back-${top.id}`]: "gable" as const,
          [`wall-left-${top.id}`]: "gable" as const,
          [`wall-right-${top.id}`]: "gable" as const,
        },
      },
    };
    expect(() => toggleRoofEdge(project1, front)).toThrow();
  });
});

describe("storey mutations clear roof", () => {
  it("addStorey clears project.roof", () => {
    const project = createSampleProject();
    expect(project.roof).toBeDefined();
    const next = addStorey(project);
    expect(next.roof).toBeUndefined();
  });
  it("duplicateStorey clears project.roof", () => {
    const project = createSampleProject();
    const next = duplicateStorey(project, "2f");
    expect(next.roof).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/__tests__/mutations.test.ts`
Expected: FAIL on the new describe blocks (functions undefined; sample project has no roof yet).

NB: the `addRoof` "already exists" test depends on `createSampleProject().roof` being defined later (Task 11). Until then, it'll currently pass once `addRoof` is implemented and given a fresh stripped sample. The "addStorey clears roof" test ALSO depends on `createSampleProject().roof` being defined. We'll wire those together in Task 11.

For now: when you run after Step 3 below, expect tests that rely on `createSampleProject().roof` to fail with `roof` undefined. That's expected. The test file as written is final-state; the failing assertions will pass once Task 11 lands.

- [ ] **Step 3: Implement the new mutations and clear-on-storey-mutation**

In `src/domain/mutations.ts`, add at the bottom (or near other top-level mutations):

```ts
import { canBuildRoof } from "./views";
import type { Roof, RoofEdgeKind } from "./types";

const PITCH_MIN = Math.PI / 36;
const PITCH_MAX = Math.PI / 3;
const OVERHANG_MIN = 0;
const OVERHANG_MAX = 2;
const DEFAULT_PITCH = Math.PI / 6; // 30°
const DEFAULT_OVERHANG = 0.6;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function topStoreyOf(project: HouseProject) {
  return [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
}

export function addRoof(project: HouseProject): HouseProject {
  if (project.roof) throw new Error("Roof already exists.");
  if (!canBuildRoof(project)) throw new Error("Top storey is not a 4-wall axis-aligned rectangle.");
  const top = topStoreyOf(project);
  const topWalls = project.walls.filter((w) => w.storeyId === top.id && w.exterior);
  const lengths = topWalls.map((w) => ({
    wall: w,
    length: Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y),
  }));
  // Sort longest first; tie-break by id for determinism.
  lengths.sort((a, b) => b.length - a.length || a.wall.id.localeCompare(b.wall.id));
  const eaveIds = new Set([lengths[0].wall.id, lengths[1].wall.id]);
  const edges: Record<string, RoofEdgeKind> = {};
  for (const w of topWalls) edges[w.id] = eaveIds.has(w.id) ? "eave" : "gable";

  const roofMaterial =
    project.materials.find((m) => m.kind === "roof") ?? project.materials[0];
  const roof: Roof = {
    edges,
    pitch: DEFAULT_PITCH,
    overhang: DEFAULT_OVERHANG,
    materialId: roofMaterial.id,
  };
  return assertValidProject({ ...project, roof });
}

export function removeRoof(project: HouseProject): HouseProject {
  if (!project.roof) return project;
  return assertValidProject({ ...project, roof: undefined });
}

export function updateRoof(
  project: HouseProject,
  patch: Partial<Pick<Roof, "pitch" | "overhang" | "materialId">>,
): HouseProject {
  if (!project.roof) throw new Error("No roof to update.");
  const next: Roof = {
    ...project.roof,
    ...(patch.pitch !== undefined ? { pitch: clamp(patch.pitch, PITCH_MIN, PITCH_MAX) } : {}),
    ...(patch.overhang !== undefined ? { overhang: clamp(patch.overhang, OVERHANG_MIN, OVERHANG_MAX) } : {}),
    ...(patch.materialId !== undefined ? { materialId: patch.materialId } : {}),
  };
  return assertValidProject({ ...project, roof: next });
}

export function toggleRoofEdge(project: HouseProject, wallId: string): HouseProject {
  if (!project.roof) throw new Error("No roof to toggle.");
  const current = project.roof.edges[wallId] === "eave" ? "eave" : "gable";
  const flipped: RoofEdgeKind = current === "eave" ? "gable" : "eave";
  const top = topStoreyOf(project);
  const topWalls = project.walls.filter((w) => w.storeyId === top.id && w.exterior);
  const nextEdges = { ...project.roof.edges, [wallId]: flipped };
  // Recount effective eaves (apply edge-resolution rule).
  const effectiveEaves = topWalls.filter((w) => nextEdges[w.id] === "eave").length;
  if (effectiveEaves === 0) throw new Error("Roof must keep at least one eave.");
  return assertValidProject({ ...project, roof: { ...project.roof, edges: nextEdges } });
}
```

Then modify `addStorey`, `duplicateStorey`, and `removeStorey` (each in this same file) to set `roof: undefined` on the returned project. Locate each function and at the point it constructs the new project, replace `assertValidProject({ ...project, storeys: ... })` with `assertValidProject({ ...project, storeys: ..., roof: undefined })` (preserve the rest of the spread).

- [ ] **Step 4: Run tests — verify mutation tests pass (except the ones that need the sample-project default roof)**

Run: `npx vitest run src/__tests__/mutations.test.ts -t "addRoof|removeRoof|updateRoof|toggleRoofEdge"`
Expected: PASS for tests that don't rely on `createSampleProject().roof`.

The `storey mutations clear roof` and `removeRoof clears` cases will fail until Task 11. That's acceptable — keep going.

- [ ] **Step 5: Commit**

```bash
git add src/domain/mutations.ts src/__tests__/mutations.test.ts
git commit -m "feat(roof): mutations addRoof/removeRoof/updateRoof/toggleRoofEdge + storey mutations clear roof"
```

---

## Task 9: Wire roof geometry into `HouseGeometry`

**Files:**
- Modify: `src/geometry/types.ts`
- Modify: `src/geometry/houseGeometry.ts`
- Modify: `src/geometry/slabGeometry.ts`

- [ ] **Step 1: Add `roof?: RoofGeometry` to `HouseGeometry`**

In `src/geometry/types.ts`:

```ts
import type { RoofGeometry } from "./roofGeometry";

// ... existing types ...

export type HouseGeometry = {
  walls: WallGeometry[];
  balconies: BalconyGeometry[];
  slabs: SlabGeometry[];
  stairs: StairRenderGeometry[];
  roof?: RoofGeometry;
};
```

- [ ] **Step 2: Replace placeholder branch in `houseGeometry.ts`**

In `src/geometry/houseGeometry.ts`, change imports:

```ts
import { buildSlabGeometry } from "./slabGeometry";  // remove buildRoofPlaceholder
import { buildRoofGeometry } from "./roofGeometry";
import { buildExteriorRing } from "./footprintRing";
```

Delete the lines:

```ts
const topStorey = pickTopStorey(project);
if (topStorey) {
  const roof = buildRoofPlaceholder(topStorey, project.walls, footprints, SLAB_MATERIAL_ID);
  if (roof) slabs.push(roof);
}
```

In their place add (still before the `return`):

```ts
let roof: HouseGeometry["roof"];
const topStorey = pickTopStorey(project);
if (topStorey && project.roof) {
  const topWalls = project.walls.filter(
    (wall) => wall.storeyId === topStorey.id && wall.exterior,
  );
  const ring = buildExteriorRing(topWalls, footprints);
  if (ring) {
    roof = buildRoofGeometry(topStorey, ring, topWalls, project.roof);
  }
}
```

Then in the `return { ... }` add `roof,` after `stairs`.

- [ ] **Step 3: Delete `buildRoofPlaceholder`**

In `src/geometry/slabGeometry.ts`, delete `buildRoofPlaceholder` and the unused `ROOF_PLACEHOLDER_THICKNESS` constant. The `SlabKind` `"roof"` value is still referenced; leave the type alone for now (one stray value won't hurt) — or, if you're feeling tidy, narrow it to `export type SlabKind = "floor"`. Defer to your discretion; the rest of the codebase only emits `"floor"` slabs after this change.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: tests in `slabGeometry.test.ts` that exercise `buildRoofPlaceholder` will fail. Replace those expectations with assertions on absence (e.g. "no kind === 'roof' slabs are emitted now"), or delete the obsolete cases. Inspect the failures and patch the test file accordingly. After patching, re-run.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/types.ts src/geometry/houseGeometry.ts src/geometry/slabGeometry.ts src/__tests__/slabGeometry.test.ts
git commit -m "feat(roof): wire RoofGeometry into HouseGeometry; drop slab placeholder"
```

---

## Task 10: 3D rendering of roof meshes

**Files:**
- Modify: `src/rendering/threeScene.ts`

- [ ] **Step 1: Add `createRoofMeshes`**

Append (or insert near `createSlabMeshes`):

```ts
import type { RoofGeometry } from "../geometry/roofGeometry";

const ROOF_FALLBACK_COLOR = "#8a4f3a";

function createRoofPanelMaterial(project: HouseProject, materialId: string) {
  const material = project.materials.find((m) => m.id === materialId);
  return new THREE.MeshStandardMaterial({
    color: material?.color ?? ROOF_FALLBACK_COLOR,
    side: THREE.DoubleSide,
  });
}

function buildRoofPanelMesh(panel: RoofGeometry["panels"][number], material: THREE.Material): THREE.Mesh {
  const positions: number[] = [];
  // Fan-triangulate from vertex 0 (panels are convex).
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

function buildRoofGableMesh(
  project: HouseProject,
  gable: RoofGeometry["gables"][number],
  walls: HouseProject["walls"],
  cache: Map<string, THREE.Material>,
): { mesh: THREE.Mesh; material: THREE.Material } {
  const wall = walls.find((w) => w.id === gable.wallId);
  const materialId = wall?.materialId ?? "";
  let material = cache.get(materialId);
  if (!material) {
    material = createSlabMaterial(project, materialId); // wall material is ok via slab path
    cache.set(materialId, material);
  }
  const positions: number[] = [];
  for (let i = 1; i < gable.vertices.length - 1; i += 1) {
    const a = gable.vertices[0];
    const b = gable.vertices[i];
    const c = gable.vertices[i + 1];
    positions.push(a.x, a.z, planYToSceneZ(a.y));
    positions.push(b.x, b.z, planYToSceneZ(b.y));
    positions.push(c.x, c.z, planYToSceneZ(c.y));
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return { mesh: new THREE.Mesh(geom, material), material };
}

function createRoofMeshes(project: HouseProject, geometry: HouseGeometry) {
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.Material[] = [];
  if (!geometry.roof) return { meshes, materials };

  const panelMaterial = createRoofPanelMaterial(project, project.roof?.materialId ?? "");
  materials.push(panelMaterial);
  for (const panel of geometry.roof.panels) {
    meshes.push(buildRoofPanelMesh(panel, panelMaterial));
  }

  const gableMaterials = new Map<string, THREE.Material>();
  for (const gable of geometry.roof.gables) {
    const { mesh, material } = buildRoofGableMesh(project, gable, project.walls, gableMaterials);
    meshes.push(mesh);
    if (!materials.includes(material)) materials.push(material);
  }
  return { meshes, materials };
}
```

- [ ] **Step 2: Wire it into the scene assembly**

Locate the line:

```ts
const meshes = [...wallMeshes, ...balconyMeshes, ...slabMeshes, ...stairMeshes];
const materials = [...wallMaterials, ...balconyMaterials, ...slabMaterials, ...stairMaterials];
```

Just above it, add:

```ts
const { meshes: roofMeshes, materials: roofMaterials } = createRoofMeshes(project, houseGeometry);
```

Then extend the arrays:

```ts
const meshes = [...wallMeshes, ...balconyMeshes, ...slabMeshes, ...stairMeshes, ...roofMeshes];
const materials = [...wallMaterials, ...balconyMaterials, ...slabMaterials, ...stairMaterials, ...roofMaterials];
```

And include `roofMeshes` in the `collidables` array a few lines below.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

The 3D test isn't in jsdom — skip automated checks here. After Task 11 wires up the sample project, you'll be able to verify visually with `npm run dev`.

- [ ] **Step 5: Commit**

```bash
git add src/rendering/threeScene.ts
git commit -m "feat(roof): three.js mesh builders for panels and gable triangles"
```

---

## Task 11: Sample project default roof

**Files:**
- Modify: `src/domain/sampleProject.ts`
- Create: `src/__tests__/sampleProject.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/sampleProject.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createSampleProject } from "../domain/sampleProject";

describe("createSampleProject", () => {
  it("ships with a default roof: front+back as eaves, sides as gables, 30° pitch, 0.6m overhang", () => {
    const project = createSampleProject();
    const top = project.storeys[project.storeys.length - 1];
    expect(project.roof).toBeDefined();
    expect(project.roof!.edges[`wall-front-${top.id}`]).toBe("eave");
    expect(project.roof!.edges[`wall-back-${top.id}`]).toBe("eave");
    expect(project.roof!.edges[`wall-left-${top.id}`]).toBe("gable");
    expect(project.roof!.edges[`wall-right-${top.id}`]).toBe("gable");
    expect(project.roof!.pitch).toBeCloseTo(Math.PI / 6);
    expect(project.roof!.overhang).toBeCloseTo(0.6);
    const material = project.materials.find((m) => m.id === project.roof!.materialId);
    expect(material?.kind).toBe("roof");
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/__tests__/sampleProject.test.ts`
Expected: FAIL (`project.roof` undefined).

- [ ] **Step 3: Add default roof to the sample**

In `src/domain/sampleProject.ts`, find the final `return { ... };`. Just before it, compute:

```ts
const topStorey = storeys[storeys.length - 1];
const roofMaterial = materials.find((m) => m.kind === "roof") ?? materials[0];
const roof = {
  edges: {
    [`wall-front-${topStorey.id}`]: "eave" as const,
    [`wall-back-${topStorey.id}`]: "eave" as const,
    [`wall-left-${topStorey.id}`]: "gable" as const,
    [`wall-right-${topStorey.id}`]: "gable" as const,
  },
  pitch: Math.PI / 6,
  overhang: 0.6,
  materialId: roofMaterial.id,
};
```

Add `roof,` to the returned object alongside `walls`, `openings`, `balconies`.

If `materials.find((m) => m.kind === "roof")` returns undefined (catalog has no roof material), confirm by inspecting `src/materials/catalog.ts`. If absent, add a roof material in the catalog with kind `"roof"`. In the existing catalog there is `mat-gray-stone` used for slabs; but per spec gable/roof materials should be a roof-kind. Audit and add one if missing.

Run: `grep -n "kind" src/materials/catalog.ts`

If no `kind: "roof"` material exists, add one near the top of the catalog list:

```ts
{
  id: "mat-clay-tile",
  name: "陶瓦",
  kind: "roof",
  color: "#8a4f3a",
},
```

- [ ] **Step 4: Run tests — verify pass**

Run: `npx vitest run src/__tests__/sampleProject.test.ts src/__tests__/mutations.test.ts`
Expected: PASS for sample-project test; the previously-failing storey-mutations-clear-roof and removeRoof tests now pass too.

- [ ] **Step 5: Run the whole suite**

Run: `npx vitest run`
Expected: PASS across the board. If `__tests__/projection.test.ts` or `slabGeometry.test.ts` regress because they expected the placeholder, patch them to remove placeholder assumptions.

- [ ] **Step 6: Commit**

```bash
git add src/domain/sampleProject.ts src/__tests__/sampleProject.test.ts src/materials/catalog.ts
git commit -m "feat(roof): sample project ships with default gable roof"
```

---

## Task 12: Persistence — assertion + drop-on-failure

**Files:**
- Modify: `src/app/persistence.ts`
- Modify: `src/__tests__/persistence.test.ts`

- [ ] **Step 1: Write failing tests**

Append to (or create) `src/__tests__/persistence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exportProjectJson, importProjectJson } from "../app/persistence";
import { createSampleProject } from "../domain/sampleProject";

describe("roof persistence", () => {
  it("round-trips the roof field through JSON", () => {
    const project = createSampleProject();
    const reloaded = importProjectJson(exportProjectJson(project));
    expect(reloaded.roof).toEqual(project.roof);
  });

  it("drops the roof when pitch is out of range, but keeps loading the project", () => {
    const project = createSampleProject();
    const json = exportProjectJson({
      ...project,
      roof: { ...project.roof!, pitch: Math.PI }, // 180° — invalid
    });
    const reloaded = importProjectJson(json);
    expect(reloaded.roof).toBeUndefined();
    expect(reloaded.id).toBe(project.id);
  });
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run src/__tests__/persistence.test.ts -t "roof persistence"`
Expected: FAIL (roof not handled by import path; second test currently throws or returns the bad roof).

- [ ] **Step 3: Add `assertRoofShape` and integrate into `assertImportedProjectShape`**

In `src/app/persistence.ts`:

```ts
function assertRoofShape(value: unknown): void {
  assertObject(value, "roof");
  const pitch = assertFiniteNumberField(value, "pitch");
  if (pitch < Math.PI / 36 || pitch > Math.PI / 3) {
    invalidProjectJson("roof.pitch out of range.");
  }
  const overhang = assertFiniteNumberField(value, "overhang");
  if (overhang < 0 || overhang > 2) {
    invalidProjectJson("roof.overhang out of range.");
  }
  assertStringField(value, "materialId");
  const edges = (value as ProjectJsonObject).edges;
  assertObject(edges, "roof.edges");
  let hasEave = false;
  for (const v of Object.values(edges as Record<string, unknown>)) {
    if (v !== "eave" && v !== "gable") invalidProjectJson("roof.edges values must be 'eave' or 'gable'.");
    if (v === "eave") hasEave = true;
  }
  if (!hasEave) invalidProjectJson("roof.edges must contain at least one 'eave'.");
}
```

Then modify `assertImportedProjectShape` to handle roof tolerantly. Replace `withImportedDefaults` so it conditionally drops a malformed roof rather than aborting the whole project. The simplest change: add a try/catch around `assertRoofShape` inside `withImportedDefaults`:

```ts
function withImportedDefaults(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const project = { ...(value as ProjectJsonObject) };

  if (project.balconies === undefined) {
    project.balconies = [];
  }

  if (project.roof !== undefined) {
    try {
      assertRoofShape(project.roof);
    } catch {
      delete project.roof;
    }
  }

  delete project.selection;
  delete project.selectedObjectId;

  return project;
}
```

- [ ] **Step 4: Run tests — verify pass**

Run: `npx vitest run src/__tests__/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/persistence.ts src/__tests__/persistence.test.ts
git commit -m "feat(roof): persistence validates roof shape; drops on failure"
```

---

## Task 13: Property panel — roof and roof-edge forms

**Files:**
- Modify: `src/components/PropertyPanel.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Add roof handlers to AppShell**

In `src/components/AppShell.tsx`, near the other mutation handlers, add:

```ts
const handleAddRoof = () => {
  dispatch({ type: "mutate", apply: (p) => addRoof(p) });
};
const handleRemoveRoof = () => {
  dispatch({ type: "mutate", apply: (p) => removeRoof(p) });
};
const handleUpdateRoof = (
  patch: Partial<{ pitch: number; overhang: number; materialId: string }>,
) => {
  dispatch({ type: "mutate", apply: (p) => updateRoof(p, patch) });
};
const handleToggleRoofEdge = (wallId: string) => {
  dispatch({ type: "mutate", apply: (p) => toggleRoofEdge(p, wallId) });
};
```

(Use whatever the existing dispatch shape is — adjust the wrapping to match other handlers like `handleAddStorey`. If the reducer expects a fully-built next-project rather than a transform, pass `apply(state.project)` accordingly.)

Add the imports:

```ts
import { addRoof, removeRoof, toggleRoofEdge, updateRoof } from "../domain/mutations";
```

Pass the four handlers down to `<PropertyPanel ... />`:

```tsx
onAddRoof={handleAddRoof}
onRemoveRoof={handleRemoveRoof}
onUpdateRoof={handleUpdateRoof}
onToggleRoofEdge={handleToggleRoofEdge}
```

- [ ] **Step 2: Add `roof` and `roof-edge` form sections to `PropertyPanel`**

In `src/components/PropertyPanel.tsx`, extend the props type with:

```ts
onAddRoof?: () => void;
onRemoveRoof?: () => void;
onUpdateRoof?: (patch: Partial<{ pitch: number; overhang: number; materialId: string }>) => void;
onToggleRoofEdge?: (wallId: string) => void;
```

Add two new branches in the selection-driven render:

```tsx
if (selection?.kind === "roof" && project.roof) {
  const roof = project.roof;
  const pitchDeg = Math.round((roof.pitch * 180) / Math.PI);
  const roofMaterials = project.materials.filter((m) => m.kind === "roof");
  return (
    <section className="property-panel">
      <h2>屋顶</h2>
      <label>
        坡度 (°)
        <input
          type="number"
          min={5}
          max={60}
          value={pitchDeg}
          onChange={(e) =>
            onUpdateRoof?.({ pitch: (Number(e.target.value) * Math.PI) / 180 })
          }
        />
      </label>
      <label>
        出檐 (m)
        <input
          type="number"
          step={0.1}
          min={0}
          max={2}
          value={roof.overhang}
          onChange={(e) => onUpdateRoof?.({ overhang: Number(e.target.value) })}
        />
      </label>
      <label>
        材质
        <select
          value={roof.materialId}
          onChange={(e) => onUpdateRoof?.({ materialId: e.target.value })}
        >
          {roofMaterials.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>
      <button className="property-secondary property-danger" onClick={onRemoveRoof}>
        移除屋顶
      </button>
    </section>
  );
}

if (selection?.kind === "roof-edge" && project.roof) {
  const wallId = selection.wallId;
  const top = [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
  const topWalls = project.walls.filter((w) => w.storeyId === top.id && w.exterior);
  const current = project.roof.edges[wallId] === "eave" ? "eave" : "gable";
  const eaveCount = topWalls.filter((w) => project.roof!.edges[w.id] === "eave").length;
  const isOnlyEave = current === "eave" && eaveCount === 1;
  return (
    <section className="property-panel">
      <h2>屋顶边缘</h2>
      <p>当前：<strong>{current === "eave" ? "檐 (eave)" : "山墙 (gable)"}</strong></p>
      <button
        disabled={isOnlyEave}
        title={isOnlyEave ? "至少需要一条檐边" : undefined}
        onClick={() => onToggleRoofEdge?.(wallId)}
      >
        切换为 {current === "eave" ? "山墙" : "檐"}
      </button>
      {/* Roof-level fields repeat here for convenience — copy the same JSX as above. */}
    </section>
  );
}
```

For the inner roof-edge case, factor the roof-level fields into a small component if they grow tedious; otherwise duplicate the form (the spec explicitly accepts this as "convenience without re-selecting").

- [ ] **Step 3: Add styles**

Append to `src/styles.css`:

```css
.property-danger {
  color: #fff;
  background-color: #b85050;
}
.roof-edge--eave {
  stroke: #2d6f8a;
  stroke-width: 3px;
}
.roof-edge--gable {
  stroke: #2d6f8a;
  stroke-dasharray: 6 4;
  stroke-width: 2px;
}
.roof-edge.is-selected {
  stroke: #f0a020;
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/PropertyPanel.tsx src/components/AppShell.tsx src/styles.css
git commit -m "feat(roof): property panel for roof and roof-edge selections"
```

---

## Task 14: Drawing surface — render the roof view

**Files:**
- Modify: `src/components/DrawingSurface2D.tsx`

- [ ] **Step 1: Replace `renderRoofPlaceholder`**

Locate `renderRoofPlaceholder` in `DrawingSurface2D.tsx`. Replace its body with logic that:

1. Calls `canBuildRoof(project)` (import from `../domain/views`).
2. If false → render the existing centered hint, but with the new text "屋顶建模需要顶层为 4 面轴对齐外墙".
3. If true and `project.roof === undefined` → render the top-storey outline lightly + a centered button labeled "+ 添加屋顶" that calls a new `onAddRoof` prop.
4. If true and `project.roof` defined → render the top-storey outline with each exterior wall styled by its edge kind (eave or gable) and clickable.

```tsx
function renderRoofView(props: {
  project: HouseProject;
  onAddRoof?: () => void;
  onSelectRoof?: () => void;
  onSelectRoofEdge?: (wallId: string) => void;
  selection?: ObjectSelection;
  scale: number; // existing plan-view scaling helpers
}) {
  const { project, onAddRoof, onSelectRoof, onSelectRoofEdge, selection, scale } = props;
  if (!canBuildRoof(project)) {
    return <div className="roof-hint">屋顶建模需要顶层为 4 面轴对齐外墙</div>;
  }
  const top = [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
  const walls = project.walls.filter((w) => w.storeyId === top.id && w.exterior);

  if (!project.roof) {
    return (
      <>
        {walls.map((w) => (
          <line
            key={w.id}
            x1={w.start.x * scale}
            y1={w.start.y * scale}
            x2={w.end.x * scale}
            y2={w.end.y * scale}
            className="roof-edge--gable" // styled but inert
          />
        ))}
        <foreignObject x="50%" y="50%" width="200" height="60">
          <button onClick={onAddRoof}>+ 添加屋顶</button>
        </foreignObject>
      </>
    );
  }

  return (
    <g
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelectRoof?.();
      }}
    >
      {walls.map((w) => {
        const kind = project.roof!.edges[w.id] === "eave" ? "eave" : "gable";
        const isSelected =
          selection?.kind === "roof-edge" && selection.wallId === w.id;
        return (
          <line
            key={w.id}
            x1={w.start.x * scale}
            y1={w.start.y * scale}
            x2={w.end.x * scale}
            y2={w.end.y * scale}
            className={`roof-edge roof-edge--${kind}${isSelected ? " is-selected" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectRoofEdge?.(w.id);
            }}
          />
        );
      })}
    </g>
  );
}
```

The exact JSX must be adapted to the actual rendering primitives used by `DrawingSurface2D` (SVG group structure, scale transforms, etc.). Match existing patterns in the file: how walls are rendered in plan views is the closest analog.

Replace the call site `renderRoofPlaceholder()` with `renderRoofView({ project, ...handlers })`. Pass `onAddRoof`, `onSelectRoof`, `onSelectRoofEdge` from `AppShell`.

In `AppShell.tsx`:

```ts
const handleSelectRoof = () => dispatch({ type: "select", selection: { kind: "roof" } });
const handleSelectRoofEdge = (wallId: string) =>
  dispatch({ type: "select", selection: { kind: "roof-edge", wallId } });
```

(Adjust to match the existing select-action shape.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/DrawingSurface2D.tsx src/components/AppShell.tsx
git commit -m "feat(roof): drawing surface roof view (add button, edge selection)"
```

---

## Task 15: UI tests for the roof view

**Files:**
- Modify: `src/__tests__/ui.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/ui.test.tsx`:

```ts
describe("roof view", () => {
  it("clicking [添加屋顶] from a no-roof project creates a default roof", async () => {
    const user = userEvent.setup();
    // Start from a project without a roof (sample default has one) — clear it first.
    render(<App initialProjectOverride={(p) => ({ ...p, roof: undefined })} />);
    // (Use whatever existing test seam exposes; or render then dispatch removeRoof.)
    // Switch to roof view:
    await user.click(screen.getByRole("button", { name: "屋顶" }));
    await user.click(screen.getByRole("button", { name: "+ 添加屋顶" }));
    // After click, the [+ 添加屋顶] button should be gone:
    expect(screen.queryByRole("button", { name: "+ 添加屋顶" })).toBeNull();
  });

  it("toggling an eave edge to gable updates the property panel label", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "屋顶" }));
    // The sample's wall-front-3f is an eave; click its corresponding line.
    // Use a data-testid on the line for easy targeting (added to component above).
    await user.click(screen.getByTestId("roof-edge-wall-front-3f"));
    await user.click(screen.getByRole("button", { name: /切换为 山墙/ }));
    expect(screen.getByText(/当前：/).textContent).toContain("山墙");
  });

  it("the toggle button is disabled when the selected eave is the last one", async () => {
    const user = userEvent.setup();
    render(<App initialProjectOverride={(p) => ({
      ...p,
      roof: { ...p.roof!, edges: {
        [`wall-front-${p.storeys.at(-1)!.id}`]: "eave",
        [`wall-back-${p.storeys.at(-1)!.id}`]: "gable",
        [`wall-left-${p.storeys.at(-1)!.id}`]: "gable",
        [`wall-right-${p.storeys.at(-1)!.id}`]: "gable",
      }},
    })} />);
    await user.click(screen.getByRole("button", { name: "屋顶" }));
    await user.click(screen.getByTestId("roof-edge-wall-front-3f"));
    expect(screen.getByRole("button", { name: /切换为 山墙/ })).toBeDisabled();
  });

  it("pitch input updates the roof model", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "屋顶" }));
    // Click roof body to select roof.
    await user.click(screen.getByTestId("roof-body"));
    const pitchInput = screen.getByLabelText("坡度 (°)") as HTMLInputElement;
    await user.clear(pitchInput);
    await user.type(pitchInput, "45");
    expect(pitchInput.value).toBe("45");
  });
});
```

NB: these tests assume two test seams that don't yet exist:

1. `<App initialProjectOverride={...} />` — a prop on `App` that lets tests inject a mutated initial project. If your `App` doesn't have this, add it (it's a one-liner). Or use the existing `bootWorkspace()` pathway with a localStorage prepopulation in `beforeEach`. Pick whichever is simpler.

2. `data-testid` attributes — add `data-testid={`roof-edge-${w.id}`}` to each `<line>` in the roof view, and `data-testid="roof-body"` to the SVG group's hit area.

- [ ] **Step 2: Add the two seams in source**

In `DrawingSurface2D.tsx`, add `data-testid` to each `<line>` and the group's invisible hit area.

In `AppShell.tsx`, accept an optional `initialProjectOverride` prop and apply it to the project loaded from `bootWorkspace()` before initializing the reducer.

- [ ] **Step 3: Run tests — verify pass**

Run: `npx vitest run src/__tests__/ui.test.tsx -t "roof view"`
Expected: PASS (4 tests).

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/DrawingSurface2D.tsx src/components/AppShell.tsx src/__tests__/ui.test.tsx
git commit -m "test(roof): UI tests for roof view (add, toggle, pitch input, last-eave disabled)"
```

---

## Task 16: Final smoke test + cleanup

**Files:** none (manual)

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: PASS, no type errors.

- [ ] **Step 2: Dev server smoke test**

Run: `npm run dev` (background)
- Open the app.
- Confirm sample project shows a real gable roof in 3D.
- Switch to the roof tab. Click each edge — toggle works, last-eave button disables.
- Adjust pitch + overhang from the property panel. 3D updates live.
- Add a new storey via the height strip — confirm roof clears and roof tab shows "+ 添加屋顶".
- Re-add roof. Confirm export → import round-trips.

- [ ] **Step 3: Final commit (if any tweaks needed)**

If any small UI fixes came out of the smoke test, batch them into one commit:

```bash
git add -p
git commit -m "fix(roof): polish from smoke test"
```

- [ ] **Step 4: Run full test suite one more time**

Run: `npx vitest run`
Expected: all pass.

---

## Self-Review

**Spec coverage** — every section of the spec has at least one task:
- §2 Shape language → Tasks 3–7 (one case each).
- §3 Data model → Task 1 (types) + Task 8 (mutations enforce).
- §4 Geometry derivation → Tasks 3–7 + Task 9 (wiring).
- §5 Editing UX → Tasks 13 + 14.
- §6 Mutations → Task 8.
- §7 3D rendering → Task 10.
- §8 Persistence → Task 12.
- §9 Defaults & migration → Task 11.
- §10 Test plan → distributed across all tasks.

**Placeholder scan** — no "TBD"/"TODO"/"implement later". A few steps explicitly defer judgment to the implementer (e.g. "match existing pattern" in Task 14) — kept because the existing component shape isn't tightly nailed down here and prescribing it would be guessing.

**Type/name consistency** — `RoofPanel`, `RoofGable`, `RoofGeometry` types defined in Task 3 and used identically in Tasks 4–7, 9, 10. `Roof` and `RoofEdgeKind` defined in Task 1, used in Task 8, 11, 12, 13. `canBuildRoof` defined in Task 2, used in Tasks 8, 14. Mutation names (`addRoof`/`removeRoof`/`updateRoof`/`toggleRoofEdge`) are consistent across Tasks 8, 11, 13.

**Known approximation** — the shed-side-gable triangle helper in Task 3 (`triangleAlong` with `mode: "rising-from-eave-side"`) is informally justified; the test in Task 3 only checks panel z-extents, not gable apex positions. If visual smoke testing in Task 16 reveals issues with shed gables, refine then.
