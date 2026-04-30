# P2A: 扁平 3D 原型 — 墙体几何 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `src/geometry/v2/` 下立起墙体几何子系统：footprintRing、wallNetwork（含 z 重叠 miter）、wallPanels、wallBuilder + 输出类型。不动 v1 几何/UI/rendering 任何文件。

**Architecture:** 端口 v1 的算法（footprintRing 几乎逐字、wallNetwork 加 z 重叠回退、wallPanels 加 height 参数），上层提供新的 `buildWallGeometry(wall, openings, storeys, footprintIndex)` 把单面墙转成带 panel + 墙脚四边形 + 解析后 z 区间的 `WallGeometryV2`。

**Tech Stack:** TypeScript 5、vitest、bun。纯函数，零 THREE 依赖。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-flat-primitive-refactor-design.md` §4.1。 plan 设计决策见会话 Q1-Q4。P2A 关键决策：**Q2 = A**（z 区间不重叠的墙不 miter，采用"junction 全员 free-end"回退）。

---

## File Structure

新建：

- `src/geometry/v2/types.ts` — `FootprintQuad`、`WallSegment`、`WallPanel`/`WallPanelRole`、`WallGeometryV2`
- `src/geometry/v2/footprintRing.ts` — `buildExteriorRing` 端口（仅 import 路径改动）
- `src/geometry/v2/wallNetwork.ts` — `buildWallNetwork` 端口（加 storeys 参数 + z 重叠回退）+ `slicePanelFootprint` 端口（不动）
- `src/geometry/v2/wallPanels.ts` — `buildWallPanels` 端口（加 wallHeight 参数）
- `src/geometry/v2/wallBuilder.ts` — `buildWallGeometry` 顶层（新）

新建测试：

- `src/__tests__/geometry-v2/footprintRing.test.ts`
- `src/__tests__/geometry-v2/wallNetwork.test.ts`
- `src/__tests__/geometry-v2/wallPanels.test.ts`
- `src/__tests__/geometry-v2/wallBuilder.test.ts`

不动：所有 v1 文件（`src/domain/types.ts`、`src/geometry/*.ts`、`src/rendering/*`、`src/components/*` 等）。

P2A 结束后 `bun run test` 应有 **30+ 条新测试通过**，`bun run build` 全绿。

---

## Task 1: v2 几何输出类型

**Files:**
- Create: `src/geometry/v2/types.ts`
- Create: `src/__tests__/geometry-v2/types.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/geometry-v2/types.test.ts
import { describe, expect, it } from "vitest";
import type {
  FootprintQuad,
  WallGeometryV2,
  WallPanel,
  WallPanelRole,
  WallSegment,
} from "../../geometry/v2/types";

// Pure type-shape smoke test: assigning a literal to each type asserts the
// schema compiles. Vitest sees no runtime assertions but the file must
// compile without errors via `bun run build`.
describe("v2 geometry types", () => {
  it("compiles with valid object literals", () => {
    const fp: FootprintQuad = {
      rightStart: { x: 0, y: 0 },
      rightEnd: { x: 1, y: 0 },
      leftEnd: { x: 1, y: 0.2 },
      leftStart: { x: 0, y: 0.2 },
    };

    const seg: WallSegment = { start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, thickness: 0.2 };

    const panel: WallPanel = { role: "full", x: 0, y: 0, width: 1, height: 3 };
    const role: WallPanelRole = "between";

    const wg: WallGeometryV2 = {
      wallId: "w1",
      start: { x: 0, y: 0 },
      end: { x: 6, y: 0 },
      thickness: 0.2,
      bottomZ: 0,
      topZ: 3.2,
      materialId: "mat-wall",
      panels: [panel],
      footprint: fp,
    };

    expect(fp.rightStart.x).toBe(0);
    expect(seg.thickness).toBe(0.2);
    expect(role).toBe("between");
    expect(wg.bottomZ).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/types.test.ts`
Expected: FAIL — module `../../geometry/v2/types` not found.

- [ ] **Step 3: Implement the types**

Create `src/geometry/v2/types.ts` with this exact content:

```typescript
import type { Point2 } from "../../domain/v2/types";

export type FootprintQuad = {
  rightStart: Point2;
  rightEnd: Point2;
  leftStart: Point2;
  leftEnd: Point2;
};

export type WallSegment = {
  start: Point2;
  end: Point2;
  thickness: number;
};

export type WallPanelRole = "full" | "left" | "right" | "between" | "below" | "above";

export type WallPanel = {
  role: WallPanelRole;
  /** Horizontal offset along the wall, meters from wall.start. */
  x: number;
  /** Vertical offset, meters from wall bottom (bottomZ). */
  y: number;
  width: number;
  height: number;
};

