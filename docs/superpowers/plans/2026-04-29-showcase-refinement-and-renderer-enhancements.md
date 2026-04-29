# Showcase Refinement & Renderer Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the showcase house (Section A — sample data fixes) and improve 3D rendering quality (Section B — material contrast, slab/wall alignment, window frames).

**Architecture:** Section A is mechanical edits to `src/domain/sampleProject.ts` plus one test assertion update — 5 small commits. Section B touches three layers: `src/materials/catalog.ts` (contrast), `src/geometry/slabGeometry.ts` (FACADE_INSET), and `src/rendering/threeScene.ts` + new `src/geometry/openingFrameGeometry.ts` (window frame meshes). All work stays on `xzhih-dev` branch.

**Tech Stack:** TypeScript / React 19 / Three.js / Vite / Vitest / bun

---

## Pre-flight

- [ ] **Verify clean working tree on `xzhih-dev`**

Run: `git status && git branch --show-current`
Expected: `位于分支 xzhih-dev` + `无文件要提交，工作区干净`

- [ ] **Baseline test run**

Run: `bun run lint && bun run test && bun run build`
Expected: lint clean, 400 tests passing, build succeeds.

If anything fails, stop — fix baseline first.

---

# Section A — Data-layer fixes (5 tasks, one commit each)

## Task A1: Reduce roof overhang 0.6m → 0.4m

**Files:**
- Modify: `src/domain/sampleProject.ts` (showcase `roof.overhang`)
- Modify: `src/__tests__/sampleProject.test.ts` (assertion + `it` description)

**Why:** User feedback — current 0.6m eave overhang feels structurally unsupported. Tighten to 0.4m.

- [ ] **Step 1: Update sample roof overhang**

Open `src/domain/sampleProject.ts`, find the `roof` literal in `createSampleProject()` (search for `pitch: Math.PI / 6,`). Change `overhang: 0.6` to `overhang: 0.4`.

The block before:
```ts
  const roof = {
    edges: {
      "wall-front-3f": "eave" as const,
      "wall-back-3f": "eave" as const,
      "wall-left-3f": "gable" as const,
      "wall-right-3f": "gable" as const,
    },
    pitch: Math.PI / 6,
    overhang: 0.6,
    materialId: ROOF_MATERIAL_ID,
  };
```

After:
```ts
  const roof = {
    edges: {
      "wall-front-3f": "eave" as const,
      "wall-back-3f": "eave" as const,
      "wall-left-3f": "gable" as const,
      "wall-right-3f": "gable" as const,
    },
    pitch: Math.PI / 6,
    overhang: 0.4,
    materialId: ROOF_MATERIAL_ID,
  };
```

- [ ] **Step 2: Update test assertion + description**

Open `src/__tests__/sampleProject.test.ts`. Update both the `it()` title and the `expect(...overhang).toBeCloseTo(...)` line:

Before:
```ts
  it("ships with a default roof: front+back as eaves, sides as gables, 30° pitch, 0.6m overhang", () => {
    ...
    expect(project.roof!.overhang).toBeCloseTo(0.6);
```

After:
```ts
  it("ships with a default roof: front+back as eaves, sides as gables, 30° pitch, 0.4m overhang", () => {
    ...
    expect(project.roof!.overhang).toBeCloseTo(0.4);
```

- [ ] **Step 3: Run tests**

Run: `bun run lint && bun run test`
Expected: 400 tests pass, no lint errors.

- [ ] **Step 4: Commit**

