# Stair Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flip stair ownership from upper-storey to lower-storey; place U-shape UP/DN labels on the correct flight; add CAD-standard cut line to the plan symbol.

**Architecture:** `Storey.stair` semantics change from "stair arriving at this storey" to "stair going up from this storey." Field shape unchanged; lookups in projection / geometry / property panel shift to read the *next* storey's height & slab thickness for climb calculation. Top storey can no longer own a stair; bottom storey can.

**Tech Stack:** TypeScript, React 19, three.js 0.184, Vitest 4, vite 8, bun.

---

## Reference: spec
`docs/superpowers/specs/2026-04-27-stair-optimization-design.md`

## Reference: working directory
All paths in this plan are relative to `/Users/zero/code/houseclaw/.worktrees/stair-optimize`. Run all commands from that directory unless stated otherwise.

## Reference: file responsibilities

| Layer        | File                                       | Touched? |
|--------------|--------------------------------------------|----------|
| Data model   | `src/domain/types.ts`                      | Doc only |
| Domain calc  | `src/domain/stairs.ts`                     | No       |
| Constraints  | `src/domain/constraints.ts`                | Yes      |
| Mutations    | `src/domain/mutations.ts`                  | No (validation in constraints handles it) |
| Sample data  | `src/domain/sampleProject.ts`              | Yes      |
| Projection   | `src/projection/plan.ts`                   | Yes      |
| Geometry     | `src/geometry/houseGeometry.ts`            | Yes      |
| Geometry     | `src/geometry/stairGeometry.ts`            | No       |
| 2D rendering | `src/components/DrawingSurface2D.tsx`      | Yes      |
| UI panel     | `src/components/PropertyPanel.tsx`         | Yes      |
| Tests        | `src/__tests__/stairMutations.test.ts`     | Yes      |
| Tests        | `src/__tests__/projection.test.ts`         | Yes      |
| Tests        | `src/__tests__/stairPlanSymbol.test.tsx`   | Yes      |
| Tests        | `src/__tests__/stairs.test.ts`             | No       |
| Tests        | `src/__tests__/stairGeometry.test.ts`      | No (pure geometry) |
| Tests        | `src/__tests__/walkPhysics.test.ts`        | No       |

## Reference: ordering rationale

The flip cascades through: constraints → sample data → projection → geometry → property panel. Each task takes one layer at a time and keeps the test suite green at the end of each task. After the ownership cascade lands (Tasks 1–6), the U-label fix (Task 7) and cut-line (Task 8) are pure 2D-rendering touches that depend on no other change.

---

## Task 1: Constraint flip — top-storey rejection

**Files:**
- Modify: `src/domain/constraints.ts:149-159`
- Test: `src/__tests__/stairMutations.test.ts:27-30`

The current constraint rejects a stair on the *lowest* storey (because that floor was the destination, with no floor below to start from). After the flip the *top* storey is rejected (no floor above to climb to).

- [ ] **Step 1: Update the failing test in `src/__tests__/stairMutations.test.ts`**

Replace lines 27-30:

```ts
  it("addStair on the top storey throws via constraints", () => {
    const project = createSampleProject();
    expect(() => addStair(project, "3f", FULL_STAIR)).toThrow(/cannot have a stair/);
  });
```

Also update the test on line 18-25 — it currently calls `removeStair(project, "2f")` then `addStair(cleared, "2f", ...)`. After the data migration in Task 3 the sample project will have stairs on 1F and 2F, with 3F empty. We are not yet migrating sample data here, so this test will still work for now; revisit in Task 3.

- [ ] **Step 2: Run the test to verify it fails**

```
bun run test src/__tests__/stairMutations.test.ts
```

Expected: `addStair on the top storey throws` fails because `addStair(project, "3f", ...)` currently succeeds (3F is the top floor, currently allowed since "lowest" check passes).

- [ ] **Step 3: Update the constraint logic**

In `src/domain/constraints.ts`, replace lines 149-160:

```ts
  const sortedStoreys = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const topStoreyId = sortedStoreys[sortedStoreys.length - 1]?.id;

  for (const storey of project.storeys) {
    const opening = storey.stair;
    if (!opening) continue;

    if (storey.id === topStoreyId) {
      errors.push(`Storey ${storey.id} cannot have a stair (no storey above).`);
      continue;
    }
```

- [ ] **Step 4: Run the test to verify it passes**