export type WallGeometryV2 = {
  wallId: string;
  start: Point2;
  end: Point2;
  thickness: number;
  /** Resolved world z of the wall bottom (resolveAnchor(wall.bottom, storeys)). */
  bottomZ: number;
  /** Resolved world z of the wall top. */
  topZ: number;
  materialId: string;
  panels: WallPanel[];
  footprint: FootprintQuad;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/__tests__/geometry-v2/types.test.ts`
Expected: PASS — 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/v2/types.ts src/__tests__/geometry-v2/types.test.ts
git commit -m "feat(geometry-v2): output types (Wall/Footprint/Panel)"
```

---

## Task 2: v2 footprintRing — 端口（仅 import 改动）

**Files:**
- Create: `src/geometry/v2/footprintRing.ts`
- Create: `src/__tests__/geometry-v2/footprintRing.test.ts`

The v1 file `src/geometry/footprintRing.ts` (142 LOC) is purely a 2D ring tracer; algorithm doesn't depend on storey/anchor at all. We port it byte-for-byte modulo import paths.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/geometry-v2/footprintRing.test.ts
import { describe, expect, it } from "vitest";
import type { Point2, Wall } from "../../domain/v2/types";
import { buildExteriorRing } from "../../geometry/v2/footprintRing";
import { buildWallNetwork } from "../../geometry/v2/wallNetwork";
import type { FootprintQuad } from "../../geometry/v2/types";

const DEFAULT_THICKNESS = 0.24;
const STOREYS = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

function makeWall(overrides: Partial<Wall> & Pick<Wall, "id" | "start" | "end">): Wall {
  return {
    thickness: DEFAULT_THICKNESS,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "2f", offset: 0 },
    exterior: true,
    materialId: "mat-wall",
    ...overrides,
  };
}

