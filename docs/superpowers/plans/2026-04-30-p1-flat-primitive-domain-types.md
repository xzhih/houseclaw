# P1: 扁平 3D 原型 — domain 类型层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `src/domain/v2/` 下立起新数据模型（Anchor + 扁平对象池 + validateProject），不动现有 UI / geometry / projection / mutations。P2 才开始把 geometry 切到新类型上。

**Architecture:** 全部新代码并列于现有 `src/domain/types.ts` 旁边。HouseProject v2 的字段组织、Anchor 系统、纯函数校验在此完成。无 mutation、无 reducer 改动。

**Tech Stack:** TypeScript 5、vitest、bun、React 19（不涉及）。所有逻辑都是纯函数。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-flat-primitive-refactor-design.md` §1、§2、§7 部分边界。

---

## File Structure

新建：

- `src/domain/v2/types.ts` — Anchor、HouseProject v2 全套类型
- `src/domain/v2/anchors.ts` — `resolveAnchor` 解析函数
- `src/domain/v2/polygon.ts` — `isPolygonSimple`、`isPolygonCCW`、`signedArea` 纯函数
- `src/domain/v2/validate.ts` — `validateProject` (返回 errors[]) + `assertValidProject` (throws)
- `src/domain/v2/fixtures.ts` — 测试用合法 v2 project 工厂（仅 export `createValidV2Project()`，方便后续测试复用）

新建测试：

- `src/__tests__/domain-v2/anchors.test.ts`
- `src/__tests__/domain-v2/polygon.test.ts`
- `src/__tests__/domain-v2/validate.test.ts`

不动：所有现有文件（`src/domain/types.ts`、`src/domain/constraints.ts`、`src/domain/mutations*` 等）。

P1 结束后 `bun run test` 应有 ~38 条新单测通过（anchors 4 + fixtures 3 + polygon 8 + validate 23），`bun run build`（即 `tsc --noEmit && vite build`）全绿。

---

## Task 1: Anchor 类型 + resolveAnchor

**Files:**
- Create: `src/domain/v2/types.ts`
- Create: `src/domain/v2/anchors.ts`
- Create: `src/__tests__/domain-v2/anchors.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/domain-v2/anchors.test.ts
import { describe, expect, it } from "vitest";
import { resolveAnchor } from "../../domain/v2/anchors";
import type { Anchor, Storey } from "../../domain/v2/types";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
  { id: "roof", label: "屋顶", elevation: 6.4 },
];

