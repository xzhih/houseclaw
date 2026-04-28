# Stair Optimization Design

Date: 2026-04-27
Branch: `feat/stair-optimize`

## Background

The stair feature works end-to-end (data model, geometry, 2D plan symbol, walk physics) but has UX rough edges that surfaced in use:

1. **Floor binding feels asymmetric.** `Storey.stair` currently means "stair arriving at this storey from below." So 2F owns the 1F→2F stair, 3F owns the 2F→3F stair, and 1F owns nothing. Users see the same stair on both 1F and 2F (they share one record) but the top floor's stair feels disconnected — it has no upper neighbor to "bind" to. The mental model in commercial CAD (Revit, ArchiCAD, AutoCAD Architecture) is the inverse: a stair belongs to the floor it climbs *from*.

2. **U-shape UP/DN label sits in the gap.** `DrawingSurface2D.tsx:579-580` places the label at `crossLength / 2`. For straight/L stairs that lands on the run; for U stairs it lands in the 50mm gap between the two flights — visually ambiguous.

3. **Plan symbol lacks the standard CAD cut-line.** The upper-half view (the part of the stair below the upper floor's slab) doesn't show a diagonal cut, which is the conventional indicator that the floor severs the staircase.

## Goals

- Stair ownership matches the user's mental model: a stair is owned by the floor it goes UP from. Top floor never has a stair.
- U-shape UP arrow renders on the lower flight, DN arrow renders on the upper flight — never in the gap between flights.
- Plan symbol uses CAD-conventional cut line on the upper-half view.

## Non-goals

Deferred — keep scope focused:

- Multiple stairs per floor
- Half-landings, mezzanines, split-level stairs
- Railings/handrails as a separate model
- Interactive draw-to-place tool (currently stairs are added via PropertyPanel)
- Building-code validation of riser height
- Promoting `GAP=0.05` to a configurable field

## Approach

### 1. Flip stair ownership

`Storey.stair` semantics change:

- **Before:** "stair that arrives at this storey from below"
- **After:** "stair that goes up from this storey to the storey above"

Consequences:

- The bottom storey can own a stair (the 1F→2F stair lives on 1F).
- The top storey is always `stair: undefined` — there is nowhere to climb to.
- `computeStairConfig` (in `src/domain/stairs.ts`) currently derives `climb` from `storey.height - storey.slabThickness` of the *owning* storey. After the flip, the owning storey is the lower one; the climb is determined by the *next* storey's slab + air column. The function signature changes to accept the next storey (or both storeys) so it can compute climb correctly.
- `addStair`/`updateStair`/`removeStair` mutations reject operations on the top storey (no upward neighbor → cannot have a stair).
- Sample project (`src/domain/sampleProject.ts`) is migrated: stair currently on 2F moves to 1F, stair currently on 3F moves to 2F.

### 2. Plan projection: shift source index

`src/projection/plan.ts` currently, for storey M's plan view:

- Renders `storeys[M].stair` as `half="upper"`
- Renders `storeys[M+1].stair` as `half="lower"` (next storey up)

After the ownership flip, the lookup inverts:

- Render `storeys[M].stair` as `half="lower"` — own stair, this is where the climb starts (UP arrow, full run visible)
- Render `storeys[M-1].stair` as `half="upper"` — lower neighbor's stair, this is where the climb ends (DN arrow, cut line)

Display mechanics, render code, and `PlanStairSymbol` shape do not change — only the source storey index shifts by one. Edge cases:

- Bottom storey: only renders own stair (no `M-1`). Shows lower half (UP).
- Top storey: only renders `M-1`'s stair (own is undefined). Shows upper half (DN, cut line).
- Middle storeys: both halves rendered, as today.

### 3. U-shape label cross-position

In `DrawingSurface2D.tsx` (around lines 579-580), branch the label position by shape × half:

| Shape    | Half  | Cross position                       |
|----------|-------|--------------------------------------|
| straight | any   | `crossLength / 2` (unchanged)        |
| l        | any   | `crossLength / 2` (unchanged)        |
| u        | lower | `flightWidth / 2`                    |
| u        | upper | `crossLength - flightWidth / 2`      |

`flightWidth` is computed the same way the U-shape geometry computes it: `(crossLength - GAP) / 2`. Run-position logic (25% / 75% based on half) is unchanged.

This places the UP label on the climb-start flight (lower half view, lower flight) and the DN label on the climb-end flight (upper half view, upper flight) — never in the gap.

### 4. CAD cut line on plan symbol

Add a diagonal cut line across the run at the position where the upper floor's slab severs the staircase. Implementation:

- Cut line drawn on **both** halves (lower and upper views) — convention in Revit/AutoCAD is that the same cut line appears on each connected floor's plan, just emphasizing different sides of the cut.
- Position: perpendicular to climb direction at run position ≈ 50% (mid-run).
- Style: single zig-zag (two short angled segments), the simpler of the standard conventions.
- Drawn in `DrawingSurface2D.tsx` next to the existing tread-lines code (around lines 546-574).
- Defer (out of scope): dashed-vs-solid distinction for the portion above/below the cut. Both halves render solid for now.

## Architecture and code touch points

| Layer        | File                                   | Change                                          |
|--------------|----------------------------------------|-------------------------------------------------|
| Data model   | `src/domain/types.ts`                  | Update doc-comment on `Storey.stair`            |
| Domain calc  | `src/domain/stairs.ts`                 | `computeStairConfig` reads next storey's climb  |
| Mutations    | `src/domain/mutations.ts`              | Reject `addStair` on top storey                 |
| Constraints  | `src/domain/constraints.ts`            | Validation: top storey cannot have a stair      |
| Sample data  | `src/domain/sampleProject.ts`          | Shift stairs down one storey                    |
| Projection   | `src/projection/plan.ts`               | Source index shift (M ↔ M-1)                    |
| 2D rendering | `src/components/DrawingSurface2D.tsx`  | U-shape label position; cut line on upper half  |
| Tests        | `src/__tests__/projection.test.ts`     | Update for new indexing                         |
| Tests        | `src/__tests__/stairMutations.test.ts` | Top-storey rejection                            |
| Tests        | `src/__tests__/stairPlanSymbol.test.tsx` | U label cross position; cut line presence    |

Walk physics, geometry builders (`stairGeometry.ts`), 3D rendering, and PropertyPanel UI are **not** touched — they operate on the stair record without caring which storey owns it.

## Data flow (after change)

```
User adds stair on storey N (N is not the top storey)
  → addStair mutation writes storeys[N].stair
  → houseGeometry computes slab hole using storeys[N].stair footprint
    on the slab of storeys[N+1] (the upper floor's slab gets cut)
  → stairGeometry builds 3D treads/landings; climb height comes from
    computeStairConfig(storeys[N], storeys[N+1])
  → plan projection on storey N renders stair as lower half (UP)
  → plan projection on storey N+1 renders stair as upper half (DN, cut line)
```

## Migration / compatibility

- No persisted projects yet — sample data only. No backward-compat shim needed.
- Sample project will be hand-edited as part of the change.
- Existing tests update in lockstep; no parallel "v1/v2" data paths.

## Testing strategy

- Geometry tests (`stairGeometry.test.ts`) should require **no changes** — geometry is independent of which storey owns the record. Run unchanged as a regression check.
- Walk physics tests should require **no changes**.
- Projection tests update: invert the storey-index assertions to match the new ownership.
- Sample-project test fixtures update.
- Mutations tests gain coverage: addStair on top storey rejected.
- New plan-symbol tests:
  - U-shape lower-half label is at `flightWidth / 2`, not `crossLength / 2`.
  - U-shape upper-half label is at `crossLength - flightWidth / 2`.
  - Both halves emit a cut line node at mid-run.

## Risks

- **Climb-height regression.** `computeStairConfig` currently uses the owning storey's height. If we mis-wire which storey contributes the climb after the flip, all stair geometry will be wrong (treads too tall/short). Mitigation: explicit unit test on `computeStairConfig(lower, upper)` that pins the formula.
- **Slab-hole layer mismatch.** `houseGeometry.ts` cuts a hole in the slab using the stair's footprint. After the flip, the stair lives on the lower storey but the hole is in the upper storey's slab. The hole-cut code must read `storeys[N].stair` and apply the cut to `storeys[N+1]`'s slab.
- **Cut-line visual collision.** If the cut line is drawn on top of tread lines, it may be visually noisy. Mitigation: draw cut line in a distinct stroke style (e.g. thicker, broken).

## Open questions

None. Proceeding to implementation plan.