function indexFootprints(walls: Wall[]): Map<string, FootprintQuad> {
  const index = new Map<string, FootprintQuad>();
  for (const fp of buildWallNetwork(walls, STOREYS)) {
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

describe("buildExteriorRing v2", () => {
  it("traces a closed rectangle CCW from exterior corners", () => {
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 6 } }),
      makeWall({ id: "b", start: { x: 10, y: 6 }, end: { x: 0, y: 6 } }),
      makeWall({ id: "l", start: { x: 0, y: 6 }, end: { x: 0, y: 0 } }),
    ];
    const ring = buildExteriorRing(walls, indexFootprints(walls));
    const half = DEFAULT_THICKNESS / 2;
    expect(ring).toBeDefined();
    expectClosePolygon(ring!, [
      { x: -half, y: -half },
      { x: 10 + half, y: -half },
      { x: 10 + half, y: 6 + half },
      { x: -half, y: 6 + half },
    ]);
  });

  it("returns undefined for fewer than 3 exterior walls", () => {
    const walls: Wall[] = [
      makeWall({ id: "a", start: { x: 0, y: 0 }, end: { x: 5, y: 0 } }),
      makeWall({ id: "b", start: { x: 5, y: 0 }, end: { x: 5, y: 5 } }),
    ];
    expect(buildExteriorRing(walls, indexFootprints(walls))).toBeUndefined();
  });

  it("ignores interior walls", () => {
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 6 } }),
      makeWall({ id: "b", start: { x: 10, y: 6 }, end: { x: 0, y: 6 } }),
      makeWall({ id: "l", start: { x: 0, y: 6 }, end: { x: 0, y: 0 } }),
      makeWall({ id: "interior", start: { x: 5, y: 0 }, end: { x: 5, y: 6 }, exterior: false }),
    ];
    const ring = buildExteriorRing(walls, indexFootprints(walls));
    expect(ring).toBeDefined();
    expect(ring!).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/footprintRing.test.ts`
Expected: FAIL — module `../../geometry/v2/footprintRing` (and `wallNetwork`) not found.

- [ ] **Step 3: Copy v1 footprintRing to v2 path**

Run: `cp src/geometry/footprintRing.ts src/geometry/v2/footprintRing.ts`

- [ ] **Step 4: Apply import-path edits**

Edit `src/geometry/v2/footprintRing.ts`:

Replace:
```typescript
import type { Point2, Wall } from "../domain/types";
import type { FootprintQuad } from "./wallNetwork";
```

With:
```typescript
import type { Point2, Wall } from "../../domain/v2/types";
import type { FootprintQuad } from "./types";
```

(Note: in v2 we move `FootprintQuad` from `wallNetwork` to `types`. wallNetwork.ts in v2 will re-export or import from types.)

- [ ] **Step 5: Run test (still fails — wallNetwork not yet ported)**

The test imports `buildWallNetwork` from `./wallNetwork` which we haven't created. Move on to Task 3, then come back to verify Task 2's tests pass.

- [ ] **Step 6: Skip commit until Task 3 lets the tests pass**

Tests in `footprintRing.test.ts` reference `buildWallNetwork` which lives in Task 3. Defer commit.

---

## Task 3: v2 wallNetwork — 端口 + z 重叠 miter 回退

**Files:**
- Create: `src/geometry/v2/wallNetwork.ts`
- Create: `src/__tests__/geometry-v2/wallNetwork.test.ts`

This is the trickiest task. We port `src/geometry/wallNetwork.ts` (274 LOC) byte-for-byte, then make 4 surgical edits:

1. Update imports for v2 types.
2. Move `FootprintQuad` / `WallSegment` etc. types out — they live in `./types` now (Task 1).
3. Add `storeys: Storey[]` parameter to `buildWallNetwork`.
4. Add z-overlap check inside the per-junction loop: if the intersection of all incident walls' [bottomZ, topZ] is empty, fall back to free-end corners for every incidence at that junction.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/geometry-v2/wallNetwork.test.ts
import { describe, expect, it } from "vitest";
import type { Wall } from "../../domain/v2/types";
import { buildWallNetwork } from "../../geometry/v2/wallNetwork";

const STOREYS = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
  { id: "roof", label: "roof", elevation: 6.4 },
];

function makeWall(overrides: Partial<Wall> & Pick<Wall, "id" | "start" | "end">): Wall {
  return {
    thickness: 0.24,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "2f", offset: 0 },
    exterior: true,
    materialId: "mat-wall",
    ...overrides,
  };
}

describe("buildWallNetwork v2", () => {
  it("emits one footprint per wall with correct corner ordering for a rectangle", () => {
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 6 } }),
      makeWall({ id: "b", start: { x: 10, y: 6 }, end: { x: 0, y: 6 } }),
      makeWall({ id: "l", start: { x: 0, y: 6 }, end: { x: 0, y: 0 } }),
    ];
    const fps = buildWallNetwork(walls, STOREYS);
    expect(fps).toHaveLength(4);
    const front = fps.find((f) => f.wallId === "f")!;
    // Front wall: rightSide is below (y < 0 in plan), leftSide is above (y > 0).
    // At a CCW exterior corner, the meet of two walls produces the SAME point
    // for adjacent walls' corners (the outer rectangle corner).
    expect(front.rightStart.x).toBeCloseTo(-0.12, 4);
    expect(front.rightStart.y).toBeCloseTo(-0.12, 4);
    expect(front.rightEnd.x).toBeCloseTo(10.12, 4);
    expect(front.rightEnd.y).toBeCloseTo(-0.12, 4);
  });

  it("falls back to free-end corners when junction walls have non-overlapping z", () => {
    // Two walls share endpoint (10,0) but cover totally separate z ranges:
    // wall a is 1F→2F (z=0..3.2), wall b is 2F→roof (z=3.2..6.4) — JUST touching at z=3.2
    // (zero overlap). Expect free-end corners (no miter).
    //
    // To exercise STRICT non-overlap (no boundary touch), use a tiny gap.
    const walls: Wall[] = [
      makeWall({
        id: "a",
        start: { x: 0, y: 0 },
        end: { x: 10, y: 0 },
        bottom: { kind: "storey", storeyId: "1f", offset: 0 },
        top: { kind: "storey", storeyId: "2f", offset: -0.1 }, // top at 3.1
      }),
      makeWall({
        id: "b",
        start: { x: 10, y: 0 },
        end: { x: 10, y: 6 },
        bottom: { kind: "storey", storeyId: "2f", offset: 0 },     // bottom at 3.2
        top: { kind: "storey", storeyId: "roof", offset: 0 },
      }),
    ];
    const fps = buildWallNetwork(walls, STOREYS);
    const a = fps.find((f) => f.wallId === "a")!;
    const b = fps.find((f) => f.wallId === "b")!;
    // a's right side normal at start (0,0) is (0,-1)*half, so rightStart should be
    // (0, -0.12); rightEnd should be (10, -0.12) — free end, NOT pulled toward b.
    expect(a.rightEnd.x).toBeCloseTo(10, 4);
    expect(a.rightEnd.y).toBeCloseTo(-0.12, 4);
    // b's right side normal at start (10,0) is (1,0)*half (from direction (0,1)).
    // rightStart at the shared endpoint should be at (10.12, 0) — free end.
    expect(b.rightStart.x).toBeCloseTo(10.12, 4);
    expect(b.rightStart.y).toBeCloseTo(0, 4);
  });

  it("miters normally when all junction walls overlap z", () => {
    // Same shape as the rectangle test but with two walls explicitly overlapping
    // in z range — verify miter still happens.
    const walls: Wall[] = [
      makeWall({ id: "f", start: { x: 0, y: 0 }, end: { x: 10, y: 0 } }),
      makeWall({ id: "r", start: { x: 10, y: 0 }, end: { x: 10, y: 6 } }),
    ];
    const fps = buildWallNetwork(walls, STOREYS);
    const front = fps.find((f) => f.wallId === "f")!;
    // At the shared junction (10,0), front's rightEnd should miter to the rectangle
    // corner (10.12, -0.12), NOT free-end at (10, -0.12).
    expect(front.rightEnd.x).toBeCloseTo(10.12, 4);
    expect(front.rightEnd.y).toBeCloseTo(-0.12, 4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/wallNetwork.test.ts`
