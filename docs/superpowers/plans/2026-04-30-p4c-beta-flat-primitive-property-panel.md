# P4C-β: 扁平 3D 原型 — PropertyPanel 全面重写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 写一个 v2 的 PropertyPanel —— 选中任何对象后右侧面板显示对应 editor，能改全部字段（含 anchor）。每种 selection kind（wall/opening/slab/roof/balcony/stair）一个 editor 子组件。StoreysEditor 移进 PropertyPanel 顶部（spec §5.3 原意）。

**Architecture:** Editor 组件用统一 layout（label + value + unit）。共享 `AnchorPicker`（spec §5.2，storey 下拉 + offset 输入 + "自定义" → absolute）和 `MaterialPicker`（按 kind 过滤的下拉）两个原子。`NumberField`（v1 已有）直接复用。所有改动 dispatch v2 reducer mutation actions（P4C-α 已落）。

**Tech Stack:** TypeScript 5、React 19、vitest。

**Spec 引用：** `docs/superpowers/specs/2026-04-30-flat-primitive-refactor-design.md` §5.2、§5.3、§5.4。

**关键决策：**
- StoreysEditor 从 AppShell 顶部移进 PropertyPanel 顶部 section
- PropertyPanel 显示在 2D 模式右侧（侧栏 ~320px），ToolPalette 横移到 ViewTabs 下方一个水平 strip
- AnchorPicker 是共享原子，所有有 anchor 字段的 editor 用它
- 6 种 kind 各自有 editor：Wall / Opening / Slab / Roof / Balcony / Stair
- 选中状态空时面板显示 hint："选择对象以编辑属性"
- Roof.edges 用 4 个下拉切换 eave/gable/hip
- 不显示 polygon 顶点编辑（v1 也没；用户改 polygon 通过删/重画）
- Stair editor 不接通"创建楼梯"流程（那是 P4C-γ，工具点击）

---

## File Structure

新建（编辑器目录 + 共享原子）：

- `src/components/editors/AnchorPicker.tsx` — Anchor 选择器（共享）
- `src/components/editors/MaterialPicker.tsx` — 材质选择器（共享）
- `src/components/editors/WallEditor.tsx`
- `src/components/editors/OpeningEditor.tsx`
- `src/components/editors/SlabEditor.tsx`
- `src/components/editors/RoofEditor.tsx`
- `src/components/editors/BalconyEditor.tsx`
- `src/components/editors/StairEditor.tsx`
- `src/components/PropertyPanel.tsx` — orchestrator（吃 selection，分派到对应 editor，含 StoreysEditor）

修改：

- `src/components/AppShell.tsx` — 2D mode 加 PropertyPanel 右侧栏，移除顶部 StoreysEditor（搬进 PropertyPanel）
- `src/styles.css` — PropertyPanel + editor 样式

不动：v1 文件、所有 v2 已落代码（domain/v2、geometry/v2、projection/v2、rendering/v2、StoreysEditor.tsx）、Preview3D、DrawingSurface2D、ToolPalette、ViewTabs、ElevationSideTabs、StoreyHeightStrip。

P4C-β 结束后：
- `bun run test` 全套绿（PropertyPanel 自身写 1-2 个集成测试）
- `bun run build` 全套绿
- 浏览器 2D 模式右侧出现 PropertyPanel，选中任何对象（点 wall/opening/slab/roof/balcony/stair）后能在右侧改字段，dispatch 路径打通

---

## Task 1: AnchorPicker + MaterialPicker 共享原子

**Files:**
- Create: `src/components/editors/AnchorPicker.tsx`
- Create: `src/components/editors/MaterialPicker.tsx`
- Create: `src/__tests__/components/editors/AnchorPicker.test.tsx`

### Step 1: Write failing test for AnchorPicker

Create `src/__tests__/components/editors/AnchorPicker.test.tsx`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnchorPicker } from "../../../components/editors/AnchorPicker";
import type { Anchor, Storey } from "../../../domain/v2/types";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

