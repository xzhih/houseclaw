# Interior Walkthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Spec 1 — give every storey a polygon slab (with optional stair opening), seal the building with a placeholder flat roof, replace the ground with an 80 cm grid, and add an FPS walk camera (1.6 m eye height, gravity, wall collision, floor-switch buttons) alongside the existing orbit camera.

**Architecture:** Stay in the existing `domain → geometry → rendering → components` pipeline. New geometry helpers (`footprintRing`, `slabGeometry`) are pure-function modules with full vitest coverage. Walk controls split into a pure-physics module (`walkPhysics`) and a thin DOM glue (`walkControls`) that wires PointerLock + key handlers to the camera; the pure module gets all the unit tests, the glue is exercised through component tests + manual browser verification per the project's test strategy.

**Tech Stack:** TypeScript, React 19, Three.js, Vitest, React Testing Library, Bun.

**Spec:** `docs/superpowers/specs/2026-04-27-interior-walkthrough-design.md`

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/domain/types.ts` | modify | Add `StairOpening` type and `Storey.stairOpening` field |
| `src/domain/constraints.ts` | modify | Validate `stairOpening` (positive size, inside polygon, not on 1F) |
| `src/domain/sampleProject.ts` | modify | Default openings on 2F and 3F |
| `src/geometry/footprintRing.ts` | new | Trace exterior wall ring → outline polygon |
| `src/geometry/slabGeometry.ts` | new | Build slab + roof-placeholder geometry from a storey |
| `src/geometry/types.ts` | modify | `SlabGeometry` type, `HouseGeometry.slabs` |
| `src/geometry/houseGeometry.ts` | modify | Pipe slab building into `buildHouseGeometry` |
| `src/rendering/walkPhysics.ts` | new | Pure functions: `resolveHorizontalCollision`, `resolveVerticalState` |
| `src/rendering/walkControls.ts` | new | DOM glue: PointerLock, key state, animation loop |
| `src/rendering/threeScene.ts` | modify | `createSlabMeshes`, larger ground + GridHelper, `cameraMode` plumbing, dispose paths |
| `src/components/Preview3D.tsx` | modify | Mode toggle button + FPS HUD (floor buttons, crosshair, exit hint) |
| `src/styles.css` | modify | Mode toggle and HUD styles |
| `src/__tests__/footprintRing.test.ts` | new | Unit tests |
| `src/__tests__/slabGeometry.test.ts` | new | Unit tests |
| `src/__tests__/walkPhysics.test.ts` | new | Unit tests |
| `src/__tests__/preview3d.test.tsx` | new | RTL: mode toggle wiring |
| `src/__tests__/constraints.test.ts` | modify | Add stair-opening validation cases |
| `src/__tests__/geometry.test.ts` | modify | Assert `geometry.slabs` shape |

---

## Task 1: Add `StairOpening` type and `Storey.stairOpening` field

**Files:**
- Modify: `src/domain/types.ts`

- [ ] **Step 1: Add type and field**

In `src/domain/types.ts`, after the existing `Storey` type, add:

```ts
export type StairOpening = {
  x: number;
  y: number;
  width: number;
  depth: number;
};
```

And update `Storey`:

```ts
export type Storey = {
  id: string;
  label: string;
  elevation: number;
  height: number;
  slabThickness: number;
  stairOpening?: StairOpening;
};
```

- [ ] **Step 2: Run typecheck**

Run: `bun run lint`
Expected: no TypeScript errors (the field is optional, no callers need updating).

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts
git commit -m "$(cat <<'EOF'
feat: add StairOpening type and Storey.stairOpening field

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Validate `stairOpening` in `assertValidProject`

**Files:**
- Modify: `src/domain/constraints.ts`
- Modify: `src/__tests__/constraints.test.ts`

- [ ] **Step 1: Inspect existing constraints test file shape**

Run: `head -40 src/__tests__/constraints.test.ts`

You will see the project follows `validateProject(project)` returning a list of error strings. Add new tests that mutate a clone of `createSampleProject()` and assert specific messages appear.

- [ ] **Step 2: Write failing tests**

Append to `src/__tests__/constraints.test.ts`:

```ts
describe("stair opening validation", () => {
  it("rejects a stair opening on the 1F slab", () => {
    const project = createSampleProject();
    const oneF = project.storeys.find((s) => s.id === "1f")!;
    oneF.stairOpening = { x: 1, y: 1, width: 1, depth: 1 };

    const errors = validateProject(project);
    expect(errors).toContain(
      "Storey 1f cannot have a stair opening (no storey below).",
    );
  });

  it("rejects zero or negative size", () => {
    const project = createSampleProject();
    const twoF = project.storeys.find((s) => s.id === "2f")!;
    twoF.stairOpening = { x: 1, y: 1, width: 0, depth: 1 };

    const errors = validateProject(project);
    expect(errors).toContain(
      "Storey 2f stair opening width must be positive.",
    );
  });

  it("rejects an opening that falls outside the storey's exterior ring", () => {
    const project = createSampleProject();
    const twoF = project.storeys.find((s) => s.id === "2f")!;
    // Sample is a 10×8 rectangle; this opening hangs off the back wall.
    twoF.stairOpening = { x: 0.6, y: 7.5, width: 1.2, depth: 2.5 };

    const errors = validateProject(project);
    expect(errors).toContain(
      "Storey 2f stair opening must be fully inside the exterior ring.",
    );
  });

  it("accepts a well-placed opening on 2F", () => {
    const project = createSampleProject();
    const twoF = project.storeys.find((s) => s.id === "2f")!;
    twoF.stairOpening = { x: 0.6, y: 5.0, width: 1.2, depth: 2.5 };

    const errors = validateProject(project);
    expect(errors).toEqual([]);
  });
});
```

Make sure the imports at the top include `validateProject` and `createSampleProject` (they likely already do; if not, add them).

- [ ] **Step 3: Run failing tests**

Run: `bun run test -- constraints`
Expected: 4 new tests fail (validation logic does not yet exist).

- [ ] **Step 4: Implement validation**

In `src/domain/constraints.ts`, inside `validateProject`, add the following block after the balcony loop and before `return errors`. We use a bounding-box check at this layer to keep the constraints module free of geometry imports; rigorous polygon containment lives in the geometry layer:

```ts
const sortedStoreys = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
const lowestStoreyId = sortedStoreys[0]?.id;