Expected: FAIL — module `../../geometry/v2/wallNetwork` not found.

- [ ] **Step 3: Copy v1 wallNetwork to v2 path**

Run: `cp src/geometry/wallNetwork.ts src/geometry/v2/wallNetwork.ts`

- [ ] **Step 4: Apply edits in `src/geometry/v2/wallNetwork.ts`**

**Edit 4a — Update imports.** Replace:
```typescript
import type { Point2, Wall } from "../domain/types";
```
With:
```typescript
import type { Point2, Storey, Wall } from "../../domain/v2/types";
import { resolveAnchor } from "../../domain/v2/anchors";
import type { FootprintQuad, WallSegment } from "./types";
```

**Edit 4b — Remove the type re-declarations now in `./types`.** Delete these lines from the file:

```typescript
export type FootprintQuad = {
  rightStart: Point2;
  rightEnd: Point2;
  leftStart: Point2;
  leftEnd: Point2;
};

export type WallFootprint = FootprintQuad & {
  wallId: string;
};

export type PanelFootprint = FootprintQuad;

export type WallSegment = {
  start: Point2;
  end: Point2;
  thickness: number;
};
```

Replace with this (re-export `WallFootprint` and `PanelFootprint` for callers, keep them tiny):

```typescript
export type WallFootprint = FootprintQuad & { wallId: string };
export type PanelFootprint = FootprintQuad;
```

