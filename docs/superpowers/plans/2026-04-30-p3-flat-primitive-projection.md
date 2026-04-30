# P3: 扁平 3D 原型 — 投影系统重写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `src/projection/v2/` 下立起 plan / elevation / roof view 三套投影：plan 改"水平切片 @ cutZ = storey.elevation + 1.2m"，elevation 改"全屋外墙按朝向过滤，每面墙带 depth tag 让渲染层 z-sort"，新增 roof view（俯视图 + edge kind 区分）。

**Architecture:** 三个独立的纯函数 `projectPlanV2 / projectElevationV2 / projectRoofViewV2`，各自吃 `HouseProject` 输出对应 Scene 数据结构（2D 图元 + 标签）。投影层不依赖 geometry 层（直接从 domain types 派生），保持纯度。

**Tech Stack:** TypeScript 5、vitest、bun。纯函数。零 THREE 依赖。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-flat-primitive-refactor-design.md` §3。

**关键决策：**
- Plan view 真正水平切片，按 `cutZ` 过滤 walls/openings/balconies/stairs/slabs（spec §3.1）
- Elevation 整栋一起，**只看 exterior 墙的"朝向过滤"**（front/back = 横向墙；left/right = 纵向墙）；每面墙带 `depth` 字段（沿视线方向的有符号距离）让 P4 渲染层做 z-sort
- Roof view 显示**所有 roofs[]** polygon + 屋脊线 + edge kind（"eave" | "gable" | "hip"），edge kind 让渲染层选不同笔触
- v2 投影**不带 skirts**（已在 P2B merge 进 Roof）
- v2 投影**不带 storeyId 字段**（v2 walls 没这概念；plan view 的"在 1F"靠水平切片 z 区间过滤判定）

---

## File Structure

新建：

- `src/projection/v2/types.ts` — Scene 类型（PlanProjectionV2 / ElevationProjectionV2 / RoofViewProjectionV2 + 子类型）
- `src/projection/v2/plan.ts` — `projectPlanV2(project, storeyId)`
- `src/projection/v2/elevation.ts` — `projectElevationV2(project, side)`
- `src/projection/v2/roofView.ts` — `projectRoofViewV2(project)`

新建测试：

- `src/__tests__/projection-v2/types.test.ts`
- `src/__tests__/projection-v2/plan.test.ts`
- `src/__tests__/projection-v2/elevation.test.ts`
- `src/__tests__/projection-v2/roofView.test.ts`

不动：所有 v1 文件、`src/domain/v2/*`、`src/geometry/v2/*`。

P3 结束后 `bun run test` 应有 **25+ 条新测试通过**，全套 ~534+。

---

## Task 1: v2 投影输出类型

**Files:**
- Create: `src/projection/v2/types.ts`
- Create: `src/__tests__/projection-v2/types.test.ts`

- [ ] **Step 1: Write failing smoke test**

```typescript
// src/__tests__/projection-v2/types.test.ts
import { describe, expect, it } from "vitest";
import type {
  ElevationProjectionV2,
  ElevationSide,
  ElevationWallBandV2,
  PlanProjectionV2,
  PlanWallSegmentV2,
  RoofViewEdgeStroke,
  RoofViewPolygon,
  RoofViewProjectionV2,
} from "../../projection/v2/types";

describe("v2 projection types", () => {
  it("compiles with valid object literals", () => {
    const wallSeg: PlanWallSegmentV2 = {
      wallId: "w1",
      start: { x: 0, y: 0 },
      end: { x: 6, y: 0 },
      thickness: 0.2,
    };

    const plan: PlanProjectionV2 = {
      viewId: "plan-1f",
      storeyId: "1f",
      cutZ: 1.2,
      wallSegments: [wallSeg],
      slabOutlines: [],
      openings: [],
      balconies: [],
      stairs: [],
    };

    const wallBand: ElevationWallBandV2 = {
      wallId: "w1",
      x: 0,
      y: 0,
      width: 6,
      height: 3.2,
      depth: 0,
    };

    const side: ElevationSide = "front";
    const elevation: ElevationProjectionV2 = {
      viewId: "elevation-front",
      side,
      wallBands: [wallBand],
      slabLines: [],
      openings: [],
      balconies: [],
      roofPolygons: [],
    };

    const edge: RoofViewEdgeStroke = {
      from: { x: 0, y: 0 },
      to: { x: 6, y: 0 },
      kind: "eave",
    };

    const polygon: RoofViewPolygon = {
      roofId: "r1",
      vertices: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 4 },
        { x: 0, y: 4 },
      ],
      edges: [edge],
      ridgeLines: [],
    };

    const roofView: RoofViewProjectionV2 = {
      viewId: "roof",
      polygons: [polygon],
    };

    expect(plan.cutZ).toBe(1.2);
    expect(elevation.side).toBe("front");
    expect(roofView.polygons).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/projection-v2/types.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement types**

Create `src/projection/v2/types.ts` with this exact content:

```typescript
import type { OpeningType, Point2 } from "../../domain/v2/types";

// ──────────────────── Plan view ────────────────────

export type PlanViewId = `plan-${string}`;

export type PlanWallSegmentV2 = {
  wallId: string;
  start: Point2;
  end: Point2;
  thickness: number;
};

export type PlanSlabOutline = {
  slabId: string;
  /** Outer polygon, CCW. */
  outline: Point2[];
  /** Inner holes (CW each), if any. */
  holes: Point2[][];
  /** "floor" = the slab the user is standing on for this storey;
   *  "intermediate" = a slab that's neither floor nor ceiling but the cutZ
   *  passes through its thickness — rare but possible. */
  role: "floor" | "intermediate";
};