for (const storey of project.storeys) {
  const opening = storey.stairOpening;
  if (!opening) continue;

  if (storey.id === lowestStoreyId) {
    errors.push(`Storey ${storey.id} cannot have a stair opening (no storey below).`);
    continue;
  }

  if (!isPositive(opening.width)) {
    errors.push(`Storey ${storey.id} stair opening width must be positive.`);
  }
  if (!isPositive(opening.depth)) {
    errors.push(`Storey ${storey.id} stair opening depth must be positive.`);
  }

  // Polygon-containment check requires the exterior ring; defer the import
  // to avoid circular module loading.
  // The ring is built lazily here from this storey's exterior walls.
  const storeyWalls = project.walls.filter(
    (wall) => wall.storeyId === storey.id && wall.exterior,
  );
  if (storeyWalls.length < 3) continue;

  // Fast bbox approximation: walls' centerline endpoints. Real ring check
  // happens in the geometry layer; constraints layer uses bbox to catch
  // obviously-outside openings while staying free of geometry imports.
  const xs = storeyWalls.flatMap((wall) => [wall.start.x, wall.end.x]);
  const ys = storeyWalls.flatMap((wall) => [wall.start.y, wall.end.y]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const corners = [
    { x: opening.x, y: opening.y },
    { x: opening.x + opening.width, y: opening.y },
    { x: opening.x + opening.width, y: opening.y + opening.depth },
    { x: opening.x, y: opening.y + opening.depth },
  ];
  const allInside = corners.every(
    (c) => c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY,
  );
  if (!allInside) {
    errors.push(`Storey ${storey.id} stair opening must be fully inside the exterior ring.`);
  }
}
```

- [ ] **Step 5: Run tests**

Run: `bun run test -- constraints`
Expected: all stair-opening tests pass; no other tests regress.

- [ ] **Step 6: Run full suite + typecheck**

Run: `bun run test && bun run lint`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/domain/constraints.ts src/__tests__/constraints.test.ts
git commit -m "$(cat <<'EOF'
feat: validate Storey.stairOpening (size, bbox, no-1F)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Default stair openings on 2F and 3F in sample project

**Files:**
- Modify: `src/domain/sampleProject.ts`
- Existing test: `src/__tests__/constraints.test.ts` (sample is validated in existing tests; verify still green)

- [ ] **Step 1: Locate the storey definitions**

Open `src/domain/sampleProject.ts`. Find where `storeys: Storey[]` is built (typically a `const storeys = [...]` array). Each storey has id, label, elevation, height, slabThickness.

- [ ] **Step 2: Add stair openings to 2F and 3F**

Modify the storey definitions so that the `2f` and `3f` storeys carry `stairOpening`:

```ts
{ id: "2f", label: "2F", elevation: DEFAULT_STOREY_HEIGHT, height: DEFAULT_STOREY_HEIGHT, slabThickness: DEFAULT_SLAB_THICKNESS, stairOpening: { x: 0.6, y: 5.0, width: 1.2, depth: 2.5 } },
{ id: "3f", label: "3F", elevation: DEFAULT_STOREY_HEIGHT * 2, height: DEFAULT_STOREY_HEIGHT, slabThickness: DEFAULT_SLAB_THICKNESS, stairOpening: { x: 0.6, y: 5.0, width: 1.2, depth: 2.5 } },
```

(Keep the `1f` storey unchanged.)

- [ ] **Step 3: Run full test suite**

Run: `bun run test`
Expected: all 119+ tests pass; the sample project still validates because the openings sit within the 10 × 8 rectangle.

- [ ] **Step 4: Commit**

```bash
git add src/domain/sampleProject.ts
git commit -m "$(cat <<'EOF'
feat: place default stair openings on 2F and 3F sample storeys

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Implement `footprintRing` exterior-ring tracer

**Files:**
- Create: `src/geometry/footprintRing.ts`
- Create: `src/__tests__/footprintRing.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/footprintRing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Point2, Wall } from "../domain/types";
import { buildExteriorRing } from "../geometry/footprintRing";
import { buildWallNetwork, type FootprintQuad } from "../geometry/wallNetwork";

const DEFAULT_THICKNESS = 0.24;
const DEFAULT_HEIGHT = 3;

function makeWall(overrides: Partial<Wall> & Pick<Wall, "id" | "start" | "end">): Wall {
  return {
    storeyId: "1f",
    thickness: DEFAULT_THICKNESS,
    height: DEFAULT_HEIGHT,
    exterior: true,
    materialId: "mat-white-render",
    ...overrides,
  };
}

function indexFootprints(walls: Wall[]): Map<string, FootprintQuad> {
  const index = new Map<string, FootprintQuad>();
  for (const fp of buildWallNetwork(walls)) {
    const { wallId, ...quad } = fp;
    index.set(wallId, quad);
  }
  return index;
}

function expectClosePolygon(actual: Point2[], expected: Point2[]) {
  expect(actual).toHaveLength(expected.length);
  expected.forEach((point, i) => {
    expect(actual[i].x).toBeCloseTo(point.x, 4);
    expect(actual[i].y).toBeCloseTo(point.y, 4);
  });
}

describe("buildExteriorRing", () => {
  it("traces a closed rectangle CCW from exterior corners", () => {
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 8 } }),
      makeWall({ id: "b", start: { x: 10, y: 8 }, end: { x: 0, y: 8 } }),
      makeWall({ id: "l", start: { x: 0, y: 8 }, end: { x: 0, y: 0 } }),
    ];

    const ring = buildExteriorRing(walls, indexFootprints(walls));

    expect(ring).toBeDefined();
    expectClosePolygon(ring!, [
      { x: -0.12, y: -0.12 },
      { x: 10.12, y: -0.12 },
      { x: 10.12, y: 8.12 },
      { x: -0.12, y: 8.12 },
    ]);
  });

  it("traces an L-shape with six exterior corners", () => {
    // L-footprint:  (0,0)→(8,0)→(8,4)→(4,4)→(4,8)→(0,8)→(0,0)
    const walls: Wall[] = [
      makeWall({ id: "a", start: { x: 0, y: 0 }, end: { x: 8, y: 0 } }),
      makeWall({ id: "b", start: { x: 8, y: 0 }, end: { x: 8, y: 4 } }),
      makeWall({ id: "c", start: { x: 8, y: 4 }, end: { x: 4, y: 4 } }),
      makeWall({ id: "d", start: { x: 4, y: 4 }, end: { x: 4, y: 8 } }),
      makeWall({ id: "e", start: { x: 4, y: 8 }, end: { x: 0, y: 8 } }),
      makeWall({ id: "f", start: { x: 0, y: 8 }, end: { x: 0, y: 0 } }),
    ];

    const ring = buildExteriorRing(walls, indexFootprints(walls));

    expect(ring).toBeDefined();
    expect(ring!).toHaveLength(6);
  });

  it("ignores interior walls", () => {
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 8 } }),
      makeWall({ id: "b", start: { x: 10, y: 8 }, end: { x: 0, y: 8 } }),
      makeWall({ id: "l", start: { x: 0, y: 8 }, end: { x: 0, y: 0 } }),
      makeWall({
        id: "interior",
        start: { x: 5, y: 0 },
        end: { x: 5, y: 8 },
        exterior: false,
      }),
    ];

    const ring = buildExteriorRing(walls, indexFootprints(walls));
    expect(ring).toBeDefined();
    expect(ring!).toHaveLength(4);
  });

  it("returns undefined when the exterior walls do not form a closed ring", () => {
    const walls: Wall[] = [
      makeWall({ id: "a", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "b", start: { x: 10, y: 0 }, end: { x: 10, y: 8 } }),
      // missing back and left walls
    ];

    expect(buildExteriorRing(walls, indexFootprints(walls))).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `bun run test -- footprintRing`
Expected: import error — `footprintRing` module does not exist.

- [ ] **Step 3: Implement `footprintRing.ts`**

Create `src/geometry/footprintRing.ts`:

```ts
import type { Point2, Wall } from "../domain/types";
import type { FootprintQuad } from "./wallNetwork";

const DEFAULT_TOLERANCE = 0.005;

type EndpointKey = string;

function endpointKey(point: Point2, tolerance: number): EndpointKey {
  const cell = 1 / tolerance;
  return `${Math.round(point.x * cell)}|${Math.round(point.y * cell)}`;
}

type DirectedSegment = {
  wallId: string;
  startKey: EndpointKey;
  endKey: EndpointKey;
  outerStart: Point2;
  outerEnd: Point2;
  outgoingAngle: number; // angle of (end - start) at startKey
};

export type BuildExteriorRingOptions = {
  tolerance?: number;
};

export function buildExteriorRing(
  walls: Wall[],
  footprintIndex: Map<string, FootprintQuad>,
  options?: BuildExteriorRingOptions,
): Point2[] | undefined {
  const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE;
  const exteriorWalls = walls.filter((wall) => wall.exterior);
  if (exteriorWalls.length < 3) return undefined;

  // Each wall contributes two directed segments (one in each direction along
  // its centerline) so the tracer can follow either way around the ring.
  const segments: DirectedSegment[] = [];
  for (const wall of exteriorWalls) {
    const fp = footprintIndex.get(wall.id);
    if (!fp) return undefined;
    const startKey = endpointKey(wall.start, tolerance);
    const endKey = endpointKey(wall.end, tolerance);

    const forwardAngle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
    const backwardAngle = Math.atan2(wall.start.y - wall.end.y, wall.start.x - wall.end.x);

    segments.push({
      wallId: wall.id,
      startKey,
      endKey,
      outerStart: fp.rightStart,
      outerEnd: fp.rightEnd,
      outgoingAngle: forwardAngle,
    });
    segments.push({
      wallId: wall.id,
      startKey: endKey,
      endKey: startKey,
      // Reversed direction → "right" side flips, so we use leftEnd → leftStart.
      outerStart: fp.leftEnd,
      outerEnd: fp.leftStart,
      outgoingAngle: backwardAngle,
    });
  }

  // Index outgoing segments by their starting junction.
  const outgoing = new Map<EndpointKey, DirectedSegment[]>();
  for (const segment of segments) {
    const list = outgoing.get(segment.startKey);
    if (list) list.push(segment);
    else outgoing.set(segment.startKey, [segment]);
  }

  // Pick a deterministic starting segment: smallest startKey, smallest angle.
  const sortedStarts = [...outgoing.keys()].sort();
  const startKey = sortedStarts[0];
  const initialList = outgoing.get(startKey);
  if (!initialList || initialList.length === 0) return undefined;
  const start = [...initialList].sort((a, b) => a.outgoingAngle - b.outgoingAngle)[0];

  const ring: Point2[] = [];
  const visited = new Set<string>();

  let current = start;
  while (true) {
    const segmentKey = `${current.wallId}|${current.startKey}`;
    if (visited.has(segmentKey)) break;
    visited.add(segmentKey);

    ring.push(current.outerStart);

    const choices = outgoing.get(current.endKey);
    if (!choices) return undefined;

    // Pick the segment that turns rightmost (i.e. smallest CCW angle from
    // the *reverse* of the incoming direction). This keeps us hugging the
    // exterior boundary even at branched junctions.
    const incomingReverse = current.outgoingAngle + Math.PI;
    const next = pickRightmost(choices, current.wallId, incomingReverse);
    if (!next) return undefined;

    if (next === start) {
      ring.push(current.outerEnd);
      break;
    }

    current = next;
  }

  if (ring.length < 3) return undefined;
  return ring;
}

function pickRightmost(
  choices: DirectedSegment[],
  incomingWallId: string,
  incomingReverseAngle: number,
): DirectedSegment | undefined {
  // Filter out U-turn back along the same wall.
  const filtered = choices.filter((c) => c.wallId !== incomingWallId);
  const pool = filtered.length > 0 ? filtered : choices;

  let best: DirectedSegment | undefined;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const candidate of pool) {
    let delta = candidate.outgoingAngle - incomingReverseAngle;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    // Rightmost = most-negative CCW delta = sharpest right turn.
    // Convert to "rightness": -delta. Smaller delta → more right.
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }

  return best;
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test -- footprintRing`
Expected: all four tests pass.

- [ ] **Step 5: Run full suite + typecheck**

Run: `bun run test && bun run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/footprintRing.ts src/__tests__/footprintRing.test.ts
git commit -m "$(cat <<'EOF'
feat: trace exterior wall ring into outline polygon

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Implement `slabGeometry`

**Files:**
- Create: `src/geometry/slabGeometry.ts`
- Create: `src/__tests__/slabGeometry.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/slabGeometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Storey, Wall } from "../domain/types";
import { buildRoofPlaceholder, buildSlabGeometry } from "../geometry/slabGeometry";
import { buildWallNetwork, type FootprintQuad } from "../geometry/wallNetwork";

function makeRectangleWalls(storeyId: string): Wall[] {
  const base = {
    storeyId,
    thickness: 0.24,
    height: 3,
    exterior: true,
    materialId: "mat-white-render",
  } as const;
  return [
    { id: `${storeyId}-front`, start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, ...base },
    { id: `${storeyId}-right`, start: { x: 10, y: 0 }, end: { x: 10, y: 8 }, ...base },
    { id: `${storeyId}-back`, start: { x: 10, y: 8 }, end: { x: 0, y: 8 }, ...base },
    { id: `${storeyId}-left`, start: { x: 0, y: 8 }, end: { x: 0, y: 0 }, ...base },
  ];
}

function indexFootprints(walls: Wall[]): Map<string, FootprintQuad> {
  const index = new Map<string, FootprintQuad>();
  for (const fp of buildWallNetwork(walls)) {
    const { wallId, ...quad } = fp;
    index.set(wallId, quad);
  }
  return index;
}

const DEFAULT_SLAB_MATERIAL = "mat-gray-stone";

describe("buildSlabGeometry", () => {
  it("returns the exterior outline with no hole when storey has no opening", () => {
    const walls = makeRectangleWalls("1f");
    const storey: Storey = {
      id: "1f",
      label: "1F",
      elevation: 0,
      height: 3.2,
      slabThickness: 0.18,
    };

    const slab = buildSlabGeometry(storey, walls, indexFootprints(walls), DEFAULT_SLAB_MATERIAL);

    expect(slab).toBeDefined();
    expect(slab!.kind).toBe("floor");
    expect(slab!.outline).toHaveLength(4);
    expect(slab!.hole).toBeUndefined();
    expect(slab!.topY).toBeCloseTo(0, 4);
    expect(slab!.thickness).toBeCloseTo(0.18, 4);
    expect(slab!.materialId).toBe(DEFAULT_SLAB_MATERIAL);
  });

  it("includes the stair opening as a rectangular hole when present", () => {
    const walls = makeRectangleWalls("2f");
    const storey: Storey = {
      id: "2f",
      label: "2F",
      elevation: 3.2,
      height: 3.2,
      slabThickness: 0.18,
      stairOpening: { x: 0.6, y: 5.0, width: 1.2, depth: 2.5 },
    };

    const slab = buildSlabGeometry(storey, walls, indexFootprints(walls), DEFAULT_SLAB_MATERIAL);

    expect(slab).toBeDefined();
    expect(slab!.hole).toBeDefined();
    expect(slab!.hole!).toEqual([
      { x: 0.6, y: 5.0 },
      { x: 1.8, y: 5.0 },
      { x: 1.8, y: 7.5 },
      { x: 0.6, y: 7.5 },
    ]);
    expect(slab!.topY).toBeCloseTo(3.2, 4);
  });

  it("returns undefined when the exterior ring cannot be built", () => {
    const walls: Wall[] = [
      {
        id: "lone",
        storeyId: "x",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        thickness: 0.24,
        height: 3,
        exterior: true,
        materialId: "mat-white-render",
      },
    ];
    const storey: Storey = {
      id: "x",
      label: "X",
      elevation: 0,
      height: 3,
      slabThickness: 0.18,
    };

    const slab = buildSlabGeometry(storey, walls, indexFootprints(walls), DEFAULT_SLAB_MATERIAL);
    expect(slab).toBeUndefined();
  });
});

describe("buildRoofPlaceholder", () => {
  it("sits on top of the topmost storey at storey-elevation + height", () => {
    const walls = makeRectangleWalls("3f");
    const topStorey: Storey = {
      id: "3f",
      label: "3F",
      elevation: 6.4,
      height: 3.2,
      slabThickness: 0.18,
    };

    const roof = buildRoofPlaceholder(topStorey, walls, indexFootprints(walls), DEFAULT_SLAB_MATERIAL);

    expect(roof).toBeDefined();
    expect(roof!.kind).toBe("roof");
    expect(roof!.hole).toBeUndefined();
    expect(roof!.thickness).toBeCloseTo(0.2, 4);
    expect(roof!.topY).toBeCloseTo(6.4 + 3.2 + 0.2, 4);
    expect(roof!.outline).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `bun run test -- slabGeometry`
Expected: import errors — module not found.

- [ ] **Step 3: Extend `geometry/types.ts` with `SlabGeometry`**

In `src/geometry/types.ts`, add:

```ts
import type { Point2 } from "../domain/types";
import type { FootprintQuad } from "./wallNetwork";

// ... existing exports ...

export type SlabKind = "floor" | "roof";

export type SlabGeometry = {
  storeyId: string;
  kind: SlabKind;
  outline: Point2[];
  hole?: Point2[];
  topY: number;
  thickness: number;
  materialId: string;
};

export type HouseGeometry = {
  walls: WallGeometry[];
  balconies: BalconyGeometry[];
  slabs: SlabGeometry[];
};
```

(Replace the existing `HouseGeometry` definition; do not duplicate.)

- [ ] **Step 4: Implement `slabGeometry.ts`**

Create `src/geometry/slabGeometry.ts`:

```ts
import type { Point2, Storey, Wall } from "../domain/types";
import { buildExteriorRing } from "./footprintRing";
import type { SlabGeometry } from "./types";
import type { FootprintQuad } from "./wallNetwork";

const ROOF_PLACEHOLDER_THICKNESS = 0.2;

function holeFromOpening(opening: { x: number; y: number; width: number; depth: number }): Point2[] {
  return [
    { x: opening.x, y: opening.y },
    { x: opening.x + opening.width, y: opening.y },
    { x: opening.x + opening.width, y: opening.y + opening.depth },
    { x: opening.x, y: opening.y + opening.depth },
  ];
}

export function buildSlabGeometry(
  storey: Storey,
  walls: Wall[],
  footprintIndex: Map<string, FootprintQuad>,
  materialId: string,
): SlabGeometry | undefined {
  const storeyWalls = walls.filter((wall) => wall.storeyId === storey.id);
  const outline = buildExteriorRing(storeyWalls, footprintIndex);
  if (!outline) return undefined;

  return {
    storeyId: storey.id,
    kind: "floor",
    outline,
    hole: storey.stairOpening ? holeFromOpening(storey.stairOpening) : undefined,
    topY: storey.elevation,
    thickness: storey.slabThickness,
    materialId,
  };
}

export function buildRoofPlaceholder(
  topStorey: Storey,
  walls: Wall[],
  footprintIndex: Map<string, FootprintQuad>,
  materialId: string,
): SlabGeometry | undefined {
  const storeyWalls = walls.filter((wall) => wall.storeyId === topStorey.id);
  const outline = buildExteriorRing(storeyWalls, footprintIndex);
  if (!outline) return undefined;

  return {
    storeyId: topStorey.id,
    kind: "roof",
    outline,
    topY: topStorey.elevation + topStorey.height + ROOF_PLACEHOLDER_THICKNESS,
    thickness: ROOF_PLACEHOLDER_THICKNESS,
    materialId,
  };
}
```

- [ ] **Step 5: Run tests**

Run: `bun run test -- slabGeometry`
Expected: all four tests pass.

- [ ] **Step 6: Run full suite + typecheck**

Run: `bun run test && bun run lint`
Expected: TypeScript will complain in `houseGeometry.ts` because `HouseGeometry` now requires a `slabs` field that the old code does not return. This is intentional — the next task fixes it.

- [ ] **Step 7: Stash the broken state? No — go straight to Task 6**

Do **not** commit yet. The pipeline change in Task 6 closes the type error before any commit. Continue to Task 6.

---

## Task 6: Wire slabs into `buildHouseGeometry`

**Files:**
- Modify: `src/geometry/houseGeometry.ts`
- Modify: `src/__tests__/geometry.test.ts`

- [ ] **Step 1: Update `buildHouseGeometry`**

In `src/geometry/houseGeometry.ts`, after computing `footprints`, build slabs:

```ts
import type { HouseProject, Point2, Wall } from "../domain/types";
import { buildRoofPlaceholder, buildSlabGeometry } from "./slabGeometry";
import type { HouseGeometry, SlabGeometry } from "./types";
import { buildWallNetwork, type FootprintQuad } from "./wallNetwork";
import { buildWallPanels } from "./wallPanels";

const SLAB_MATERIAL_ID = "mat-gray-stone";

function clonePoint(point: Point2): Point2 {
  return { x: point.x, y: point.y };
}

function cloneFootprint(quad: FootprintQuad): FootprintQuad {
  return {
    rightStart: clonePoint(quad.rightStart),
    rightEnd: clonePoint(quad.rightEnd),
    leftStart: clonePoint(quad.leftStart),
    leftEnd: clonePoint(quad.leftEnd),
  };
}

function fallbackFootprint(wall: Wall): FootprintQuad {
  return {
    rightStart: clonePoint(wall.start),
    rightEnd: clonePoint(wall.end),
    leftStart: clonePoint(wall.start),
    leftEnd: clonePoint(wall.end),
  };
}

function buildFootprintIndex(walls: Wall[]): Map<string, FootprintQuad> {
  const wallsByStorey = new Map<string, Wall[]>();
  for (const wall of walls) {
    const list = wallsByStorey.get(wall.storeyId);
    if (list) list.push(wall);
    else wallsByStorey.set(wall.storeyId, [wall]);
  }

  const index = new Map<string, FootprintQuad>();
  for (const storeyWalls of wallsByStorey.values()) {
    for (const fp of buildWallNetwork(storeyWalls)) {
      const { wallId, ...quad } = fp;
      index.set(wallId, quad);
    }
  }
  return index;
}

function pickTopStorey(project: HouseProject) {
  return [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
}

export function buildHouseGeometry(project: HouseProject): HouseGeometry {
  const footprints = buildFootprintIndex(project.walls);

  const slabs: SlabGeometry[] = [];
  for (const storey of project.storeys) {
    const slab = buildSlabGeometry(storey, project.walls, footprints, SLAB_MATERIAL_ID);
    if (slab) slabs.push(slab);
  }
  const topStorey = pickTopStorey(project);
  if (topStorey) {
    const roof = buildRoofPlaceholder(topStorey, project.walls, footprints, SLAB_MATERIAL_ID);
    if (roof) slabs.push(roof);
  }

  return {
    walls: project.walls.map((wall) => ({
      wallId: wall.id,
      storeyId: wall.storeyId,
      start: clonePoint(wall.start),
      end: clonePoint(wall.end),
      thickness: wall.thickness,
      height: wall.height,
      materialId: wall.materialId,
      panels: buildWallPanels(
        wall,
        project.openings.filter((opening) => opening.wallId === wall.id),
      ),
      footprint: cloneFootprint(footprints.get(wall.id) ?? fallbackFootprint(wall)),
    })),
    balconies: project.balconies.map((balcony) => ({
      balconyId: balcony.id,
      storeyId: balcony.storeyId,
      attachedWallId: balcony.attachedWallId,
      offset: balcony.offset,
      width: balcony.width,
      depth: balcony.depth,
      slabThickness: balcony.slabThickness,
      railingHeight: balcony.railingHeight,
      materialId: balcony.materialId,
      railingMaterialId: balcony.railingMaterialId,
    })),
    slabs,
  };
}
```

- [ ] **Step 2: Add a test in `geometry.test.ts`**

In `src/__tests__/geometry.test.ts`, after the existing footprint test, add:

```ts
it("emits a floor slab per storey plus one placeholder roof", () => {
  const geometry = buildHouseGeometry(createSampleProject());

  const floors = geometry.slabs.filter((slab) => slab.kind === "floor");
  const roofs = geometry.slabs.filter((slab) => slab.kind === "roof");

  expect(floors).toHaveLength(3);
  expect(roofs).toHaveLength(1);

  const twoF = floors.find((slab) => slab.storeyId === "2f")!;
  expect(twoF.hole).toBeDefined();
  expect(twoF.topY).toBeCloseTo(3.2, 4);

  const oneF = floors.find((slab) => slab.storeyId === "1f")!;
  expect(oneF.hole).toBeUndefined();
  expect(oneF.topY).toBeCloseTo(0, 4);

  expect(roofs[0].topY).toBeCloseTo(6.4 + 3.2 + 0.2, 4);
});
```

- [ ] **Step 3: Run tests**

Run: `bun run test`
Expected: 121+ tests pass.

- [ ] **Step 4: Run typecheck + build**

Run: `bun run lint && bun run build`
Expected: clean build.

- [ ] **Step 5: Commit (Tasks 5 + 6 together)**

```bash
git add src/geometry/types.ts src/geometry/slabGeometry.ts src/geometry/houseGeometry.ts src/__tests__/slabGeometry.test.ts src/__tests__/geometry.test.ts
git commit -m "$(cat <<'EOF'
feat: emit per-storey slabs and a placeholder roof

Slabs derive from the storey's exterior wall ring; stairOpening becomes
a rectangular hole. The topmost storey gets a 0.2m flat slab as a roof
placeholder so the building reads as a closed box. Both feed into
HouseGeometry.slabs for the renderer.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Render slab meshes in the scene

**Files:**
- Modify: `src/rendering/threeScene.ts`

- [ ] **Step 1: Add `createSlabMeshes` and integrate into `mountHouseScene`**

In `src/rendering/threeScene.ts`, alongside the existing `createWallMeshes` / `createBalconyMeshes`, add:

```ts
import type { SlabGeometry } from "../geometry/types";

const SLAB_FALLBACK_COLOR = "#a1a8a3";

function createSlabMaterial(project: HouseProject, materialId: string) {
  const material = project.materials.find((candidate) => candidate.id === materialId);
  return new THREE.MeshStandardMaterial({
    color: material?.color ?? SLAB_FALLBACK_COLOR,
    roughness: 0.85,
    metalness: 0.02,
  });
}

function buildSlabMesh(slab: SlabGeometry, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(
    slab.outline.map((point) => new THREE.Vector2(point.x, point.y)),
  );
  if (slab.hole) {
    shape.holes.push(
      new THREE.Path(slab.hole.map((point) => new THREE.Vector2(point.x, point.y))),
    );
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: slab.thickness,
    bevelEnabled: false,
  });
  // ExtrudeGeometry lays the shape on the XY plane and extrudes +Z.
  // Rotate so the shape's XY becomes world XZ and extrusion becomes -Y.
  geometry.rotateX(Math.PI / 2);
  // After rotation: top face sits at y=0, bottom at y=-thickness. Translate
  // so the top face matches slab.topY.
  geometry.translate(0, slab.topY, 0);

  return new THREE.Mesh(geometry, material);
}

function createSlabMeshes(project: HouseProject, geometry: HouseGeometry) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];

  for (const slab of geometry.slabs) {
    let material = materials.get(slab.materialId);
    if (!material) {
      material = createSlabMaterial(project, slab.materialId);
      materials.set(slab.materialId, material);
    }
    meshes.push(buildSlabMesh(slab, material));
  }

  return { meshes, materials: [...materials.values()] };
}
```

- [ ] **Step 2: Wire into `mountHouseScene`**

Find the body of `mountHouseScene`, locate where wall + balcony meshes are added to the scene, and extend:

```ts
const { meshes: wallMeshes, materials: wallMaterials } = createWallMeshes(project, houseGeometry);
const { meshes: balconyMeshes, materials: balconyMaterials } = createBalconyMeshes(project, houseGeometry);
const { meshes: slabMeshes, materials: slabMaterials } = createSlabMeshes(project, houseGeometry);

const meshes = [...wallMeshes, ...balconyMeshes, ...slabMeshes];
const materials = [...wallMaterials, ...balconyMaterials, ...slabMaterials];
```

(Keep the `scene.add(ambient, keyLight, ground, ...meshes)` line unchanged — `meshes` now includes slabs.)

- [ ] **Step 3: Verify the dispose path still covers them**

Look for the dispose loop:

```ts
for (const mesh of meshes) {
  mesh.geometry.dispose();
}
for (const material of materials) {
  material.dispose();
}
```

It already iterates the unified `meshes` and `materials` arrays — slab disposal is automatic. No change needed.

- [ ] **Step 4: Build and visually verify**

Run: `bun run build && bun run dev`
Open the dev URL in a browser. In 3D mode you should now see:
- The building has a flat top (placeholder roof) instead of a missing top.
- Looking at the model from a low angle you can see horizontal slab lines between floors.
- The 2F and 3F slabs each have a rectangular hole near the back-left (X≈0.6, Z≈5.0).

Stop the dev server (`Ctrl+C`).

- [ ] **Step 5: Commit**

```bash
git add src/rendering/threeScene.ts
git commit -m "$(cat <<'EOF'
feat: render slabs and placeholder roof in the 3D scene

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Replace the ground with a larger plane and an 80 cm grid

**Files:**
- Modify: `src/rendering/threeScene.ts`

- [ ] **Step 1: Update `createGround`**

Replace the existing `createGround` function in `src/rendering/threeScene.ts` with:

```ts
function createGround(bounds: SceneBounds) {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const size = Math.max(width, depth, 8) * 6;
  const finalSize = Math.max(size, 40);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  const geometry = new THREE.PlaneGeometry(finalSize, finalSize);
  const material = new THREE.MeshStandardMaterial({
    color: GROUND_COLOR,
    roughness: 0.92,
    metalness: 0,
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, -0.001, centerZ);

  const grid = new THREE.GridHelper(
    finalSize,
    Math.max(1, Math.round(finalSize / 0.8)),
    "#a8b2ad",
    "#c8d0cb",
  );
  grid.position.set(centerX, 0.001, centerZ);

  return { ground, grid, geometry, material };
}
```

- [ ] **Step 2: Add the grid to the scene**

In `mountHouseScene`, find the line that adds `ground` to the scene:

```ts
const { ground, geometry: groundGeometry, material: groundMaterial } = createGround(bounds);
```

Replace with:

```ts
const { ground, grid, geometry: groundGeometry, material: groundMaterial } = createGround(bounds);
```

And in `scene.add(...)`:

```ts
scene.add(ambient, keyLight, ground, grid, ...meshes);
```

- [ ] **Step 3: Update dispose path for the grid**

Find the existing dispose block and add:

```ts
grid.geometry.dispose();
const gridMaterial = grid.material;
if (Array.isArray(gridMaterial)) {
  gridMaterial.forEach((m) => m.dispose());
} else {
  gridMaterial.dispose();
}
```

(`THREE.GridHelper` extends `LineSegments` whose `material` is normally a `LineBasicMaterial`; the array branch is defensive in case three.js changes its mind.)

- [ ] **Step 4: Build and visually verify**

Run: `bun run build && bun run dev`
In the browser, the ground should now extend ~6× the building footprint and you should see clear 80 cm grid lines under and around the building.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/rendering/threeScene.ts
git commit -m "$(cat <<'EOF'
feat: enlarge ground plane and overlay 80cm grid

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Walk physics — pure functions

**Files:**
- Create: `src/rendering/walkPhysics.ts`
- Create: `src/__tests__/walkPhysics.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/walkPhysics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  resolveHorizontalCollision,
  resolveVerticalState,
  type HorizontalProbe,
  type VerticalProbe,
} from "../rendering/walkPhysics";

describe("resolveHorizontalCollision", () => {
  const radius = 0.3;

  it("passes desired move through unchanged when no walls block", () => {
    const probe: HorizontalProbe = () => null;
    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: 0 },
      radius,
      probe,
    );
    expect(out).toEqual({ x: 0.5, z: 0 });
  });

  it("clamps motion along the +x axis when a wall is in the way", () => {
    // Wall hit at distance 0.4 along +x; allowed move = 0.4 - radius = 0.1.
    const probe: HorizontalProbe = (origin, dir) =>
      dir.x > 0.5 ? 0.4 : null;

    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: 0 },
      radius,
      probe,
    );
    expect(out.x).toBeCloseTo(0.1, 4);
    expect(out.z).toBe(0);
  });

  it("slides along walls: +x blocked still allows -z motion", () => {
    const probe: HorizontalProbe = (origin, dir) =>
      dir.x > 0.5 ? 0.4 : null;

    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: -0.6 },
      radius,
      probe,
    );
    expect(out.x).toBeCloseTo(0.1, 4);
    expect(out.z).toBeCloseTo(-0.6, 4);
  });

  it("never lets motion go below zero distance from a wall", () => {
    // Wall already inside the radius (e.g. starting position is touching).
    const probe: HorizontalProbe = (origin, dir) =>
      dir.x > 0.5 ? 0.1 : null;

    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: 0 },
      radius,
      probe,
    );
    expect(out.x).toBeCloseTo(0, 4);
  });

  it("returns zero motion when desired is zero", () => {
    const probe: HorizontalProbe = () => null;
    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0, z: 0 },
      radius,
      probe,
    );
    expect(out).toEqual({ x: 0, z: 0 });
  });
});