**Edit 4c — Update `buildWallNetwork` signature** to take `storeys: Storey[]`. Replace:
```typescript
export function buildWallNetwork(
  walls: Wall[],
  options?: BuildWallNetworkOptions,
): WallFootprint[] {
```
With:
```typescript
export function buildWallNetwork(
  walls: Wall[],
  storeys: Storey[],
  options?: BuildWallNetworkOptions,
): WallFootprint[] {
```

**Edit 4d — Add z-overlap check in the per-junction loop.** Locate the block starting `for (const junction of junctions)` (currently at v1 line 163). Right after the `const sorted = ...` line and BEFORE `if (sorted.length === 1)`, insert this block:

```typescript
    // Z-overlap gate (v2): if any pair of walls at this junction has
    // disjoint [bottomZ, topZ] intervals, no mitering is meaningful;
    // emit free-end corners for every incidence and skip the junction.
    if (sorted.length > 1) {
      const intervals = sorted.map((inc) => {
        const wall = walls.find((w) => w.id === inc.wallId)!;
        return {
          lo: resolveAnchor(wall.bottom, storeys),
          hi: resolveAnchor(wall.top, storeys),
        };
      });
      const lo = Math.max(...intervals.map((i) => i.lo));
      const hi = Math.min(...intervals.map((i) => i.hi));
      if (lo >= hi) {
        for (const inc of sorted) {
          corners.set(inc, freeEndCorners(junction, inc));
        }
        continue;
      }
    }
```

(The fallback uses `freeEndCorners` which is already defined in v1 wallNetwork.ts at line 88. The block should sit immediately before the existing `if (sorted.length === 1)` branch.)

**Edit 4e — Wall lookup needed inside loop.** The block above does `walls.find((w) => w.id === inc.wallId)`. Inefficient but fine for ≤ ~50 walls. No additional change needed.

- [ ] **Step 5: Run tests for both Task 2 and Task 3**

Run: `bun run test src/__tests__/geometry-v2/`
Expected: PASS — Task 1 (1) + Task 2 (3) + Task 3 (3) = 7 tests pass.

If anything fails, double-check the inserted z-overlap block; in particular that:
- The block is INSIDE `for (const junction of junctions)` not outside
- The `continue` at the end skips the rest of the junction's body
- `freeEndCorners` is still in scope (it's defined at module level in v1)

- [ ] **Step 6: Run full build**

Run: `bun run build`
Expected: tsc clean, vite build succeeds.

- [ ] **Step 7: Commit Tasks 2 + 3 together**

```bash
git add src/geometry/v2/footprintRing.ts src/geometry/v2/wallNetwork.ts src/__tests__/geometry-v2/footprintRing.test.ts src/__tests__/geometry-v2/wallNetwork.test.ts
git commit -m "feat(geometry-v2): footprintRing + wallNetwork (z-overlap miter gate)"
```

---

## Task 4: v2 wallPanels — 端口 + height 参数

**Files:**
- Create: `src/geometry/v2/wallPanels.ts`
- Create: `src/__tests__/geometry-v2/wallPanels.test.ts`

The v1 `buildWallPanels(wall, openings)` reads `wall.height` for vertical sizing. v2 walls don't have a `height` field; height is `resolveAnchor(top) - resolveAnchor(bottom)`. We change the signature to take an explicit `wallHeight: number` parameter (caller resolves anchors and passes the number).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/geometry-v2/wallPanels.test.ts
import { describe, expect, it } from "vitest";
import type { Opening, Wall } from "../../domain/v2/types";
import { buildWallPanels } from "../../geometry/v2/wallPanels";

function makeWall(): Wall {
  return {
    id: "w",
    start: { x: 0, y: 0 },
    end: { x: 6, y: 0 },
    thickness: 0.2,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "2f", offset: 0 },
    exterior: true,
    materialId: "mat-wall",
  };
}