describe("AnchorPicker", () => {
  it("renders the storey label and offset value for storey-anchored", () => {
    const onChange = vi.fn();
    render(
      <AnchorPicker
        anchor={{ kind: "storey", storeyId: "1f", offset: 0.5 }}
        storeys={STOREYS}
        label="底"
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("底 锚点")).toHaveValue("1f");
    expect(screen.getByLabelText("底 偏移")).toHaveValue(0.5);
  });

  it("renders the absolute z value when anchor kind is absolute", () => {
    const onChange = vi.fn();
    render(
      <AnchorPicker
        anchor={{ kind: "absolute", z: 2.4 }}
        storeys={STOREYS}
        label="底"
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("底 锚点")).toHaveValue("__absolute__");
    expect(screen.getByLabelText("底 z")).toHaveValue(2.4);
  });

  it("dispatches onChange when storey changes (preserves offset)", () => {
    const onChange = vi.fn();
    render(
      <AnchorPicker
        anchor={{ kind: "storey", storeyId: "1f", offset: 0.3 }}
        storeys={STOREYS}
        label="底"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("底 锚点"), { target: { value: "2f" } });
    expect(onChange).toHaveBeenCalledWith({
      kind: "storey",
      storeyId: "2f",
      offset: 0.3,
    });
  });

  it("switches to absolute mode preserving the resolved z", () => {
    const onChange = vi.fn();
    render(
      <AnchorPicker
        anchor={{ kind: "storey", storeyId: "2f", offset: 0.5 }}
        storeys={STOREYS}
        label="底"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("底 锚点"), { target: { value: "__absolute__" } });
    // 2F (3.2) + 0.5 = 3.7
    expect(onChange).toHaveBeenCalledWith({
      kind: "absolute",
      z: 3.7,
    });
  });
});
```

### Step 2: Run test (expect FAIL)

```bash
bun run test src/__tests__/components/editors/AnchorPicker.test.tsx
```

### Step 3: Implement AnchorPicker

Create `src/components/editors/AnchorPicker.tsx`:

```typescript
import { useId } from "react";
import type { Anchor, Storey } from "../../domain/v2/types";

type AnchorPickerProps = {
  anchor: Anchor;
  storeys: Storey[];
  label: string;
  onChange: (anchor: Anchor) => void;
};

const ABSOLUTE_KEY = "__absolute__";

function resolveZ(anchor: Anchor, storeys: Storey[]): number {
  if (anchor.kind === "absolute") return anchor.z;
  const storey = storeys.find((s) => s.id === anchor.storeyId);
  return (storey?.elevation ?? 0) + anchor.offset;
}

export function AnchorPicker({ anchor, storeys, label, onChange }: AnchorPickerProps) {
  const selectId = useId();
  const offsetId = useId();

  const selectValue = anchor.kind === "absolute" ? ABSOLUTE_KEY : anchor.storeyId;

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === ABSOLUTE_KEY) {
      onChange({ kind: "absolute", z: resolveZ(anchor, storeys) });
    } else {
      const offset = anchor.kind === "storey" ? anchor.offset : 0;
      onChange({ kind: "storey", storeyId: v, offset });
    }
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    if (anchor.kind === "absolute") {
      onChange({ kind: "absolute", z: v });
    } else {
      onChange({ kind: "storey", storeyId: anchor.storeyId, offset: v });
    }
  };

  return (
    <div className="anchor-picker">
      <label className="anchor-picker-label" htmlFor={selectId}>{label}</label>
      <div className="anchor-picker-row">
        <select
          id={selectId}
          aria-label={`${label} 锚点`}
          value={selectValue}
          onChange={handleSelectChange}
        >
          {storeys.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
          <option value={ABSOLUTE_KEY}>自定义</option>
        </select>
        <span className="anchor-picker-sep">+</span>
        <input
          id={offsetId}
          type="number"
          step="0.05"
          aria-label={`${label} ${anchor.kind === "absolute" ? "z" : "偏移"}`}
          value={anchor.kind === "absolute" ? anchor.z : anchor.offset}
          onChange={handleNumberChange}
        />
        <span className="anchor-picker-unit">m</span>
      </div>
    </div>
  );
}
```

### Step 4: Implement MaterialPicker

Create `src/components/editors/MaterialPicker.tsx`:

```typescript
import { useId } from "react";
import type { Material, MaterialKind } from "../../domain/v2/types";

type MaterialPickerProps = {
  materials: Material[];
  value: string;
  /** Optional: filter the dropdown to materials matching one or more kinds. */
  kinds?: MaterialKind[];
  label: string;
  onChange: (materialId: string) => void;
};

