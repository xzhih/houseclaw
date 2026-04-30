# P2B: 扁平 3D 原型 — 楼板 + 屋顶几何 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `src/geometry/v2/` 下加入 slab + roof 子系统：`SlabGeometryV2/RoofPanel/RoofGable/RoofGeometryV2` 输出类型 + slabBuilder（polygon + holes 直接用） + roofGeometry 端口（5-case dispatcher 端口、吃 Roof.polygon 直接、删 wallId）。

**Architecture:** Slab 几乎零算法 —— v2 的 polygon/holes 已是用户授权的最终轮廓，builder 只做 anchor 解析和点拷贝。Roof 端口 v1 的 ~660 LOC 5-case dispatcher，但 ResolvedEdge 用 polygon 边索引代替 wallId、RoofGable 删 wallId 加 materialId、`buildRoofGeometry` 直接吃 `Roof.polygon`。

**Tech Stack:** TypeScript 5、vitest、bun。纯函数，零 THREE 依赖。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-flat-primitive-refactor-design.md` §2.3、§2.4、§4.2、§4.3。设计决策：**Q1 = A**（山墙三角片 materialId = roof.materialId，不绑定到墙）。

**v1 限制保留**：Roof.polygon 必须是 4 顶点。L 形 / T 形 polygon 留 v2.1。

**v1.1 简化**：`RoofEdgeKind = "hip"` 在 P2B 内**当作 "gable" 处理**（生成竖直三角片）。真正的 hip 几何（角部斜降）留 v2.1，那时同步实现 L 形屋顶 + straight skeleton。这条简化必须在 roof builder 文件顶部加 TODO 注释明示。

---

## File Structure

新建：

- `src/geometry/v2/slabBuilder.ts` — `buildSlabGeometry(slab, storeys) → SlabGeometryV2`
- `src/geometry/v2/roofGeometry.ts` — 端口 v1 roofGeometry.ts，吃 `Roof.polygon` 直接

修改：

- `src/geometry/v2/types.ts` — 追加 SlabGeometryV2、RoofPanel、RoofGable、RoofGeometryV2 类型

新建测试：

- `src/__tests__/geometry-v2/slabBuilder.test.ts`
- `src/__tests__/geometry-v2/roofGeometry.test.ts`

不动：所有 v1 文件、`src/domain/v2/*`、`src/geometry/v2/{footprintRing,wallNetwork,wallPanels,wallBuilder}.ts`。

P2B 结束后 `bun run test` 应有 **17 条新测试通过**（types 1 + slab 6 + roof 10），全套 ~483。

---

## Task 1: 输出类型扩展（slab + roof）

**Files:**
- Modify: `src/geometry/v2/types.ts` (append)
- Create: `src/__tests__/geometry-v2/slabRoofTypes.test.ts`

- [ ] **Step 1: Write failing smoke test**

```typescript
// src/__tests__/geometry-v2/slabRoofTypes.test.ts
import { describe, expect, it } from "vitest";
import type {
  RoofGable,
  RoofGeometryV2,
  RoofPanel,
  SlabGeometryV2,
} from "../../geometry/v2/types";

describe("v2 slab + roof output types", () => {
  it("compiles with valid object literals", () => {
    const slab: SlabGeometryV2 = {
      slabId: "s1",
      outline: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 4 },
        { x: 0, y: 4 },
      ],
      holes: [],
      topZ: 0,
      thickness: 0.15,
      materialId: "mat-slab",
    };

    const panel: RoofPanel = {
      vertices: [
        { x: 0, y: 0, z: 3.2 },
        { x: 6, y: 0, z: 3.2 },
        { x: 3, y: 2, z: 5 },
      ],
      materialId: "mat-roof",
    };

    const gable: RoofGable = {
      vertices: [
        { x: 0, y: 0, z: 3.2 },
        { x: 6, y: 0, z: 3.2 },
        { x: 3, y: 0, z: 5 },
      ],
      materialId: "mat-roof",
    };

    const roof: RoofGeometryV2 = {
      roofId: "r1",
      panels: [panel],
      gables: [gable],
    };

    expect(slab.outline).toHaveLength(4);
    expect(panel.vertices).toHaveLength(3);
    expect(gable.vertices).toHaveLength(3);
    expect(roof.panels).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/slabRoofTypes.test.ts`
Expected: FAIL — types not exported.

- [ ] **Step 3: Append types to `src/geometry/v2/types.ts`**

Open `src/geometry/v2/types.ts` and append at the end (after the existing `WallGeometryV2`):

```typescript

import type { Point3 } from "../../domain/v2/types";

export type SlabGeometryV2 = {
  slabId: string;
  /** Outer boundary polygon, CCW. Caller-validated by validateProject. */
  outline: Point2[];
  /** Inner holes; each polygon CW. Empty array when none. */
  holes: Point2[][];
  /** Resolved world z of the slab top face (resolveAnchor(slab.top, storeys)). */
  topZ: number;
  thickness: number;
  materialId: string;
  edgeMaterialId?: string;
};