function makeOpening(overrides: Partial<Opening> & Pick<Opening, "id">): Opening {
  return {
    wallId: "w",
    type: "window",
    offset: 1,
    sillHeight: 0.9,
    width: 1.5,
    height: 1.2,
    frameMaterialId: "mat-frame",
    ...overrides,
  };
}

describe("buildWallPanels v2", () => {
  it("returns a single full panel when there are no openings", () => {
    const panels = buildWallPanels(makeWall(), [], 3.2);
    expect(panels).toHaveLength(1);
    expect(panels[0]).toMatchObject({ role: "full", x: 0, y: 0, width: 6, height: 3.2 });
  });

  it("splits around a single opening into 2 gap panels + below + above", () => {
    const panels = buildWallPanels(makeWall(), [makeOpening({ id: "o1" })], 3.2);
    // Expected: left gap (0..1) + right gap (2.5..6) + below (1..2.5, 0..0.9) + above (1..2.5, 2.1..3.2)
    expect(panels).toHaveLength(4);
    const roles = panels.map((p) => p.role).sort();
    expect(roles).toEqual(["above", "below", "left", "right"]);
  });

  it("handles multiple openings with sweep-line splitting", () => {
    const openings: Opening[] = [
      makeOpening({ id: "o1", offset: 0.5, width: 1 }),
      makeOpening({ id: "o2", offset: 3, width: 1.2 }),
    ];
    const panels = buildWallPanels(makeWall(), openings, 3.2);
    // 3 gap panels (left, between, right) + 2 below + 2 above = 7
    expect(panels).toHaveLength(7);
    const gapRoles = panels.filter((p) => ["left", "between", "right"].includes(p.role));
    expect(gapRoles).toHaveLength(3);
  });

  it("uses caller-provided wallHeight, not any field on Wall", () => {
    // wall.bottom/top would resolve to 3.2m, but we pass 5.0 — panels must use 5.0
    const panels = buildWallPanels(makeWall(), [], 5.0);
    expect(panels[0].height).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/wallPanels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Copy v1 wallPanels to v2 path**

Run: `cp src/geometry/wallPanels.ts src/geometry/v2/wallPanels.ts`

- [ ] **Step 4: Apply edits in `src/geometry/v2/wallPanels.ts`**

**Edit 4a — Replace imports.** Replace:
```typescript
import { wallLength } from "../domain/measurements";
import type { Opening, Wall } from "../domain/types";
import type { WallPanel, WallPanelRole } from "./types";
```
With:
```typescript
import type { Opening, Wall } from "../../domain/v2/types";
import type { WallPanel, WallPanelRole } from "./types";

function wallLength(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}
```

**Edit 4b — Update `buildWallPanels` signature.** Replace:
```typescript
export function buildWallPanels(wall: Wall, openings: Opening[]): WallPanel[] {
  const wallWidth = wallLength(wall);
```
With:
```typescript
export function buildWallPanels(
  wall: Wall,
  openings: Opening[],
  wallHeight: number,
): WallPanel[] {
  const wallWidth = wallLength(wall);
```

**Edit 4c — Replace every `wall.height` with `wallHeight`.** There are 4 occurrences in v1 wallPanels.ts (lines 38, 54, 65, 82). Use replace_all if the editor supports it; otherwise do them one by one. Each occurrence is the literal string `wall.height`.

- [ ] **Step 5: Run tests**

Run: `bun run test src/__tests__/geometry-v2/wallPanels.test.ts`
Expected: PASS — 4 tests pass.

Run: `bun run test src/__tests__/geometry-v2/`
Expected: cumulative 11 tests pass (1 + 3 + 3 + 4).

- [ ] **Step 6: Commit**

```bash
git add src/geometry/v2/wallPanels.ts src/__tests__/geometry-v2/wallPanels.test.ts
git commit -m "feat(geometry-v2): wallPanels (height parameter)"
```

---

## Task 5: v2 wallBuilder — 顶层装配

**Files:**
- Create: `src/geometry/v2/wallBuilder.ts`
- Create: `src/__tests__/geometry-v2/wallBuilder.test.ts`

This is a NEW top-level entry point that combines anchor resolution, panel splitting, and footprint lookup into a single `WallGeometryV2` per wall.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/geometry-v2/wallBuilder.test.ts
import { describe, expect, it } from "vitest";
import type { Opening, Storey, Wall } from "../../domain/v2/types";
import { buildWallGeometry } from "../../geometry/v2/wallBuilder";
import { buildWallNetwork } from "../../geometry/v2/wallNetwork";
import type { FootprintQuad } from "../../geometry/v2/types";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

function makeWall(): Wall {
  return {
    id: "w-front",
    start: { x: 0, y: 0 },
    end: { x: 6, y: 0 },
    thickness: 0.2,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "2f", offset: 0 },
    exterior: true,
    materialId: "mat-wall",
  };
}

function indexFootprints(walls: Wall[]): Map<string, FootprintQuad> {
  const index = new Map<string, FootprintQuad>();
  for (const fp of buildWallNetwork(walls, STOREYS)) {
    const { wallId, ...quad } = fp;
    index.set(wallId, quad);
  }
  return index;
}

describe("buildWallGeometry v2", () => {
  it("emits resolved bottomZ/topZ from anchors", () => {
    const wall = makeWall();
    const geo = buildWallGeometry(wall, [], STOREYS, indexFootprints([wall]));
    expect(geo.bottomZ).toBe(0);
    expect(geo.topZ).toBe(3.2);
    expect(geo.wallId).toBe("w-front");
    expect(geo.thickness).toBe(0.2);
    expect(geo.materialId).toBe("mat-wall");
  });

  it("emits panels using resolved height (no openings → single full panel)", () => {
    const wall = makeWall();
    const geo = buildWallGeometry(wall, [], STOREYS, indexFootprints([wall]));
    expect(geo.panels).toHaveLength(1);
    expect(geo.panels[0]).toMatchObject({ role: "full", height: 3.2, width: 6 });
  });

  it("splits panels around an opening", () => {
    const wall = makeWall();
    const opening: Opening = {
      id: "o1",
      wallId: "w-front",
      type: "window",
      offset: 2,
      sillHeight: 0.9,
      width: 1.5,
      height: 1.2,
      frameMaterialId: "mat-frame",
    };
    const geo = buildWallGeometry(wall, [opening], STOREYS, indexFootprints([wall]));
    expect(geo.panels).toHaveLength(4);
  });

  it("supports tall double-height walls via top anchor at higher storey", () => {
    const wall: Wall = {
      ...makeWall(),
      top: { kind: "absolute", z: 6.4 },
    };
    const geo = buildWallGeometry(wall, [], STOREYS, indexFootprints([wall]));
    expect(geo.bottomZ).toBe(0);
    expect(geo.topZ).toBe(6.4);
    expect(geo.panels[0].height).toBe(6.4);
  });

  it("clones start/end so callers can't mutate input", () => {
    const wall = makeWall();
    const geo = buildWallGeometry(wall, [], STOREYS, indexFootprints([wall]));
    geo.start.x = 999;
    expect(wall.start.x).toBe(0);
  });

  it("falls back to a degenerate footprint when wallId not in index", () => {
    const wall = makeWall();
    const emptyIndex = new Map<string, FootprintQuad>();
    const geo = buildWallGeometry(wall, [], STOREYS, emptyIndex);
    // Degenerate footprint: rightStart=leftStart=wall.start, rightEnd=leftEnd=wall.end
    expect(geo.footprint.rightStart).toEqual({ x: 0, y: 0 });
    expect(geo.footprint.leftStart).toEqual({ x: 0, y: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/wallBuilder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement wallBuilder**

Create `src/geometry/v2/wallBuilder.ts` with this exact content:

```typescript
import { resolveAnchor } from "../../domain/v2/anchors";
import type { Opening, Point2, Storey, Wall } from "../../domain/v2/types";
import { buildWallPanels } from "./wallPanels";
import type { FootprintQuad, WallGeometryV2 } from "./types";

function clonePoint(p: Point2): Point2 {
  return { x: p.x, y: p.y };
}

function cloneFootprint(fp: FootprintQuad): FootprintQuad {
  return {
    rightStart: clonePoint(fp.rightStart),
    rightEnd: clonePoint(fp.rightEnd),
    leftStart: clonePoint(fp.leftStart),
    leftEnd: clonePoint(fp.leftEnd),
  };
}

function fallbackFootprint(wall: Wall): FootprintQuad {
  // Zero-length / missing-network wall: collapse to a degenerate quad so
  // downstream rendering produces zero-volume geometry instead of crashing.
  return {
    rightStart: clonePoint(wall.start),
    rightEnd: clonePoint(wall.end),
    leftStart: clonePoint(wall.start),
    leftEnd: clonePoint(wall.end),
  };
}

export function buildWallGeometry(
  wall: Wall,
  openings: Opening[],
  storeys: Storey[],
  footprintIndex: Map<string, FootprintQuad>,
): WallGeometryV2 {
  const bottomZ = resolveAnchor(wall.bottom, storeys);
  const topZ = resolveAnchor(wall.top, storeys);
  const wallHeight = topZ - bottomZ;
  const ownOpenings = openings.filter((o) => o.wallId === wall.id);
  const panels = buildWallPanels(wall, ownOpenings, wallHeight);
  const footprint = footprintIndex.get(wall.id);
  return {
    wallId: wall.id,
    start: clonePoint(wall.start),
    end: clonePoint(wall.end),
    thickness: wall.thickness,
    bottomZ,
    topZ,
    materialId: wall.materialId,
    panels,
    footprint: footprint ? cloneFootprint(footprint) : fallbackFootprint(wall),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/__tests__/geometry-v2/wallBuilder.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/v2/wallBuilder.ts src/__tests__/geometry-v2/wallBuilder.test.ts
git commit -m "feat(geometry-v2): wallBuilder (anchor-resolved height + panels + footprint)"
```

---

## Task 6: 全套绿线检查 + 收尾

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`
Expected: existing tests still pass (449 from before P2A) + ~17 new geometry-v2 tests = ~466 total.

- [ ] **Step 2: Full type check + build**

Run: `bun run build`
Expected: tsc --noEmit clean, vite build succeeds.

- [ ] **Step 3: Confirm isolation — zero v1 modifications**

Run: `git diff dd6854c..HEAD -- src/ ':!src/geometry/v2/' ':!src/__tests__/geometry-v2/' ':!src/domain/v2/' ':!src/__tests__/domain-v2/'`
Expected: empty diff. If anything appears, revert it.

(Note: dd6854c is the P1.5 commit; everything after that on main is P2A.)

- [ ] **Step 4: Confirm file count**

Run: `git diff dd6854c..HEAD --stat`
Expected: 8 new files (5 source + 3 test, plus types.test.ts).
Specifically: `geometry/v2/{types,footprintRing,wallNetwork,wallPanels,wallBuilder}.ts` + `__tests__/geometry-v2/{types,footprintRing,wallNetwork,wallPanels,wallBuilder}.test.ts` (5 + 5 = 10 files actually).

- [ ] **Step 5: No additional commit needed**

P2A is complete. The Task 1-5 commits are the trail.

---

## Done Criteria

- `bun run test` 全绿，新测试 ≥ 17 条覆盖 types / footprintRing / wallNetwork / wallPanels / wallBuilder
- `bun run build` 全绿
- v1 文件 + 现有 v2 文件（`src/domain/v2/*`）字面零修改
- `src/geometry/v2/` 下 5 个文件存在并互相 self-contained
- 后续 P2B 启动时可直接 `import { buildWallGeometry } from "src/geometry/v2/wallBuilder"`

## P2A 不做（明确边界）

- Slab / Roof / Stair / Balcony / Opening frame builder（P2B + P2C）
- `buildSceneGeometryV2` 顶层装配（P2C）
- 任何 rendering / UI 改动（P4）
- Wall miter 在 z 部分重叠（部分高度区间相交）的精细处理 —— v1 简化为"全交集非空 → miter，否则全部 free-end"