```
bun run test src/__tests__/stairMutations.test.ts
```

Expected: all 4 stair-mutation tests pass.

- [ ] **Step 5: Run the full test suite to confirm nothing else breaks**

```
bun run test
```

Expected: many other tests will fail (sample data still has stairs on 2F/3F, which is now invalid because 3F is the top storey). That's the expected next step. Note: do **not** commit yet — the suite is red.

- [ ] **Step 6: Migrate the sample project so the suite goes green again**

In `src/domain/sampleProject.ts`, move the stair from 2F (lines 77-86) to 1F (currently has no stair, lines 64-70), and move the stair from 3F (lines 94-103) to 2F. Remove the stair from 3F.

The result: `storeys[0]` (1F) has the first stair, `storeys[1]` (2F) has the second, `storeys[2]` (3F) has none.

Replace `src/domain/sampleProject.ts:63-105`:

```ts
  const storeys: Storey[] = [
    {
      id: "1f",
      label: "1F",
      elevation: 0,
      height: DEFAULT_STOREY_HEIGHT,
      slabThickness: DEFAULT_SLAB_THICKNESS,
      stair: {
        x: 0.6,
        y: 5.0,
        width: 1.2,
        depth: 2.5,
        shape: "straight",
        treadDepth: 0.27,
        bottomEdge: "+y",
        materialId: STAIR_MATERIAL_ID,
      },
    },
    {
      id: "2f",
      label: "2F",
      elevation: 3.2,
      height: DEFAULT_STOREY_HEIGHT,
      slabThickness: DEFAULT_SLAB_THICKNESS,
      stair: {
        x: 0.6,
        y: 5.0,
        width: 1.2,
        depth: 2.5,
        shape: "straight",
        treadDepth: 0.27,
        bottomEdge: "+y",
        materialId: STAIR_MATERIAL_ID,
      },
    },
    {
      id: "3f",
      label: "3F",
      elevation: 6.4,
      height: DEFAULT_STOREY_HEIGHT,
      slabThickness: DEFAULT_SLAB_THICKNESS,
    },
  ];
```

- [ ] **Step 7: Update mutation test to use the new sample shape**

In `src/__tests__/stairMutations.test.ts`, the test at lines 18-25 currently does `removeStair(project, "2f")` then `addStair(cleared, "2f", ...)`. After the migration `addStair(project, "2f", ...)` would still succeed (2F has stair, addStair overwrites). Update to be unambiguous:

```ts
  it("addStair attaches stair to a non-top storey", () => {
    const project = createSampleProject();
    // sample now has stairs on 1f / 2f; clear 1f then re-add
    const cleared = removeStair(project, "1f");
    const next = addStair(cleared, "1f", FULL_STAIR);
    const oneF = next.storeys.find((s) => s.id === "1f");
    expect(oneF?.stair).toEqual(FULL_STAIR);
  });

  it("removeStair clears the field", () => {
    const project = createSampleProject();
    const next = removeStair(project, "1f");
    expect(next.storeys.find((s) => s.id === "1f")?.stair).toBeUndefined();
  });

  it("updateStair patches selected fields and validates", () => {
    const project = createSampleProject();
    const next = updateStair(project, "1f", { shape: "u", treadDepth: 0.3 });
    const oneF = next.storeys.find((s) => s.id === "1f");
    expect(oneF?.stair?.shape).toBe("u");
    expect(oneF?.stair?.treadDepth).toBe(0.3);
    expect(oneF?.stair?.bottomEdge).toBe("+y");
  });
```

- [ ] **Step 8: Re-run mutation tests**

```
bun run test src/__tests__/stairMutations.test.ts
```

Expected: all 4 mutation tests pass.

- [ ] **Step 9: Don't worry about the broader suite yet — it's still red**

The other failing tests will be fixed in Tasks 2–4. Do not commit yet.

- [ ] **Step 10: Update the doc-comment on `Storey.stair`**

In `src/domain/types.ts:62`, replace:

```ts
  stair?: Stair;
```

with:

```ts
  /** Stair going up from this storey to the next one above. The top storey
   *  must always have stair === undefined. */
  stair?: Stair;
```

- [ ] **Step 11: Commit**

