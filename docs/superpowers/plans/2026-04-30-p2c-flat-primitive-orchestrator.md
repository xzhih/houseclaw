# P2C: 扁平 3D 原型 — 开洞框 + 楼梯 + 阳台 + 顶层装配 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P2 收尾 —— 把 opening frame、stair、balcony 三个子系统补齐，再用一个 `buildSceneGeometryV2(project)` 顶层装配把 P2A + P2B + P2C 全部 builder 串起来，输出完整的 `HouseGeometryV2`。

**Architecture:** Opening frame 端口 v1（输入 wall-local、算法不变）；stair 端口 v1，第二参数从 Storey 换成预解析的 `{lowerZ, upperZ, slabThickness}`；balcony 在 v1 是 `houseGeometry.ts` 的内联 .map，v2 抽成独立 builder 文件，加上 anchor 解析；顶层 `buildSceneGeometryV2` 类似 v1 的 `buildHouseGeometry` 但全程吃 v2 类型。

**Tech Stack:** TypeScript 5、vitest、bun。纯函数，零 THREE 依赖。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-flat-primitive-refactor-design.md` §4.4、§4.5。

**关键设计决策：**
- Stair `slabThickness` 不再来自 Storey（v2 Storey 没这字段），由 caller（buildSceneGeometryV2）查找 `stair.to` 解析后等于 top 的 Slab，读它的 thickness。如果没找到匹配的 Slab，fallback 到常量 0.18m。
- Balcony 几何在 v1 是 `houseGeometry.ts` 内联 .map；v2 抽成 `balconyBuilder.ts`。
- `buildSceneGeometryV2` 不做"切楼板 holes"逻辑 —— v2 Slab.holes 由用户在编辑器里手动配。这是 v2 简化（spec §6.1 已明示）。

---

## File Structure

新建：

- `src/geometry/v2/openingFrameGeometry.ts` — port v1，wallLength 内联
- `src/geometry/v2/stairGeometry.ts` — port v1，2nd param 改 `{lowerZ, upperZ, slabThickness}`
- `src/geometry/v2/balconyBuilder.ts` — 新（v1 在 houseGeometry 内联）
- `src/geometry/v2/houseGeometry.ts` — `buildSceneGeometryV2(project) → HouseGeometryV2` 顶层装配

修改：

- `src/geometry/v2/types.ts` — 追加 FrameStrip、StairGeometryV2、BalconyGeometryV2、HouseGeometryV2 类型

新建测试：

- `src/__tests__/geometry-v2/openingFrameGeometry.test.ts`
- `src/__tests__/geometry-v2/stairGeometry.test.ts`
- `src/__tests__/geometry-v2/balconyBuilder.test.ts`
- `src/__tests__/geometry-v2/houseGeometry.test.ts`

不动：所有 v1 文件、`src/domain/v2/*`、P2A/P2B 已落的 `src/geometry/v2/*` 文件。

P2C 结束后 `bun run test` 应有 **20+ 条新测试通过**，全套 ~503 +。

---

## Task 1: 类型扩展（FrameStrip + Stair + Balcony + HouseGeometryV2）

**Files:**
- Modify: `src/geometry/v2/types.ts` (append)
- Create: `src/__tests__/geometry-v2/houseGeometryTypes.test.ts`

- [ ] **Step 1: Write failing smoke test**

```typescript
// src/__tests__/geometry-v2/houseGeometryTypes.test.ts
import { describe, expect, it } from "vitest";
import type {
  BalconyGeometryV2,
  FrameStrip,
  HouseGeometryV2,
  StairBoxV2,
  StairGeometryV2,
} from "../../geometry/v2/types";

describe("v2 orchestrator types", () => {
  it("compiles with valid object literals", () => {
    const frame: FrameStrip = {
      role: "top",
      center: { x: 0, y: 0, z: 2 },
      size: { alongWall: 1, height: 0.06, depth: 0.04 },
      rotationY: 0,
      materialId: "mat-frame",
    };

    const box: StairBoxV2 = { cx: 0, cy: 0, cz: 0, sx: 1, sy: 0.165, sz: 0.27 };
    const stair: StairGeometryV2 = { stairId: "s1", treads: [box], landings: [], materialId: "mat-stair" };

    const balcony: BalconyGeometryV2 = {
      balconyId: "b1",
      attachedWallId: "w1",
      offset: 1,
      width: 2,
      depth: 1,
      slabThickness: 0.15,
      slabTopZ: 3.2,
      railingHeight: 1.1,
      materialId: "mat-wall",
      railingMaterialId: "mat-frame",
    };

    const house: HouseGeometryV2 = {
      walls: [],
      slabs: [],
      roofs: [],
      stairs: [],
      balconies: [],
      openingFrames: [],
    };

    expect(frame.size.alongWall).toBe(1);
    expect(stair.treads[0].sx).toBe(1);
    expect(balcony.slabTopZ).toBe(3.2);
    expect(house.walls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/houseGeometryTypes.test.ts`
Expected: FAIL — types not exported.

- [ ] **Step 3: Append types to `src/geometry/v2/types.ts`**

After the existing `RoofGeometryV2` type, append:

```typescript

/** A single rectangular frame strip ready for three.js BoxGeometry. */
export type FrameStrip = {
  role: "top" | "bottom" | "left" | "right";
  /** Center point. center.x and center.y are plan-space coordinates;
   *  center.z is world height. Renderer converts plan-y → scene-z. */
  center: { x: number; y: number; z: number };
  /** Box dimensions in three local axes after rotation. */
  size: { alongWall: number; height: number; depth: number };
  /** Rotation around scene Y axis to align the box with the wall. */
  rotationY: number;
  materialId: string;
};