describe("resolveVerticalState", () => {
  const config = {
    eyeHeight: 1.6,
    snapThreshold: 0.2,
    gravity: -9.8,
    maxRayLength: 5,
  } as const;

  it("snaps the camera to the surface when the player is grounded", () => {
    const probe: VerticalProbe = () => 0; // surface at y=0

    const next = resolveVerticalState(
      { cameraY: 1.6 + 0.05, vy: 0 },
      { x: 0, z: 0 },
      0.016,
      config,
      probe,
    );

    expect(next).not.toBe("respawn");
    if (next === "respawn") return;
    expect(next.cameraY).toBeCloseTo(1.6, 4);
    expect(next.vy).toBe(0);
  });

  it("snaps up small steps within the snap threshold", () => {
    const probe: VerticalProbe = () => 0.15; // tread 15cm above last footing

    const next = resolveVerticalState(
      { cameraY: 1.6, vy: 0 },
      { x: 0, z: 0 },
      0.016,
      config,
      probe,
    );

    if (next === "respawn") throw new Error("expected snap");
    expect(next.cameraY).toBeCloseTo(0.15 + 1.6, 4);
    expect(next.vy).toBe(0);
  });

  it("falls under gravity when the surface is far below", () => {
    const probe: VerticalProbe = () => -3.0; // 3m drop

    const next = resolveVerticalState(
      { cameraY: 1.6, vy: 0 },
      { x: 0, z: 0 },
      0.1,
      config,
      probe,
    );

    if (next === "respawn") throw new Error("expected falling");
    // After 0.1s of -9.8 m/s² gravity, vy = -0.98 and cameraY ≈ 1.6 + (-0.98)*0.1 = 1.502
    expect(next.vy).toBeCloseTo(-0.98, 3);
    expect(next.cameraY).toBeCloseTo(1.502, 3);
  });

  it("returns 'respawn' when the probe finds no surface within range", () => {
    const probe: VerticalProbe = () => null;

    const next = resolveVerticalState(
      { cameraY: 1.6, vy: 0 },
      { x: 0, z: 0 },
      0.016,
      config,
      probe,
    );
    expect(next).toBe("respawn");
  });
});
```

- [ ] **Step 2: Run failing tests**

Run: `bun run test -- walkPhysics`
Expected: import errors — module not found.

- [ ] **Step 3: Implement `walkPhysics.ts`**

Create `src/rendering/walkPhysics.ts`:

```ts
export type Vec3 = { x: number; y: number; z: number };
export type Vec2XZ = { x: number; z: number };