```
git add src/domain/constraints.ts src/domain/sampleProject.ts src/domain/types.ts src/__tests__/stairMutations.test.ts
git commit -m "$(cat <<'EOF'
refactor(stair): flip ownership — stair belongs to lower storey

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Plan projection — source from lower neighbor

**Files:**
- Modify: `src/projection/plan.ts:5-100`
- Test: `src/__tests__/projection.test.ts:183-234`

Currently plan.ts reads `currentStorey.stair` as `half="upper"` and `upperStorey.stair` as `half="lower"`. After the flip, the lookup inverts: `currentStorey.stair` (own going-up) is `half="lower"`, and `lowerStorey.stair` (the going-up from below, ending here) is `half="upper"`.

Climb computation also moves: for the `currentStorey.stair` symbol the climb is to the storey *above* (`storeys[i+1]`); for the `lowerStorey.stair` symbol the climb ends at `currentStorey` (so use `currentStorey.height` and `currentStorey.slabThickness` — same as today, since the stair traverses from N-1 to N).

- [ ] **Step 1: Update projection tests to assert new semantics**

Replace `src/__tests__/projection.test.ts:183-201` with:

```ts
  it("emits stair symbols using lower-storey ownership", () => {
    // after the ownership flip: 1F has a stair (1F→2F), 2F has a stair (2F→3F),
    // 3F has no stair (top floor).
    const project = createSampleProject();

    const planFor1F = projectPlanView(project, "1f");
    expect(planFor1F.stairs).toHaveLength(1); // own stair, lower half (UP)
    expect(planFor1F.stairs[0].storeyId).toBe("1f");
    expect(planFor1F.stairs[0].half).toBe("lower");

    const planFor2F = projectPlanView(project, "2f");
    expect(planFor2F.stairs).toHaveLength(2); // 1F's stair (upper, DN) + 2F's own (lower, UP)
    expect(planFor2F.stairs.find((s) => s.storeyId === "1f")?.half).toBe("upper");
    expect(planFor2F.stairs.find((s) => s.storeyId === "2f")?.half).toBe("lower");

    const planFor3F = projectPlanView(project, "3f");
    expect(planFor3F.stairs).toHaveLength(1); // 2F's stair (upper, DN)
    expect(planFor3F.stairs[0].storeyId).toBe("2f");
    expect(planFor3F.stairs[0].half).toBe("upper");
  });