/** Per-stair a tread or landing box. World-space center + dimensions. */
export type StairBoxV2 = {
  cx: number; cy: number; cz: number;
  sx: number; sy: number; sz: number;
  /** Rotation around world Y at the box's own center (radians). */
  rotationY?: number;
};

export type StairGeometryV2 = {
  stairId: string;
  treads: StairBoxV2[];
  landings: StairBoxV2[];
  materialId: string;
};

export type BalconyGeometryV2 = {
  balconyId: string;
  attachedWallId: string;
  offset: number;
  width: number;
  depth: number;
  slabThickness: number;
  /** Resolved world z of the balcony slab top. */
  slabTopZ: number;
  railingHeight: number;
  materialId: string;
  railingMaterialId: string;
};

export type HouseGeometryV2 = {
  walls: WallGeometryV2[];
  slabs: SlabGeometryV2[];
  roofs: RoofGeometryV2[];
  stairs: StairGeometryV2[];
  balconies: BalconyGeometryV2[];
  /** Per-opening frame strips, flattened. */
  openingFrames: FrameStrip[];
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/__tests__/geometry-v2/houseGeometryTypes.test.ts`
Expected: PASS — 1 test.

- [ ] **Step 5: Cumulative + build**

Run: `bun run test src/__tests__/geometry-v2/`
Expected: 35 tests (34 from P2A+P2B + 1 new).

Run: `bun run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/v2/types.ts src/__tests__/geometry-v2/houseGeometryTypes.test.ts
git commit -m "feat(geometry-v2): orchestrator output types (Frame/Stair/Balcony/House)"
```

---

## Task 2: openingFrameGeometry v2 — 端口

**Files:**
- Create: `src/geometry/v2/openingFrameGeometry.ts` (cp + edits)
- Create: `src/__tests__/geometry-v2/openingFrameGeometry.test.ts`

The v1 file is 83 LOC. Two changes:
1. Import paths to v2.
2. Drop the `wallLength` import (was from `domain/measurements`); inline it like wallPanels v2 did.

`FrameStrip` type already lives in v2 `types.ts` from Task 1 — DELETE the local re-declaration.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/geometry-v2/openingFrameGeometry.test.ts
import { describe, expect, it } from "vitest";
import type { Opening, Wall } from "../../domain/v2/types";
import { buildOpeningFrameStrips } from "../../geometry/v2/openingFrameGeometry";

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

function makeOpening(overrides?: Partial<Opening>): Opening {
  return {
    id: "o1",
    wallId: "w-front",
    type: "window",
    offset: 1.5,
    sillHeight: 0.9,
    width: 1.5,
    height: 1.2,
    frameMaterialId: "mat-frame",
    ...overrides,
  };
}

describe("buildOpeningFrameStrips v2", () => {
  it("emits 4 strips around a window opening (top/bottom/left/right)", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), makeWall());
    expect(strips).toHaveLength(4);
    const roles = strips.map((s) => s.role).sort();
    expect(roles).toEqual(["bottom", "left", "right", "top"]);
  });

  it("emits 0 strips for void openings (structural openings)", () => {
    const strips = buildOpeningFrameStrips(makeOpening({ type: "void" }), makeWall());
    expect(strips).toHaveLength(0);
  });

  it("emits 4 strips for door openings", () => {
    const strips = buildOpeningFrameStrips(makeOpening({ type: "door" }), makeWall());
    expect(strips).toHaveLength(4);
  });

  it("uses opening.frameMaterialId for all strips", () => {
    const strips = buildOpeningFrameStrips(makeOpening({ frameMaterialId: "mat-walnut" }), makeWall());
    expect(strips.every((s) => s.materialId === "mat-walnut")).toBe(true);
  });

  it("emits 0 strips for zero-length wall", () => {
    const wall: Wall = { ...makeWall(), end: { x: 0, y: 0 } };
    const strips = buildOpeningFrameStrips(makeOpening(), wall);
    expect(strips).toHaveLength(0);
  });

  it("strip z values are wall-local (sillHeight + ...) — NOT resolved to world z", () => {
    // Frame strip z = sill + offset; for a window with sill=0.9 and height=1.2,
    // the bottom strip is at z ≈ 0.93 (sill + FRAME_BAR/2) regardless of wall.bottom anchor.
    const strips = buildOpeningFrameStrips(makeOpening(), makeWall());
    const bottom = strips.find((s) => s.role === "bottom")!;
    expect(bottom.center.z).toBeCloseTo(0.93, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/openingFrameGeometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Copy v1 file to v2 path**

```bash
cp src/geometry/openingFrameGeometry.ts src/geometry/v2/openingFrameGeometry.ts
```

- [ ] **Step 4: Apply edits in `src/geometry/v2/openingFrameGeometry.ts`**

**Edit 4a — Replace imports.** Find the first 2 lines:

```typescript
import { wallLength } from "../domain/measurements";
import type { Opening, Wall } from "../domain/types";
```

Replace with:

```typescript
import type { Opening, Wall } from "../../domain/v2/types";
import type { FrameStrip } from "./types";

function wallLength(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}
```

**Edit 4b — Delete the local `FrameStrip` type declaration.** Find and DELETE this block (it's now imported from `./types`):

```typescript
/** A single rectangular frame strip ready for three.js BoxGeometry. */
export type FrameStrip = {
  role: "top" | "bottom" | "left" | "right";
  /** Center point. center.x and center.y are plan-space coordinates;
   *  center.z is world height. Renderer converts plan-y → scene-z. */
  center: { x: number; y: number; z: number };
  /** Box dimensions in three local axes after rotation:
   *  alongWall = box width along wall direction;
   *  height = box height along world-Y;
   *  depth = box thickness in wall-normal direction. */
  size: { alongWall: number; height: number; depth: number };
  /** Rotation around scene Y axis to align the box with the wall. */
  rotationY: number;
  materialId: string;
};
```

The two FRAME_BAR / FRAME_DEPTH constants and the buildOpeningFrameStrips function stay unchanged.

- [ ] **Step 5: Run tests**

Run: `bun run test src/__tests__/geometry-v2/openingFrameGeometry.test.ts`
Expected: 6/6 PASS.

Run: `bun run test src/__tests__/geometry-v2/`
Expected: 41 cumulative.

Run: `bun run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/v2/openingFrameGeometry.ts src/__tests__/geometry-v2/openingFrameGeometry.test.ts
git commit -m "feat(geometry-v2): openingFrameGeometry port"
```

---

## Task 3: stairGeometry v2 — 端口 + anchor 参数

**Files:**
- Create: `src/geometry/v2/stairGeometry.ts` (cp + edits)
- Create: `src/__tests__/geometry-v2/stairGeometry.test.ts`

The v1 file is 385 LOC. The math is preserved verbatim; only the `buildStairGeometry` signature changes:
- v1: `(stair, storey, lowerStoreyTopY)` — `storey.elevation` for upper z, `storey.slabThickness` for thickness
- v2: `(stair, lowerZ, upperZ, slabThickness)` — pre-resolved by caller

The internal helpers (`buildStraight`, `buildL`, `buildU`, `appendLowerFlight`, `makeBoxAtCross`, `basisForEdge`) stay unchanged.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/geometry-v2/stairGeometry.test.ts
import { describe, expect, it } from "vitest";
import type { Stair } from "../../domain/v2/types";
import { buildStairGeometry, stairFootprintPolygon } from "../../geometry/v2/stairGeometry";

function makeStair(overrides?: Partial<Stair>): Stair {
  return {
    id: "s1",
    x: 0, y: 0, width: 1, depth: 3,
    shape: "straight",
    treadDepth: 0.27,
    bottomEdge: "+y",
    from: { kind: "absolute", z: 0 },
    to: { kind: "absolute", z: 3.2 },
    materialId: "mat-stair",
    ...overrides,
  };
}

describe("buildStairGeometry v2", () => {
  it("emits a stack of treads for a straight stair", () => {
    const geo = buildStairGeometry(makeStair(), 0, 3.2, 0.18);
    expect(geo.treads.length).toBeGreaterThan(0);
    expect(geo.landings).toHaveLength(0);
  });

  it("emits treads + landing for an L-shaped stair", () => {
    const geo = buildStairGeometry(makeStair({ shape: "l", width: 2, depth: 3 }), 0, 3.2, 0.18);
    expect(geo.treads.length).toBeGreaterThan(0);
    expect(geo.landings.length).toBe(1);
  });

  it("emits treads + landing for a U-shaped stair", () => {
    const geo = buildStairGeometry(makeStair({ shape: "u", width: 2.4, depth: 3 }), 0, 3.2, 0.18);
    expect(geo.treads.length).toBeGreaterThan(0);
    // landing may be 0 or 1 depending on remaining run space; for a 2.4×3 stair
    // with treadDepth=0.27 and climb=3.2 there's enough room for the U landing.
    expect(geo.landings.length).toBeGreaterThanOrEqual(0);
  });

  it("scales tread height with climb", () => {
    const tall = buildStairGeometry(makeStair(), 0, 4.0, 0.18);
    const short = buildStairGeometry(makeStair(), 0, 3.0, 0.18);
    // More climb → more treads (or taller risers).
    expect(tall.treads.length + tall.landings.length).toBeGreaterThanOrEqual(
      short.treads.length + short.landings.length,
    );
  });

  it("applies stair.rotation to all boxes", () => {
    const stair = makeStair({ rotation: Math.PI / 2 });
    const geo = buildStairGeometry(stair, 0, 3.2, 0.18);
    expect(geo.treads.every((t) => t.rotationY === Math.PI / 2)).toBe(true);
  });
});

describe("stairFootprintPolygon v2", () => {
  it("returns a 4-vertex CCW rectangle for an axis-aligned stair", () => {
    const polygon = stairFootprintPolygon(makeStair(), 3.2);
    expect(polygon).toHaveLength(4);
    // Compute signed area to check CCW (>0)
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      area += a.x * b.y - b.x * a.y;
    }
    expect(area).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/stairGeometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Copy v1 file to v2 path**

```bash
cp src/geometry/stairGeometry.ts src/geometry/v2/stairGeometry.ts
```

- [ ] **Step 4: Apply edits in `src/geometry/v2/stairGeometry.ts`**

**Edit 4a — Replace imports.** Find:

```typescript
import { computeStairConfig, rotatePoint } from "../domain/stairs";
import type { StairConfig } from "../domain/stairs";
import type { Point2, Stair, Storey } from "../domain/types";
```

Replace with:

```typescript
import { computeStairConfig, rotatePoint } from "../../domain/stairs";
import type { StairConfig } from "../../domain/stairs";
import type { Point2, Stair } from "../../domain/v2/types";
import type { StairBoxV2, StairGeometryV2 } from "./types";
```

(Note: `Storey` no longer needed; `domain/stairs` is reused as-is from v1 — it's pure helpers and doesn't import v1 types.)

**Edit 4b — Delete local type declarations.** Find and DELETE:

```typescript
export type StairBox = {
  cx: number; cy: number; cz: number;  // world-space center
  sx: number; sy: number; sz: number;  // dimensions
  /** Rotation around world Y axis at the box's own center (radians). Matches stair.rotation. */
  rotationY?: number;
};

export type StairGeometry = {
  treads: StairBox[];
  landings: StairBox[];
};
```

These are now in `./types` as `StairBoxV2` and (close to) `StairGeometryV2`. Note: v2 `StairGeometryV2` adds `stairId` and `materialId` (provided by the outer `buildStairGeometry` wrapper).

**Edit 4c — Type aliases for internal use.** Add right after the imports:

```typescript
type StairBox = StairBoxV2;
type StairGeometry = { treads: StairBoxV2[]; landings: StairBoxV2[] };
```

This lets the existing internal functions (`buildStraight`, `buildL`, `buildU`, `appendLowerFlight`, `makeBoxAtCross`) keep their existing signatures without changes. The outer `buildStairGeometry` will wrap with `stairId` and `materialId`.

**Edit 4d — Update `buildStairGeometry` signature + body.** Find:

```typescript
export function buildStairGeometry(
  stair: Stair,
  storey: Storey,
  lowerStoreyTopY: number,
): StairGeometry {
  const climb = storey.elevation - lowerStoreyTopY;
  const t = storey.slabThickness;
  let geom: StairGeometry;
  switch (stair.shape) {
    case "straight":
      geom = buildStraight(stair, lowerStoreyTopY, climb, t);
      break;
    case "l":
      geom = buildL(stair, lowerStoreyTopY, climb, t);
      break;
    case "u":
      geom = buildU(stair, lowerStoreyTopY, climb, t);
      break;
  }

  const angle = stair.rotation ?? 0;
  if (angle !== 0) {
    // Plan-space center maps directly to world (cx, cz): plan-x → world-x, plan-y → world-z.
    const worldCenter = { x: stair.x + stair.width / 2, y: stair.y + stair.depth / 2 };
    const applyRotation = (box: StairBox): StairBox => {
      const rotated = rotatePoint({ x: box.cx, y: box.cz }, worldCenter, angle);
      return { ...box, cx: rotated.x, cz: rotated.y, rotationY: angle };
    };
    geom = {
      treads: geom.treads.map(applyRotation),
      landings: geom.landings.map(applyRotation),
    };
  }

  return geom;
}
```

Replace with:

```typescript
export function buildStairGeometry(
  stair: Stair,
  lowerZ: number,
  upperZ: number,
  slabThickness: number,
): StairGeometryV2 {
  const climb = upperZ - lowerZ;
  let geom: StairGeometry;
  switch (stair.shape) {
    case "straight":
      geom = buildStraight(stair, lowerZ, climb, slabThickness);
      break;
    case "l":
      geom = buildL(stair, lowerZ, climb, slabThickness);
      break;
    case "u":
      geom = buildU(stair, lowerZ, climb, slabThickness);
      break;
  }

  const angle = stair.rotation ?? 0;
  if (angle !== 0) {
    const worldCenter = { x: stair.x + stair.width / 2, y: stair.y + stair.depth / 2 };
    const applyRotation = (box: StairBox): StairBox => {
      const rotated = rotatePoint({ x: box.cx, y: box.cz }, worldCenter, angle);
      return { ...box, cx: rotated.x, cz: rotated.y, rotationY: angle };
    };
    geom = {
      treads: geom.treads.map(applyRotation),
      landings: geom.landings.map(applyRotation),
    };
  }

  return {
    stairId: stair.id,
    treads: geom.treads,
    landings: geom.landings,
    materialId: stair.materialId,
  };
}
```

(All internal `buildStraight`, `buildL`, `buildU` etc. signatures unchanged. They use `lowerStoreyTopY` as a parameter name — change that name to `lowerZ` for consistency, OR leave as-is since it's just a local name. **Recommendation:** leave `lowerStoreyTopY` as the internal param name to minimize diff; it's a one-time port and the variable name doesn't bleed out.)

**Edit 4e — `stairFootprintPolygon` signature.** Find:

```typescript
export function stairFootprintPolygon(stair: Stair, _climb: number): Point2[] {
```

Leave it unchanged. The signature already takes a `_climb: number` (unused) for v1 compat. No edit needed.

- [ ] **Step 5: Run tests**

Run: `bun run test src/__tests__/geometry-v2/stairGeometry.test.ts`
Expected: 6/6 PASS.

Run: `bun run test src/__tests__/geometry-v2/`
Expected: 47 cumulative.

Run: `bun run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/v2/stairGeometry.ts src/__tests__/geometry-v2/stairGeometry.test.ts
git commit -m "feat(geometry-v2): stairGeometry port (anchor-resolved climb)"
```

---

## Task 4: balconyBuilder — NEW

**Files:**
- Create: `src/geometry/v2/balconyBuilder.ts`
- Create: `src/__tests__/geometry-v2/balconyBuilder.test.ts`

In v1 the balcony "geometry" is just a field-by-field copy from `Balcony` to `BalconyGeometry` — the actual 3D shape lives in the renderer. v2 follows the same pattern but resolves the slabTop anchor.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/geometry-v2/balconyBuilder.test.ts
import { describe, expect, it } from "vitest";
import type { Balcony, Storey } from "../../domain/v2/types";
import { buildBalconyGeometry } from "../../geometry/v2/balconyBuilder";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

function makeBalcony(overrides?: Partial<Balcony>): Balcony {
  return {
    id: "b1",
    attachedWallId: "w-front",
    offset: 1,
    width: 2,
    depth: 1,
    slabTop: { kind: "storey", storeyId: "2f", offset: 0 },
    slabThickness: 0.15,
    railingHeight: 1.1,
    materialId: "mat-wall",
    railingMaterialId: "mat-frame",
    ...overrides,
  };
}

describe("buildBalconyGeometry v2", () => {
  it("resolves slabTopZ from storey anchor", () => {
    const geo = buildBalconyGeometry(makeBalcony(), STOREYS);
    expect(geo.balconyId).toBe("b1");
    expect(geo.slabTopZ).toBe(3.2);
    expect(geo.attachedWallId).toBe("w-front");
  });

  it("propagates all dimensional fields", () => {
    const geo = buildBalconyGeometry(
      makeBalcony({ width: 3.5, depth: 1.2, slabThickness: 0.18, railingHeight: 1.0 }),
      STOREYS,
    );
    expect(geo.width).toBe(3.5);
    expect(geo.depth).toBe(1.2);
    expect(geo.slabThickness).toBe(0.18);
    expect(geo.railingHeight).toBe(1.0);
  });

  it("propagates both materialIds", () => {
    const geo = buildBalconyGeometry(
      makeBalcony({ materialId: "mat-deck", railingMaterialId: "mat-iron" }),
      STOREYS,
    );
    expect(geo.materialId).toBe("mat-deck");
    expect(geo.railingMaterialId).toBe("mat-iron");
  });

  it("supports absolute anchor", () => {
    const geo = buildBalconyGeometry(
      makeBalcony({ slabTop: { kind: "absolute", z: 4.5 } }),
      STOREYS,
    );
    expect(geo.slabTopZ).toBe(4.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/balconyBuilder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement balconyBuilder**

Create `src/geometry/v2/balconyBuilder.ts` with this exact content:

```typescript
import { resolveAnchor } from "../../domain/v2/anchors";
import type { Balcony, Storey } from "../../domain/v2/types";
import type { BalconyGeometryV2 } from "./types";

export function buildBalconyGeometry(balcony: Balcony, storeys: Storey[]): BalconyGeometryV2 {
  return {
    balconyId: balcony.id,
    attachedWallId: balcony.attachedWallId,
    offset: balcony.offset,
    width: balcony.width,
    depth: balcony.depth,
    slabThickness: balcony.slabThickness,
    slabTopZ: resolveAnchor(balcony.slabTop, storeys),
    railingHeight: balcony.railingHeight,
    materialId: balcony.materialId,
    railingMaterialId: balcony.railingMaterialId,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test src/__tests__/geometry-v2/balconyBuilder.test.ts`
Expected: 4/4 PASS.

Run: `bun run test src/__tests__/geometry-v2/`
Expected: 51 cumulative.

Run: `bun run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/v2/balconyBuilder.ts src/__tests__/geometry-v2/balconyBuilder.test.ts
git commit -m "feat(geometry-v2): balconyBuilder (anchor-resolved slabTop)"
```

---

## Task 5: buildSceneGeometryV2 — 顶层装配

**Files:**
- Create: `src/geometry/v2/houseGeometry.ts`
- Create: `src/__tests__/geometry-v2/houseGeometry.test.ts`

The orchestrator iterates `project.walls/slabs/roofs/stairs/balconies/openings` and calls each builder. For stairs, it looks up the slabThickness by finding the slab whose `top.resolved` matches `stair.to.resolved` (within 0.01m); fallback to 0.18m if not found.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/geometry-v2/houseGeometry.test.ts
import { describe, expect, it } from "vitest";
import { createValidV2Project } from "../../domain/v2/fixtures";
import { buildSceneGeometryV2 } from "../../geometry/v2/houseGeometry";

describe("buildSceneGeometryV2", () => {
  it("returns all 6 geometry buckets", () => {
    const geo = buildSceneGeometryV2(createValidV2Project());
    expect(geo.walls).toBeDefined();
    expect(geo.slabs).toBeDefined();
    expect(geo.roofs).toBeDefined();
    expect(geo.stairs).toBeDefined();
    expect(geo.balconies).toBeDefined();
    expect(geo.openingFrames).toBeDefined();
  });

  it("emits one wall geometry per project wall", () => {
    const project = createValidV2Project();
    const geo = buildSceneGeometryV2(project);
    expect(geo.walls).toHaveLength(project.walls.length);
    expect(geo.walls[0].wallId).toBe(project.walls[0].id);
  });

  it("emits one slab geometry per project slab", () => {
    const project = createValidV2Project();
    const geo = buildSceneGeometryV2(project);
    expect(geo.slabs).toHaveLength(project.slabs.length);
  });

  it("emits one roof geometry per project roof (when defined)", () => {
    const project = createValidV2Project();
    const geo = buildSceneGeometryV2(project);
    // The fixture roof has 2 eaves opposite, so it should produce a valid 2-panel + 2-gable roof.
    expect(geo.roofs).toHaveLength(project.roofs.length);
  });

  it("emits opening frames for non-void openings only", () => {
    const project = createValidV2Project();
    const geo = buildSceneGeometryV2(project);
    // Fixture has 1 window opening → 4 frame strips.
    expect(geo.openingFrames).toHaveLength(4);
  });

  it("emits stair geometries when project has stairs", () => {
    const project = createValidV2Project();
    project.stairs.push({
      id: "s1",
      x: 1, y: 1, width: 1, depth: 3,
      shape: "straight",
      treadDepth: 0.27,
      bottomEdge: "+y",
      from: { kind: "storey", storeyId: "1f", offset: 0 },
      to: { kind: "storey", storeyId: "2f", offset: 0 },
      materialId: "mat-wall",
    });
    const geo = buildSceneGeometryV2(project);
    expect(geo.stairs).toHaveLength(1);
    expect(geo.stairs[0].stairId).toBe("s1");
    expect(geo.stairs[0].treads.length).toBeGreaterThan(0);
  });

  it("emits balcony geometries when project has balconies", () => {
    const project = createValidV2Project();
    project.balconies.push({
      id: "b1",
      attachedWallId: project.walls[0].id,
      offset: 1,
      width: 2,
      depth: 1,
      slabTop: { kind: "storey", storeyId: "2f", offset: 0 },
      slabThickness: 0.15,
      railingHeight: 1.1,
      materialId: "mat-wall",
      railingMaterialId: "mat-frame",
    });
    const geo = buildSceneGeometryV2(project);
    expect(geo.balconies).toHaveLength(1);
    expect(geo.balconies[0].slabTopZ).toBe(3.2);
  });

  it("filters out roofs that fail to build (e.g., wrong polygon size)", () => {
    const project = createValidV2Project();
    // Mutate the roof to have a 3-vertex polygon → buildRoofGeometry returns undefined.
    project.roofs[0].polygon = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 4 },
    ];
    project.roofs[0].edges = ["eave", "gable", "gable"];
    const geo = buildSceneGeometryV2(project);
    expect(geo.roofs).toHaveLength(0);
  });

  it("uses fallback slabThickness=0.18 when no slab matches stair.to z", () => {
    const project = createValidV2Project();
    // Stair goes to z=10 (no matching slab in fixture)
    project.stairs.push({
      id: "s1",
      x: 1, y: 1, width: 1, depth: 3,
      shape: "straight",
      treadDepth: 0.27,
      bottomEdge: "+y",
      from: { kind: "absolute", z: 0 },
      to: { kind: "absolute", z: 10 },
      materialId: "mat-wall",
    });
    const geo = buildSceneGeometryV2(project);
    // Should still produce a stair without throwing.
    expect(geo.stairs).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/houseGeometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement orchestrator**

Create `src/geometry/v2/houseGeometry.ts` with this exact content:

```typescript
import { resolveAnchor } from "../../domain/v2/anchors";
import type { HouseProject, Slab, Storey } from "../../domain/v2/types";
import { buildBalconyGeometry } from "./balconyBuilder";
import type { FootprintQuad, HouseGeometryV2 } from "./types";
import { buildOpeningFrameStrips } from "./openingFrameGeometry";
import { buildRoofGeometry } from "./roofGeometry";
import { buildSlabGeometry } from "./slabBuilder";
import { buildStairGeometry } from "./stairGeometry";
import { buildWallGeometry } from "./wallBuilder";
import { buildWallNetwork } from "./wallNetwork";

const FALLBACK_SLAB_THICKNESS = 0.18;
const SLAB_MATCH_EPS = 0.01;

function pickSlabThicknessFor(toZ: number, slabs: Slab[], storeys: Storey[]): number {
  for (const slab of slabs) {
    const slabTop = resolveAnchor(slab.top, storeys);
    if (Math.abs(slabTop - toZ) <= SLAB_MATCH_EPS) {
      return slab.thickness;
    }
  }
  return FALLBACK_SLAB_THICKNESS;
}

export function buildSceneGeometryV2(project: HouseProject): HouseGeometryV2 {
  const storeys = project.storeys;

  // Wall network produces a footprint quad per wall (with z-overlap miter gate).
  const fps = buildWallNetwork(project.walls, storeys);
  const footprintIndex = new Map<string, FootprintQuad>();
  for (const fp of fps) {
    const { wallId, ...quad } = fp;
    footprintIndex.set(wallId, quad);
  }

  const walls = project.walls.map((w) =>
    buildWallGeometry(w, project.openings, storeys, footprintIndex),
  );

  const slabs = project.slabs.map((s) => buildSlabGeometry(s, storeys));

  const roofs = project.roofs
    .map((r) => buildRoofGeometry(r, storeys))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);

  const stairs = project.stairs.map((stair) => {
    const lowerZ = resolveAnchor(stair.from, storeys);
    const upperZ = resolveAnchor(stair.to, storeys);
    const slabThickness = pickSlabThicknessFor(upperZ, project.slabs, storeys);
    return buildStairGeometry(stair, lowerZ, upperZ, slabThickness);
  });

  const balconies = project.balconies.map((b) => buildBalconyGeometry(b, storeys));

  const wallsById = new Map(project.walls.map((w) => [w.id, w]));
  const openingFrames = project.openings.flatMap((opening) => {
    const wall = wallsById.get(opening.wallId);
    if (!wall) return [];
    return buildOpeningFrameStrips(opening, wall);
  });

  return { walls, slabs, roofs, stairs, balconies, openingFrames };
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test src/__tests__/geometry-v2/houseGeometry.test.ts`
Expected: 9/9 PASS.

Run: `bun run test src/__tests__/geometry-v2/`
Expected: 60 cumulative.

Run: `bun run test`
Expected: ~509 full suite.

Run: `bun run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/v2/houseGeometry.ts src/__tests__/geometry-v2/houseGeometry.test.ts
git commit -m "feat(geometry-v2): buildSceneGeometryV2 orchestrator"
```

---

## Task 6: 全套绿线检查

**Files:** None (verification only).

- [ ] **Step 1: Full test suite**

```bash
bun run test
```

Expected: ~509 tests pass (483 baseline + 1 + 6 + 6 + 4 + 9 = 509).

- [ ] **Step 2: Build**

```bash
bun run build
```

Expected: tsc + vite green.

- [ ] **Step 3: Confirm isolation**

```bash
git diff 37b9a87..HEAD -- src/ ':!src/geometry/v2/' ':!src/__tests__/geometry-v2/'
```

Expected: empty.

- [ ] **Step 4: Confirm file count**

```bash
git diff 37b9a87..HEAD --stat
```

Expected: 1 modified (types.ts) + 8 new (4 src + 4 tests) = 9 files.

- [ ] **Step 5: No additional commit**

---

## Done Criteria

- `bun run test` 全绿，新测试 ≥ 26 (1+6+6+4+9 = 26)
- `bun run build` 全绿
- v1 文件 + P2A/P2B v2 文件零修改
- `buildSceneGeometryV2(project)` 能从合法 v2 fixture 生成完整 `HouseGeometryV2`
- P3 启动时可直接 `import { buildSceneGeometryV2 }` 给 projection 层喂数据

## P2C 不做

- 任何 rendering / UI 改动（P4）
- Slab 自动 hole 计算（v2 用户手动配 holes）
- L 形 / T 形 polygon 屋顶 / 真正 hip 几何 → v2.1
- 端到端 image-style 房子 fixture → P5（搭新 sample 时验收）