export type HorizontalProbe = (
  origin: Vec3,
  direction: { x: number; z: number },
  maxDistance: number,
) => number | null;

export type VerticalProbe = (
  origin: Vec3,
  maxDistance: number,
) => number | null;

export type WalkConfig = {
  eyeHeight: number;
  snapThreshold: number;
  gravity: number;
  maxRayLength: number;
};

export type VerticalState = {
  cameraY: number;
  vy: number;
};

export function resolveHorizontalCollision(
  position: Vec3,
  desiredMove: Vec2XZ,
  radius: number,
  probe: HorizontalProbe,
): Vec2XZ {
  let dx = desiredMove.x;
  let dz = desiredMove.z;

  // X axis
  if (dx !== 0) {
    const dirX = dx > 0 ? 1 : -1;
    const queryDir = { x: dirX, z: 0 };
    const max = Math.abs(dx) + radius;
    const hit = probe(position, queryDir, max);
    if (hit !== null) {
      const allowed = Math.max(0, hit - radius);
      dx = dirX * Math.min(Math.abs(dx), allowed);
    }
  }

  // Z axis (independent — sliding falls out for free)
  if (dz !== 0) {
    const dirZ = dz > 0 ? 1 : -1;
    const queryDir = { x: 0, z: dirZ };
    const max = Math.abs(dz) + radius;
    const hit = probe(position, queryDir, max);
    if (hit !== null) {
      const allowed = Math.max(0, hit - radius);
      dz = dirZ * Math.min(Math.abs(dz), allowed);
    }
  }

  return { x: dx, z: dz };
}