```

Also update the rotation tests at lines 203-234 — they reference 2F's stair and assert `half: "upper"`. With the migration, 2F's stair appears as `half="lower"` on 2F's plan, and as `half="upper"` on 3F's plan. Replace:

```ts
  it("populates rotation and center on PlanStairSymbol", () => {
    // stair on 2F is the 2F→3F stair; appears as lower half on 2F's plan
    const project = createSampleProject();
    const planFor2F = projectPlanView(project, "2f");
    const lowerHalf = planFor2F.stairs.find((s) => s.storeyId === "2f" && s.half === "lower");
    expect(lowerHalf).toBeDefined();
    expect(lowerHalf!.rotation).toBe(0);
    expect(lowerHalf!.center).toMatchObject({
      x: expect.any(Number),
      y: expect.any(Number),
    });
    const twoF = project.storeys.find((s) => s.id === "2f")!;
    const stair = twoF.stair!;
    expect(lowerHalf!.center.x).toBeCloseTo(stair.x + stair.width / 2, 6);
    expect(lowerHalf!.center.y).toBeCloseTo(stair.y + stair.depth / 2, 6);
  });

  it("propagates a non-zero rotation from the Stair data model into PlanStairSymbol", () => {
    const project = createSampleProject();
    const twoF = project.storeys.find((s) => s.id === "2f")!;
    const stairWithRot = { ...twoF.stair!, rotation: Math.PI / 6 };
    const modifiedProject = {
      ...project,
      storeys: project.storeys.map((s) =>
        s.id === "2f" ? { ...s, stair: stairWithRot } : s,
      ),
    };
    const planFor2F = projectPlanView(modifiedProject, "2f");
    const lowerHalf = planFor2F.stairs.find((s) => s.storeyId === "2f" && s.half === "lower");
    expect(lowerHalf!.rotation).toBeCloseTo(Math.PI / 6, 6);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```
bun run test src/__tests__/projection.test.ts
```

Expected: stair-related tests fail because `plan.ts` still uses old ownership semantics.

- [ ] **Step 3: Rewrite `plan.ts` stair section**

Replace `src/projection/plan.ts:5-100` with:

```ts
export function projectPlanView(project: HouseProject, storeyId: string): PlanProjection {
  const walls = project.walls.filter((wall) => wall.storeyId === storeyId);
  const wallIds = new Set(walls.map((wall) => wall.id));

  const sortedStoreys = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const currentIdx = sortedStoreys.findIndex((s) => s.id === storeyId);
  const currentStorey = currentIdx >= 0 ? sortedStoreys[currentIdx] : undefined;
  const lowerStorey = currentIdx > 0 ? sortedStoreys[currentIdx - 1] : undefined;
  const upperStorey =
    currentIdx >= 0 && currentIdx + 1 < sortedStoreys.length
      ? sortedStoreys[currentIdx + 1]
      : undefined;

  const stairs: PlanStairSymbol[] = [];

  // Own stair: the going-up stair starting at this storey. Show as lower half (UP).
  if (currentStorey?.stair && upperStorey) {
    const climb = upperStorey.elevation - currentStorey.elevation;
    const cfg = computeStairConfig(climb, upperStorey.slabThickness, currentStorey.stair.treadDepth);
    stairs.push({
      storeyId: currentStorey.id,
      half: "lower",
      rect: {
        x: currentStorey.stair.x,
        y: currentStorey.stair.y,
        width: currentStorey.stair.width,
        depth: currentStorey.stair.depth,
      },
      shape: currentStorey.stair.shape,
      bottomEdge: currentStorey.stair.bottomEdge,
      treadDepth: currentStorey.stair.treadDepth,
      treadCount: cfg.treadCount,
      turn: currentStorey.stair.turn,
      rotation: currentStorey.stair.rotation ?? 0,
      center: {
        x: currentStorey.stair.x + currentStorey.stair.width / 2,
        y: currentStorey.stair.y + currentStorey.stair.depth / 2,
      },
    });
  }

  // Lower neighbor's stair: it climbs up to me. Show as upper half (DN).
  if (lowerStorey?.stair && currentStorey) {
    const climb = currentStorey.elevation - lowerStorey.elevation;
    const cfg = computeStairConfig(climb, currentStorey.slabThickness, lowerStorey.stair.treadDepth);
    stairs.push({
      storeyId: lowerStorey.id,
      half: "upper",
      rect: {
        x: lowerStorey.stair.x,
        y: lowerStorey.stair.y,
        width: lowerStorey.stair.width,
        depth: lowerStorey.stair.depth,
      },
      shape: lowerStorey.stair.shape,
      bottomEdge: lowerStorey.stair.bottomEdge,
      treadDepth: lowerStorey.stair.treadDepth,
      treadCount: cfg.treadCount,
      turn: lowerStorey.stair.turn,
      rotation: lowerStorey.stair.rotation ?? 0,
      center: {
        x: lowerStorey.stair.x + lowerStorey.stair.width / 2,
        y: lowerStorey.stair.y + lowerStorey.stair.depth / 2,
      },
    });
  }

  return {
    viewId: `plan-${storeyId}`,
    wallSegments: walls.map((wall) => ({
      wallId: wall.id,
      start: { ...wall.start },
      end: { ...wall.end },
      thickness: wall.thickness,
    })),
    openings: project.openings
      .filter((opening) => wallIds.has(opening.wallId))
      .map((opening) => ({
        openingId: opening.id,
        wallId: opening.wallId,
        type: opening.type,
        offset: opening.offset,
        width: opening.width,
      })),
    balconies: project.balconies
      .filter((balcony) => balcony.storeyId === storeyId && wallIds.has(balcony.attachedWallId))
      .map((balcony) => ({
        balconyId: balcony.id,
        wallId: balcony.attachedWallId,
        offset: balcony.offset,
        width: balcony.width,
        depth: balcony.depth,
      })),
    stairs,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```
bun run test src/__tests__/projection.test.ts
```

Expected: all projection tests pass.

- [ ] **Step 5: Commit**

```
git add src/projection/plan.ts src/__tests__/projection.test.ts
git commit -m "$(cat <<'EOF'
refactor(projection): source plan stairs from lower neighbor

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: House geometry — slab hole + 3D stair build use upper-neighbor

**Files:**
- Modify: `src/geometry/houseGeometry.ts:60-113`

The current loop at line 70-75 places a slab hole on `storeys[i].id` for each storey-with-stair (where the stair record lives on the upper storey, i.e. the floor that needs the hole). After the flip the stair record lives on the lower storey but the slab to cut is still the upper one. Same for `buildStairGeometry`: it still needs the upper storey's elevation/slab.

- [ ] **Step 1: Verify the geometry tests baseline first**

```
bun run test src/__tests__/stairGeometry.test.ts
```

Expected: all geometry tests pass — they exercise `buildStairGeometry` directly with explicit climb/slabThickness, which are independent of ownership.

- [ ] **Step 2: Rewrite the slab-hole and stair-iteration loops in `houseGeometry.ts`**

Replace `src/geometry/houseGeometry.ts:60-113` with:

```ts
export function buildHouseGeometry(project: HouseProject): HouseGeometry {
  const footprints = buildFootprintIndex(project.walls);

  const sortedStoreys = [...project.storeys].sort((a, b) => a.elevation - b.elevation);

  // Compute a tight slab-hole polygon per storey based on the actual stair footprint.
  // After the ownership flip the stair record lives on the LOWER storey of each climb;
  // the slab being cut is the UPPER storey's slab.
  const slabHoleByStorey = new Map<string, Point2[]>();
  for (let i = 0; i < sortedStoreys.length - 1; i += 1) {
    const lowerStorey = sortedStoreys[i];
    const upperStorey = sortedStoreys[i + 1];
    if (!lowerStorey.stair) continue;
    const climb = upperStorey.elevation - lowerStorey.elevation;
    slabHoleByStorey.set(upperStorey.id, stairFootprintPolygon(lowerStorey.stair, climb));
  }

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

  const stairs: StairRenderGeometry[] = [];
  for (let i = 0; i < sortedStoreys.length - 1; i += 1) {
    const lowerStorey = sortedStoreys[i];
    const upperStorey = sortedStoreys[i + 1];
    if (!lowerStorey.stair) continue;
    // buildStairGeometry signature: (stair, upperStorey, lowerStoreyTopY).
    // upperStorey supplies elevation + slabThickness for climb math.
    const geom = buildStairGeometry(lowerStorey.stair, upperStorey, lowerStorey.elevation);
    stairs.push({
      storeyId: lowerStorey.id,
      materialId: lowerStorey.stair.materialId,
      treads: geom.treads,
      landings: geom.landings,
    });
  }
```

- [ ] **Step 3: Run the geometry test suite**

```
bun run test src/__tests__/stairGeometry.test.ts src/__tests__/walkPhysics.test.ts
```

Expected: all geometry + walk-physics tests still pass.

- [ ] **Step 4: Run the full suite**

```
bun run test
```

Expected: passes — projection (Task 2), constraints/mutations (Task 1), geometry (this task) all green. The `stairPlanSymbol.test.tsx` will fail because it still references "选择楼梯 2f" — fixed in Task 4.

- [ ] **Step 5: Commit**

```
git add src/geometry/houseGeometry.ts
git commit -m "$(cat <<'EOF'
refactor(geometry): cut upper slab + build stair from lower-storey owner

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Stair plan-symbol integration test — match new ownership

**Files:**
- Modify: `src/__tests__/stairPlanSymbol.test.tsx`

The test currently asserts UP appears on 1F's plan because 2F's stair shows there as lower half. After the flip, on 1F's plan the stair shown is 1F's own stair (lower half = UP). Same UP label, but the storeyId for selection is "1f" not "2f". Test 3 asserts `选择楼梯 2f` — needs updating. Test 2 asserts DN on 3F — after the flip 2F's stair shows on 3F as upper half, still DN. Pass.

- [ ] **Step 1: Update the failing test**

Replace `src/__tests__/stairPlanSymbol.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("stair plan symbol", () => {
  it("renders UP label on 1F plan (1F's own stair, lower half)", () => {
    render(<App />);
    expect(screen.getByText("UP")).toBeInTheDocument();
  });

  it("renders DN label on 3F plan (2F's stair, upper half)", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "3F" }));

    expect(screen.getByText("DN")).toBeInTheDocument();
  });

  it("clicking the stair symbol selects the stair owner-storey", async () => {
    const user = userEvent.setup();
    render(<App />);

    // 1F plan shows 1F's own stair as lower half
    const stairBtn = screen.getByRole("button", { name: "选择楼梯 1f" });
    await user.click(stairBtn);

    expect(stairBtn).toHaveAttribute("aria-pressed", "true");
  });
});
```

- [ ] **Step 2: Run the test**

```
bun run test src/__tests__/stairPlanSymbol.test.tsx
```

Expected: all 3 tests pass — code already supports the behavior (Tasks 1–3 wired the data flow).

- [ ] **Step 3: Run the full suite**

```
bun run test
```

Expected: 283 passing (or whatever the original baseline was, plus or minus the rewritten tests).

- [ ] **Step 4: Commit**

```
git add src/__tests__/stairPlanSymbol.test.tsx
git commit -m "$(cat <<'EOF'
test(stair): plan symbol asserts new owner-is-lower behavior

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: PropertyPanel — feed climb from upper neighbor