export function MaterialPicker({ materials, value, kinds, label, onChange }: MaterialPickerProps) {
  const id = useId();
  const filtered = kinds ? materials.filter((m) => kinds.includes(m.kind)) : materials;
  return (
    <div className="material-picker">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {filtered.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </div>
  );
}
```

### Step 5: Run tests + build

```bash
bun run test src/__tests__/components/editors/AnchorPicker.test.tsx
bun run build
```

Expected: 4 anchor picker tests pass; build green.

### Step 6: Commit

```bash
git add src/components/editors/AnchorPicker.tsx src/components/editors/MaterialPicker.tsx src/__tests__/components/editors/AnchorPicker.test.tsx
git commit -m "feat(editors): AnchorPicker + MaterialPicker (shared atoms)"
```

## Context

- **Working directory:** `/Users/zero/code/houseclaw`
- **Branch:** `main`
- **Previous commit (BASE):** `df347c2` (P4C-α final)

## Strict isolation

This task touches ONLY:
- `src/components/editors/AnchorPicker.tsx` (create)
- `src/components/editors/MaterialPicker.tsx` (create)
- `src/__tests__/components/editors/AnchorPicker.test.tsx` (create)

NO modifications elsewhere.

## Self-Review

- 4 AnchorPicker tests pass?
- `bun run build` green?
- Only 3 files touched?
- Commit message exact: `feat(editors): AnchorPicker + MaterialPicker (shared atoms)`?

## Report

Status, what implemented, test results, files changed, commit SHA.

---

## Task 2: WallEditor + OpeningEditor

**Files:**
- Create: `src/components/editors/WallEditor.tsx`
- Create: `src/components/editors/OpeningEditor.tsx`

Each editor takes the entity + project (for storeys/materials lookup) + dispatch. Renders fields in a vertical stack.

### Step 1: Implement `src/components/editors/WallEditor.tsx`

```typescript
import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Wall } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { AnchorPicker } from "./AnchorPicker";
import { MaterialPicker } from "./MaterialPicker";

type WallEditorProps = {
  wall: Wall;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function tryDispatch(
  fn: () => ProjectActionV2,
  dispatch: (action: ProjectActionV2) => void,
): string | undefined {
  try {
    dispatch(fn());
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function WallEditor({ wall, project, dispatch }: WallEditorProps) {
  return (
    <div className="entity-editor wall-editor">
      <div className="entity-editor-title">墙 {wall.id}</div>
      <AnchorPicker
        label="底"
        anchor={wall.bottom}
        storeys={project.storeys}
        onChange={(bottom) => dispatch({ type: "update-wall", wallId: wall.id, patch: { bottom } })}
      />
      <AnchorPicker
        label="顶"
        anchor={wall.top}
        storeys={project.storeys}
        onChange={(top) => dispatch({ type: "update-wall", wallId: wall.id, patch: { top } })}
      />
      <NumberField
        label="厚度"
        value={wall.thickness}
        step={0.01}
        min={0.05}
        unit="m"
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-wall", wallId: wall.id, patch: { thickness: v } }),
          dispatch,
        )}
      />
      <label className="entity-editor-checkbox">
        <input
          type="checkbox"
          checked={wall.exterior}
          onChange={(e) => dispatch({
            type: "update-wall",
            wallId: wall.id,
            patch: { exterior: e.target.checked },
          })}
        />
        外墙
      </label>
      <MaterialPicker
        label="材质"
        materials={project.materials}
        value={wall.materialId}
        kinds={["wall", "decor"]}
        onChange={(materialId) => dispatch({ type: "update-wall", wallId: wall.id, patch: { materialId } })}
      />
    </div>
  );
}
```

### Step 2: Implement `src/components/editors/OpeningEditor.tsx`

```typescript
import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Opening, OpeningType } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { MaterialPicker } from "./MaterialPicker";