export function resolveVerticalState(
  state: VerticalState,
  cameraXZ: Vec2XZ,
  dt: number,
  config: WalkConfig,
  probe: VerticalProbe,
): VerticalState | "respawn" {
  const feetY = state.cameraY - config.eyeHeight;
  const origin: Vec3 = { x: cameraXZ.x, y: feetY + 0.01, z: cameraXZ.z };
  const surfaceY = probe(origin, config.maxRayLength);

  if (surfaceY === null) {
    return "respawn";
  }

  const drop = feetY - surfaceY;
  if (drop <= config.snapThreshold) {
    return { cameraY: surfaceY + config.eyeHeight, vy: 0 };
  }

  // Free fall
  const newVy = state.vy + config.gravity * dt;
  const newCameraY = state.cameraY + newVy * dt;
  return { cameraY: newCameraY, vy: newVy };
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test -- walkPhysics`
Expected: 8 tests pass.

- [ ] **Step 5: Run full suite + typecheck**

Run: `bun run test && bun run lint`

- [ ] **Step 6: Commit**

```bash
git add src/rendering/walkPhysics.ts src/__tests__/walkPhysics.test.ts
git commit -m "$(cat <<'EOF'
feat: walk physics primitives — horizontal collision + vertical snap/fall

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `attachWalkControls` — DOM glue

**Files:**
- Create: `src/rendering/walkControls.ts`

- [ ] **Step 1: Implement `walkControls.ts`**

Create `src/rendering/walkControls.ts`:

```ts
import * as THREE from "three";
import {
  resolveHorizontalCollision,
  resolveVerticalState,
  type HorizontalProbe,
  type VerticalProbe,
} from "./walkPhysics";

const EYE_HEIGHT = 1.6;
const PLAYER_RADIUS = 0.3;
const FOV_DEGREES = 70;
const WALK_SPEED = 1.4;
const RUN_SPEED = 2.8;
const GRAVITY = -9.8;
const SNAP_THRESHOLD = 0.2;
const MAX_DOWN_RAY = 5;
const MAX_HORIZONTAL_RAY = WALK_SPEED * 0.5; // upper bound for one frame
const MOUSE_SENSITIVITY = 0.0025;
const PITCH_LIMIT = THREE.MathUtils.degToRad(85);

export type WalkSpawn = {
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
};

export type WalkCallbacks = {
  onWalkExit: () => void;             // fired when pointer-lock is released (Esc)
  onDigitKey: (digit: number) => void; // 1, 2, 3 — used to switch storeys without leaving lock
};

export type WalkControls = {
  enable(spawn: WalkSpawn): void;
  disable(): void;
  setSpawn(spawn: WalkSpawn): void;
  dispose(): void;
};

export function attachWalkControls(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  collidables: THREE.Object3D[],
  callbacks: WalkCallbacks,
): WalkControls {
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = false;

  const keys = new Set<string>();
  let yaw = 0;
  let pitch = 0;
  let vy = 0;
  let enabled = false;
  let respawnPosition: WalkSpawn = { x: 0, y: EYE_HEIGHT, z: 0, yaw: 0, pitch: 0 };
  let rafId = 0;
  let lastTimestamp = 0;
  let savedFov = camera.fov;

  const horizontalProbe: HorizontalProbe = (origin, direction, maxDistance) => {
    const dirVec = new THREE.Vector3(direction.x, 0, direction.z).normalize();
    raycaster.set(
      new THREE.Vector3(origin.x, origin.y, origin.z),
      dirVec,
    );
    raycaster.near = 0;
    raycaster.far = maxDistance;
    const hits = raycaster.intersectObjects(collidables, false);
    if (hits.length === 0) return null;
    return hits[0].distance;
  };

  const verticalProbe: VerticalProbe = (origin, maxDistance) => {
    raycaster.set(
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(0, -1, 0),
    );
    raycaster.near = 0;
    raycaster.far = maxDistance;
    const hits = raycaster.intersectObjects(collidables, false);
    if (hits.length === 0) return null;
    return hits[0].point.y;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!enabled) return;
    if (event.key === "Escape") {
      // Browser will release pointer-lock; pointerlockchange handler triggers disable + onWalkExit.
      return;
    }
    if (event.key === "1" || event.key === "2" || event.key === "3") {
      callbacks.onDigitKey(Number(event.key));
      return;
    }
    keys.add(event.key.toLowerCase());
  };

  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.key.toLowerCase());
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!enabled || document.pointerLockElement !== canvas) return;
    yaw -= event.movementX * MOUSE_SENSITIVITY;
    pitch -= event.movementY * MOUSE_SENSITIVITY;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  };

  const onPointerLockChangeNative = () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && enabled) {
      // User pressed Esc → fully disable, notify Preview3D so it flips back to orbit.
      disable();
      callbacks.onWalkExit();
    }
  };

  const tick = (timestamp: number) => {
    if (!enabled) return;
    const dt = lastTimestamp ? Math.min(0.05, (timestamp - lastTimestamp) / 1000) : 0.016;
    lastTimestamp = timestamp;

    // 1. Build desired horizontal move
    const speed = keys.has("shift") ? RUN_SPEED : WALK_SPEED;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    let intentForward = 0;
    let intentRight = 0;
    if (keys.has("w") || keys.has("arrowup")) intentForward -= 1;
    if (keys.has("s") || keys.has("arrowdown")) intentForward += 1;
    if (keys.has("d") || keys.has("arrowright")) intentRight += 1;
    if (keys.has("a") || keys.has("arrowleft")) intentRight -= 1;
    let desiredX = (forwardX * intentForward + rightX * intentRight) * speed * dt;
    let desiredZ = (forwardZ * intentForward + rightZ * intentRight) * speed * dt;

    // 2. Horizontal collision
    const adjusted = resolveHorizontalCollision(
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      { x: desiredX, z: desiredZ },
      PLAYER_RADIUS,
      horizontalProbe,
    );
    camera.position.x += adjusted.x;
    camera.position.z += adjusted.z;

    // 3. Vertical
    const verticalNext = resolveVerticalState(
      { cameraY: camera.position.y, vy },
      { x: camera.position.x, z: camera.position.z },
      dt,
      {
        eyeHeight: EYE_HEIGHT,
        snapThreshold: SNAP_THRESHOLD,
        gravity: GRAVITY,
        maxRayLength: MAX_DOWN_RAY,
      },
      verticalProbe,
    );

    if (verticalNext === "respawn") {
      camera.position.set(respawnPosition.x, respawnPosition.y, respawnPosition.z);
      vy = 0;
    } else {
      camera.position.y = verticalNext.cameraY;
      vy = verticalNext.vy;
    }

    // 4. Apply look
    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch, yaw, 0);

    rafId = requestAnimationFrame(tick);
  };

  const enable = (spawn: WalkSpawn) => {
    if (enabled) return;
    enabled = true;
    respawnPosition = { ...spawn };
    setSpawn(spawn);
    savedFov = camera.fov;
    camera.fov = FOV_DEGREES;
    camera.updateProjectionMatrix();
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChangeNative);
    canvas.requestPointerLock?.();
    lastTimestamp = 0;
    rafId = requestAnimationFrame(tick);
  };

  const disable = () => {
    if (!enabled) return;
    enabled = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("pointerlockchange", onPointerLockChangeNative);
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock?.();
    }
    keys.clear();
    camera.fov = savedFov;
    camera.updateProjectionMatrix();
  };

  const setSpawn = (spawn: WalkSpawn) => {
    camera.position.set(spawn.x, spawn.y, spawn.z);
    yaw = spawn.yaw;
    pitch = spawn.pitch;
    vy = 0;
    respawnPosition = { ...spawn };
  };

  return {
    enable,
    disable,
    setSpawn,
    dispose: () => {
      disable();
    },
  };
}
```

- [ ] **Step 2: Build to confirm it compiles**

Run: `bun run lint`
Expected: no TypeScript errors. (No tests for this DOM-glue module — it is exercised via integration with the scene and tested through manual browser verification per the spec's testing strategy.)

- [ ] **Step 3: Commit**

```bash
git add src/rendering/walkControls.ts
git commit -m "$(cat <<'EOF'
feat: attach FPS walk controls to the WebGL canvas

Wires PointerLock, key state, and a per-frame raycast loop to the
shared camera. Pure-physics decisions live in walkPhysics.ts; this
module is the DOM glue.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Extend `MountedScene` API and switch camera modes

**Files:**
- Modify: `src/rendering/threeScene.ts`

- [ ] **Step 1: Add imports + extend types**

At the top of `src/rendering/threeScene.ts`, add:

```ts
import { attachWalkControls, type WalkCallbacks, type WalkSpawn } from "./walkControls";
```

Find the existing `MountedScene` type and replace:

```ts
export type CameraMode = "orbit" | "walk";

export type MountedSceneOptions = {
  onWalkExit?: () => void;
  onDigitKey?: (digit: number) => void;
};

export type MountedScene = {
  setCameraMode(mode: CameraMode): void;
  setActiveStorey(storeyId: string): void;
  dispose(): void;
};
```

Update `mountHouseScene`'s signature to accept options:

```ts
export function mountHouseScene(
  container: HTMLElement,
  project: HouseProject,
  options?: MountedSceneOptions,
): MountedScene {
```

- [ ] **Step 2: Wire walk controls into `mountHouseScene`**

After `meshes` / `materials` are assembled and the renderer + scene are ready, replace the existing orbit-controls + return block with:

```ts
const collidables: THREE.Object3D[] = [...wallMeshes, ...slabMeshes];

const callbacks: WalkCallbacks = {
  onWalkExit: () => options?.onWalkExit?.(),
  onDigitKey: (digit) => options?.onDigitKey?.(digit),
};

const walkControls = attachWalkControls(renderer, camera, collidables, callbacks);

const computeSpawn = (storeyId: string): WalkSpawn => {
  const storey = project.storeys.find((s) => s.id === storeyId) ?? project.storeys[0];
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
    y: storey.elevation + 1.6,
    yaw: 0,
    pitch: 0,
  };
};

let currentOrbit: OrbitControls | null = attachOrbitControls(renderer, camera, scene, center, distance, container);
let activeMode: CameraMode = "orbit";

const setCameraMode = (mode: CameraMode) => {
  if (mode === activeMode) return;
  activeMode = mode;
  if (mode === "walk") {
    currentOrbit?.dispose();
    currentOrbit = null;
    walkControls.enable(computeSpawn("1f"));
  } else {
    walkControls.disable();
    camera.position.copy(center).addScaledVector(new THREE.Vector3(0.85, 0.62, -1).normalize(), distance);
    camera.lookAt(center);
    currentOrbit = attachOrbitControls(renderer, camera, scene, center, distance, container);
  }
};

const setActiveStorey = (storeyId: string) => {
  if (activeMode !== "walk") return;
  walkControls.setSpawn(computeSpawn(storeyId));
};

return {
  setCameraMode,
  setActiveStorey,
  dispose: () => {
    walkControls.dispose();
    currentOrbit?.dispose();
    for (const mesh of meshes) mesh.geometry.dispose();
    for (const material of materials) material.dispose();
    groundGeometry.dispose();
    groundMaterial.dispose();
    grid.geometry.dispose();
    const gridMaterial = grid.material;
    if (Array.isArray(gridMaterial)) gridMaterial.forEach((m) => m.dispose());
    else gridMaterial.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    container.replaceChildren();
  },
};
```

(`OrbitControls` is the type returned by `attachOrbitControls`. If the existing file does not export the type alias, add a `type OrbitControls = ReturnType<typeof attachOrbitControls>;` near the top.)

- [ ] **Step 3: Update existing callers**

Search for all callers of `mountHouseScene` (likely just `Preview3D.tsx`). Their uses of the returned object will still work because the new methods are added — old `dispose` is still there. No call-site change needed for this task.

- [ ] **Step 4: Build and quick smoke test**

Run: `bun run build`
Expected: clean.

Run: `bun run dev`
In the browser:
- 3D should still default to orbit (no UI toggle yet). Drag works. No regression.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/rendering/threeScene.ts
git commit -m "$(cat <<'EOF'
feat: extend MountedScene with cameraMode + activeStorey hooks

Plumbs walk-vs-orbit toggling into the scene without yet exposing it
in the UI; the next change wires Preview3D buttons.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `Preview3D` mode toggle + FPS HUD (with RTL test)

**Files:**
- Modify: `src/components/Preview3D.tsx`
- Create: `src/__tests__/preview3d.test.tsx`

- [ ] **Step 1: Refactor `Preview3D` to expose mode + HUD**

Replace `src/components/Preview3D.tsx` content with:

```tsx
import { useEffect, useRef, useState } from "react";
import type { HouseProject } from "../domain/types";
import { mountHouseScene, type CameraMode, type MountedScene } from "../rendering/threeScene";

type Preview3DProps = {
  project: HouseProject;
};

export function Preview3D({ project }: Preview3DProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MountedScene | null>(null);
  const projectRef = useRef(project);
  const [cameraMode, setCameraMode] = useState<CameraMode>("orbit");
  const [activeStoreyId, setActiveStoreyId] = useState<string>(() => project.storeys[0]?.id ?? "1f");
  const [mountFailed, setMountFailed] = useState(false);

  // Keep the ref pointing at the latest project so callbacks see fresh storeys.
  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    try {
      sceneRef.current = mountHouseScene(host, project, {
        onWalkExit: () => setCameraMode("orbit"),
        onDigitKey: (digit) => {
          const storey = projectRef.current.storeys[digit - 1];
          if (storey) setActiveStoreyId(storey.id);
        },
      });
      setMountFailed(false);
      return () => {
        sceneRef.current?.dispose();
        sceneRef.current = null;
      };
    } catch {
      setMountFailed(true);
      const status = document.createElement("p");
      status.className = "preview-status";
      status.textContent = "WebGL preview unavailable in this environment.";
      host.replaceChildren(status);
      return () => host.replaceChildren();
    }
  }, [project]);

  useEffect(() => {
    sceneRef.current?.setCameraMode(cameraMode);
  }, [cameraMode]);

  useEffect(() => {
    if (cameraMode === "walk") {
      sceneRef.current?.setActiveStorey(activeStoreyId);
    }
  }, [cameraMode, activeStoreyId]);

  return (
    <div className="preview-shell" aria-label="3D preview">
      <div ref={hostRef} className="three-host" aria-label="Three.js house preview" />

      <div className="preview-mode-toggle" aria-hidden={mountFailed}>
        <button
          type="button"
          className={cameraMode === "orbit" ? "is-active" : ""}
          onClick={() => setCameraMode("orbit")}
        >
          环视
        </button>
        <button
          type="button"
          className={cameraMode === "walk" ? "is-active" : ""}
          onClick={() => setCameraMode("walk")}
        >
          漫游
        </button>
      </div>

      {cameraMode === "orbit" && (
        <div className="preview-overlay" aria-hidden="true">
          <div className="preview-badge">
            <p className="preview-name">{project.name}</p>
            <p className="preview-hint">拖拽旋转 · 滚轮缩放</p>
          </div>
        </div>
      )}

      {cameraMode === "walk" && (
        <>
          <div className="walk-crosshair" aria-hidden="true" />
          <div className="walk-hud">
            <div className="walk-floor-buttons" role="group" aria-label="楼层切换">
              {project.storeys.map((storey) => (
                <button
                  key={storey.id}
                  type="button"
                  className={storey.id === activeStoreyId ? "is-active" : ""}
                  onClick={() => setActiveStoreyId(storey.id)}
                >
                  {storey.label}
                </button>
              ))}
            </div>
            <p className="walk-hint">Esc 退出 · WASD 移动 · 鼠标看 · 1/2/3 切楼层</p>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write RTL test**

Create `src/__tests__/preview3d.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const setCameraMode = vi.fn();
const setActiveStorey = vi.fn();
const dispose = vi.fn();

vi.mock("../rendering/threeScene", () => ({
  mountHouseScene: vi.fn(() => ({
    setCameraMode,
    setActiveStorey,
    dispose,
  })),
}));

import { Preview3D } from "../components/Preview3D";
import { createSampleProject } from "../domain/sampleProject";

describe("Preview3D camera-mode wiring", () => {
  it("renders the mode toggle and forwards clicks to the scene", async () => {
    setCameraMode.mockReset();
    const user = userEvent.setup();
    render(<Preview3D project={createSampleProject()} />);

    const walkButton = screen.getByRole("button", { name: "漫游" });
    await user.click(walkButton);

    expect(setCameraMode).toHaveBeenCalledWith("walk");
  });

  it("forwards floor-button clicks to setActiveStorey while in walk mode", async () => {
    setActiveStorey.mockReset();
    const user = userEvent.setup();
    render(<Preview3D project={createSampleProject()} />);

    await user.click(screen.getByRole("button", { name: "漫游" }));
    await user.click(screen.getByRole("button", { name: "2F" }));

    expect(setActiveStorey).toHaveBeenCalledWith("2f");
  });

  it("hides floor buttons in orbit mode", () => {
    render(<Preview3D project={createSampleProject()} />);
    expect(screen.queryByRole("group", { name: "楼层切换" })).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `bun run test -- preview3d`
Expected: 3 tests pass.

- [ ] **Step 4: Run full suite + typecheck**

Run: `bun run test && bun run lint`

- [ ] **Step 5: Commit**

```bash
git add src/components/Preview3D.tsx src/__tests__/preview3d.test.tsx
git commit -m "$(cat <<'EOF'
feat: Preview3D mode toggle and FPS HUD

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Style the mode toggle and HUD

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Append HUD styles**

Append to `src/styles.css`:

```css
/* 3D preview mode toggle */
.preview-mode-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 4px;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  z-index: 10;
}
.preview-mode-toggle button {
  border: none;
  background: transparent;
  padding: 6px 12px;
  font-size: 13px;
  border-radius: 6px;
  cursor: pointer;
  color: #4a5552;
}
.preview-mode-toggle button.is-active {
  background: #2f4a3f;
  color: #ffffff;
}

/* FPS HUD */
.walk-crosshair {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 4px;
  height: 4px;
  margin-left: -2px;
  margin-top: -2px;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 50%;
  pointer-events: none;
  z-index: 9;
}

.walk-hud {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  z-index: 10;
  pointer-events: auto;
}

.walk-floor-buttons {
  display: flex;
  gap: 6px;
  background: rgba(0, 0, 0, 0.55);
  padding: 6px 8px;
  border-radius: 10px;
}
.walk-floor-buttons button {
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  padding: 6px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}
.walk-floor-buttons button.is-active {
  background: #ffffff;
  color: #2f4a3f;
}

.walk-hint {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.4);
  padding: 4px 8px;
  border-radius: 4px;
  letter-spacing: 0.04em;
}
```

- [ ] **Step 2: Visual verify**

Run: `bun run dev` and click `漫游` — you should see:
- Top-right pill toggle highlighting `漫游`
- A small crosshair dot in the middle
- 1F/2F/3F buttons + an Esc hint at the bottom center

Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "$(cat <<'EOF'
feat: style the 3D preview mode toggle and FPS HUD

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`
Expected: every test passes; no warnings.

- [ ] **Step 2: Run typecheck and production build**

Run: `bun run lint && bun run build`
Expected: clean compile, build artifacts emit.

- [ ] **Step 3: Manual browser walkthrough (per spec §8)**

Run: `bun run dev`. In the browser, execute these checks. Each must succeed.

- [ ] Open the app — 3D defaults to `环视`; the building reads as a closed box with a flat placeholder roof and 80 cm ground grid is visible.
- [ ] Click `漫游` — pointer locks; you spawn at 1F center, eye height 1.6 m, FOV widens.
- [ ] WASD walks; Shift accelerates; mouse rotates the view; rotation feels natural (right = look right, down = look down).
- [ ] Walking into a wall stops at the wall; sliding along the wall works (e.g. press `W+D` against a perpendicular wall, you should slide).
- [ ] Door openings let you walk through; window sills block at body height.
- [ ] Press `2` (digit key) — you teleport to 2F center at 1.6 m above the 2F floor (HUD button highlight follows the active floor).
- [ ] Walk toward the back-left corner; you find a rectangular opening in the 2F floor.
- [ ] Walk over the opening — gravity drops you onto the 1F slab; you stand at 1.6 m above the 1F floor.
- [ ] Press `Esc` — pointer unlocks; HUD disappears; toggle highlight returns to `环视`.
- [ ] No console errors throughout.

- [ ] **Step 4: If all checks pass, no further commits required.**

If any check fails, file a follow-up note in the corresponding task and fix before declaring Spec 1 complete.

---

## Self-Review Checklist (run before declaring plan done)

- [ ] Every spec section in `docs/superpowers/specs/2026-04-27-interior-walkthrough-design.md` maps to at least one task.
- [ ] No "TODO" / "TBD" / "fill in later" left in any task.
- [ ] Type names referenced across tasks are consistent (`MountedScene`, `CameraMode`, `WalkSpawn`, `SlabGeometry`, `FootprintQuad`, `StairOpening`).
- [ ] Each task ends with a commit step.
- [ ] Test files match the test names referenced in the file-structure table.