export type PlanOpeningGlyphV2 = {
  openingId: string;
  wallId: string;
  type: OpeningType;
  offset: number;
  width: number;
};

export type PlanBalconyGlyphV2 = {
  balconyId: string;
  wallId: string;
  offset: number;
  width: number;
  depth: number;
};

export type PlanStairSymbolV2 = {
  stairId: string;
  rect: { x: number; y: number; width: number; depth: number };
  shape: "straight" | "l" | "u";
  bottomEdge: "+x" | "-x" | "+y" | "-y";
  treadDepth: number;
  /** Total tread count derived from climb / riser-target. */
  treadCount: number;
  turn?: "left" | "right";
  rotation: number;
  center: { x: number; y: number };
};

export type PlanProjectionV2 = {
  viewId: PlanViewId;
  storeyId: string;
  /** Horizontal cut-plane elevation = storey.elevation + PLAN_CUT_HEIGHT. */
  cutZ: number;
  wallSegments: PlanWallSegmentV2[];
  slabOutlines: PlanSlabOutline[];
  openings: PlanOpeningGlyphV2[];
  balconies: PlanBalconyGlyphV2[];
  stairs: PlanStairSymbolV2[];
};

// ──────────────────── Elevation view ────────────────────

export type ElevationSide = "front" | "back" | "left" | "right";
export type ElevationViewId = `elevation-${ElevationSide}`;

export type ElevationWallBandV2 = {
  wallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Perpendicular distance along the view axis. Lower = closer to viewer.
   *  Renderer paints in descending depth (back-to-front) for occlusion. */
  depth: number;
};

export type ElevationOpeningRectV2 = {
  openingId: string;
  wallId: string;
  type: OpeningType;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
};

export type ElevationBalconyRectV2 = {
  balconyId: string;
  wallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
};

export type ElevationSlabLine = {
  slabId: string;
  /** Horizontal segment at the slab top in (x, z). */
  start: Point2;
  end: Point2;
  thickness: number;
  depth: number;
};

export type ElevationRoofPolygonV2 = {
  roofId: string;
  vertices: Point2[];
  kind: "panel" | "gable";
  depth: number;
};

export type ElevationProjectionV2 = {
  viewId: ElevationViewId;
  side: ElevationSide;
  wallBands: ElevationWallBandV2[];
  slabLines: ElevationSlabLine[];
  openings: ElevationOpeningRectV2[];
  balconies: ElevationBalconyRectV2[];
  roofPolygons: ElevationRoofPolygonV2[];
};

// ──────────────────── Roof view ────────────────────

export type RoofViewEdgeKind = "eave" | "gable" | "hip";

export type RoofViewEdgeStroke = {
  from: Point2;
  to: Point2;
  kind: RoofViewEdgeKind;
};

export type RoofViewRidgeLine = {
  from: Point2;
  to: Point2;
};

export type RoofViewPolygon = {
  roofId: string;
  vertices: Point2[];
  edges: RoofViewEdgeStroke[];
  ridgeLines: RoofViewRidgeLine[];
};