/** Sloped roof panel, 3 or 4 Point3 vertices, CCW from outside. */
export type RoofPanel = {
  vertices: Point3[];
  materialId: string;
};

/** Vertical triangular extension above the wall top. CCW from outside.
 *  v2 drops the wallId binding (per design decision Q1=A) — gables use the
 *  parent roof's materialId. */
export type RoofGable = {
  vertices: Point3[];
  materialId: string;
};

export type RoofGeometryV2 = {
  roofId: string;
  panels: RoofPanel[];
  gables: RoofGable[];
};
```

(Keep the existing `WallGeometryV2` and earlier exports untouched. The added `import type { Point3 } from "../../domain/v2/types"` should sit at the top with the existing `Point2` import — adjust the existing import line to bring in `Point3` too instead of adding a second import. Final import line should read: `import type { Point2, Point3 } from "../../domain/v2/types";`)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/__tests__/geometry-v2/slabRoofTypes.test.ts`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```bash
git add src/geometry/v2/types.ts src/__tests__/geometry-v2/slabRoofTypes.test.ts
git commit -m "feat(geometry-v2): Slab + Roof output types"
```

---

## Task 2: slabBuilder

**Files:**
- Create: `src/geometry/v2/slabBuilder.ts`
- Create: `src/__tests__/geometry-v2/slabBuilder.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/geometry-v2/slabBuilder.test.ts
import { describe, expect, it } from "vitest";
import type { Slab, Storey } from "../../domain/v2/types";
import { buildSlabGeometry } from "../../geometry/v2/slabBuilder";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

function makeSlab(overrides?: Partial<Slab>): Slab {
  return {
    id: "slab-1",
    polygon: [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 0, y: 4 },
    ],
    top: { kind: "storey", storeyId: "1f", offset: 0 },
    thickness: 0.15,
    materialId: "mat-slab",
    ...overrides,
  };
}

describe("buildSlabGeometry v2", () => {
  it("resolves topZ from anchor and copies polygon as outline", () => {
    const geo = buildSlabGeometry(makeSlab(), STOREYS);
    expect(geo.slabId).toBe("slab-1");
    expect(geo.topZ).toBe(0);
    expect(geo.thickness).toBe(0.15);
    expect(geo.outline).toEqual([
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
      { x: 0, y: 4 },
    ]);
    expect(geo.holes).toEqual([]);
  });

  it("resolves storey-anchored top to elevation + offset", () => {
    const geo = buildSlabGeometry(
      makeSlab({ top: { kind: "storey", storeyId: "2f", offset: 0.05 } }),
      STOREYS,
    );
    expect(geo.topZ).toBeCloseTo(3.25);
  });

  it("supports absolute anchor", () => {
    const geo = buildSlabGeometry(
      makeSlab({ top: { kind: "absolute", z: 1.5 } }),
      STOREYS,
    );
    expect(geo.topZ).toBe(1.5);
  });

  it("copies holes when present (each as its own array)", () => {
    const slab = makeSlab({
      holes: [
        [
          { x: 1, y: 1 },
          { x: 1, y: 2 },
          { x: 2, y: 2 },
          { x: 2, y: 1 },
        ],
      ],
    });
    const geo = buildSlabGeometry(slab, STOREYS);
    expect(geo.holes).toHaveLength(1);
    expect(geo.holes[0]).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
    ]);
  });

  it("clones polygon points so mutating output does not affect input", () => {
    const slab = makeSlab();
    const geo = buildSlabGeometry(slab, STOREYS);
    geo.outline[0].x = 999;
    expect(slab.polygon[0].x).toBe(0);
  });

  it("propagates edgeMaterialId when present", () => {
    const slab = makeSlab({ edgeMaterialId: "mat-edge" });
    const geo = buildSlabGeometry(slab, STOREYS);
    expect(geo.edgeMaterialId).toBe("mat-edge");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/slabBuilder.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement slabBuilder**

Create `src/geometry/v2/slabBuilder.ts` with this exact content:

```typescript
import { resolveAnchor } from "../../domain/v2/anchors";
import type { Point2, Slab, Storey } from "../../domain/v2/types";
import type { SlabGeometryV2 } from "./types";