**Files:**
- Modify: `src/components/PropertyPanel.tsx:380-400`

`StairEditor` calls `computeStairConfig(storey.height, storey.slabThickness, ...)` where `storey` is the storey whose stair is being edited. After the flip, `storey` is the *lower* storey of the climb; the climb math wants the upper storey's slabThickness and the floor-to-floor distance (`upperStorey.elevation - storey.elevation`).

- [ ] **Step 1: Update `StairEditor` to look up the upper neighbor**

Replace `src/components/PropertyPanel.tsx:380-388` with:

```tsx
function StairEditor({ project, id, onProjectChange }: EditorProps) {
  const sortedStoreys = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const idx = sortedStoreys.findIndex((s) => s.id === id);
  const storey = idx >= 0 ? sortedStoreys[idx] : undefined;
  const upperStorey = idx >= 0 && idx + 1 < sortedStoreys.length ? sortedStoreys[idx + 1] : undefined;
  const stair = storey?.stair;
  if (!storey || !stair || !upperStorey) return null;

  const apply = (patch: StairPatch) =>
    commit(onProjectChange, patch, (final) => updateStair(project, storey.id, final));

  const climb = upperStorey.elevation - storey.elevation;
  const cfg = computeStairConfig(climb, upperStorey.slabThickness, stair.treadDepth);
```