export type RoofViewProjectionV2 = {
  viewId: "roof";
  polygons: RoofViewPolygon[];
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/__tests__/projection-v2/types.test.ts`
Expected: PASS — 1 test.

- [ ] **Step 5: Build**

Run: `bun run build`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/projection/v2/types.ts src/__tests__/projection-v2/types.test.ts
git commit -m "feat(projection-v2): output types (Plan/Elevation/RoofView)"
```

---

## Task 2: planProjection — 水平切片

**Files:**
- Create: `src/projection/v2/plan.ts`
- Create: `src/__tests__/projection-v2/plan.test.ts`

The water-cut: `cutZ = storey.elevation + PLAN_CUT_HEIGHT (= 1.2m)`. Filters by anchor-resolved wall vertical extents and slab elevations.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/projection-v2/plan.test.ts
import { describe, expect, it } from "vitest";
import type { HouseProject, Wall } from "../../domain/v2/types";
import { createValidV2Project } from "../../domain/v2/fixtures";
import { PLAN_CUT_HEIGHT, projectPlanV2 } from "../../projection/v2/plan";

describe("projectPlanV2", () => {
  it("returns viewId, storeyId, cutZ", () => {
    const project = createValidV2Project();
    const view = projectPlanV2(project, "1f");
    expect(view.viewId).toBe("plan-1f");
    expect(view.storeyId).toBe("1f");
    expect(view.cutZ).toBeCloseTo(1.2);
  });

  it("includes walls whose [bottomZ, topZ] interval contains cutZ", () => {
    const project = createValidV2Project();
    const view = projectPlanV2(project, "1f");
    // All 4 fixture walls span 1F (z=0) to 2F (z=3.2); cutZ=1.2 is in range.
    expect(view.wallSegments).toHaveLength(4);
  });

  it("excludes walls whose vertical extent does not include cutZ", () => {
    const project = createValidV2Project();
    // Drop one wall to z=[2, 2.5] — totally above cutZ=1.2.
    project.walls[0].bottom = { kind: "absolute", z: 2 };
    project.walls[0].top = { kind: "absolute", z: 2.5 };
    const view = projectPlanV2(project, "1f");
    expect(view.wallSegments).toHaveLength(3);
    expect(view.wallSegments.find((w) => w.wallId === project.walls[0].id)).toBeUndefined();
  });

  it("includes a slab as 'floor' role when its top resolves to storey elevation", () => {
    const project = createValidV2Project();
    const view = projectPlanV2(project, "1f");
    // Fixture has one slab anchored at 1F top (= 0m), which equals storey elevation 0.
    expect(view.slabOutlines).toHaveLength(1);
    expect(view.slabOutlines[0].role).toBe("floor");
    expect(view.slabOutlines[0].outline).toHaveLength(4);
  });

  it("propagates slab holes into the projection", () => {
    const project = createValidV2Project();
    project.slabs[0].holes = [
      [
        { x: 1, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 2, y: 1 },
      ],
    ];
    const view = projectPlanV2(project, "1f");
    expect(view.slabOutlines[0].holes).toHaveLength(1);
  });

  it("includes openings whose parent wall is in the cut", () => {
    const project = createValidV2Project();
    const view = projectPlanV2(project, "1f");
    // Fixture has 1 opening on w-front; the wall is in the cut.
    expect(view.openings).toHaveLength(1);
    expect(view.openings[0].openingId).toBe("opening-front-window");
  });

  it("excludes openings whose parent wall is filtered out", () => {
    const project = createValidV2Project();
    // Push wall above the cutZ.
    const target = project.walls.find((w) => w.id === "w-front")!;
    target.bottom = { kind: "absolute", z: 2 };
    target.top = { kind: "absolute", z: 2.5 };
    const view = projectPlanV2(project, "1f");
    expect(view.openings).toHaveLength(0);
  });

  it("includes balconies whose slabTop resolves to this storey's elevation", () => {
    const project = createValidV2Project();
    project.balconies.push({
      id: "b1",
      attachedWallId: project.walls[0].id,
      offset: 1,
      width: 2,
      depth: 1,
      slabTop: { kind: "storey", storeyId: "1f", offset: 0 },
      slabThickness: 0.15,
      railingHeight: 1.1,
      materialId: "mat-wall",
      railingMaterialId: "mat-frame",
    });
    const view = projectPlanV2(project, "1f");
    expect(view.balconies).toHaveLength(1);
  });

  it("excludes balconies whose slabTop resolves to a different storey", () => {
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
    const view1F = projectPlanV2(project, "1f");
    const view2F = projectPlanV2(project, "2f");
    expect(view1F.balconies).toHaveLength(0);
    expect(view2F.balconies).toHaveLength(1);
  });

  it("includes stairs whose 'from' resolves to this storey", () => {
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
    const view = projectPlanV2(project, "1f");
    expect(view.stairs).toHaveLength(1);
    expect(view.stairs[0].stairId).toBe("s1");
  });

  it("excludes stairs not starting at this storey", () => {
    const project = createValidV2Project();
    project.stairs.push({
      id: "s1",
      x: 1, y: 1, width: 1, depth: 3,
      shape: "straight",
      treadDepth: 0.27,
      bottomEdge: "+y",
      from: { kind: "storey", storeyId: "2f", offset: 0 },
      to: { kind: "absolute", z: 6.4 },
      materialId: "mat-wall",
    });
    const view = projectPlanV2(project, "1f");
    expect(view.stairs).toHaveLength(0);
  });

  it("returns empty arrays gracefully when project storey doesn't exist", () => {
    const project = createValidV2Project();
    const view = projectPlanV2(project, "ghost");
    expect(view.wallSegments).toHaveLength(0);
    expect(view.slabOutlines).toHaveLength(0);
    expect(view.cutZ).toBe(0); // fallback when storey not found
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/projection-v2/plan.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement plan projection**

Create `src/projection/v2/plan.ts` with this exact content:

```typescript
import { resolveAnchor } from "../../domain/v2/anchors";
import type { HouseProject, Storey } from "../../domain/v2/types";
import { computeStairConfig } from "../../domain/stairs";
import type {
  PlanBalconyGlyphV2,
  PlanOpeningGlyphV2,
  PlanProjectionV2,
  PlanSlabOutline,
  PlanStairSymbolV2,
  PlanWallSegmentV2,
} from "./types";

export const PLAN_CUT_HEIGHT = 1.2;
const STOREY_MATCH_EPS = 0.05;
const FALLBACK_SLAB_THICKNESS = 0.18;

function getStorey(project: HouseProject, storeyId: string): Storey | undefined {
  return project.storeys.find((s) => s.id === storeyId);
}

export function projectPlanV2(project: HouseProject, storeyId: string): PlanProjectionV2 {
  const storey = getStorey(project, storeyId);
  if (!storey) {
    return {
      viewId: `plan-${storeyId}`,
      storeyId,
      cutZ: 0,
      wallSegments: [],
      slabOutlines: [],
      openings: [],
      balconies: [],
      stairs: [],
    };
  }

  const cutZ = storey.elevation + PLAN_CUT_HEIGHT;
  const storeys = project.storeys;

  // Walls whose vertical extent contains cutZ.
  const visibleWalls = project.walls.filter((wall) => {
    const bz = resolveAnchor(wall.bottom, storeys);
    const tz = resolveAnchor(wall.top, storeys);
    return bz <= cutZ && cutZ <= tz;
  });
  const visibleWallIds = new Set(visibleWalls.map((w) => w.id));

  const wallSegments: PlanWallSegmentV2[] = visibleWalls.map((w) => ({
    wallId: w.id,
    start: { ...w.start },
    end: { ...w.end },
    thickness: w.thickness,
  }));

  // Slabs:
  //   - "floor" if top.resolved ≈ storey.elevation.
  //   - "intermediate" if top.resolved is between (storey.elevation, cutZ + thickness)
  //     AND the slab's thickness range contains cutZ — rare, used for mezzanine tags.
  const slabOutlines: PlanSlabOutline[] = [];
  for (const slab of project.slabs) {
    const top = resolveAnchor(slab.top, storeys);
    const bottom = top - slab.thickness;
    if (Math.abs(top - storey.elevation) <= STOREY_MATCH_EPS) {
      slabOutlines.push({
        slabId: slab.id,
        outline: slab.polygon.map((p) => ({ ...p })),
        holes: (slab.holes ?? []).map((hole) => hole.map((p) => ({ ...p }))),
        role: "floor",
      });
    } else if (bottom <= cutZ && cutZ <= top) {
      slabOutlines.push({
        slabId: slab.id,
        outline: slab.polygon.map((p) => ({ ...p })),
        holes: (slab.holes ?? []).map((hole) => hole.map((p) => ({ ...p }))),
        role: "intermediate",
      });
    }
  }

  const openings: PlanOpeningGlyphV2[] = project.openings
    .filter((o) => visibleWallIds.has(o.wallId))
    .map((o) => ({
      openingId: o.id,
      wallId: o.wallId,
      type: o.type,
      offset: o.offset,
      width: o.width,
    }));

  const balconies: PlanBalconyGlyphV2[] = project.balconies
    .filter((b) => Math.abs(resolveAnchor(b.slabTop, storeys) - storey.elevation) <= STOREY_MATCH_EPS)
    .map((b) => ({
      balconyId: b.id,
      wallId: b.attachedWallId,
      offset: b.offset,
      width: b.width,
      depth: b.depth,
    }));

  const stairs: PlanStairSymbolV2[] = [];
  for (const stair of project.stairs) {
    const fromZ = resolveAnchor(stair.from, storeys);
    if (Math.abs(fromZ - storey.elevation) > STOREY_MATCH_EPS) continue;
    const toZ = resolveAnchor(stair.to, storeys);
    const climb = toZ - fromZ;
    // Need slabThickness for tread count; pick from a slab whose top ≈ toZ, fallback 0.18.
    let slabThickness = FALLBACK_SLAB_THICKNESS;
    for (const slab of project.slabs) {
      if (Math.abs(resolveAnchor(slab.top, storeys) - toZ) <= STOREY_MATCH_EPS) {
        slabThickness = slab.thickness;
        break;
      }
    }
    const cfg = computeStairConfig(climb, slabThickness, stair.treadDepth);
    stairs.push({
      stairId: stair.id,
      rect: { x: stair.x, y: stair.y, width: stair.width, depth: stair.depth },
      shape: stair.shape,
      bottomEdge: stair.bottomEdge,
      treadDepth: stair.treadDepth,
      treadCount: cfg.treadCount,
      turn: stair.turn,
      rotation: stair.rotation ?? 0,
      center: {
        x: stair.x + stair.width / 2,
        y: stair.y + stair.depth / 2,
      },
    });
  }

  return {
    viewId: `plan-${storeyId}`,
    storeyId,
    cutZ,
    wallSegments,
    slabOutlines,
    openings,
    balconies,
    stairs,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test src/__tests__/projection-v2/plan.test.ts`
Expected: 12/12 PASS.

Run: `bun run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/projection/v2/plan.ts src/__tests__/projection-v2/plan.test.ts
git commit -m "feat(projection-v2): plan view with horizontal slice"
```

---

## Task 3: elevationProjection — 全屋朝向过滤 + depth tag

**Files:**
- Create: `src/projection/v2/elevation.ts`
- Create: `src/__tests__/projection-v2/elevation.test.ts`

Visible-wall filter (per side, exterior only):
- `front` / `back`: walls with `|start.y - end.y| < TOL` (horizontal in plan, perpendicular to view)
- `left` / `right`: walls with `|start.x - end.x| < TOL`

Each wall band gets `depth = perpendicular distance from view plane along view axis`. Lower = closer to viewer.

Slabs project as horizontal lines at z = top.resolved, x extent = polygon's projected span on the view axis.

All roofs project; `RoofGeometryV2.panels` and `.gables` map to `ElevationRoofPolygonV2` with `kind: "panel" | "gable"`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/projection-v2/elevation.test.ts
import { describe, expect, it } from "vitest";
import { createValidV2Project } from "../../domain/v2/fixtures";
import { projectElevationV2 } from "../../projection/v2/elevation";

describe("projectElevationV2", () => {
  it("returns viewId + side", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    expect(view.viewId).toBe("elevation-front");
    expect(view.side).toBe("front");
  });

  it("front view includes only horizontal exterior walls", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    // Fixture: 4 walls forming a rectangle. Front (y=0) and back (y=4) are horizontal.
    // Front view shows BOTH front and back walls (both perpendicular to view axis).
    expect(view.wallBands).toHaveLength(2);
    const wallIds = view.wallBands.map((b) => b.wallId).sort();
    expect(wallIds).toEqual(["w-back", "w-front"]);
  });

  it("left view includes only vertical exterior walls", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "left");
    expect(view.wallBands).toHaveLength(2);
    const wallIds = view.wallBands.map((b) => b.wallId).sort();
    expect(wallIds).toEqual(["w-left", "w-right"]);
  });

  it("wall band x and width come from projected wall extent", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    const front = view.wallBands.find((b) => b.wallId === "w-front")!;
    expect(front.width).toBeCloseTo(6, 4);
    expect(front.x).toBeCloseTo(0, 4);
  });

  it("wall band y and height come from anchor-resolved bottomZ/topZ", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    const front = view.wallBands.find((b) => b.wallId === "w-front")!;
    expect(front.y).toBe(0);
    expect(front.height).toBeCloseTo(3.2, 4);
  });

  it("front-side wall has lower depth than back-side wall (closer = smaller depth)", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    const front = view.wallBands.find((b) => b.wallId === "w-front")!;
    const back = view.wallBands.find((b) => b.wallId === "w-back")!;
    expect(front.depth).toBeLessThan(back.depth);
  });

  it("excludes interior walls", () => {
    const project = createValidV2Project();
    project.walls.push({
      id: "w-interior",
      start: { x: 3, y: 0 },
      end: { x: 3, y: 4 },
      thickness: 0.1,
      bottom: { kind: "storey", storeyId: "1f", offset: 0 },
      top: { kind: "storey", storeyId: "2f", offset: 0 },
      exterior: false,
      materialId: "mat-wall",
    });
    const view = projectElevationV2(project, "left");
    expect(view.wallBands.find((b) => b.wallId === "w-interior")).toBeUndefined();
  });

  it("emits a slab line per slab at z = top.resolved", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    expect(view.slabLines).toHaveLength(1);
    expect(view.slabLines[0].slabId).toBe("slab-1f");
    expect(view.slabLines[0].start.y).toBe(0); // top z = 0 for 1F slab
  });

  it("emits opening rects with anchor-resolved y from wall.bottom + sillHeight", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    expect(view.openings).toHaveLength(1);
    const opening = view.openings[0];
    expect(opening.y).toBeCloseTo(0.9); // sillHeight
    expect(opening.height).toBeCloseTo(1.2);
  });

  it("emits roof polygons (panels + gables) with depth tags", () => {
    const project = createValidV2Project();
    const view = projectElevationV2(project, "front");
    // Fixture roof has 2-opp gable: 2 panels + 2 gables.
    expect(view.roofPolygons.length).toBeGreaterThan(0);
    const panels = view.roofPolygons.filter((p) => p.kind === "panel");
    const gables = view.roofPolygons.filter((p) => p.kind === "gable");
    expect(panels.length).toBeGreaterThan(0);
    expect(gables.length).toBeGreaterThan(0);
  });

  it("supports tall walls spanning multiple storeys (anchor-resolved height)", () => {
    const project = createValidV2Project();
    project.walls[0].top = { kind: "absolute", z: 6.4 };
    const view = projectElevationV2(project, "front");
    const tall = view.wallBands.find((b) => b.wallId === project.walls[0].id)!;
    expect(tall.height).toBeCloseTo(6.4, 4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/projection-v2/elevation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement elevation projection**

Create `src/projection/v2/elevation.ts` with this exact content:

```typescript
import { resolveAnchor } from "../../domain/v2/anchors";
import type { HouseProject, Point2, Wall } from "../../domain/v2/types";
import { buildRoofGeometry } from "../../geometry/v2/roofGeometry";
import type {
  ElevationBalconyRectV2,
  ElevationOpeningRectV2,
  ElevationProjectionV2,
  ElevationRoofPolygonV2,
  ElevationSide,
  ElevationSlabLine,
  ElevationWallBandV2,
} from "./types";

const PARALLEL_TOL = 0.005;

function isVisibleWall(wall: Wall, side: ElevationSide): boolean {
  if (!wall.exterior) return false;
  if (side === "front" || side === "back") {
    return Math.abs(wall.end.y - wall.start.y) < PARALLEL_TOL;
  }
  return Math.abs(wall.end.x - wall.start.x) < PARALLEL_TOL;
}

function projectAxis(point: { x: number; y: number }, side: ElevationSide): number {
  if (side === "front") return point.x;
  if (side === "back") return -point.x;
  if (side === "left") return -point.y;
  return point.y;
}

function depthFor(point: { x: number; y: number }, side: ElevationSide): number {
  if (side === "front") return point.y;
  if (side === "back") return -point.y;
  if (side === "left") return point.x;
  return -point.x;
}

function pointAlongWall(wall: Wall, distance: number): Point2 {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: wall.start.x, y: wall.start.y };
  return {
    x: wall.start.x + (dx / len) * distance,
    y: wall.start.y + (dy / len) * distance,
  };
}

function spanExtent(
  wall: Wall,
  offset: number,
  width: number,
  side: ElevationSide,
): { x: number; width: number } {
  const a = projectAxis(pointAlongWall(wall, offset), side);
  const b = projectAxis(pointAlongWall(wall, offset + width), side);
  return { x: Math.min(a, b), width: Math.abs(b - a) };
}

function wallExtent(wall: Wall, side: ElevationSide): { x: number; width: number } {
  const a = projectAxis(wall.start, side);
  const b = projectAxis(wall.end, side);
  return { x: Math.min(a, b), width: Math.abs(b - a) };
}

function wallDepth(wall: Wall, side: ElevationSide): number {
  return (depthFor(wall.start, side) + depthFor(wall.end, side)) / 2;
}

function polygonProjectedBounds(polygon: Point2[], side: ElevationSide) {
  const xs = polygon.map((p) => projectAxis(p, side));
  const depths = polygon.map((p) => depthFor(p, side));
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    avgDepth: depths.reduce((s, d) => s + d, 0) / depths.length,
  };
}

export function projectElevationV2(
  project: HouseProject,
  side: ElevationSide,
): ElevationProjectionV2 {
  const storeys = project.storeys;
  const visibleWalls = project.walls.filter((w) => isVisibleWall(w, side));
  const wallsById = new Map(visibleWalls.map((w) => [w.id, w]));

  const wallBands: ElevationWallBandV2[] = visibleWalls.map((wall) => {
    const ext = wallExtent(wall, side);
    return {
      wallId: wall.id,
      x: ext.x,
      y: resolveAnchor(wall.bottom, storeys),
      width: ext.width,
      height: resolveAnchor(wall.top, storeys) - resolveAnchor(wall.bottom, storeys),
      depth: wallDepth(wall, side),
    };
  });

  const slabLines: ElevationSlabLine[] = project.slabs.map((slab) => {
    const z = resolveAnchor(slab.top, storeys);
    const bounds = polygonProjectedBounds(slab.polygon, side);
    return {
      slabId: slab.id,
      start: { x: bounds.minX, y: z },
      end: { x: bounds.maxX, y: z },
      thickness: slab.thickness,
      depth: bounds.avgDepth,
    };
  });

  const openings: ElevationOpeningRectV2[] = project.openings
    .filter((o) => wallsById.has(o.wallId))
    .map((o) => {
      const wall = wallsById.get(o.wallId)!;
      const ext = spanExtent(wall, o.offset, o.width, side);
      return {
        openingId: o.id,
        wallId: o.wallId,
        type: o.type,
        x: ext.x,
        y: resolveAnchor(wall.bottom, storeys) + o.sillHeight,
        width: ext.width,
        height: o.height,
        depth: wallDepth(wall, side),
      };
    });

  const balconies: ElevationBalconyRectV2[] = project.balconies
    .filter((b) => wallsById.has(b.attachedWallId))
    .map((b) => {
      const wall = wallsById.get(b.attachedWallId)!;
      const ext = spanExtent(wall, b.offset, b.width, side);
      return {
        balconyId: b.id,
        wallId: b.attachedWallId,
        x: ext.x,
        y: resolveAnchor(b.slabTop, storeys),
        width: ext.width,
        height: b.slabThickness + b.railingHeight,
        depth: wallDepth(wall, side),
      };
    });

  const roofPolygons: ElevationRoofPolygonV2[] = [];
  for (const roof of project.roofs) {
    const geom = buildRoofGeometry(roof, storeys);
    if (!geom) continue;
    for (const panel of geom.panels) {
      const verts = panel.vertices.map((v) => ({ x: projectAxis(v, side), y: v.z }));
      const avgDepth =
        panel.vertices.reduce((s, v) => s + depthFor(v, side), 0) / panel.vertices.length;
      roofPolygons.push({ roofId: roof.id, vertices: verts, kind: "panel", depth: avgDepth });
    }
    for (const gable of geom.gables) {
      const verts = gable.vertices.map((v) => ({ x: projectAxis(v, side), y: v.z }));
      const avgDepth =
        gable.vertices.reduce((s, v) => s + depthFor(v, side), 0) / gable.vertices.length;
      roofPolygons.push({ roofId: roof.id, vertices: verts, kind: "gable", depth: avgDepth });
    }
  }

  return {
    viewId: `elevation-${side}`,
    side,
    wallBands,
    slabLines,
    openings,
    balconies,
    roofPolygons,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test src/__tests__/projection-v2/elevation.test.ts`
Expected: 11/11 PASS.

Run: `bun run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/projection/v2/elevation.ts src/__tests__/projection-v2/elevation.test.ts
git commit -m "feat(projection-v2): elevation view (orientation-filtered + depth tag)"
```

---

## Task 4: roofView — 多屋顶俯视图

**Files:**
- Create: `src/projection/v2/roofView.ts`
- Create: `src/__tests__/projection-v2/roofView.test.ts`

Top-down projection: each Roof's polygon → 2D outline; each polygon edge → `RoofViewEdgeStroke` carrying the edge `kind` for the renderer to pick a stroke style. Ridge lines come from the roof geometry's panel apexes (3D apex projected to 2D = drop the z).

For v1 simplicity: ridge lines = pairs of high-z vertices in adjacent roof panels (i.e., the 3D apex line of each panel pair). If a roof has only one panel (shed), it has no ridge.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/__tests__/projection-v2/roofView.test.ts
import { describe, expect, it } from "vitest";
import { createValidV2Project } from "../../domain/v2/fixtures";
import { projectRoofViewV2 } from "../../projection/v2/roofView";

describe("projectRoofViewV2", () => {
  it("returns viewId 'roof'", () => {
    const view = projectRoofViewV2(createValidV2Project());
    expect(view.viewId).toBe("roof");
  });

  it("emits one polygon per project roof", () => {
    const project = createValidV2Project();
    const view = projectRoofViewV2(project);
    expect(view.polygons).toHaveLength(project.roofs.length);
    expect(view.polygons[0].roofId).toBe("roof-main");
  });

  it("polygon vertices match roof.polygon (CCW, 4 verts for v1)", () => {
    const project = createValidV2Project();
    const view = projectRoofViewV2(project);
    expect(view.polygons[0].vertices).toHaveLength(4);
  });

  it("emits one edge stroke per polygon edge with correct kind", () => {
    const project = createValidV2Project();
    const view = projectRoofViewV2(project);
    expect(view.polygons[0].edges).toHaveLength(4);
    const kinds = view.polygons[0].edges.map((e) => e.kind);
    expect(kinds).toEqual(project.roofs[0].edges);
  });

  it("treats hip edges as their own kind (preserves user intent)", () => {
    const project = createValidV2Project();
    project.roofs[0].edges = ["eave", "hip", "gable", "hip"];
    const view = projectRoofViewV2(project);
    const kinds = view.polygons[0].edges.map((e) => e.kind);
    expect(kinds).toContain("hip");
  });

  it("emits no ridge lines for shed (1 eave + 3 gables)", () => {
    const project = createValidV2Project();
    project.roofs[0].edges = ["eave", "gable", "gable", "gable"];
    const view = projectRoofViewV2(project);
    expect(view.polygons[0].ridgeLines).toHaveLength(0);
  });

  it("emits at least one ridge line for 2-opp gable", () => {
    const project = createValidV2Project();
    project.roofs[0].edges = ["eave", "gable", "eave", "gable"];
    const view = projectRoofViewV2(project);
    expect(view.polygons[0].ridgeLines.length).toBeGreaterThan(0);
  });

  it("returns empty polygons array when project has no roofs", () => {
    const project = createValidV2Project();
    project.roofs = [];
    const view = projectRoofViewV2(project);
    expect(view.polygons).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/projection-v2/roofView.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement roof view projection**

Create `src/projection/v2/roofView.ts` with this exact content:

```typescript
import type { HouseProject, Point2 } from "../../domain/v2/types";
import { buildRoofGeometry } from "../../geometry/v2/roofGeometry";
import type {
  RoofViewEdgeStroke,
  RoofViewPolygon,
  RoofViewProjectionV2,
  RoofViewRidgeLine,
} from "./types";

const RIDGE_TOL = 0.001;

function topDown(p: { x: number; y: number; z: number }): Point2 {
  return { x: p.x, y: p.y };
}

/** A ridge is a panel edge that (a) sits at the panel's max-z, (b) is non-
 *  degenerate (length > tolerance), and (c) is SHARED between two or more
 *  panels. The "shared" gate is what excludes shed roofs (1 panel = no
 *  shared edges) and includes 2-opp-gable / hip4 / half-hip ridges. */
function extractRidgeLines(panels: { vertices: { x: number; y: number; z: number }[] }[]): RoofViewRidgeLine[] {
  type EdgeRecord = { from: Point2; to: Point2; key: string };
  const allEdges: EdgeRecord[] = [];
  for (const panel of panels) {
    if (panel.vertices.length < 3) continue;
    const maxZ = Math.max(...panel.vertices.map((v) => v.z));
    const n = panel.vertices.length;
    for (let i = 0; i < n; i += 1) {
      const a = panel.vertices[i];
      const b = panel.vertices[(i + 1) % n];
      if (Math.abs(a.z - maxZ) > RIDGE_TOL || Math.abs(b.z - maxZ) > RIDGE_TOL) continue;
      const ax = topDown(a);
      const bx = topDown(b);
      // Skip degenerate (zero-length) edges — happens at hip4 apex when W == D.
      if (Math.hypot(ax.x - bx.x, ax.y - bx.y) < RIDGE_TOL) continue;
      // Canonical key (smaller endpoint first) so shared edges across panels
      // collapse to one entry.
      const key =
        ax.x + ax.y < bx.x + bx.y
          ? `${ax.x.toFixed(4)},${ax.y.toFixed(4)}|${bx.x.toFixed(4)},${bx.y.toFixed(4)}`
          : `${bx.x.toFixed(4)},${bx.y.toFixed(4)}|${ax.x.toFixed(4)},${ax.y.toFixed(4)}`;
      allEdges.push({ from: ax, to: bx, key });
    }
  }
  // A ridge is shared by ≥ 2 panels.
  const counts = new Map<string, { from: Point2; to: Point2; count: number }>();
  for (const e of allEdges) {
    const existing = counts.get(e.key);
    if (existing) existing.count += 1;
    else counts.set(e.key, { from: e.from, to: e.to, count: 1 });
  }
  return [...counts.values()]
    .filter((e) => e.count >= 2)
    .map((e) => ({ from: e.from, to: e.to }));
}

export function projectRoofViewV2(project: HouseProject): RoofViewProjectionV2 {
  const polygons: RoofViewPolygon[] = [];
  for (const roof of project.roofs) {
    const verts = roof.polygon.map((p) => ({ x: p.x, y: p.y }));
    const edges: RoofViewEdgeStroke[] = roof.polygon.map((p, i) => {
      const next = roof.polygon[(i + 1) % roof.polygon.length];
      return {
        from: { x: p.x, y: p.y },
        to: { x: next.x, y: next.y },
        kind: roof.edges[i],
      };
    });

    const geom = buildRoofGeometry(roof, project.storeys);
    const ridgeLines = geom ? extractRidgeLines(geom.panels) : [];

    polygons.push({
      roofId: roof.id,
      vertices: verts,
      edges,
      ridgeLines,
    });
  }
  return { viewId: "roof", polygons };
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test src/__tests__/projection-v2/roofView.test.ts`
Expected: 8/8 PASS.

Run: `bun run build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/projection/v2/roofView.ts src/__tests__/projection-v2/roofView.test.ts
git commit -m "feat(projection-v2): roof view (multi-roof + edge kinds + ridge lines)"
```

---

## Task 5: 全套绿线检查

**Files:** None (verification only).

- [ ] **Step 1: Full test suite**

```bash
bun run test
```

Expected: ~544 total (509 baseline + 1 + 12 + 11 + 8 = 541; allow ±2).

- [ ] **Step 2: Build**

```bash
bun run build
```

Expected: green.

- [ ] **Step 3: Confirm isolation**

```bash
git diff 8064076..HEAD -- src/ ':!src/projection/v2/' ':!src/__tests__/projection-v2/'
```

Expected: empty.

- [ ] **Step 4: Confirm file count**

```bash
git diff 8064076..HEAD --stat
```

Expected: 8 added (4 src + 4 tests).

- [ ] **Step 5: No additional commit needed**

---

## Done Criteria

- `bun run test` 全绿，新测试 ≥ 32 (1+12+11+8)
- `bun run build` 全绿
- v1 + v2 已落代码字面零修改
- `projectPlanV2 / projectElevationV2 / projectRoofViewV2` 都能从合法 fixture 输出对应 Scene 类型
- P4 启动时 DrawingSurface2D 可直接 `import { project*V2 }` 切换到新数据源

## P3 不做

- DrawingSurface2D 接通新数据 → P4
- ToolPalette / PropertyPanel UI 调整 → P4
- Storey 列表编辑器 UI → P4
- Edge kind 视觉笔触渲染（粗实线 / 细线 / 点划线）→ P4 渲染层
- 立面里 opening 的 z 严格判定（截面以上的开洞虚线）→ v2.1