function clonePoint(p: Point2): Point2 {
  return { x: p.x, y: p.y };
}

export function buildSlabGeometry(slab: Slab, storeys: Storey[]): SlabGeometryV2 {
  return {
    slabId: slab.id,
    outline: slab.polygon.map(clonePoint),
    holes: (slab.holes ?? []).map((hole) => hole.map(clonePoint)),
    topZ: resolveAnchor(slab.top, storeys),
    thickness: slab.thickness,
    materialId: slab.materialId,
    edgeMaterialId: slab.edgeMaterialId,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/__tests__/geometry-v2/slabBuilder.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Run cumulative + build**

Run: `bun run test src/__tests__/geometry-v2/`
Expected: PASS — 24 tests (17 from P2A + 1 types + 6 slab).

Run: `bun run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/v2/slabBuilder.ts src/__tests__/geometry-v2/slabBuilder.test.ts
git commit -m "feat(geometry-v2): slabBuilder (polygon + holes anchor-resolved)"
```

---

## Task 3: roofGeometry — 端口 + Roof.polygon 直接吃 + 删 wallId

**Files:**
- Create: `src/geometry/v2/roofGeometry.ts` (via cp + extensive edits)
- Create: `src/__tests__/geometry-v2/roofGeometry.test.ts`

This is the largest task in P2B. Port v1 `src/geometry/roofGeometry.ts` (667 LOC), apply structural edits to swap `walls + topStorey + exteriorRing` input for `roof + storeys`, drop `wallId` from gables, and treat `"hip"` edge kind as `"gable"` (with TODO comment).

The 5 build functions (`buildShed`, `buildGable2Opp`, `buildCornerSlope2Adj`, `buildHalfHip3`, `buildHip4`) and all the math helpers (`eaveAxes`, `sideOfWall`/replacement, `liftToWorld`, `triangleAlong`, etc.) are preserved byte-for-byte. The only structural changes are at the input/output layer and `RoofGable` shape.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/geometry-v2/roofGeometry.test.ts
import { describe, expect, it } from "vitest";
import type { Roof, RoofEdgeKind, Storey } from "../../domain/v2/types";
import { buildRoofGeometry } from "../../geometry/v2/roofGeometry";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

function makeRoof(edges: RoofEdgeKind[], overrides?: Partial<Roof>): Roof {
  return {
    id: "roof-1",
    polygon: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 0, y: 6 },
    ],
    base: { kind: "storey", storeyId: "2f", offset: 0 },
    edges,
    pitch: Math.PI / 6, // 30°
    overhang: 0.5,
    materialId: "mat-roof",
    ...overrides,
  };
}