describe("resolveAnchor", () => {
  it("resolves a storey anchor to elevation + offset", () => {
    const a: Anchor = { kind: "storey", storeyId: "2f", offset: 0.5 };
    expect(resolveAnchor(a, STOREYS)).toBeCloseTo(3.7);
  });

  it("resolves a storey anchor with negative offset", () => {
    const a: Anchor = { kind: "storey", storeyId: "1f", offset: -0.15 };
    expect(resolveAnchor(a, STOREYS)).toBeCloseTo(-0.15);
  });

  it("resolves an absolute anchor to its z value", () => {
    const a: Anchor = { kind: "absolute", z: 2.4 };
    expect(resolveAnchor(a, STOREYS)).toBe(2.4);
  });

  it("throws when a storey anchor references a missing storey", () => {
    const a: Anchor = { kind: "storey", storeyId: "ghost", offset: 0 };
    expect(() => resolveAnchor(a, STOREYS)).toThrow(/missing storey: ghost/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/domain-v2/anchors.test.ts`
Expected: FAIL — module `../../domain/v2/anchors` not found.

- [ ] **Step 3: Write minimal types**

```typescript
// src/domain/v2/types.ts
export type Anchor =
  | { kind: "storey"; storeyId: string; offset: number }
  | { kind: "absolute"; z: number };

export type Storey = {
  id: string;
  label: string;
  elevation: number;
};
```

- [ ] **Step 4: Implement resolveAnchor**

```typescript
// src/domain/v2/anchors.ts
import type { Anchor, Storey } from "./types";

export function resolveAnchor(anchor: Anchor, storeys: Storey[]): number {
  if (anchor.kind === "absolute") {
    return anchor.z;
  }
  const storey = storeys.find((s) => s.id === anchor.storeyId);
  if (!storey) {
    throw new Error(`resolveAnchor: missing storey: ${anchor.storeyId}`);
  }
  return storey.elevation + anchor.offset;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run test src/__tests__/domain-v2/anchors.test.ts`
Expected: PASS — 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/v2/types.ts src/domain/v2/anchors.ts src/__tests__/domain-v2/anchors.test.ts
git commit -m "feat(domain-v2): Anchor type + resolveAnchor"
```

---

## Task 2: HouseProject v2 完整类型 + fixture

**Files:**
- Modify: `src/domain/v2/types.ts`
- Create: `src/domain/v2/fixtures.ts`
- Create: `src/__tests__/domain-v2/fixtures.test.ts`

- [ ] **Step 1: Write the failing test (smoke)**

```typescript
// src/__tests__/domain-v2/fixtures.test.ts
import { describe, expect, it } from "vitest";
import { createValidV2Project } from "../../domain/v2/fixtures";

describe("createValidV2Project", () => {
  it("returns a project with schemaVersion 2", () => {
    const project = createValidV2Project();
    expect(project.schemaVersion).toBe(2);
  });

  it("has at least one storey, wall, slab, roof, opening, material", () => {
    const project = createValidV2Project();
    expect(project.storeys.length).toBeGreaterThan(0);
    expect(project.walls.length).toBeGreaterThan(0);
    expect(project.slabs.length).toBeGreaterThan(0);
    expect(project.roofs.length).toBeGreaterThan(0);
    expect(project.openings.length).toBeGreaterThan(0);
    expect(project.materials.length).toBeGreaterThan(0);
  });

  it("walls reference existing storeys via anchors", () => {
    const project = createValidV2Project();
    const storeyIds = new Set(project.storeys.map((s) => s.id));
    for (const w of project.walls) {
      if (w.bottom.kind === "storey") expect(storeyIds.has(w.bottom.storeyId)).toBe(true);
      if (w.top.kind === "storey") expect(storeyIds.has(w.top.storeyId)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/domain-v2/fixtures.test.ts`
Expected: FAIL — `createValidV2Project` not exported.

- [ ] **Step 3: Extend types**

Append to `src/domain/v2/types.ts`:

```typescript
export type Point2 = { x: number; y: number };
export type Point3 = { x: number; y: number; z: number };

export type MaterialKind = "wall" | "roof" | "frame" | "railing" | "decor";

export type Material = {
  id: string;
  name: string;
  kind: MaterialKind;
  color: string;
  textureUrl?: string;
  repeat?: { x: number; y: number };
};

export type Wall = {
  id: string;
  start: Point2;
  end: Point2;
  thickness: number;
  bottom: Anchor;
  top: Anchor;
  exterior: boolean;
  materialId: string;
};

export type Slab = {
  id: string;
  polygon: Point2[];
  top: Anchor;
  thickness: number;
  materialId: string;
  edgeMaterialId?: string;
};

export type RoofEdgeKind = "eave" | "gable" | "hip";

export type Roof = {
  id: string;
  polygon: Point2[];
  base: Anchor;
  edges: RoofEdgeKind[];
  pitch: number;
  overhang: number;
  materialId: string;
};

export type OpeningType = "door" | "window" | "void";

export type Opening = {
  id: string;
  wallId: string;
  type: OpeningType;
  offset: number;
  sillHeight: number;
  width: number;
  height: number;
  frameMaterialId: string;
};

export type Balcony = {
  id: string;
  attachedWallId: string;
  offset: number;
  width: number;
  depth: number;
  slabTop: Anchor;
  slabThickness: number;
  railingHeight: number;
  materialId: string;
  railingMaterialId: string;
};

export type StairShape = "straight" | "l" | "u";
export type StairEdge = "+x" | "-x" | "+y" | "-y";
export type StairTurn = "left" | "right";

export type Stair = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  shape: StairShape;
  treadDepth: number;
  bottomEdge: StairEdge;
  turn?: StairTurn;
  rotation?: number;
  from: Anchor;
  to: Anchor;
  materialId: string;
};

export type HouseProject = {
  schemaVersion: 2;
  id: string;
  name: string;
  storeys: Storey[];
  walls: Wall[];
  slabs: Slab[];
  roofs: Roof[];
  openings: Opening[];
  balconies: Balcony[];
  stairs: Stair[];
  materials: Material[];
};
```

- [ ] **Step 4: Create fixture**

```typescript
// src/domain/v2/fixtures.ts
import type { HouseProject } from "./types";

/**
 * Smallest valid v2 project: one storey + four walls forming a 6x4 rectangle
 * + one floor slab + one rectangular gable roof + one window + one wall material.
 * Used as a reusable starting point for validation tests.
 */
export function createValidV2Project(): HouseProject {
  return {
    schemaVersion: 2,
    id: "test-project",
    name: "Test Project",
    storeys: [
      { id: "1f", label: "1F", elevation: 0 },
      { id: "2f", label: "2F", elevation: 3.2 },
    ],
    materials: [
      { id: "mat-wall", name: "白漆", kind: "wall", color: "#f0f0f0" },
      { id: "mat-roof", name: "深灰瓦", kind: "roof", color: "#3a3a3a" },
      { id: "mat-frame", name: "深灰窗框", kind: "frame", color: "#2a2a2a" },
      { id: "mat-slab", name: "楼板", kind: "decor", color: "#cccccc" },
    ],
    walls: [
      {
        id: "w-front",
        start: { x: 0, y: 0 },
        end: { x: 6, y: 0 },
        thickness: 0.2,
        bottom: { kind: "storey", storeyId: "1f", offset: 0 },
        top: { kind: "storey", storeyId: "2f", offset: 0 },
        exterior: true,
        materialId: "mat-wall",
      },
      {
        id: "w-right",
        start: { x: 6, y: 0 },
        end: { x: 6, y: 4 },
        thickness: 0.2,
        bottom: { kind: "storey", storeyId: "1f", offset: 0 },
        top: { kind: "storey", storeyId: "2f", offset: 0 },
        exterior: true,
        materialId: "mat-wall",
      },
      {
        id: "w-back",
        start: { x: 6, y: 4 },
        end: { x: 0, y: 4 },
        thickness: 0.2,
        bottom: { kind: "storey", storeyId: "1f", offset: 0 },
        top: { kind: "storey", storeyId: "2f", offset: 0 },
        exterior: true,
        materialId: "mat-wall",
      },
      {
        id: "w-left",
        start: { x: 0, y: 4 },
        end: { x: 0, y: 0 },
        thickness: 0.2,
        bottom: { kind: "storey", storeyId: "1f", offset: 0 },
        top: { kind: "storey", storeyId: "2f", offset: 0 },
        exterior: true,
        materialId: "mat-wall",
      },
    ],
    slabs: [
      {
        id: "slab-1f",
        polygon: [
          { x: 0, y: 0 },
          { x: 6, y: 0 },
          { x: 6, y: 4 },
          { x: 0, y: 4 },
        ],
        top: { kind: "storey", storeyId: "1f", offset: 0 },
        thickness: 0.15,
        materialId: "mat-slab",
      },
    ],
    roofs: [
      {
        id: "roof-main",
        polygon: [
          { x: -0.5, y: -0.5 },
          { x: 6.5, y: -0.5 },
          { x: 6.5, y: 4.5 },
          { x: -0.5, y: 4.5 },
        ],
        base: { kind: "storey", storeyId: "2f", offset: 0 },
        edges: ["eave", "gable", "eave", "gable"],
        pitch: Math.PI / 6,
        overhang: 0.5,
        materialId: "mat-roof",
      },
    ],
    openings: [
      {
        id: "opening-front-window",
        wallId: "w-front",
        type: "window",
        offset: 1.5,
        sillHeight: 0.9,
        width: 1.5,
        height: 1.2,
        frameMaterialId: "mat-frame",
      },
    ],
    balconies: [],
    stairs: [],
  };
}
```

- [ ] **Step 5: Run tests**

Run: `bun run test src/__tests__/domain-v2/`
Expected: PASS — anchors (4) + fixtures (3) = 7 tests pass.

- [ ] **Step 6: Run full build**

Run: `bun run build`
Expected: succeed (tsc --noEmit clean, vite build clean).

- [ ] **Step 7: Commit**

```bash
git add src/domain/v2/types.ts src/domain/v2/fixtures.ts src/__tests__/domain-v2/fixtures.test.ts
git commit -m "feat(domain-v2): HouseProject schema + valid fixture"
```

---

## Task 3: 多边形几何辅助 (signedArea / isCCW / isSimple)

**Files:**
- Create: `src/domain/v2/polygon.ts`
- Create: `src/__tests__/domain-v2/polygon.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/domain-v2/polygon.test.ts
import { describe, expect, it } from "vitest";
import { isPolygonCCW, isPolygonSimple, signedArea } from "../../domain/v2/polygon";
import type { Point2 } from "../../domain/v2/types";

const SQUARE_CCW: Point2[] = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];

const SQUARE_CW: Point2[] = [...SQUARE_CCW].reverse();

describe("signedArea", () => {
  it("is positive for CCW polygons", () => {
    expect(signedArea(SQUARE_CCW)).toBeCloseTo(16);
  });

  it("is negative for CW polygons", () => {
    expect(signedArea(SQUARE_CW)).toBeCloseTo(-16);
  });
});

describe("isPolygonCCW", () => {
  it("returns true for CCW square", () => {
    expect(isPolygonCCW(SQUARE_CCW)).toBe(true);
  });

  it("returns false for CW square", () => {
    expect(isPolygonCCW(SQUARE_CW)).toBe(false);
  });
});

describe("isPolygonSimple", () => {
  it("returns true for a non-self-intersecting square", () => {
    expect(isPolygonSimple(SQUARE_CCW)).toBe(true);
  });

  it("returns true for an L-shape", () => {
    const L: Point2[] = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 4 },
      { x: 0, y: 4 },
    ];
    expect(isPolygonSimple(L)).toBe(true);
  });

  it("returns false for a self-intersecting bowtie", () => {
    const BOWTIE: Point2[] = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ];
    expect(isPolygonSimple(BOWTIE)).toBe(false);
  });

  it("returns false for a polygon with fewer than 3 vertices", () => {
    expect(isPolygonSimple([{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/domain-v2/polygon.test.ts`
Expected: FAIL — `polygon` module not found.

- [ ] **Step 3: Implement polygon helpers**

```typescript
// src/domain/v2/polygon.ts
import type { Point2 } from "./types";

/** Shoelace formula. Positive => CCW, negative => CW. */
export function signedArea(polygon: Point2[]): number {
  let sum = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    sum += (b.x - a.x) * (b.y + a.y);
  }
  return -sum / 2;
}

export function isPolygonCCW(polygon: Point2[]): boolean {
  return signedArea(polygon) > 0;
}

/** Check that no two non-adjacent edges intersect. O(n²) — fine for ≤ ~20-vertex
 *  building outlines. */
export function isPolygonSimple(polygon: Point2[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = polygon[i];
    const a2 = polygon[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent edges (they share a vertex).
      if (j === i || (j + 1) % n === i) continue;
      const b1 = polygon[j];
      const b2 = polygon[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

function segmentsIntersect(p1: Point2, p2: Point2, p3: Point2, p4: Point2): boolean {
  const d1 = cross(p4, p3, p1);
  const d2 = cross(p4, p3, p2);
  const d3 = cross(p2, p1, p3);
  const d4 = cross(p2, p1, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function cross(a: Point2, b: Point2, c: Point2): number {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test src/__tests__/domain-v2/polygon.test.ts`
Expected: PASS — 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/polygon.ts src/__tests__/domain-v2/polygon.test.ts
git commit -m "feat(domain-v2): polygon helpers (signedArea, isCCW, isSimple)"
```

---

## Task 4: validateProject — anchor 引用 + 墙高度

**Files:**
- Create: `src/domain/v2/validate.ts`
- Create: `src/__tests__/domain-v2/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/domain-v2/validate.test.ts
import { describe, expect, it } from "vitest";
import { createValidV2Project } from "../../domain/v2/fixtures";
import { MIN_WALL_HEIGHT, validateProject } from "../../domain/v2/validate";

describe("validateProject — base case", () => {
  it("returns no errors for a valid project", () => {
    expect(validateProject(createValidV2Project())).toEqual([]);
  });
});

describe("validateProject — anchor references", () => {
  it("flags a wall whose bottom anchor references a missing storey", () => {
    const p = createValidV2Project();
    p.walls[0].bottom = { kind: "storey", storeyId: "ghost", offset: 0 };
    const errors = validateProject(p);
    expect(errors).toContain("Wall w-front bottom anchor references missing storey: ghost");
  });

  it("flags a wall whose top anchor references a missing storey", () => {
    const p = createValidV2Project();
    p.walls[0].top = { kind: "storey", storeyId: "ghost", offset: 0 };
    const errors = validateProject(p);
    expect(errors).toContain("Wall w-front top anchor references missing storey: ghost");
  });

  it("does not flag absolute anchors", () => {
    const p = createValidV2Project();
    p.walls[0].bottom = { kind: "absolute", z: -0.15 };
    p.walls[0].top = { kind: "absolute", z: 3.0 };
    expect(validateProject(p)).toEqual([]);
  });
});

describe("validateProject — wall height", () => {
  it(`flags a wall shorter than ${MIN_WALL_HEIGHT}m`, () => {
    const p = createValidV2Project();
    p.walls[0].top = { kind: "absolute", z: 0.3 };
    p.walls[0].bottom = { kind: "absolute", z: 0 };
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Wall w-front height") && e.includes("< 0.5"))).toBe(true);
  });

  it("flags a wall whose top resolves below its bottom", () => {
    const p = createValidV2Project();
    p.walls[0].bottom = { kind: "absolute", z: 3.0 };
    p.walls[0].top = { kind: "absolute", z: 0 };
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Wall w-front") && e.includes("top below bottom"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test src/__tests__/domain-v2/validate.test.ts`
Expected: FAIL — `validate` module not found.

- [ ] **Step 3: Implement validateProject (foundation + wall height + anchor refs)**

```typescript
// src/domain/v2/validate.ts
import { resolveAnchor } from "./anchors";
import type { Anchor, HouseProject } from "./types";

export const MIN_WALL_HEIGHT = 0.5;

export function validateProject(project: HouseProject): string[] {
  const errors: string[] = [];
  const storeyIds = new Set(project.storeys.map((s) => s.id));

  function checkAnchor(anchor: Anchor, label: string): boolean {
    if (anchor.kind === "storey" && !storeyIds.has(anchor.storeyId)) {
      errors.push(`${label} references missing storey: ${anchor.storeyId}`);
      return false;
    }
    return true;
  }

  for (const wall of project.walls) {
    const bottomOk = checkAnchor(wall.bottom, `Wall ${wall.id} bottom anchor`);
    const topOk = checkAnchor(wall.top, `Wall ${wall.id} top anchor`);
    if (!bottomOk || !topOk) continue;
    const bottomZ = resolveAnchor(wall.bottom, project.storeys);
    const topZ = resolveAnchor(wall.top, project.storeys);
    if (topZ < bottomZ) {
      errors.push(`Wall ${wall.id} top below bottom (top=${topZ.toFixed(3)}, bottom=${bottomZ.toFixed(3)})`);
    } else if (topZ - bottomZ < MIN_WALL_HEIGHT) {
      errors.push(`Wall ${wall.id} height ${(topZ - bottomZ).toFixed(3)}m < 0.5m`);
    }
  }

  return errors;
}

export function assertValidProject(project: HouseProject): HouseProject {
  const errors = validateProject(project);
  if (errors.length > 0) {
    throw new Error(`Invalid v2 project:\n${errors.join("\n")}`);
  }
  return project;
}
```

- [ ] **Step 4: Run tests**

Run: `bun run test src/__tests__/domain-v2/validate.test.ts`
Expected: PASS — 6 tests in this file pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/validate.ts src/__tests__/domain-v2/validate.test.ts
git commit -m "feat(domain-v2): validateProject — anchors + wall height"
```

---

## Task 5: validateProject — slab / roof 不变量

**Files:**
- Modify: `src/domain/v2/validate.ts`
- Modify: `src/__tests__/domain-v2/validate.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/__tests__/domain-v2/validate.test.ts`:

```typescript
describe("validateProject — slab", () => {
  it("flags a slab polygon with fewer than 3 vertices", () => {
    const p = createValidV2Project();
    p.slabs[0].polygon = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Slab slab-1f") && e.includes("polygon"))).toBe(true);
  });

  it("flags a self-intersecting slab polygon", () => {
    const p = createValidV2Project();
    p.slabs[0].polygon = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 4, y: 0 },
      { x: 0, y: 4 },
    ];
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Slab slab-1f") && e.includes("self-intersecting"))).toBe(true);
  });

  it("flags a CW (non-CCW) slab polygon", () => {
    const p = createValidV2Project();
    p.slabs[0].polygon = [...p.slabs[0].polygon].reverse();
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Slab slab-1f") && e.includes("CCW"))).toBe(true);
  });

  it("flags a slab with non-positive thickness", () => {
    const p = createValidV2Project();
    p.slabs[0].thickness = 0;
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Slab slab-1f") && e.includes("thickness"))).toBe(true);
  });
});

describe("validateProject — roof", () => {
  it("flags a roof whose edges length differs from polygon length", () => {
    const p = createValidV2Project();
    p.roofs[0].edges = ["eave", "gable", "eave"]; // length 3 vs polygon 4
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Roof roof-main") && e.includes("edges length"))).toBe(true);
  });

  it("flags a roof with pitch outside [π/36, π/3]", () => {
    const p = createValidV2Project();
    p.roofs[0].pitch = Math.PI / 100;
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Roof roof-main") && e.includes("pitch"))).toBe(true);
  });

  it("flags a roof with overhang outside [0, 2]", () => {
    const p = createValidV2Project();
    p.roofs[0].overhang = 2.5;
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Roof roof-main") && e.includes("overhang"))).toBe(true);
  });

  it("flags a roof whose base anchor references a missing storey", () => {
    const p = createValidV2Project();
    p.roofs[0].base = { kind: "storey", storeyId: "ghost", offset: 0 };
    const errors = validateProject(p);
    expect(errors).toContain("Roof roof-main base anchor references missing storey: ghost");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/__tests__/domain-v2/validate.test.ts`
Expected: FAIL on the 8 new tests.

- [ ] **Step 3: Extend validateProject**

Modify `src/domain/v2/validate.ts`. Add imports at top:

```typescript
import { isPolygonCCW, isPolygonSimple } from "./polygon";
```

Then update the `validateProject` function. Replace its body with:

```typescript
export function validateProject(project: HouseProject): string[] {
  const errors: string[] = [];
  const storeyIds = new Set(project.storeys.map((s) => s.id));

  function checkAnchor(anchor: Anchor, label: string): boolean {
    if (anchor.kind === "storey" && !storeyIds.has(anchor.storeyId)) {
      errors.push(`${label} references missing storey: ${anchor.storeyId}`);
      return false;
    }
    return true;
  }

  for (const wall of project.walls) {
    const bottomOk = checkAnchor(wall.bottom, `Wall ${wall.id} bottom anchor`);
    const topOk = checkAnchor(wall.top, `Wall ${wall.id} top anchor`);
    if (!bottomOk || !topOk) continue;
    const bottomZ = resolveAnchor(wall.bottom, project.storeys);
    const topZ = resolveAnchor(wall.top, project.storeys);
    if (topZ < bottomZ) {
      errors.push(`Wall ${wall.id} top below bottom (top=${topZ.toFixed(3)}, bottom=${bottomZ.toFixed(3)})`);
    } else if (topZ - bottomZ < MIN_WALL_HEIGHT) {
      errors.push(`Wall ${wall.id} height ${(topZ - bottomZ).toFixed(3)}m < 0.5m`);
    }
  }

  for (const slab of project.slabs) {
    checkAnchor(slab.top, `Slab ${slab.id} top anchor`);
    if (slab.thickness <= 0) {
      errors.push(`Slab ${slab.id} thickness must be positive (got ${slab.thickness})`);
    }
    if (slab.polygon.length < 3) {
      errors.push(`Slab ${slab.id} polygon must have ≥ 3 vertices (got ${slab.polygon.length})`);
      continue;
    }
    if (!isPolygonSimple(slab.polygon)) {
      errors.push(`Slab ${slab.id} polygon is self-intersecting`);
    }
    if (!isPolygonCCW(slab.polygon)) {
      errors.push(`Slab ${slab.id} polygon must be CCW`);
    }
  }

  for (const roof of project.roofs) {
    checkAnchor(roof.base, `Roof ${roof.id} base anchor`);
    if (roof.edges.length !== roof.polygon.length) {
      errors.push(
        `Roof ${roof.id} edges length ${roof.edges.length} ≠ polygon length ${roof.polygon.length}`,
      );
    }
    if (roof.pitch < Math.PI / 36 || roof.pitch > Math.PI / 3) {
      errors.push(`Roof ${roof.id} pitch ${roof.pitch.toFixed(3)} out of [π/36, π/3]`);
    }
    if (roof.overhang < 0 || roof.overhang > 2) {
      errors.push(`Roof ${roof.id} overhang ${roof.overhang} out of [0, 2]`);
    }
    if (roof.polygon.length < 3) {
      errors.push(`Roof ${roof.id} polygon must have ≥ 3 vertices`);
    } else if (!isPolygonSimple(roof.polygon)) {
      errors.push(`Roof ${roof.id} polygon is self-intersecting`);
    }
  }

  return errors;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/__tests__/domain-v2/validate.test.ts`
Expected: PASS — all 14 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/validate.ts src/__tests__/domain-v2/validate.test.ts
git commit -m "feat(domain-v2): validate slab + roof invariants"
```

---

## Task 6: validateProject — opening / stair / balcony 不变量

**Files:**
- Modify: `src/domain/v2/validate.ts`
- Modify: `src/__tests__/domain-v2/validate.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `src/__tests__/domain-v2/validate.test.ts`:

```typescript
describe("validateProject — opening", () => {
  it("flags an opening that references a missing wall", () => {
    const p = createValidV2Project();
    p.openings[0].wallId = "ghost";
    const errors = validateProject(p);
    expect(errors).toContain("Opening opening-front-window references missing wall: ghost");
  });

  it("flags an opening whose sillHeight + height exceeds resolved wall height", () => {
    const p = createValidV2Project();
    p.openings[0].sillHeight = 2.5;
    p.openings[0].height = 1.5; // 4.0m total > 3.2m wall height
    const errors = validateProject(p);
    expect(
      errors.some((e) => e.includes("Opening opening-front-window") && e.includes("exceeds wall height")),
    ).toBe(true);
  });

  it("flags an opening whose offset + width exceeds wall length", () => {
    const p = createValidV2Project();
    p.openings[0].offset = 5.5;
    p.openings[0].width = 1.0; // 6.5 > 6 wall length
    const errors = validateProject(p);
    expect(
      errors.some((e) => e.includes("Opening opening-front-window") && e.includes("exceeds wall length")),
    ).toBe(true);
  });
});

describe("validateProject — stair", () => {
  it("flags a stair whose to anchor resolves not strictly above from", () => {
    const p = createValidV2Project();
    p.stairs.push({
      id: "s1",
      x: 1, y: 1, width: 1, depth: 3,
      shape: "straight",
      treadDepth: 0.27,
      bottomEdge: "+y",
      from: { kind: "absolute", z: 0 },
      to: { kind: "absolute", z: 0 },
      materialId: "mat-wall",
    });
    const errors = validateProject(p);
    expect(errors.some((e) => e.includes("Stair s1") && e.includes("to must be above from"))).toBe(true);
  });

  it("flags a stair whose anchors reference missing storeys", () => {
    const p = createValidV2Project();
    p.stairs.push({
      id: "s2",
      x: 1, y: 1, width: 1, depth: 3,
      shape: "straight",
      treadDepth: 0.27,
      bottomEdge: "+y",
      from: { kind: "storey", storeyId: "ghost", offset: 0 },
      to: { kind: "storey", storeyId: "2f", offset: 0 },
      materialId: "mat-wall",
    });
    const errors = validateProject(p);
    expect(errors).toContain("Stair s2 from anchor references missing storey: ghost");
  });
});

describe("validateProject — balcony", () => {
  it("flags a balcony that references a missing wall", () => {
    const p = createValidV2Project();
    p.balconies.push({
      id: "b1",
      attachedWallId: "ghost",
      offset: 1,
      width: 2,
      depth: 1,
      slabTop: { kind: "storey", storeyId: "2f", offset: 0 },
      slabThickness: 0.15,
      railingHeight: 1.1,
      materialId: "mat-wall",
      railingMaterialId: "mat-frame",
    });
    const errors = validateProject(p);
    expect(errors).toContain("Balcony b1 references missing wall: ghost");
  });

  it("flags a balcony whose slabTop anchor references missing storey", () => {
    const p = createValidV2Project();
    p.balconies.push({
      id: "b2",
      attachedWallId: "w-front",
      offset: 1,
      width: 2,
      depth: 1,
      slabTop: { kind: "storey", storeyId: "ghost", offset: 0 },
      slabThickness: 0.15,
      railingHeight: 1.1,
      materialId: "mat-wall",
      railingMaterialId: "mat-frame",
    });
    const errors = validateProject(p);
    expect(errors).toContain("Balcony b2 slabTop anchor references missing storey: ghost");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test src/__tests__/domain-v2/validate.test.ts`
Expected: FAIL on the 7 new tests.

- [ ] **Step 3: Extend validateProject**

In `src/domain/v2/validate.ts`, append to the `validateProject` body (just before `return errors`):

```typescript
  const wallsById = new Map(project.walls.map((w) => [w.id, w]));

  for (const opening of project.openings) {
    const wall = wallsById.get(opening.wallId);
    if (!wall) {
      errors.push(`Opening ${opening.id} references missing wall: ${opening.wallId}`);
      continue;
    }
    // Wall length
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const wallLength = Math.hypot(dx, dy);
    if (opening.offset + opening.width > wallLength + 1e-6) {
      errors.push(
        `Opening ${opening.id} offset+width ${(opening.offset + opening.width).toFixed(3)} exceeds wall length ${wallLength.toFixed(3)}`,
      );
    }
    // Wall vertical height (skip if wall anchors invalid — already flagged above).
    if (wall.bottom.kind === "storey" && !storeyIds.has(wall.bottom.storeyId)) continue;
    if (wall.top.kind === "storey" && !storeyIds.has(wall.top.storeyId)) continue;
    const wallHeight =
      resolveAnchor(wall.top, project.storeys) - resolveAnchor(wall.bottom, project.storeys);
    if (opening.sillHeight + opening.height > wallHeight + 1e-6) {
      errors.push(
        `Opening ${opening.id} sillHeight+height ${(opening.sillHeight + opening.height).toFixed(3)} exceeds wall height ${wallHeight.toFixed(3)}`,
      );
    }
  }

  for (const stair of project.stairs) {
    const fromOk = checkAnchor(stair.from, `Stair ${stair.id} from anchor`);
    const toOk = checkAnchor(stair.to, `Stair ${stair.id} to anchor`);
    if (!fromOk || !toOk) continue;
    const fromZ = resolveAnchor(stair.from, project.storeys);
    const toZ = resolveAnchor(stair.to, project.storeys);
    if (toZ <= fromZ) {
      errors.push(`Stair ${stair.id} to must be above from (from=${fromZ.toFixed(3)}, to=${toZ.toFixed(3)})`);
    }
  }

  for (const balcony of project.balconies) {
    if (!wallsById.has(balcony.attachedWallId)) {
      errors.push(`Balcony ${balcony.id} references missing wall: ${balcony.attachedWallId}`);
    }
    checkAnchor(balcony.slabTop, `Balcony ${balcony.id} slabTop anchor`);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test src/__tests__/domain-v2/validate.test.ts`
Expected: PASS — all 21 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/v2/validate.ts src/__tests__/domain-v2/validate.test.ts
git commit -m "feat(domain-v2): validate opening/stair/balcony invariants"
```

---

## Task 7: assertValidProject 抛错合约

**Files:**
- Modify: `src/__tests__/domain-v2/validate.test.ts`

- [ ] **Step 1: Append failing tests**

In `src/__tests__/domain-v2/validate.test.ts`, extend the existing import line to include `assertValidProject`:

```typescript
import { MIN_WALL_HEIGHT, assertValidProject, validateProject } from "../../domain/v2/validate";
```

Then append at the bottom of the file:

```typescript
describe("assertValidProject", () => {
  it("returns the project unchanged when valid", () => {
    const p = createValidV2Project();
    expect(assertValidProject(p)).toBe(p);
  });

  it("throws an Error containing every collected error message", () => {
    const p = createValidV2Project();
    p.walls[0].bottom = { kind: "storey", storeyId: "ghost-a", offset: 0 };
    p.walls[1].top = { kind: "storey", storeyId: "ghost-b", offset: 0 };
    expect(() => assertValidProject(p)).toThrow(/ghost-a/);
    expect(() => assertValidProject(p)).toThrow(/ghost-b/);
    expect(() => assertValidProject(p)).toThrow(/Invalid v2 project/);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun run test src/__tests__/domain-v2/validate.test.ts`
Expected: PASS — `assertValidProject` was already exported in Task 4, so the contract holds. All 23 tests pass.

If they fail, return to Task 4 and reconcile.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/domain-v2/validate.test.ts
git commit -m "test(domain-v2): assertValidProject throws/returns contract"
```

---

## Task 8: 全套绿线检查 + 收尾

**Files:** None (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `bun run test`
Expected: PASS — existing tests still pass + ~38 new domain-v2 tests pass.

- [ ] **Step 2: Run the full type check + build**

Run: `bun run build`
Expected: tsc --noEmit clean, vite build succeeds, no warnings about unused exports in `src/domain/v2/`.

- [ ] **Step 3: Confirm new files are isolated**

Run: `git diff --stat main..HEAD`
Expected: Only files under `src/domain/v2/` and `src/__tests__/domain-v2/` and `docs/superpowers/{specs,plans}/2026-04-30-*` should appear. **No** modifications to `src/domain/types.ts`, `src/domain/constraints.ts`, `src/domain/mutations*`, `src/geometry/`, `src/projection/`, `src/components/`, `src/rendering/`, `src/app/`. If anything else shows up, revert it before completing.

- [ ] **Step 4: Final verification commit (no-op or summary)**

If all checks pass, P1 is complete. No additional commit needed; the previous task commits are the trail.

---

## Done Criteria

- `bun run test` 全绿，新测试 ≥ 38 条覆盖 anchors / polygon / fixtures / validate
- `bun run build` 全绿，`tsc --noEmit` 无报错
- 现有 v1 模块（`src/domain/types.ts`、`constraints.ts`、`mutations*`、UI、geometry、projection、rendering）**字面零修改**
- `src/domain/v2/` 下：`types.ts` / `anchors.ts` / `polygon.ts` / `validate.ts` / `fixtures.ts` 五个文件存在并互相 self-contained
- 后续 P2 启动时可直接 `import { ... } from "src/domain/v2/types"` 开始改写 geometry builder

## P1 不做（明确边界）

- 任何 mutation / reducer 接口（P2 视情况，最终 P4 接通）
- persistence load v2 文件 / 拒绝 v1（P4 处理）
- migrate v1 → v2（spec §6.1 已明确不做）
- sample showcase 改写（P5）
- UI / projection / geometry 任何变动（P2-P4）