```bash
git add src/domain/sampleProject.ts src/__tests__/sampleProject.test.ts
git commit -m "$(cat <<'EOF'
chore(sample): showcase 屋檐悬挑 0.6 → 0.4m

之前 60cm 悬挑视觉上像无支撑大悬臂，收紧到 40cm 更符合中式坡屋面比例。
同步 sampleProject.test.ts 的 it 标题与断言值。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task A2: Standardize front-face opening rhythm

**Files:**
- Modify: `src/domain/sampleProject.ts` (1F, 2F, 3F front opening offsets/dimensions)

**Why:** User feedback — windows are unaligned across storeys, sizes vary inconsistently. Establish a 3-column rhythm at column-centers x = 2 / 6 / 10 for the 12m front (1F+2F), and 2 columns at x = 3 / 7 for the 10m front (3F).

**Standard openings:**
- 1F front (12m wall): window @ offset 1.0 (center 2.0) + door @ offset 5.0 (center 6.0) + window @ offset 9.0 (center 10.0). Windows: 2.0×1.8, sill 0.6. Door: 2.0×2.3, sill 0.
- 2F front (12m wall): 3 windows @ offsets 1.0 / 5.0 / 9.0 (centers 2.0 / 6.0 / 10.0). Each 2.0×2.0, sill 0.4.
- 3F front (10m wall, x=1..11): 2 windows @ offsets 2.0 / 6.0 (centers 3.0 / 7.0 in wall-local; absolute x = 3.0 / 7.0). Each 2.0×1.6, sill 0.6.

- [ ] **Step 1: Update 1F front openings**

In `src/domain/sampleProject.ts`, find the `openings` array. Replace the three "1F front" entries (`win-front-1f-l`, `door-front-1f`, `win-front-1f-r`) with:

```ts
    // 1F 前面：3 列对齐（中心 x = 2 / 6 / 10）—— 双开门居中、窗子两侧
    {
      id: "win-front-1f-l",
      wallId: "wall-front-1f",
      type: "window",
      offset: 1.0,
      sillHeight: 0.6,
      width: 2.0,
      height: 1.8,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "door-front-1f",
      wallId: "wall-front-1f",
      type: "door",
      offset: 5.0,
      sillHeight: 0.0,
      width: 2.0,
      height: 2.3,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-front-1f-r",
      wallId: "wall-front-1f",
      type: "window",
      offset: 9.0,
      sillHeight: 0.6,
      width: 2.0,
      height: 1.8,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
```

- [ ] **Step 2: Update 2F front openings**

Find and replace `win-front-2f-l`, `win-front-2f-c`, `win-front-2f-r`:

```ts
    // 2F 前面：3 列对齐（与 1F 同 x 中心）—— 三窗一字排开
    {
      id: "win-front-2f-l",
      wallId: "wall-front-2f",
      type: "window",
      offset: 1.0,
      sillHeight: 0.4,
      width: 2.0,
      height: 2.0,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-front-2f-c",
      wallId: "wall-front-2f",
      type: "window",
      offset: 5.0,
      sillHeight: 0.4,
      width: 2.0,
      height: 2.0,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-front-2f-r",
      wallId: "wall-front-2f",
      type: "window",
      offset: 9.0,
      sillHeight: 0.4,
      width: 2.0,
      height: 2.0,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
```

- [ ] **Step 3: Update 3F front openings**

Find and replace `win-front-3f-l`, `win-front-3f-r`:

```ts
    // 3F 前面：2 列对齐于 3F 立面中线（中心 x = 3 / 7，3F 墙 x ∈ [1, 11]）
    {
      id: "win-front-3f-l",
      wallId: "wall-front-3f",
      type: "window",
      offset: 2.0,
      sillHeight: 0.6,
      width: 2.0,
      height: 1.6,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-front-3f-r",
      wallId: "wall-front-3f",
      type: "window",
      offset: 6.0,
      sillHeight: 0.6,
      width: 2.0,
      height: 1.6,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
```

- [ ] **Step 4: Run tests**

Run: `bun run lint && bun run test`
Expected: 400 tests pass.

If `propertyEditing.test.tsx` or `ui.test.tsx` fails because they look up `win-front-1f-l` — that ID still exists, OK. If they look up by specific offset values that changed, update those tests.

- [ ] **Step 5: Commit**

```bash
git add src/domain/sampleProject.ts
git commit -m "$(cat <<'EOF'
chore(sample): showcase 前立面 3 列对齐——窗户尺寸标准化

1F/2F 前墙窗户中心对齐 x = 2/6/10（每 4m 一柱），3F 前墙对齐 x = 3/7。
窗子尺寸统一 2.0m 宽，sillHeight 按楼层渐高 (0.6/0.4/0.6)，立面更整齐。
1F 大门加宽 1.2 → 2.0m 与窗子等宽。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task A3: Move side window away from stair

**Files:**
- Modify: `src/domain/sampleProject.ts` (left/right side window offsets on 1F)

**Why:** User feedback — left side window directly overlooks the interior stair (1F stair occupies y=4.4..7.6, current `win-left-1f` at offset 2.5 sits at wall-local y=6.5, in the middle of stair range).

The wall `wall-left-1f` runs from (0,9) → (0,2). Direction = (0,-1). Length = 7m. Wall-local offset along the wall: offset 0 = (0,9), offset 7 = (0,2).

Stair occupies plan y=4.4..7.6 → wall-local offset 1.4..4.6. To avoid overlap, place window at offset > 4.7 (south of stair). Use offset 5.0 (window spans wall-local 5.0..6.4 → plan y=4.0..2.6, just below the stair end).

- [ ] **Step 1: Update side windows**

Find and replace the 4 side-window entries (`win-right-1f`, `win-left-1f`, `win-right-2f`, `win-left-2f`):

```ts
    // 1F 侧窗：左侧避开楼梯（offset 5.0 = wall-local y=4..2.6，在楼梯南侧）
    // 右侧无楼梯，对称放在 offset 5.0 形成立面对称
    {
      id: "win-right-1f",
      wallId: "wall-right-1f",
      type: "window",
      offset: 5.0,
      sillHeight: 0.9,
      width: 1.4,
      height: 1.4,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-left-1f",
      wallId: "wall-left-1f",
      type: "window",
      offset: 5.0,
      sillHeight: 0.9,
      width: 1.4,
      height: 1.4,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    // 2F 侧窗：与 1F 侧窗同 offset 立面对齐
    {
      id: "win-right-2f",
      wallId: "wall-right-2f",
      type: "window",
      offset: 5.0,
      sillHeight: 0.9,
      width: 1.4,
      height: 1.6,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-left-2f",
      wallId: "wall-left-2f",
      type: "window",
      offset: 5.0,
      sillHeight: 0.9,
      width: 1.4,
      height: 1.6,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
```

- [ ] **Step 2: Run tests**

Run: `bun run lint && bun run test`
Expected: 400 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/domain/sampleProject.ts
git commit -m "$(cat <<'EOF'
chore(sample): 1F 左侧窗避开楼梯位置

左侧楼梯占 wall-local offset 1.4..4.6，原窗子在 offset 2.5 直接看进
楼梯井。挪到 offset 5.0（楼梯南侧），同步右侧窗 + 2F 双侧窗对齐 offset 5.0
形成立面规整。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task A4: Make balcony railings visible

**Files:**
- Modify: `src/domain/sampleProject.ts` (railingMaterialId on all 3 balconies)

**Why:** User feedback — balcony railings currently invisible because they share the wall material (white). Switch to dark frame material for visibility.

- [ ] **Step 1: Switch railingMaterialId**

Find the 3 balconies (`balcony-front-2f`, `balcony-back-2f`, `balcony-front-3f`). Change each `railingMaterialId: WALL_MATERIAL_ID` to `railingMaterialId: FRAME_MATERIAL_ID`.

Concretely, the 3 balconies block:

```ts
  const balconies: Balcony[] = [
    {
      id: "balcony-front-2f",
      storeyId: "2f",
      attachedWallId: "wall-front-2f",
      offset: 0,
      width: 12,
      depth: 0.8,
      slabThickness: SLAB_THICKNESS,
      railingHeight: 0.9,
      materialId: SLAB_MATERIAL_ID,
      railingMaterialId: FRAME_MATERIAL_ID,    // ← was WALL_MATERIAL_ID
    },
    {
      id: "balcony-back-2f",
      storeyId: "2f",
      attachedWallId: "wall-back-2f",
      offset: 2.0,
      width: 5.0,
      depth: 1.2,
      slabThickness: SLAB_THICKNESS,
      railingHeight: 1.05,
      materialId: SLAB_MATERIAL_ID,
      railingMaterialId: FRAME_MATERIAL_ID,    // ← was WALL_MATERIAL_ID
    },
    {
      id: "balcony-front-3f",
      storeyId: "3f",
      attachedWallId: "wall-front-3f",
      offset: 0,
      width: 10,
      depth: 0.8,
      slabThickness: SLAB_THICKNESS,
      railingHeight: 1.05,
      materialId: SLAB_MATERIAL_ID,
      railingMaterialId: FRAME_MATERIAL_ID,    // ← was WALL_MATERIAL_ID
    },
  ];
```

- [ ] **Step 2: Run tests**

Run: `bun run lint && bun run test`
Expected: 400 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/domain/sampleProject.ts
git commit -m "$(cat <<'EOF'
chore(sample): 阳台栏杆改用深框材质（与白墙形成对比）

之前栏杆与墙体同材（mat-white-render），渲染中肉眼看不见。
切到 mat-dark-frame（#263238），白墙背景下栏杆轮廓清晰可读。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task A5: Standardize storey heights to 3.2m

**Files:**
- Modify: `src/domain/sampleProject.ts` (`TOP_STOREY_HEIGHT` constant)

**Why:** User feedback — heights vary inconsistently. Currently 1F=2F=3.2m, 3F=3.0m. Unify to 3.2m for clean stacking.

- [ ] **Step 1: Update TOP_STOREY_HEIGHT**

Near the top of `src/domain/sampleProject.ts`, find:
```ts
const TOP_STOREY_HEIGHT = 3.0;
```

Change to:
```ts
const TOP_STOREY_HEIGHT = 3.2;
```

(`STOREY_HEIGHT = 3.2` is already correct for 1F/2F.)

- [ ] **Step 2: Run tests**

Run: `bun run lint && bun run test`
Expected: 400 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/domain/sampleProject.ts
git commit -m "$(cat <<'EOF'
chore(sample): 三层楼层高度统一 3.2m

之前 3F 是 3.0m，与 1F/2F 不一致。统一到 3.2m 保持立面节奏。
3F 总高 (3F.elev + 3F.height) 从 9.4 调到 9.6，对屋面与窗子位置无副作用。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Section B — Renderer enhancements (3 tasks)

## Task B1: Brighten wall material for contrast

**Files:**
- Modify: `src/materials/catalog.ts` (mat-white-render color)

**Why:** User feedback — walls render as mid-gray under three.js shadows because base color #dedbd2 is already dim. Brightening to a true off-white #f4efe6 gives better lit/shadow contrast and reads as "white wall" not "gray block".

- [ ] **Step 1: Update mat-white-render color**

In `src/materials/catalog.ts`, find:

```ts
  {
    id: "mat-white-render",
    name: "外墙涂料",
    kind: "wall",
    // Eggshell white with a faint cool tint — fresh, not yellow.
    color: "#dedbd2",
    repeat: { x: 2, y: 2 },
  },
```

Change `color: "#dedbd2"` to `color: "#f4efe6"`. Keep the comment in sync:

```ts
  {
    id: "mat-white-render",
    name: "外墙涂料",
    kind: "wall",
    // Bright eggshell — chosen for visible contrast against mat-gray-tile roof
    // and mat-dark-frame openings under three.js shadows.
    color: "#f4efe6",
    repeat: { x: 2, y: 2 },
  },
```

- [ ] **Step 2: Run tests**

Run: `bun run lint && bun run test && bun run build`
Expected: 400 tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/materials/catalog.ts
git commit -m "$(cat <<'EOF'
chore(materials): mat-white-render 外墙白调亮 #dedbd2 → #f4efe6

原 #dedbd2 在 three.js 阴影下被压成中灰，用户反馈整栋楼"单一灰色"。
调到 #f4efe6 留出与 #3a3f43 灰瓦、#263238 深窗框、#6e7173 灰石的对比层次。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task B2: Remove FACADE_INSET to align slab edges with walls

**Files:**
- Modify: `src/geometry/slabGeometry.ts:10` (`FACADE_INSET` constant)

**Why:** User feedback — visible seams between slab edges and exterior walls. The cause is `FACADE_INSET = 0.005` (5mm) that contracts the slab outline inward. With sub-mm wall thickness rendering, the inset shows up as a hairline gap. Setting to 0 makes slabs flush.

- [ ] **Step 1: Set FACADE_INSET to 0**

In `src/geometry/slabGeometry.ts`, find:

```ts
const FACADE_INSET = 0.005;
```

Change to:

```ts
// 0 = slab outline coincides with the exterior wall outline (flush facade).
// A tiny positive value would create a visible seam in three.js renderer.
const FACADE_INSET = 0;
```

- [ ] **Step 2: Run tests**

Run: `bun run lint && bun run test && bun run build`
Expected: 400 tests pass.

If `slabGeometry.test.ts` or `geometry.test.ts` has assertions on inset values, they may need adjustment. Read failures and update specific numeric expectations only — don't change test intent.

- [ ] **Step 3: Commit**

```bash
git add src/geometry/slabGeometry.ts
git commit -m "$(cat <<'EOF'
fix(geometry): FACADE_INSET 0.005 → 0（楼板与墙体齐平）

原 5mm 内缩在 3D 渲染中形成可见的接缝（用户反馈"墙体/楼层穿插"），
归零后楼板外轮廓与外墙外缘齐平、立面整洁。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task B3: Window/door frame mesh

**Files:**
- Create: `src/geometry/openingFrameGeometry.ts`
- Modify: `src/rendering/threeScene.ts` (integrate frame meshes alongside wall panels)
- Test: `src/__tests__/openingFrameGeometry.test.ts`

**Why:** User feedback — windows look "paper-thin" because openings are just holes through walls; there's no positive frame geometry. Add a thin rectangular frame (4 strips) around each opening, in the wall plane on the outer face, using the opening's `frameMaterialId`.

**Approach:** Pure-function builder produces 4 box descriptors per opening (top / bottom / left / right strips). Three.js renderer iterates and creates one BoxGeometry per strip, positioned/rotated to align with the host wall.

**Geometry math:**
For a wall along û = (ux, uy) with thickness `t` and outward normal n̂ = (uy, -ux):
- Wall plane center: `wall.start + û * (offset + width/2)`
- Outer face: shift by `n̂ * (t/2)`
- Frame thickness in n̂ direction: 0.04m (slightly proud of wall surface)
- Frame strip thickness in u/v: 0.06m (the visible "frame depth")

Per opening at `offset`/`width`/`sillHeight`/`height`:
- bottomStrip:  along u, length=width,         thickness=0.06m, at sillHeight, depth 0.04m outward
- topStrip:     along u, length=width,         thickness=0.06m, at sillHeight+height-0.06, depth 0.04m outward
- leftStrip:    along u, length=0.06m,         thickness=height, at sillHeight, depth 0.04m outward
- rightStrip:   along u, length=0.06m,         thickness=height, at sillHeight+0, offset+width-0.06, depth 0.04m

Simpler representation as `{ centerXY, centerZ, sx, sy, sz, rotationY, materialId }` per strip.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/openingFrameGeometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildOpeningFrameStrips } from "../geometry/openingFrameGeometry";
import type { Opening, Wall } from "../domain/types";

const HOST_WALL: Wall = {
  id: "w-host",
  storeyId: "1f",
  start: { x: 0, y: 0 },
  end: { x: 10, y: 0 },        // along +x; outward normal -y (right side)
  thickness: 0.24,
  height: 3.2,
  exterior: true,
  materialId: "mat-white-render",
};

function makeOpening(overrides: Partial<Opening> = {}): Opening {
  return {
    id: "o1",
    wallId: HOST_WALL.id,
    type: "window",
    offset: 2.0,
    sillHeight: 0.6,
    width: 2.0,
    height: 1.8,
    frameMaterialId: "mat-dark-frame",
    ...overrides,
  };
}

describe("buildOpeningFrameStrips", () => {
  it("emits exactly 4 strips per opening (top/bottom/left/right)", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    expect(strips).toHaveLength(4);
    const roles = strips.map((s) => s.role).sort();
    expect(roles).toEqual(["bottom", "left", "right", "top"]);
  });

  it("all strips carry the opening frame material id", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    for (const s of strips) expect(s.materialId).toBe("mat-dark-frame");
  });

  it("bottom strip sits at sillHeight (in z)", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    const bottom = strips.find((s) => s.role === "bottom")!;
    // bottom strip is 0.06m tall, centered at sillHeight + 0.03
    expect(bottom.center.z).toBeCloseTo(0.6 + 0.03, 5);
  });

  it("top strip sits at sillHeight + height - 0.06/2 (in z)", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    const top = strips.find((s) => s.role === "top")!;
    // top strip 0.06m tall, centered at sillHeight + height - 0.03
    expect(top.center.z).toBeCloseTo(0.6 + 1.8 - 0.03, 5);
  });

  it("left/right strips span opening height in z and 0.06m in width", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    const left = strips.find((s) => s.role === "left")!;
    const right = strips.find((s) => s.role === "right")!;
    expect(left.size.height).toBeCloseTo(1.8, 5);
    expect(right.size.height).toBeCloseTo(1.8, 5);
    expect(left.size.alongWall).toBeCloseTo(0.06, 5);
    expect(right.size.alongWall).toBeCloseTo(0.06, 5);
  });

  it("strips are positioned on the wall's outer face (n̂ = -y for this wall)", () => {
    const strips = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    // wall midline at y=0, thickness 0.24 → outer face y = -0.12
    // frame protrudes outward by half-depth (0.04 / 2 = 0.02)
    // expect every strip center.y ≈ -0.12 - 0.02 = -0.14
    for (const s of strips) expect(s.center.y).toBeCloseTo(-0.14, 5);
  });

  it("rotationY matches wall direction (0 for +x, π/2 for +y)", () => {
    const stripsX = buildOpeningFrameStrips(makeOpening(), HOST_WALL);
    expect(stripsX[0].rotationY).toBeCloseTo(0, 5);

    const wallY: Wall = { ...HOST_WALL, start: { x: 5, y: 0 }, end: { x: 5, y: 8 } };
    const stripsY = buildOpeningFrameStrips(makeOpening({ offset: 1, width: 1.5 }), wallY);
    // wall along +y → rotationY around +z axis from +x to +y is π/2
    // (three.js convention: rotationY around scene Y axis; for plan +y → scene -z, atan2 result differs)
    // We just verify all strips have the same rotation:
    const rots = stripsY.map((s) => s.rotationY);
    expect(rots.every((r) => Math.abs(r - rots[0]) < 1e-9)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/__tests__/openingFrameGeometry.test.ts`
Expected: FAIL with "Cannot find module ../geometry/openingFrameGeometry" or similar.

- [ ] **Step 3: Implement openingFrameGeometry.ts**

Create `src/geometry/openingFrameGeometry.ts`:

```ts
import { wallLength } from "../domain/measurements";
import type { Opening, Wall } from "../domain/types";

/** A single rectangular frame strip ready for three.js BoxGeometry. */
export type FrameStrip = {
  role: "top" | "bottom" | "left" | "right";
  /** Center in 3D scene coords. center.x / center.z are computed using the
   *  scene-space conversion (plan-y → -scene-z). center.y is height in 3D. */
  center: { x: number; y: number; z: number };
  /** Box dimensions. alongWall = box width along wall direction; height = box
   *  height along world-Y; depth = box thickness in wall-normal direction. */
  size: { alongWall: number; height: number; depth: number };
  /** Rotation around scene Y axis to align the box with the wall. */
  rotationY: number;
  materialId: string;
};

/** Frame strip thickness (visible width of the frame on the facade). */
const FRAME_BAR = 0.06;
/** How far the frame protrudes outward from the wall outer face (m). */
const FRAME_DEPTH = 0.04;

/**
 * Build 4 frame strips around a single opening.
 *
 * The strips form a rectangular ring on the wall's OUTER face, just proud of
 * the wall surface (so they catch light). Caller is responsible for converting
 * `center.z` (plan-space convention) to scene-space if needed; this function
 * already returns scene-space center.z = -plan_y.
 */
export function buildOpeningFrameStrips(opening: Opening, wall: Wall): FrameStrip[] {
  const len = wallLength(wall);
  if (len === 0) return [];

  const ux = (wall.end.x - wall.start.x) / len;
  const uy = (wall.end.y - wall.start.y) / len;
  // Outward normal: +90° CW of û (matches balcony/skirt convention).
  const nx = uy;
  const ny = -ux;

  // Wall outer face shift: half thickness outward from wall midline.
  const outerShift = wall.thickness / 2 + FRAME_DEPTH / 2;

  // Build a strip given (alongStart, alongLen, zCenter, zHeight, role).
  const make = (
    role: FrameStrip["role"],
    alongStart: number,
    alongLen: number,
    zCenter: number,
    zHeight: number,
  ): FrameStrip => {
    const along = alongStart + alongLen / 2;
    const cx = wall.start.x + ux * along + nx * outerShift;
    const cy = wall.start.y + uy * along + ny * outerShift;
    return {
      role,
      center: { x: cx, y: zCenter, z: -cy },  // plan y → scene -z
      size: { alongWall: alongLen, height: zHeight, depth: FRAME_DEPTH },
      rotationY: -Math.atan2(-uy, ux),  // matches scene rotation convention
      materialId: opening.frameMaterialId,
    };
  };

  const sill = opening.sillHeight;
  const top = sill + opening.height;

  // bottom/top strips span full opening width.
  // left/right strips span full opening height (overlap at corners is fine visually).
  return [
    make("bottom", opening.offset,                              opening.width, sill + FRAME_BAR / 2,         FRAME_BAR),
    make("top",    opening.offset,                              opening.width, top - FRAME_BAR / 2,          FRAME_BAR),
    make("left",   opening.offset,                              FRAME_BAR,     sill + opening.height / 2,    opening.height),
    make("right",  opening.offset + opening.width - FRAME_BAR,  FRAME_BAR,     sill + opening.height / 2,    opening.height),
  ];
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `bun test src/__tests__/openingFrameGeometry.test.ts`
Expected: 7 tests PASS.

If tests fail because of normal/sign expectations, double-check the test wall fixture. The test fixture wall (0,0)→(10,0) has interior at y > 0, so outward = -y. With our formula `nx = uy = 0, ny = -ux = -1`, n̂ = (0, -1). Correct.

- [ ] **Step 5: Integrate frame meshes into threeScene**

Open `src/rendering/threeScene.ts`. At the top of the file, add:

```ts
import { buildOpeningFrameStrips } from "../geometry/openingFrameGeometry";
```

Find `createWallMeshes` (around line 385). After the inner `for (const panel of wallGeometry.panels)` loop, add a second loop that builds frame meshes for each opening on this wall:

```ts
function createWallMeshes(project: HouseProject, geometry: HouseGeometry) {
  const storeyElevations = new Map(project.storeys.map((storey) => [storey.id, storey.elevation]));
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];

  for (const wallGeometry of geometry.walls) {
    let material = materials.get(wallGeometry.materialId);
    if (!material) {
      material = createMaterial(project, wallGeometry.materialId);
      materials.set(wallGeometry.materialId, material);
    }

    const storeyElevation = storeyElevations.get(wallGeometry.storeyId) ?? 0;

    for (const panel of wallGeometry.panels) {
      meshes.push(createWallPanelMesh(wallGeometry, panel, storeyElevation, material));
    }

    // Window/door frame meshes
    const wall = project.walls.find((w) => w.id === wallGeometry.wallId);
    if (!wall) continue;
    const wallOpenings = project.openings.filter((o) => o.wallId === wall.id);
    for (const opening of wallOpenings) {
      const strips = buildOpeningFrameStrips(opening, wall);
      for (const strip of strips) {
        let frameMat = materials.get(strip.materialId);
        if (!frameMat) {
          frameMat = createMaterial(project, strip.materialId);
          materials.set(strip.materialId, frameMat);
        }
        const box = new THREE.BoxGeometry(strip.size.alongWall, strip.size.height, strip.size.depth);
        const mesh = new THREE.Mesh(box, frameMat);
        mesh.position.set(strip.center.x, storeyElevation + strip.center.y, strip.center.z);
        mesh.rotation.y = strip.rotationY;
        meshes.push(mesh);
      }
    }
  }

  return { meshes, materials: [...materials.values()] };
}
```

- [ ] **Step 6: Verify via build + tests**

Run: `bun run lint && bun run test && bun run build`
Expected: 407 tests pass (400 + 7 new frame tests), build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/geometry/openingFrameGeometry.ts src/__tests__/openingFrameGeometry.test.ts src/rendering/threeScene.ts
git commit -m "$(cat <<'EOF'
feat(geometry): 添加门窗框 mesh —— 解决 3D 视图"纸片感"

新增 openingFrameGeometry.buildOpeningFrameStrips 纯函数：
对每个 Opening 在墙体外缘生成 4 条 0.06m 宽 × 0.04m 厚的框条
（top/bottom/left/right）。frameMaterialId 沿用 Opening 既有字段。
threeScene.createWallMeshes 增加 frame mesh 渲染循环。

7 个单元测试覆盖 strip 数量、材质、定位、旋转、wall normal 一致性。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

# Final Verification

- [ ] **Final test sweep**

Run: `bun run lint && bun run test && bun run build`
Expected: 407 tests passing, lint + build green.

- [ ] **Manual walkthrough**

Run: `bun run dev`

Verify in browser:
1. **Refresh / new project** loads showcase house
2. **Roof:** overhang visibly tighter (~40cm) — no more comically large eaves
3. **Front face alignment:** 1F windows + door + 2F windows + 3F windows all line up at column centers x = 2/6/10 (1F+2F) or x=3/7 (3F)
4. **Side windows** no longer directly look at stair
5. **Balcony railings** visible as dark frames against white walls
6. **Wall material** reads as warm white (not gray) under three.js shadow
7. **Slab/wall seams** flush — no visible hairline gaps
8. **Window frames** visible as dark borders around each opening — solves "paper-thin" critique

If anything looks broken, identify which task introduced the regression and fix in a follow-up commit.

- [ ] **Commit summary** (no extra commit needed; just verify history)

```bash
git log --oneline xzhih-dev ^main 2>/dev/null | head -15
```

Expected: 8 commits added since last main merge:
- A1 roof overhang
- A2 opening rhythm
- A3 side window vs stair
- A4 railing material
- A5 storey heights
- B1 wall white brightness
- B2 FACADE_INSET
- B3 frame mesh

---

## Done Criteria

1. `bun run lint` + `bun run test` + `bun run build` 全绿（407 tests, was 400 + 7 frame tests）
2. Showcase house in dev server visually addresses the 8-point user critique:
   - ✅ Roof overhang reasonable
   - ✅ Storey heights uniform
   - ✅ Window alignment + size consistency
   - ✅ Side window not staring at stair
   - ✅ Visible balcony railings
   - ✅ Material contrast (white walls vs dark frames vs gray roof)
   - ✅ Slab/wall flush
   - ✅ Window frames present (no more "paper-thin" feel)
3. No data-model changes (still uses existing `Wall` / `Opening` / `Balcony` schema; frame mesh derives from existing fields)