describe("buildRoofGeometry v2 — shed (1 eave + 3 gables)", () => {
  it("emits 1 panel and 3 gables", () => {
    const roof = makeRoof(["eave", "gable", "gable", "gable"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    expect(geo!.roofId).toBe("roof-1");
    expect(geo!.panels).toHaveLength(1);
    expect(geo!.gables).toHaveLength(3);
  });

  it("returns undefined when no edge resolves to eave", () => {
    const roof = makeRoof(["gable", "gable", "gable", "gable"]);
    expect(buildRoofGeometry(roof, STOREYS)).toBeUndefined();
  });

  it("returns undefined when polygon is not 4 vertices", () => {
    const roof: Roof = {
      ...makeRoof(["eave", "gable", "gable"]),
      polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 6 }],
    };
    expect(buildRoofGeometry(roof, STOREYS)).toBeUndefined();
  });

  it("uses roof.materialId for both panels and gables", () => {
    const roof = makeRoof(["eave", "gable", "gable", "gable"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo!.panels.every((p) => p.materialId === "mat-roof")).toBe(true);
    expect(geo!.gables.every((g) => g.materialId === "mat-roof")).toBe(true);
  });
});

describe("buildRoofGeometry v2 — gable (2 opposite eaves)", () => {
  it("emits 2 panels and 2 gables", () => {
    const roof = makeRoof(["eave", "gable", "eave", "gable"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    expect(geo!.panels).toHaveLength(2);
    expect(geo!.gables).toHaveLength(2);
  });
});

describe("buildRoofGeometry v2 — hip (4 eaves)", () => {
  it("emits 4 panels and 0 gables", () => {
    const roof = makeRoof(["eave", "eave", "eave", "eave"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    expect(geo!.panels).toHaveLength(4);
    expect(geo!.gables).toHaveLength(0);
  });
});

describe("buildRoofGeometry v2 — half-hip (3 eaves + 1 gable)", () => {
  it("emits 3 panels and 1 gable", () => {
    const roof = makeRoof(["eave", "eave", "gable", "eave"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    expect(geo!.panels).toHaveLength(3);
    expect(geo!.gables).toHaveLength(1);
  });
});

describe("buildRoofGeometry v2 — corner slope (2 adjacent eaves)", () => {
  it("emits 2 panels and 2 gables", () => {
    const roof = makeRoof(["eave", "eave", "gable", "gable"]);
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    expect(geo!.panels).toHaveLength(2);
    expect(geo!.gables).toHaveLength(2);
  });
});

describe("buildRoofGeometry v2 — hip edge as gable (P2B simplification)", () => {
  it("treats 'hip' as 'gable' for now", () => {
    // 1 eave + 3 hip should produce same shape as 1 eave + 3 gable (shed with
    // vertical gable triangles). v2.1 will implement true hip geometry.
    const eaveGable = buildRoofGeometry(makeRoof(["eave", "gable", "gable", "gable"]), STOREYS)!;
    const eaveHip = buildRoofGeometry(makeRoof(["eave", "hip", "hip", "hip"]), STOREYS)!;
    expect(eaveHip.panels).toHaveLength(eaveGable.panels.length);
    expect(eaveHip.gables).toHaveLength(eaveGable.gables.length);
  });
});

describe("buildRoofGeometry v2 — base anchor resolution", () => {
  it("resolves base anchor to wallTopZ", () => {
    const roof = makeRoof(["eave", "gable", "eave", "gable"], {
      base: { kind: "absolute", z: 5.0 },
    });
    const geo = buildRoofGeometry(roof, STOREYS);
    expect(geo).toBeDefined();
    // Eave panels' lower edge sits at base z = 5.0
    const lowZ = Math.min(...geo!.panels.flatMap((p) => p.vertices.map((v) => v.z)));
    expect(lowZ).toBeCloseTo(5.0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/geometry-v2/roofGeometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Copy v1 roofGeometry to v2 path**

```bash
cp src/geometry/roofGeometry.ts src/geometry/v2/roofGeometry.ts
```

- [ ] **Step 4: Apply edits in `src/geometry/v2/roofGeometry.ts`**

**Edit 4a — Replace imports.** The file's first line currently reads:

```typescript
import type { Point2, Point3, Roof, Storey, Wall } from "../domain/types";
```

Replace with:

```typescript
import { resolveAnchor } from "../../domain/v2/anchors";
import type { Point2, Point3, Roof, RoofEdgeKind, Storey } from "../../domain/v2/types";
import type { RoofGable, RoofGeometryV2, RoofPanel } from "./types";
```

(Note: `Wall` is no longer needed.)

**Edit 4b — Remove the v1 type re-declarations.** Find and DELETE these blocks (they're now in `./types`):

```typescript
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
```

Replace with NOTHING (just delete). The new types come from `./types` via the import added in 4a.

**Edit 4c — Update `ResolvedEdge` type.** Find the current definition:

```typescript
type ResolvedEdge = {
  wallId: string;
  side: "front" | "right" | "back" | "left"; // canonical role on axis-aligned rect
  kind: "eave" | "gable";
};
```

Replace with:

```typescript
type ResolvedEdge = {
  edgeIndex: number;
  side: "front" | "right" | "back" | "left";
  kind: "eave" | "gable";
};
```

(`edgeIndex` replaces `wallId`; `kind` stays "eave" | "gable" since hip is collapsed to gable in 4f.)

**Edit 4d — Add a TODO at the top of the file** (right after the import block):

```typescript
// v1 limit: Roof.polygon must be 4 vertices (axis-aligned rect after bbox).
// v1.1 simplification: edge kind "hip" is treated as "gable" — produces
// a vertical triangular gable end instead of the proper diagonal hip slope.
// True per-edge hip geometry will land alongside L/T-shape polygons in v2.1
// (straight skeleton). See plan 2026-04-30-p2b-flat-primitive-slab-roof.md.
```

**Edit 4e — Rewrite `buildRoofGeometry` signature and body.** Find:

```typescript
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
    case 2: {
      const eaves = resolved.filter((e) => e.kind === "eave");
      if (eaves[0].side === oppositeSide(eaves[1].side)) {
        return buildGable2Opp(resolved, outer, wallTopZ, slope, roof.materialId);
      }
      return buildCornerSlope2Adj(resolved, outer, wallTopZ, slope, roof.materialId);
    }
    case 3:
      return buildHalfHip3(resolved, outer, wallTopZ, slope, roof.materialId);
    case 4:
      return buildHip4(resolved, outer, wallTopZ, slope, roof.materialId);
    default:
      // Other cases added in later tasks.
      return undefined;
  }
}
```

Replace with:

```typescript
export function buildRoofGeometry(
  roof: Roof,
  storeys: Storey[],
): RoofGeometryV2 | undefined {
  if (roof.polygon.length !== 4) return undefined;
  const resolved = resolveEdges(roof.polygon, roof.edges);
  if (!resolved) return undefined;
  if (!resolved.some((e) => e.kind === "eave")) return undefined;

  const wallTopZ = resolveAnchor(roof.base, storeys);
  const rect = bbox(roof.polygon);
  if (!rect) return undefined;
  const outer = expandRect(rect, roof.overhang);
  const slope = Math.tan(roof.pitch);

  // Dispatch by eave count + adjacency.
  const eaveCount = resolved.filter((e) => e.kind === "eave").length;
  let result: { panels: RoofPanel[]; gables: RoofGable[] } | undefined;
  switch (eaveCount) {
    case 1:
      result = buildShed(resolved, outer, wallTopZ, slope, roof.materialId);
      break;
    case 2: {
      const eaves = resolved.filter((e) => e.kind === "eave");
      if (eaves[0].side === oppositeSide(eaves[1].side)) {
        result = buildGable2Opp(resolved, outer, wallTopZ, slope, roof.materialId);
      } else {
        result = buildCornerSlope2Adj(resolved, outer, wallTopZ, slope, roof.materialId);
      }
      break;
    }
    case 3:
      result = buildHalfHip3(resolved, outer, wallTopZ, slope, roof.materialId);
      break;
    case 4:
      result = buildHip4(resolved, outer, wallTopZ, slope, roof.materialId);
      break;
    default:
      return undefined;
  }
  if (!result) return undefined;
  return { roofId: roof.id, panels: result.panels, gables: result.gables };
}
```

**Edit 4f — Rewrite `resolveEdges`.** Find the v1 implementation:

```typescript
function resolveEdges(walls: Wall[], ring: Point2[], roof: Roof): ResolvedEdge[] | undefined {
  if (walls.length !== 4) return undefined;
  if (!walls.every((w) => w.exterior)) return undefined;

  if (!bbox(ring)) return undefined;
  // Side detection compares wall centerlines, so build the bbox from the
  // centerlines themselves — the exterior ring sits half a wall-thickness
  // outside, which would push every wall outside RECT_TOL.
  const rect = wallCenterlineBbox(walls);
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
```

Replace with:

```typescript
function resolveEdges(
  polygon: Point2[],
  edges: RoofEdgeKind[],
): ResolvedEdge[] | undefined {
  if (polygon.length !== 4 || edges.length !== 4) return undefined;
  const rect = bbox(polygon);
  if (!rect) return undefined;

  const sided = polygon.map<ResolvedEdge | undefined>((p, i) => {
    const next = polygon[(i + 1) % polygon.length];
    const side = sideOfEdge(p, next, rect);
    if (!side) return undefined;
    const tag = edges[i];
    // v1.1 simplification: "hip" → "gable".
    const kind: "eave" | "gable" = tag === "eave" ? "eave" : "gable";
    return { edgeIndex: i, side, kind };
  });

  if (sided.some((s) => !s)) return undefined;
  const sides = new Set(sided.map((s) => s!.side));
  if (sides.size !== 4) return undefined;
  return sided as ResolvedEdge[];
}
```

**Edit 4g — Replace `wallCenterlineBbox` and `sideOfWall` with `sideOfEdge`.** Delete these v1 functions:

```typescript
function wallCenterlineBbox(walls: Wall[]): Rect | undefined {
  if (walls.length === 0) return undefined;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const w of walls) {
    xs.push(w.start.x, w.end.x);
    ys.push(w.start.y, w.end.y);
  }
  return { xMin: Math.min(...xs), xMax: Math.max(...xs), yMin: Math.min(...ys), yMax: Math.max(...ys) };
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
```

Replace with this single new helper:

```typescript
function sideOfEdge(a: Point2, b: Point2, rect: Rect): ResolvedEdge["side"] | undefined {
  const horizontal = Math.abs(b.y - a.y) < RECT_TOL;
  const vertical = Math.abs(b.x - a.x) < RECT_TOL;
  if (horizontal === vertical) return undefined;
  if (horizontal) {
    if (Math.abs(a.y - rect.yMin) < RECT_TOL) return "front";
    if (Math.abs(a.y - rect.yMax) < RECT_TOL) return "back";
    return undefined;
  }
  if (Math.abs(a.x - rect.xMax) < RECT_TOL) return "right";
  if (Math.abs(a.x - rect.xMin) < RECT_TOL) return "left";
  return undefined;
}
```

**Edit 4h — Strip `wallId` from gable construction in build functions.** Find every occurrence of `wallId: <something>,` inside `RoofGable` literals (there are several, in `buildShed`, `buildGable2Opp`, `buildHalfHip3`, `buildCornerSlope2Adj`). Each construction looks like:

```typescript
gables.push({
  wallId: opposite.wallId,
  vertices: triangleAlong(...)
});
```

or

```typescript
{ wallId: gable.wallId, vertices: ... }
```

Replace EACH occurrence: remove the `wallId: ...,` line and add `materialId,` (using the existing `materialId` parameter which is `roof.materialId`).

Specifically the build functions all have `materialId` as a parameter — verify and add it to each gable literal.

**Pattern**: change `{ wallId: X.wallId, vertices: Y }` to `{ materialId, vertices: Y }`. Apply this to every gable construction in the file. Hunt with `grep -n "wallId" src/geometry/v2/roofGeometry.ts` after the edit — it should return zero hits.

**Edit 4i — Verify return type alignment.** The 5 build functions in v1 return `RoofGeometry`. In v2 their return type is now an inline `{ panels: RoofPanel[]; gables: RoofGable[] }` (not `RoofGeometryV2` because the outer caller adds `roofId`). If any function explicitly types its return as `RoofGeometry`, change it to the inline shape. Each function's signature should look like:

```typescript
function buildShed(
  edges: ResolvedEdge[],
  outer: Rect,
  wallTopZ: number,
  slope: number,
  materialId: string,
): { panels: RoofPanel[]; gables: RoofGable[] } {
```

Also the explicit return type `RoofGeometry` on each function declaration must be updated. There are 5 such functions: `buildShed`, `buildGable2Opp`, `buildHalfHip3`, `buildHip4`, `buildCornerSlope2Adj`.

After edit, run `grep -n "RoofGeometry" src/geometry/v2/roofGeometry.ts` — should return zero (only `RoofGeometryV2` lives in `./types`, the imported name).

- [ ] **Step 5: Run tests**

```bash
bun run test src/__tests__/geometry-v2/roofGeometry.test.ts
```

Expected: 10 tests pass (4 shed + 1 gable + 1 hip + 1 half-hip + 1 corner-slope + 1 hip-as-gable + 1 base-anchor = 10).

If failures occur:
- **"resolveEdges returns undefined"**: side classification for the polygon edges is failing. Check that `polygon` is truly axis-aligned and `bbox` matches your test's expectations. The v2 test uses polygon `[(0,0), (10,0), (10,6), (0,6)]` with bbox `{xMin:0, xMax:10, yMin:0, yMax:6}`. Each edge midpoint should resolve to a unique side.
- **wallId references remaining**: re-grep and fix.
- **Type errors after edit 4i**: the inline return type must match `{ panels: RoofPanel[]; gables: RoofGable[] }` exactly.

- [ ] **Step 6: Run full suite + build**

```bash
bun run test
```

Expected: ~478 total tests pass (449 baseline + 17 P2A + 1 P2B types + 6 slab + 11 roof = 484 cumulative; allow ±2 for any test discovery quirks).

```bash
bun run build
```

Expected: tsc + vite green.

- [ ] **Step 7: Commit**

```bash
git add src/geometry/v2/roofGeometry.ts src/__tests__/geometry-v2/roofGeometry.test.ts
git commit -m "feat(geometry-v2): roofGeometry (Roof.polygon direct, drops wallId)"
```

---

## Task 4: 全套绿线检查

**Files:** None (verification only).

- [ ] **Step 1: Full test suite**

```bash
bun run test
```

Expected: green; ~480+ tests pass.

- [ ] **Step 2: Type check + build**

```bash
bun run build
```

Expected: tsc clean, vite green.

- [ ] **Step 3: Confirm isolation**

```bash
git diff 490649b..HEAD -- src/ ':!src/geometry/v2/' ':!src/__tests__/geometry-v2/'
```

Expected: empty. (490649b is P2A's last commit; everything after is P2B.)

- [ ] **Step 4: Confirm file count**

```bash
git diff 490649b..HEAD --stat
```

Expected: 5 modified/added files
- `src/geometry/v2/types.ts` (modified, +47)
- `src/geometry/v2/slabBuilder.ts` (added)
- `src/geometry/v2/roofGeometry.ts` (added)
- `src/__tests__/geometry-v2/slabRoofTypes.test.ts` (added)
- `src/__tests__/geometry-v2/slabBuilder.test.ts` (added)
- `src/__tests__/geometry-v2/roofGeometry.test.ts` (added)

(That's 6 files actually: 1 modified + 5 added.)

- [ ] **Step 5: No additional commit needed**

P2B complete via Tasks 1-3 commits.

---

## Done Criteria

- `bun run test` 全绿，新测试 ≥ 17 条覆盖 slab + roof
- `bun run build` 全绿
- v1 文件 + P2A v2 文件零修改
- `src/geometry/v2/{slabBuilder,roofGeometry}.ts` 新增并 self-contained
- 后续 P2C 启动时可直接 `import { buildSlabGeometry, buildRoofGeometry }`

## P2B 不做（明确边界）

- Opening frame / Stair / Balcony builder（P2C）
- `buildSceneGeometryV2` 顶层装配（P2C）
- 任何 rendering / UI 改动（P4）
- 真正的 hip geometry（"hip" 当 "gable" 处理） → v2.1
- L 形 / T 形 polygon 屋顶 → v2.1
- 4-vert 之外的 polygon 形状 → v2.1