type OpeningEditorProps = {
  opening: Opening;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

const TYPES: Array<{ id: OpeningType; label: string }> = [
  { id: "door", label: "门" },
  { id: "window", label: "窗" },
  { id: "void", label: "空洞" },
];

function tryDispatch(
  fn: () => ProjectActionV2,
  dispatch: (action: ProjectActionV2) => void,
): string | undefined {
  try {
    dispatch(fn());
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function OpeningEditor({ opening, project, dispatch }: OpeningEditorProps) {
  return (
    <div className="entity-editor opening-editor">
      <div className="entity-editor-title">开洞 {opening.id} (墙 {opening.wallId})</div>
      <div className="entity-editor-row">
        <label>类型</label>
        <select
          value={opening.type}
          onChange={(e) => dispatch({
            type: "update-opening",
            openingId: opening.id,
            patch: { type: e.target.value as OpeningType },
          })}
        >
          {TYPES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
        </select>
      </div>
      <NumberField
        label="距墙起点"
        value={opening.offset}
        step={0.05}
        min={0}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { offset: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="离地高度"
        value={opening.sillHeight}
        step={0.05}
        min={0}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { sillHeight: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="宽度"
        value={opening.width}
        step={0.05}
        min={0.1}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { width: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="高度"
        value={opening.height}
        step={0.05}
        min={0.1}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { height: v } }),
          dispatch,
        )}
      />
      <MaterialPicker
        label="框架材质"
        materials={project.materials}
        value={opening.frameMaterialId}
        kinds={["frame"]}
        onChange={(materialId) => dispatch({ type: "update-opening", openingId: opening.id, patch: { frameMaterialId: materialId } })}
      />
    </div>
  );
}
```

### Step 3: Run build + tests

```bash
bun run build
bun run test
```

Expected: green.

### Step 4: Commit

```bash
git add src/components/editors/WallEditor.tsx src/components/editors/OpeningEditor.tsx
git commit -m "feat(editors): WallEditor + OpeningEditor"
```

---

## Task 3: SlabEditor + RoofEditor + BalconyEditor + StairEditor

**Files:**
- Create: `src/components/editors/SlabEditor.tsx`
- Create: `src/components/editors/RoofEditor.tsx`
- Create: `src/components/editors/BalconyEditor.tsx`
- Create: `src/components/editors/StairEditor.tsx`

Pattern is the same as WallEditor / OpeningEditor. Each editor:
1. Imports props types (`ProjectStateV2`, `ProjectActionV2`, the entity type).
2. Imports NumberField + AnchorPicker / MaterialPicker as needed.
3. Renders an entity title + per-field controls.
4. Each field's onChange dispatches the corresponding `update-X` action.

### Step 1: SlabEditor

```typescript
// src/components/editors/SlabEditor.tsx
import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Slab } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { AnchorPicker } from "./AnchorPicker";
import { MaterialPicker } from "./MaterialPicker";

type SlabEditorProps = {
  slab: Slab;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function tryDispatch(fn: () => ProjectActionV2, dispatch: (action: ProjectActionV2) => void): string | undefined {
  try { dispatch(fn()); return undefined; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

export function SlabEditor({ slab, project, dispatch }: SlabEditorProps) {
  return (
    <div className="entity-editor slab-editor">
      <div className="entity-editor-title">楼板 {slab.id}</div>
      <AnchorPicker
        label="顶面"
        anchor={slab.top}
        storeys={project.storeys}
        onChange={(top) => dispatch({ type: "update-slab", slabId: slab.id, patch: { top } })}
      />
      <NumberField
        label="厚度"
        value={slab.thickness}
        step={0.01}
        min={0.05}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-slab", slabId: slab.id, patch: { thickness: v } }),
          dispatch,
        )}
      />
      <MaterialPicker
        label="顶面材质"
        materials={project.materials}
        value={slab.materialId}
        kinds={["decor", "wall"]}
        onChange={(materialId) => dispatch({ type: "update-slab", slabId: slab.id, patch: { materialId } })}
      />
      <div className="entity-editor-readonly">
        多边形 {slab.polygon.length} 顶点{slab.holes && slab.holes.length ? `, ${slab.holes.length} 个 hole` : ""}
      </div>
    </div>
  );
}
```

### Step 2: RoofEditor

```typescript
// src/components/editors/RoofEditor.tsx
import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Roof, RoofEdgeKind } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { AnchorPicker } from "./AnchorPicker";
import { MaterialPicker } from "./MaterialPicker";

type RoofEditorProps = {
  roof: Roof;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

const EDGE_KINDS: Array<{ id: RoofEdgeKind; label: string }> = [
  { id: "eave", label: "檐口" },
  { id: "gable", label: "山墙" },
  { id: "hip", label: "戗脊" },
];

function tryDispatch(fn: () => ProjectActionV2, dispatch: (action: ProjectActionV2) => void): string | undefined {
  try { dispatch(fn()); return undefined; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

function deg(r: number): number { return (r * 180) / Math.PI; }
function rad(d: number): number { return (d * Math.PI) / 180; }

export function RoofEditor({ roof, project, dispatch }: RoofEditorProps) {
  return (
    <div className="entity-editor roof-editor">
      <div className="entity-editor-title">屋顶 {roof.id}</div>
      <AnchorPicker
        label="檐口高度"
        anchor={roof.base}
        storeys={project.storeys}
        onChange={(base) => dispatch({ type: "update-roof", roofId: roof.id, patch: { base } })}
      />
      <NumberField
        label="坡度"
        value={deg(roof.pitch)}
        step={1}
        min={5}
        max={60}
        unit="°"
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-roof", roofId: roof.id, patch: { pitch: rad(v) } }),
          dispatch,
        )}
      />
      <NumberField
        label="出檐"
        value={roof.overhang}
        step={0.05}
        min={0}
        max={2}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-roof", roofId: roof.id, patch: { overhang: v } }),
          dispatch,
        )}
      />
      <MaterialPicker
        label="瓦面材质"
        materials={project.materials}
        value={roof.materialId}
        kinds={["roof"]}
        onChange={(materialId) => dispatch({ type: "update-roof", roofId: roof.id, patch: { materialId } })}
      />
      <div className="entity-editor-edges">
        <div className="entity-editor-row-header">边类型</div>
        {roof.edges.map((edgeKind, i) => (
          <div className="entity-editor-row" key={i}>
            <label>边 {i}</label>
            <select
              value={edgeKind}
              onChange={(e) => {
                const newEdges = [...roof.edges];
                newEdges[i] = e.target.value as RoofEdgeKind;
                dispatch({ type: "update-roof", roofId: roof.id, patch: { edges: newEdges } });
              }}
            >
              {EDGE_KINDS.map((k) => (<option key={k.id} value={k.id}>{k.label}</option>))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Step 3: BalconyEditor

```typescript
// src/components/editors/BalconyEditor.tsx
import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Balcony } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { AnchorPicker } from "./AnchorPicker";
import { MaterialPicker } from "./MaterialPicker";

type BalconyEditorProps = {
  balcony: Balcony;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function tryDispatch(fn: () => ProjectActionV2, dispatch: (action: ProjectActionV2) => void): string | undefined {
  try { dispatch(fn()); return undefined; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

export function BalconyEditor({ balcony, project, dispatch }: BalconyEditorProps) {
  return (
    <div className="entity-editor balcony-editor">
      <div className="entity-editor-title">阳台 {balcony.id} (墙 {balcony.attachedWallId})</div>
      <AnchorPicker
        label="楼板顶"
        anchor={balcony.slabTop}
        storeys={project.storeys}
        onChange={(slabTop) => dispatch({ type: "update-balcony", balconyId: balcony.id, patch: { slabTop } })}
      />
      <NumberField
        label="距墙起点"
        value={balcony.offset}
        step={0.05}
        min={0}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-balcony", balconyId: balcony.id, patch: { offset: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="宽度"
        value={balcony.width}
        step={0.05}
        min={0.5}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-balcony", balconyId: balcony.id, patch: { width: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="进深"
        value={balcony.depth}
        step={0.05}
        min={0.5}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-balcony", balconyId: balcony.id, patch: { depth: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="楼板厚度"
        value={balcony.slabThickness}
        step={0.01}
        min={0.05}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-balcony", balconyId: balcony.id, patch: { slabThickness: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="栏杆高度"
        value={balcony.railingHeight}
        step={0.05}
        min={0.5}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-balcony", balconyId: balcony.id, patch: { railingHeight: v } }),
          dispatch,
        )}
      />
      <MaterialPicker
        label="底面材质"
        materials={project.materials}
        value={balcony.materialId}
        onChange={(materialId) => dispatch({ type: "update-balcony", balconyId: balcony.id, patch: { materialId } })}
      />
      <MaterialPicker
        label="栏杆材质"
        materials={project.materials}
        value={balcony.railingMaterialId}
        kinds={["frame", "railing"]}
        onChange={(materialId) => dispatch({ type: "update-balcony", balconyId: balcony.id, patch: { railingMaterialId: materialId } })}
      />
    </div>
  );
}
```

### Step 4: StairEditor

```typescript
// src/components/editors/StairEditor.tsx
import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Stair, StairEdge, StairShape, StairTurn } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { AnchorPicker } from "./AnchorPicker";
import { MaterialPicker } from "./MaterialPicker";

type StairEditorProps = {
  stair: Stair;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

const SHAPES: Array<{ id: StairShape; label: string }> = [
  { id: "straight", label: "直跑" },
  { id: "l", label: "L 形" },
  { id: "u", label: "U 形" },
];

const EDGES: Array<{ id: StairEdge; label: string }> = [
  { id: "+y", label: "+y（向后上）" },
  { id: "-y", label: "-y（向前上）" },
  { id: "+x", label: "+x（向左上）" },
  { id: "-x", label: "-x（向右上）" },
];

const TURNS: Array<{ id: StairTurn; label: string }> = [
  { id: "left", label: "向左转" },
  { id: "right", label: "向右转" },
];

function tryDispatch(fn: () => ProjectActionV2, dispatch: (action: ProjectActionV2) => void): string | undefined {
  try { dispatch(fn()); return undefined; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

function deg(r: number): number { return (r * 180) / Math.PI; }
function rad(d: number): number { return (d * Math.PI) / 180; }

export function StairEditor({ stair, project, dispatch }: StairEditorProps) {
  return (
    <div className="entity-editor stair-editor">
      <div className="entity-editor-title">楼梯 {stair.id}</div>
      <AnchorPicker
        label="起点 z"
        anchor={stair.from}
        storeys={project.storeys}
        onChange={(from) => dispatch({ type: "update-stair", stairId: stair.id, patch: { from } })}
      />
      <AnchorPicker
        label="终点 z"
        anchor={stair.to}
        storeys={project.storeys}
        onChange={(to) => dispatch({ type: "update-stair", stairId: stair.id, patch: { to } })}
      />
      <div className="entity-editor-row">
        <label>形状</label>
        <select
          value={stair.shape}
          onChange={(e) => dispatch({ type: "update-stair", stairId: stair.id, patch: { shape: e.target.value as StairShape } })}
        >
          {SHAPES.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
        </select>
      </div>
      <div className="entity-editor-row">
        <label>底边方向</label>
        <select
          value={stair.bottomEdge}
          onChange={(e) => dispatch({ type: "update-stair", stairId: stair.id, patch: { bottomEdge: e.target.value as StairEdge } })}
        >
          {EDGES.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
        </select>
      </div>
      {(stair.shape === "l" || stair.shape === "u") && (
        <div className="entity-editor-row">
          <label>转向</label>
          <select
            value={stair.turn ?? "right"}
            onChange={(e) => dispatch({ type: "update-stair", stairId: stair.id, patch: { turn: e.target.value as StairTurn } })}
          >
            {TURNS.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
          </select>
        </div>
      )}
      <NumberField
        label="X 位置"
        value={stair.x}
        step={0.05}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { x: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="Y 位置"
        value={stair.y}
        step={0.05}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { y: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="宽度"
        value={stair.width}
        step={0.05}
        min={0.6}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { width: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="进深"
        value={stair.depth}
        step={0.05}
        min={0.6}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { depth: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="踏步深度"
        value={stair.treadDepth}
        step={0.01}
        min={0.2}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { treadDepth: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="旋转"
        value={deg(stair.rotation ?? 0)}
        step={1}
        min={-180}
        max={180}
        unit="°"
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { rotation: rad(v) } }),
          dispatch,
        )}
      />
      <MaterialPicker
        label="材质"
        materials={project.materials}
        value={stair.materialId}
        onChange={(materialId) => dispatch({ type: "update-stair", stairId: stair.id, patch: { materialId } })}
      />
    </div>
  );
}
```

### Step 5: Run build + tests

```bash
bun run build
bun run test
```

Expected: green.

### Step 6: Commit

```bash
git add src/components/editors/SlabEditor.tsx src/components/editors/RoofEditor.tsx src/components/editors/BalconyEditor.tsx src/components/editors/StairEditor.tsx
git commit -m "feat(editors): SlabEditor + RoofEditor + BalconyEditor + StairEditor"
```

---

## Task 4: PropertyPanel orchestrator + AppShell wiring

**Files:**
- Create: `src/components/PropertyPanel.tsx`
- Modify: `src/components/AppShell.tsx` (add PropertyPanel, remove standalone StoreysEditor from top)
- Modify: `src/styles.css` (PropertyPanel + editor + layout CSS)

### Step 1: Create `src/components/PropertyPanel.tsx`

```typescript
import type { ProjectActionV2, ProjectStateV2, SelectionV2 } from "../app/v2/projectReducer";
import { StoreysEditor } from "./StoreysEditor";
import { BalconyEditor } from "./editors/BalconyEditor";
import { OpeningEditor } from "./editors/OpeningEditor";
import { RoofEditor } from "./editors/RoofEditor";
import { SlabEditor } from "./editors/SlabEditor";
import { StairEditor } from "./editors/StairEditor";
import { WallEditor } from "./editors/WallEditor";

type PropertyPanelProps = {
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function SelectionBody({
  project,
  selection,
  dispatch,
}: {
  project: ProjectStateV2;
  selection: NonNullable<SelectionV2>;
  dispatch: (action: ProjectActionV2) => void;
}) {
  if (selection.kind === "wall") {
    const wall = project.walls.find((w) => w.id === selection.wallId);
    return wall ? <WallEditor wall={wall} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">墙 {selection.wallId} 已被删除</p>;
  }
  if (selection.kind === "opening") {
    const opening = project.openings.find((o) => o.id === selection.openingId);
    return opening ? <OpeningEditor opening={opening} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">开洞 {selection.openingId} 已被删除</p>;
  }
  if (selection.kind === "slab") {
    const slab = project.slabs.find((s) => s.id === selection.slabId);
    return slab ? <SlabEditor slab={slab} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">楼板 {selection.slabId} 已被删除</p>;
  }
  if (selection.kind === "roof") {
    const roof = project.roofs.find((r) => r.id === selection.roofId);
    return roof ? <RoofEditor roof={roof} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">屋顶 {selection.roofId} 已被删除</p>;
  }
  if (selection.kind === "balcony") {
    const balcony = project.balconies.find((b) => b.id === selection.balconyId);
    return balcony ? <BalconyEditor balcony={balcony} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">阳台 {selection.balconyId} 已被删除</p>;
  }
  if (selection.kind === "stair") {
    const stair = project.stairs.find((s) => s.id === selection.stairId);
    return stair ? <StairEditor stair={stair} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">楼梯 {selection.stairId} 已被删除</p>;
  }
  if (selection.kind === "storey") {
    return <p className="property-panel-hint">楼层属性请在顶部楼层编辑器中修改</p>;
  }
  return null;
}

export function PropertyPanel({ project, dispatch }: PropertyPanelProps) {
  const { selection } = project;
  return (
    <aside className="property-panel" aria-label="属性面板">
      <section className="property-panel-section">
        <h3 className="property-panel-section-title">楼层</h3>
        <StoreysEditor project={project} dispatch={dispatch} />
      </section>
      <section className="property-panel-section">
        <h3 className="property-panel-section-title">选中对象</h3>
        {selection ? (
          <SelectionBody project={project} selection={selection} dispatch={dispatch} />
        ) : (
          <p className="property-panel-hint">在 2D 视图中点击对象以编辑属性</p>
        )}
      </section>
    </aside>
  );
}
```

### Step 2: Update `src/components/AppShell.tsx`

Read current AppShell. Then:

1. Replace the standalone `<StoreysEditor>` at the top of `editor-2d` (it's now inside PropertyPanel).
2. Add `<PropertyPanel>` as the right sibling of `<DrawingSurface2D>` and `<ToolPalette>`.

Find:
```tsx
        ) : (
          <div className="editor-2d">
            <StoreysEditor project={project} dispatch={dispatch} />
            <ViewTabs ... />
            {isElevation ? (
              <ElevationSideTabs ... />
            ) : null}
            <div className="editor-2d-body">
              <DrawingSurface2D ... />
              <ToolPalette ... />
            </div>
          </div>
        )}
```

Replace with:
```tsx
        ) : (
          <div className="editor-2d">
            <ViewTabs
              project={project}
              onChange={(viewId) => dispatch({ type: "set-view", viewId })}
            />
            {isElevation ? (
              <ElevationSideTabs
                activeView={project.activeView}
                onChange={(viewId) => dispatch({ type: "set-view", viewId })}
              />
            ) : null}
            <div className="editor-2d-body">
              <DrawingSurface2D
                project={project}
                onSelect={(selection) => dispatch({ type: "select", selection })}
              />
              <ToolPalette
                activeTool={project.activeTool}
                onChange={(toolId) => dispatch({ type: "set-tool", toolId })}
              />
              <PropertyPanel project={project} dispatch={dispatch} />
            </div>
          </div>
        )}
```

Update imports: remove `StoreysEditor` import, add `PropertyPanel` import.

### Step 3: Append CSS to `src/styles.css`

```css

/* P4C-β: PropertyPanel */
.property-panel {
  width: 320px;
  border-left: 1px solid #ddd;
  background: white;
  overflow-y: auto;
  padding: 12px;
  font-size: 0.9em;
}
.property-panel-section { margin-bottom: 16px; }
.property-panel-section-title {
  font-size: 0.95em;
  font-weight: 500;
  color: #444;
  margin: 0 0 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid #eee;
}
.property-panel-hint, .property-panel-missing {
  color: #888;
  font-style: italic;
  padding: 8px 0;
}
.property-panel-missing { color: #c00; }

/* Generic entity editor styles */
.entity-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.entity-editor-title {
  font-weight: 500;
  color: #333;
  font-size: 0.9em;
  padding-bottom: 4px;
}
.entity-editor-readonly {
  color: #888;
  font-size: 0.85em;
  padding: 4px 0;
}
.entity-editor-row, .anchor-picker, .material-picker, .number-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.entity-editor-row label, .anchor-picker-label, .material-picker label, .number-field label {
  font-size: 0.85em;
  color: #555;
}
.entity-editor-row select, .material-picker select, .anchor-picker select, .anchor-picker input {
  padding: 3px 6px;
  border: 1px solid #ccc;
  border-radius: 3px;
  font-size: 0.95em;
}
.anchor-picker-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.anchor-picker select { min-width: 80px; }
.anchor-picker input { width: 80px; }
.anchor-picker-sep { color: #888; }
.anchor-picker-unit { color: #888; font-size: 0.85em; }
.entity-editor-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.9em;
}
.entity-editor-edges { margin-top: 8px; }
.entity-editor-row-header {
  font-weight: 500;
  color: #555;
  font-size: 0.85em;
  margin-bottom: 4px;
}
```

Also remove the now-redundant `.storeys-editor { border-bottom: 1px solid #ddd; ... }` styling that puts it as a top strip — let it inherit from `.property-panel` instead. Specifically, find `.storeys-editor` and remove `border-bottom: 1px solid #ddd; padding: 12px 16px;` (so it sits cleanly inside the property panel).

### Step 4: Run build + tests

```bash
bun run build
bun run test
```

Expected: green.

### Step 5: Commit

```bash
git add src/components/PropertyPanel.tsx src/components/AppShell.tsx src/styles.css
git commit -m "feat(components): PropertyPanel + StoreysEditor relocation"
```

---

## Task 5: Final sweep + browser smoke

### Step 1: Full test suite

```bash
bun run test
```

Expected: all tests + 6 skipped pass.

### Step 2: Build

```bash
bun run build
```

Expected: tsc + vite green.

### Step 3: File count

```bash
git diff [P4C-α-final]..HEAD --stat
```

Expected: ~12 files added/modified.

### Step 4: Manual smoke

User opens browser:
- 2D mode: see PropertyPanel on the right (~320px), with Storeys section at top + selection hint
- Click on a wall in plan view → wall fields (anchor / thickness / material / exterior) appear in PropertyPanel
- Edit thickness → 3D preview updates
- Switch storey via top dropdown in WallEditor → wall moves vertically
- Click on opening → opening editor appears
- Click on roof in roof view → roof editor with edge type pickers
- Empty selection: panel shows hint

---

## Done Criteria

- `bun run test` 全套绿
- `bun run build` 全套绿
- 浏览器 2D 模式右侧出现 PropertyPanel，选中对象后能编辑全部字段
- StoreysEditor 已移进 PropertyPanel 顶部
- v1 + 已落 v2 代码（domain/v2、geometry/v2、projection/v2、rendering/v2）字面零修改

## P4C-β 不做（明确边界）

- 工具点击 → 创建对象（"画墙"工具点击后能画墙）→ P4C-γ
- 拖拽编辑（移动墙端点、调整开洞位置）→ P4C-γ
- 重启用 P4A 期间 skip 的 6 个测试 → P4C-γ
- PropertyPanel 在 3D 模式下也显示 → 后续 polish
- 编辑器 polish（输入校验红线、错误提示等高级 UX）→ 后续 polish
- 撤销/重做 → 后续 phase

## 风险

1. **AnchorPicker 的 onChange 时机**：currently `onChange` per keystroke — 用户敲数字过程中每一个中间状态都会 dispatch，可能触发 assertValidProject 抛错。推荐用 NumberField 的 onCommit 模式（blur 才 commit）但 anchor offset 用了原生 input，缺这层保护。**实际效果浏览器跑过再决定是否补**。
2. **Mutation throw → React 错误边界**：editor 没 try-catch 包装 dispatch，违法编辑会导致 React 渲染中断。`tryDispatch` helper 已在每个 NumberField 的 onCommit 里包装；anchor / select 字段的 dispatch 没包装 —— 浏览器测试如果遇到崩溃，加 try-catch wrapper。
3. **CSS 调整可能与现有样式冲突**：尤其 `.storeys-editor` 的样式从顶部 strip 转为 panel 内嵌，可能视觉错位。Manual smoke 时检查。