- [ ] **Step 2: Type-check the change**

```
bun run lint
```

Expected: no type errors.

- [ ] **Step 3: Run the full suite**

```
bun run test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```
git add src/components/PropertyPanel.tsx
git commit -m "$(cat <<'EOF'
fix(panel): stair config uses upper-neighbor height and slab

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Smoke test — build and dev server

**Files:** none modified.

Confirm the type checker and bundler accept the changes end-to-end before moving to the visual polish tasks.

- [ ] **Step 1: Type-check**

```
bun run lint
```

Expected: clean.

- [ ] **Step 2: Build**

```
bun run build
```

Expected: build succeeds.

- [ ] **Step 3: Sanity-launch dev server (manual visual check is optional but useful)**

```
bun run dev
```

Open the app, switch between 1F / 2F / 3F plans, confirm:
- 1F plan shows the stair (UP label, lower half).
- 2F plan shows two stair symbols (one with DN from 1F, one with UP for 2F's own).
- 3F plan shows the stair from 2F (DN label, upper half).
- Clicking the stair symbol selects it; PropertyPanel opens and the read-only "踢踏数 N · 踢踏高度 Hmm" line shows non-zero values.

Stop dev with Ctrl-C.

No commit (no file changes in this task).

---

## Task 7: U-shape UP/DN label on the correct flight

**Files:**
- Modify: `src/components/DrawingSurface2D.tsx:546-583`
- Test: `src/__tests__/stairPlanSymbol.test.tsx`

For U-shape stairs, the label currently lands at `crossLength / 2` — in the gap between the two flights. Move it to the lower flight's center for `half="lower"` (UP) and to the upper flight's center for `half="upper"` (DN).

- [ ] **Step 1: Add a failing test**

Append to `src/__tests__/stairPlanSymbol.test.tsx` (inside the existing `describe`):

```tsx
  it("U-shape UP label sits on the lower flight, not in the gap", async () => {
    const user = userEvent.setup();
    render(<App />);

    // open 1F's stair editor, change shape to U
    await user.click(screen.getByRole("button", { name: "选择楼梯 1f" }));
    await user.click(screen.getByRole("button", { name: "U" }));

    const upText = screen.getByText("UP");
    const x = Number(upText.getAttribute("x"));
    const y = Number(upText.getAttribute("y"));
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);

    // Sample stair: bottomEdge="+y", width=1.2, depth=2.5 → crossLength=1.2.
    // Label cross position should be on the lower flight (cross < crossLength/2),
    // NOT centered (cross == crossLength/2).
    // The lower flight cross-center is flightWidth/2 = (crossLength - GAP)/4 ≈ 0.2875
    // in stair-local coords. Cross-center for "centered" would be crossLength/2 = 0.6.
    // We don't know the exact projected x in pixels (depends on viewport scale), but
    // we can assert that when we toggle to a centered-cross shape (straight) the x
    // changes — i.e. U is not the same x as straight.

    await user.click(screen.getByRole("button", { name: "一字" }));
    const upStraight = screen.getByText("UP");
    const xStraight = Number(upStraight.getAttribute("x"));

    expect(x).not.toBeCloseTo(xStraight, 1);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```
bun run test src/__tests__/stairPlanSymbol.test.tsx
```

Expected: fails — the U label and straight label currently sit at the same cross-center.

- [ ] **Step 3: Implement the cross-position branch**

In `src/components/DrawingSurface2D.tsx`, change lines 546-583. The `else` branch (U shape) builds `flightWidth` already. After the U geometry is built (after line 574 closes the `else` block), compute a per-shape label cross-position. Specifically replace lines 576-580 with:

```tsx
  // Label centered on the half being shown:
  // - lower half = run [0, runLength/2] (near bottomEdge, UP arrow on lower flight for U)
  // - upper half = run [runLength/2, runLength]            (DN arrow on upper flight for U)
  const labelRunCenter = stair.half === "lower" ? runLength * 0.25 : runLength * 0.75;
  let labelCross = crossLength / 2;
  if (shape === "u") {
    const GAP = 0.05;
    const flightWidth = (crossLength - GAP) / 2;
    labelCross = stair.half === "lower" ? flightWidth / 2 : crossLength - flightWidth / 2;
  }
  const labelPos = proj(labelRunCenter, labelCross);
```

Note: the U-shape `GAP` constant is still declared inside the `else` branch (line 548). Promoting it to a function-scope const so the label code can reuse it would be cleaner, but is out of scope for this task. The duplication is two lines.

- [ ] **Step 4: Run the test to verify it passes**

```
bun run test src/__tests__/stairPlanSymbol.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 5: Run the full suite**

```
bun run test
```

Expected: clean.

- [ ] **Step 6: Commit**

```
git add src/components/DrawingSurface2D.tsx src/__tests__/stairPlanSymbol.test.tsx
git commit -m "$(cat <<'EOF'
fix(stair-2d): U-shape label sits on flight, not in gap

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: CAD cut line on plan symbol

**Files:**
- Modify: `src/components/DrawingSurface2D.tsx:470-583, 768-818`
- Test: `src/__tests__/stairPlanSymbol.test.tsx`

Add a single zig-zag cut line at run-midpoint on both halves. Drawn as a `<polyline>` with class `plan-stair-cut`.

- [ ] **Step 1: Add a failing test**

Append to `src/__tests__/stairPlanSymbol.test.tsx`:

```tsx
  it("renders a cut line on the stair plan symbol", () => {
    const { container } = render(<App />);
    const cut = container.querySelector(".plan-stair-cut");
    expect(cut).not.toBeNull();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

```
bun run test src/__tests__/stairPlanSymbol.test.tsx
```

Expected: fails — no element has class `plan-stair-cut`.

- [ ] **Step 3: Add cut-line geometry to `buildStairSymbolGeometry`**

In `src/components/DrawingSurface2D.tsx`, extend the `StairSymbolGeometry` type at lines 470-476:

```tsx
type StairSymbolGeometry = {
  outline: Point2D[];
  flights: Point2D[][];
  landings: Point2D[][];
  treadLines: Array<{ from: Point2D; to: Point2D }>;
  cutLine: Point2D[]; // zig-zag polyline; empty array = no cut drawn
  labelPos: Point2D;
};
```

At the bottom of `buildStairSymbolGeometry` (just before `return`), compute a 3-point zig-zag at mid-run spanning the full cross. Replace lines 576-583 (after the Task 7 changes) with:

```tsx
  // Label centered on the half being shown.
  const labelRunCenter = stair.half === "lower" ? runLength * 0.25 : runLength * 0.75;
  let labelCross = crossLength / 2;
  if (shape === "u") {
    const GAP = 0.05;
    const flightWidth = (crossLength - GAP) / 2;
    labelCross = stair.half === "lower" ? flightWidth / 2 : crossLength - flightWidth / 2;
  }
  const labelPos = proj(labelRunCenter, labelCross);

  // CAD cut line: zig-zag across the run at midpoint, marking where the upper
  // floor's slab severs the staircase. Drawn on both halves at the same run
  // position (run = runLength / 2).
  const cutRun = runLength / 2;
  const cutOffset = Math.min(0.12, runLength * 0.08); // stagger half-depth
  const cutLine: Point2D[] = [
    proj(cutRun - cutOffset, 0),
    proj(cutRun + cutOffset, crossLength * 0.5),
    proj(cutRun - cutOffset, crossLength),
  ];

  return { outline, flights, landings, treadLines, cutLine, labelPos };
}
```

- [ ] **Step 4: Render the cut line in JSX**

In `src/components/DrawingSurface2D.tsx` around lines 797-806 (between `treadLines` map and the `<text>` label), add a polyline:

```tsx
            {symbol.cutLine.length > 0 ? (
              <polyline
                className="plan-stair-cut"
                points={polyPoints(symbol.cutLine)}
                fill="none"
              />
            ) : null}
```

Insert immediately after the `{symbol.treadLines.map(...)}` block and before the `<text>` element.

- [ ] **Step 5: Style the cut line**

Find the existing stair classes in CSS. Search:

```
grep -rn "plan-stair-tread" src/
```

Add a sibling rule next to `.plan-stair-tread` for `.plan-stair-cut`. Use a darker stroke and slightly thicker than treads:

```css
.plan-stair-cut {
  stroke: #555;
  stroke-width: 1.2;
  fill: none;
}
```

(Insert in the same CSS file the grep finds, in proximity to the other `.plan-stair-*` rules.)

- [ ] **Step 6: Run the test**

```
bun run test src/__tests__/stairPlanSymbol.test.tsx
```

Expected: all 5 tests pass.

- [ ] **Step 7: Visually verify**

```
bun run dev
```

Open the app, look at any plan view with a stair, confirm the cut line is visible and reads as a zig-zag through the staircase. Stop dev.

- [ ] **Step 8: Commit**

```
git add src/components/DrawingSurface2D.tsx src/__tests__/stairPlanSymbol.test.tsx
# If a CSS file was edited, add it too. Find with: git status
git commit -m "$(cat <<'EOF'
feat(stair-2d): CAD-style cut line on plan symbol

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final verification

**Files:** none modified.

- [ ] **Step 1: Run lint, build, and the full test suite**

```
bun run lint
bun run build
bun run test
```

Expected: all green. Test count should be the original 283 ± changes (the rewritten tests in Tasks 1, 2, 4, plus 2 new in Tasks 7, 8).

- [ ] **Step 2: Manual smoke test against the spec acceptance criteria**

```
bun run dev
```

Walk through:

1. **Ownership flip**: 1F's plan shows a stair with UP label. 2F's plan shows two stairs (DN from below, UP for own). 3F's plan shows DN-only.
2. **Edit affordance consistent**: clicking any stair on any plan opens the property panel for that stair's owning lower storey.
3. **U-shape label off-center**: switch any stair's shape to U; the UP/DN label should sit on the lower/upper flight respectively, not in the gap.
4. **Cut line visible**: a zig-zag line appears across each plan stair symbol at mid-run.
5. **Walk physics still smooth**: enter walk mode, climb the stair to 2F and 3F. Verify no regressions in step rate.

Stop dev.

- [ ] **Step 3: No commit needed**

The work is done; all changes are committed. The `feat/stair-optimize` branch is ready for the user to review or merge.

---

## Self-review checklist

After implementing, the engineer should verify:

- [ ] No `Storey.stair` references in code or tests still treat the field as "arrives at this floor". (`grep -rn "stair" src/` and skim for stale comments.)
- [ ] No call site of `computeStairConfig` passes the *lower* storey's `slabThickness` (slab thickness must come from upper storey of the climb).
- [ ] No call site of `buildStairGeometry` passes the *lower* storey as the `storey` argument.
- [ ] The 3F plan view selects no stair owner of "3f" — top floor cannot own a stair.
- [ ] Vitest output: original baseline (283) ± expected delta (≈ +2 from new tests).
