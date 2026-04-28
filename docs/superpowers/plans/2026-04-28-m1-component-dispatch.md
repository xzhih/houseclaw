# M1 构件分发统一 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `PropertyPanel.tsx` / `AppShell.tsx` 中按 `selection.kind` 分发的 if/switch/OR 链全部收敛到一个 `selectionRegistry` 中，让加新构件只动 1 处。

**Architecture:** 新增 `src/components/selectionRegistry.tsx`，定义 `SelectionDescriptor<S>` + `SelectionDescriptorMap`（mapped type 强制 exhaustive）+ 三个 helpers：`getDescriptor`、`isSelectionDeletable`、`deleteSelection`。PropertyPanel 用 `EditorRouter` 替代 8 个 if 块；AppShell 调用 helpers 替代 switch / OR 链。8 个编辑器组件签名统一为 `(sel, ctx)` 形式，`StoreyEditor` 内嵌"复制楼层"按钮。

**Tech Stack:** TypeScript / React 19 / Vitest / bun

**关联文档:**
- Spec: `docs/superpowers/specs/2026-04-28-m1-component-dispatch-design.md`
- Roadmap: `docs/2026-04-28-iteration-friction-roadmap.md`

---

## 文件结构

| 文件 | 操作 | 责任 |
|---|---|---|
| `src/components/selectionRegistry.tsx` | 新建 | descriptor 类型、registry map、3 个 helpers |
| `src/components/PropertyPanel.tsx` | 修改 | 编辑器签名统一；用 `EditorRouter` 替代 if 链；导出编辑器 |
| `src/components/AppShell.tsx` | 修改 | `handleDeleteSelection` / 键盘 delete 用 helpers |
| `src/__tests__/selectionRegistry.test.ts` | 新建 | helpers 行为 + exhaustive 哨兵 |

---

## Task 1：编辑器组件签名统一为 `(sel, ctx)`

> **目标**：把 8 个编辑器函数签名改成 `({ sel, ctx })`，PropertyPanel 主体仍用 if 链调用，但参数形态切到新形态。这一步纯重构，现有测试全过即可。

**Files:**
- Modify: `src/components/PropertyPanel.tsx` — 8 个编辑器函数 + 8 个 if-block 的调用点

- [ ] **Step 1.1：新增 `EditorCtx` 与 `Sel<K>` 类型别名**

`src/components/PropertyPanel.tsx` 顶部（在 `EditorProps` 类型附近）加：

```tsx
import type { ObjectSelection } from "../domain/selection";

type EditorCtx = {
  project: HouseProject;
  onProjectChange: (p: HouseProject) => void;
  onApplyWallMaterial: (wallId: string, materialId: string) => void;
  onDuplicateStorey?: (storeyId: string) => void;
};

type Sel<K extends ObjectSelection["kind"]> = Extract<ObjectSelection, { kind: K }>;
```

旧 `EditorProps` / `WallEditorProps` 类型保留——下一步会替换调用点后再删除。

- [ ] **Step 1.2：改写 8 个编辑器签名（保留主体）**

每个编辑器从 `(props: EditorProps)` 改成 `({ sel, ctx }: { sel: Sel<"..."> ; ctx: EditorCtx })`，函数体里把 `project / id / onProjectChange / onApplyWallMaterial / onDuplicateStorey` 替换为 `ctx.project / sel.id / ctx.onProjectChange / ctx.onApplyWallMaterial / ctx.onDuplicateStorey`。

举例（`OpeningEditor`，line 170）：

```tsx
function OpeningEditor({ sel, ctx }: { sel: Sel<"opening">; ctx: EditorCtx }) {
  const opening = ctx.project.openings.find((candidate) => candidate.id === sel.id);
  if (!opening) return null;

  const widthLabel = opening.type === "window" ? "窗宽" : "宽度";
  const apply = (patch: OpeningPatch) =>
    commit(ctx.onProjectChange, patch, (final) => updateOpening(ctx.project, sel.id, final));

  return (/* ...JSX 主体不变... */);
}
```

8 个编辑器逐一对应：

| 函数 | 现有行 | sel 类型 | 用 ctx 字段 |
|---|---|---|---|
| `OpeningEditor` | 170 | `Sel<"opening">` | project, onProjectChange |
| `WallEditor` | 193 | `Sel<"wall">` | project, onProjectChange, onApplyWallMaterial |
| `BalconyEditor` | 253 | `Sel<"balcony">` | project, onProjectChange |
| `StoreyEditor` | 272 | `Sel<"storey">` | project, onProjectChange（onDuplicateStorey 在 Task 7 加） |
| `RoofEditor` | 303 | `Sel<"roof">` | project, onProjectChange（sel 仅占位） |
| `RoofEdgeEditor` | 372 | `Sel<"roof-edge">` | project, onProjectChange；用 `sel.wallId` |
| `SkirtEditor` | 399 | `Sel<"skirt">` | project, onProjectChange |
| `StairEditor` | 448 | `Sel<"stair">` | project, onProjectChange |

- [ ] **Step 1.3：在 PropertyPanel 主体里构造 `ctx` 并改写 if 链调用点**

`PropertyPanel.tsx:97-149` 改写 8 个 `<XxxEditor ... />` 调用：

```tsx
export function PropertyPanel({
  project,
  onApplyWallMaterial,
  onProjectChange,
  onDeleteSelection,
  onDuplicateStorey,
}: PropertyPanelProps) {
  const selection = project.selection;
  const ctx: EditorCtx = { project, onProjectChange, onApplyWallMaterial, onDuplicateStorey };

  const isDeletable =
    selection?.kind === "wall" ||
    selection?.kind === "opening" ||
    selection?.kind === "balcony" ||
    selection?.kind === "stair" ||
    selection?.kind === "skirt" ||
    (selection?.kind === "storey" && project.storeys.length > 1);

  const deleteLabel = selection?.kind === "storey" ? "删除楼层" : "删除";

  return (
    <aside className="property-panel" aria-label="Properties">
      <h2>属性</h2>
      {!selection ? <p className="panel-placeholder">选择墙、门、窗、开孔、阳台、楼梯或楼层查看属性。</p> : null}

      {selection?.kind === "opening" ? <OpeningEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "wall" ? <WallEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "balcony" ? <BalconyEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "storey" ? <StoreyEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "stair" ? <StairEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "roof" ? <RoofEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "roof-edge" ? <RoofEdgeEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "skirt" ? <SkirtEditor sel={selection} ctx={ctx} /> : null}

      {selection?.kind === "storey" && onDuplicateStorey ? (
        <button
          type="button"
          className="property-secondary"
          onClick={() => onDuplicateStorey(selection.id)}
        >
          复制楼层
        </button>
      ) : null}

      {isDeletable ? (
        <button type="button" className="property-delete" onClick={onDeleteSelection}>
          {deleteLabel}
        </button>
      ) : null}
    </aside>
  );
}
```

if 链条目顺序对调（`opening` 仍在第一个）以保持 diff 可读。

- [ ] **Step 1.4：删除不再使用的 `EditorProps` / `WallEditorProps`**

```tsx
// 删掉这两块（line 64-68、189-191）
type EditorProps = { ... };
type WallEditorProps = EditorProps & { ... };
```

- [ ] **Step 1.5：跑 typecheck + 测试**

```bash
bun run lint
bun run test
```

**期望**：全绿。`ui.test.tsx` / `propertyEditing.test.tsx` 因为渲染整个 `<App />` 不感知签名变化。

- [ ] **Step 1.6：commit**

```bash
git add src/components/PropertyPanel.tsx
git commit -m "$(cat <<'EOF'
refactor(property-panel): 编辑器统一接受 (sel, ctx)

为 M1 构件分发 registry 化做准备：8 个 editor 组件签名归一，
PropertyPanel 主体先构造 ctx 再分发，行为不变。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2：导出编辑器组件供 registry 使用

> **目标**：为后续 `selectionRegistry.tsx` 引用 8 个编辑器，把它们从 PropertyPanel.tsx 导出。

**Files:**
- Modify: `src/components/PropertyPanel.tsx` — 8 个编辑器函数前加 `export`

- [ ] **Step 2.1：在每个编辑器函数前加 `export`**

8 处：`OpeningEditor`、`WallEditor`、`BalconyEditor`、`StoreyEditor`、`StairEditor`、`RoofEditor`、`RoofEdgeEditor`、`SkirtEditor`。`EditorCtx` 也 export。

```tsx
export type EditorCtx = { ... };
export function OpeningEditor({ sel, ctx }: { sel: Sel<"opening">; ctx: EditorCtx }) { ... }
// ... 其他 7 个同理
```

- [ ] **Step 2.2：跑 lint + test 确认无回退**

```bash
bun run lint && bun run test
```

**期望**：全绿。

- [ ] **Step 2.3：commit**

```bash
git add src/components/PropertyPanel.tsx
git commit -m "$(cat <<'EOF'
refactor(property-panel): 导出 8 个编辑器组件 + EditorCtx

为 selectionRegistry 引用做准备。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3：创建 `selectionRegistry.tsx` 类型骨架 + 空 helpers

> **目标**：先把 registry 文件结构和类型立起来，让后续 task 可以增量填内容；helpers 先返回保守值，配合下一步 TDD。

**Files:**
- Create: `src/components/selectionRegistry.tsx`

- [ ] **Step 3.1：创建文件，写入类型 + 空 map + 三 helpers 占位**

```tsx
// src/components/selectionRegistry.tsx
import type { ReactNode } from "react";
import type { ObjectSelection, ObjectSelectionKind } from "../domain/selection";
import type { HouseProject } from "../domain/types";
import {
  removeBalcony,
  removeOpening,
  removeSkirt,
  removeStair,
  removeStorey,
  removeWall,
} from "../domain/mutations";
import type { ViewId } from "../domain/types";
import {
  BalconyEditor,
  OpeningEditor,
  RoofEdgeEditor,
  RoofEditor,
  SkirtEditor,
  StairEditor,
  StoreyEditor,
  WallEditor,
  type EditorCtx,
} from "./PropertyPanel";

export type { EditorCtx };

export type SelectionDescriptor<S extends ObjectSelection> = {
  renderEditor(sel: S, ctx: EditorCtx): ReactNode;
  isDeletable?(sel: S, project: HouseProject): boolean;
  remove?(project: HouseProject, sel: S): HouseProject;
  afterRemove?(project: HouseProject, sel: S): HouseProject;
  deleteLabel?: string;
};

export type SelectionDescriptorMap = {
  [K in ObjectSelectionKind]: SelectionDescriptor<Extract<ObjectSelection, { kind: K }>>;
};

export const selectionRegistry: SelectionDescriptorMap = {
  wall: {
    renderEditor: (sel, ctx) => <WallEditor sel={sel} ctx={ctx} />,
    remove: (project, sel) => removeWall(project, sel.id),
  },
  opening: {
    renderEditor: (sel, ctx) => <OpeningEditor sel={sel} ctx={ctx} />,
    remove: (project, sel) => removeOpening(project, sel.id),
  },
  balcony: {
    renderEditor: (sel, ctx) => <BalconyEditor sel={sel} ctx={ctx} />,
    remove: (project, sel) => removeBalcony(project, sel.id),
  },
  stair: {
    renderEditor: (sel, ctx) => <StairEditor sel={sel} ctx={ctx} />,
    remove: (project, sel) => removeStair(project, sel.id),
  },
  skirt: {
    renderEditor: (sel, ctx) => <SkirtEditor sel={sel} ctx={ctx} />,
    remove: (project, sel) => removeSkirt(project, sel.id),
  },
  storey: {
    renderEditor: (sel, ctx) => <StoreyEditor sel={sel} ctx={ctx} />,
    isDeletable: (_sel, project) => project.storeys.length > 1,
    remove: (project, sel) => removeStorey(project, sel.id),
    afterRemove: (project, sel) => {
      if (project.activeView !== `plan-${sel.id}`) return project;
      const fallback = project.storeys[0]?.id;
      if (!fallback) return project;
      return { ...project, activeView: `plan-${fallback}` as ViewId };
    },
    deleteLabel: "删除楼层",
  },
  roof: {
    renderEditor: (sel, ctx) => <RoofEditor sel={sel} ctx={ctx} />,
  },
  "roof-edge": {
    renderEditor: (sel, ctx) => <RoofEdgeEditor sel={sel} ctx={ctx} />,
  },
};

export function getDescriptor<S extends ObjectSelection>(
  sel: S,
): SelectionDescriptor<S> {
  return selectionRegistry[sel.kind] as unknown as SelectionDescriptor<S>;
}

export function isSelectionDeletable(
  sel: ObjectSelection | undefined,
  project: HouseProject,
): boolean {
  if (!sel) return false;
  const d = getDescriptor(sel);
  if (!d.remove) return false;
  return d.isDeletable?.(sel, project) ?? true;
}

export function deleteSelection(
  project: HouseProject,
  sel: ObjectSelection,
): HouseProject {
  const d = getDescriptor(sel);
  if (!d.remove) {
    throw new Error(`selection kind "${sel.kind}" is not deletable`);
  }
  const next = d.remove(project, sel);
  return d.afterRemove ? d.afterRemove(next, sel) : next;
}
```

注意：

- 引入 `ViewId` 类型给 `storey.afterRemove` 用——已存在 `domain/types.ts`，作为命名导入即可。
- `getDescriptor` 用了 `as unknown as` 双 cast，因为 mapped type 不能反向推断。这是 registry pattern 的标准做法，不在 helper 之外暴露。
- 不引入 React 模块本身，因为已通过 `OpeningEditor` 等组件 transitively 满足 jsx 编译；但若 lint 报"need React import"，加 `import * as React from "react";`。

- [ ] **Step 3.2：跑 lint + build 确认编译通过**

```bash
bun run lint
```

**期望**：通过。如果 mapped type 报"missing keys"，检查 `ObjectSelection` 是否新增了未覆盖的 variant（不应该有）。

- [ ] **Step 3.3：跑 test 确认无现有测试受影响**

```bash
bun run test
```

**期望**：全绿。新文件未被任何模块 import，行为完全不变。

- [ ] **Step 3.4：commit**

```bash
git add src/components/selectionRegistry.tsx
git commit -m "$(cat <<'EOF'
feat(selection): selectionRegistry 类型骨架 + 全量 entries

为 M1 构件分发统一引入 SelectionDescriptor / SelectionDescriptorMap
+ 三个 helpers (getDescriptor, isSelectionDeletable, deleteSelection)。
此 commit 仅落地结构，调用方迁移在后续 task 中进行。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4：写 registry helpers 测试（TDD-style，先验证逻辑）

> **目标**：用单测固化 `isSelectionDeletable` 和 `deleteSelection` 行为，包含 storey afterRemove 的 activeView fallback 逻辑。

**Files:**
- Create: `src/__tests__/selectionRegistry.test.ts`

- [ ] **Step 4.1：写测试文件**

```ts
// src/__tests__/selectionRegistry.test.ts
import { describe, expect, it } from "vitest";
import {
  deleteSelection,
  isSelectionDeletable,
  selectionRegistry,
} from "../components/selectionRegistry";
import { createSampleProject } from "../domain/sampleProject";
import type { ObjectSelection, ObjectSelectionKind } from "../domain/selection";
import type { HouseProject, ViewId } from "../domain/types";

const ALL_KINDS: ObjectSelectionKind[] = [
  "wall",
  "opening",
  "balcony",
  "storey",
  "stair",
  "skirt",
  "roof",
  "roof-edge",
];

function withSingleStorey(project: HouseProject): HouseProject {
  const top = project.storeys[0];
  return {
    ...project,
    storeys: [top],
    walls: project.walls.filter((w) => w.storeyId === top.id),
    openings: project.openings.filter((o) =>
      project.walls.some((w) => w.id === o.wallId && w.storeyId === top.id),
    ),
    balconies: project.balconies.filter((b) =>
      project.walls.some((w) => w.id === b.wallId && w.storeyId === top.id),
    ),
    skirts: project.skirts.filter((s) => s.storeyId === top.id),
    activeView: `plan-${top.id}` as ViewId,
  };
}

describe("selectionRegistry", () => {
  it("covers every ObjectSelectionKind", () => {
    for (const kind of ALL_KINDS) {
      expect(selectionRegistry[kind]).toBeDefined();
      expect(typeof selectionRegistry[kind].renderEditor).toBe("function");
    }
  });

  it("only storey carries a custom deleteLabel", () => {
    expect(selectionRegistry.storey.deleteLabel).toBe("删除楼层");
    for (const kind of ALL_KINDS) {
      if (kind === "storey") continue;
      expect(selectionRegistry[kind].deleteLabel).toBeUndefined();
    }
  });

  describe("isSelectionDeletable", () => {
    const project = createSampleProject();
    const wallId = project.walls[0].id;
    const openingId = project.openings[0]?.id;
    const balconyId = project.balconies[0]?.id;
    const skirtId = project.skirts[0]?.id;
    const stairStoreyId = project.storeys.find((s) => s.stair)?.id;
    const storeyId = project.storeys[0].id;

    it("returns false for undefined selection", () => {
      expect(isSelectionDeletable(undefined, project)).toBe(false);
    });

    it("returns true for wall / opening / balcony / skirt / stair", () => {
      const cases: ObjectSelection[] = [
        { kind: "wall", id: wallId },
        ...(openingId ? [{ kind: "opening", id: openingId } as const] : []),
        ...(balconyId ? [{ kind: "balcony", id: balconyId } as const] : []),
        ...(skirtId ? [{ kind: "skirt", id: skirtId } as const] : []),
        ...(stairStoreyId ? [{ kind: "stair", id: stairStoreyId } as const] : []),
      ];
      for (const sel of cases) {
        expect(isSelectionDeletable(sel, project)).toBe(true);
      }
    });

    it("returns true for storey when storeys.length > 1", () => {
      expect(project.storeys.length).toBeGreaterThan(1);
      expect(isSelectionDeletable({ kind: "storey", id: storeyId }, project)).toBe(true);
    });

    it("returns false for storey when storeys.length === 1", () => {
      const single = withSingleStorey(project);
      expect(isSelectionDeletable({ kind: "storey", id: single.storeys[0].id }, single)).toBe(false);
    });

    it("returns false for roof and roof-edge", () => {
      expect(isSelectionDeletable({ kind: "roof" }, project)).toBe(false);
      expect(
        isSelectionDeletable({ kind: "roof-edge", wallId }, project),
      ).toBe(false);
    });
  });

  describe("deleteSelection", () => {
    it("removeStorey resets activeView when deleting current view's storey", () => {
      const project = createSampleProject();
      const targetId = project.storeys[1].id;
      const remainingFirst = project.storeys.find((s) => s.id !== targetId)!.id;
      const start: HouseProject = { ...project, activeView: `plan-${targetId}` as ViewId };

      const next = deleteSelection(start, { kind: "storey", id: targetId });

      expect(next.storeys.find((s) => s.id === targetId)).toBeUndefined();
      expect(next.activeView).toBe(`plan-${remainingFirst}`);
    });

    it("removeStorey preserves activeView when deleting other storey", () => {
      const project = createSampleProject();
      const keepId = project.storeys[0].id;
      const removeId = project.storeys[1].id;
      const start: HouseProject = { ...project, activeView: `plan-${keepId}` as ViewId };

      const next = deleteSelection(start, { kind: "storey", id: removeId });

      expect(next.activeView).toBe(`plan-${keepId}`);
    });

    it("removeWall does not touch activeView", () => {
      const project = createSampleProject();
      const wallId = project.walls[0].id;

      const next = deleteSelection(project, { kind: "wall", id: wallId });

      expect(next.activeView).toBe(project.activeView);
      expect(next.walls.find((w) => w.id === wallId)).toBeUndefined();
    });

    it("throws for non-deletable kinds", () => {
      const project = createSampleProject();
      expect(() => deleteSelection(project, { kind: "roof" })).toThrow();
    });
  });
});
```

- [ ] **Step 4.2：跑测试**

```bash
bun run test src/__tests__/selectionRegistry.test.ts
```

**期望**：全绿。registry 已在 Task 3 实现，所有断言应直接通过。如果某个断言失败，说明 Task 3 实现有偏差，回去修。

- [ ] **Step 4.3：跑全量测试 + lint**

```bash
bun run lint && bun run test
```

**期望**：全绿。

- [ ] **Step 4.4：commit**

```bash
git add src/__tests__/selectionRegistry.test.ts
git commit -m "$(cat <<'EOF'
test(selection): selectionRegistry helpers + 覆盖完备性

锁定 isSelectionDeletable / deleteSelection 行为契约，
含 storey afterRemove activeView fallback 的两条路径。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5：PropertyPanel 用 EditorRouter 替换 if 链

> **目标**：删除 8 个 `selection?.kind === "..."` 的 if-block，替换为单个 `EditorRouter`；`isDeletable` / `deleteLabel` 改用 helpers。

**Files:**
- Modify: `src/components/PropertyPanel.tsx`

- [ ] **Step 5.1：在 PropertyPanel.tsx 引入 helpers + EditorRouter**

文件顶部 import 区加：

```tsx
import {
  getDescriptor,
  isSelectionDeletable,
} from "./selectionRegistry";
```

在文件靠上位置（紧跟 `commit` helper 后面）定义 `EditorRouter`：

```tsx
function EditorRouter({
  selection,
  ctx,
}: {
  selection: ObjectSelection;
  ctx: EditorCtx;
}) {
  const descriptor = getDescriptor(selection);
  return <>{descriptor.renderEditor(selection, ctx)}</>;
}
```

`EditorCtx` 仍由本文件 Task 1 中的本地定义提供，不需要从 selectionRegistry 反向 import。selectionRegistry 通过 `import { type EditorCtx } from "./PropertyPanel"` 拿到——这是单向类型依赖，不构成运行时循环。

- [ ] **Step 5.2：替换 PropertyPanel 主体**

`PropertyPanel.tsx:97-149` 段替换为：

```tsx
export function PropertyPanel({
  project,
  onApplyWallMaterial,
  onProjectChange,
  onDeleteSelection,
  onDuplicateStorey,
}: PropertyPanelProps) {
  const selection = project.selection;
  const ctx: EditorCtx = { project, onProjectChange, onApplyWallMaterial, onDuplicateStorey };

  const isDeletable = isSelectionDeletable(selection, project);
  const deleteLabel = selection
    ? getDescriptor(selection).deleteLabel ?? "删除"
    : "删除";

  return (
    <aside className="property-panel" aria-label="Properties">
      <h2>属性</h2>
      {!selection ? <p className="panel-placeholder">选择墙、门、窗、开孔、阳台、楼梯或楼层查看属性。</p> : null}

      {selection ? <EditorRouter selection={selection} ctx={ctx} /> : null}

      {selection?.kind === "storey" && onDuplicateStorey ? (
        <button
          type="button"
          className="property-secondary"
          onClick={() => onDuplicateStorey(selection.id)}
        >
          复制楼层
        </button>
      ) : null}

      {isDeletable ? (
        <button type="button" className="property-delete" onClick={onDeleteSelection}>
          {deleteLabel}
        </button>
      ) : null}
    </aside>
  );
}
```

注意 storey 复制按钮**这一步先保留在 PropertyPanel 主体**，下一步（Task 7）再挪进 StoreyEditor。

- [ ] **Step 5.3：跑全量测试**

```bash
bun run lint && bun run test
```

**期望**：全绿。`ui.test.tsx`、`propertyEditing.test.tsx` 因为通过文本 / role 查询编辑器内容，不依赖具体组件渲染路径，应不受影响。

如果 `propertyEditing.test.tsx` 出现 `Cannot find role` 之类失败，说明 EditorRouter 没有正确渲染——回去检查 `getDescriptor` 返回值。

- [ ] **Step 5.4：commit**

```bash
git add src/components/PropertyPanel.tsx
git commit -m "$(cat <<'EOF'
refactor(property-panel): EditorRouter 替代 8 个 if 块

PropertyPanel 主体不再按 selection.kind 分发；isDeletable / deleteLabel
改由 selectionRegistry helpers 提供。复制楼层按钮暂留主体，下个 commit
内嵌进 StoreyEditor。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6：AppShell 改用 helpers 替代 switch + OR 链

> **目标**：`handleDeleteSelection` 用 `deleteSelection`，键盘 delete 检查用 `isSelectionDeletable`。

**Files:**
- Modify: `src/components/AppShell.tsx`

- [ ] **Step 6.1：导入 helpers，移除不再用的 mutation imports**

`src/components/AppShell.tsx:23-37` import 块保留 `addBalcony / addOpening / addSkirt / addStair / addStorey / addWall / duplicateStorey`，**移除**：`removeBalcony / removeOpening / removeSkirt / removeStair / removeStorey / removeWall`（已被 selectionRegistry 内部替换）。

新增 import：

```tsx
import { deleteSelection, isSelectionDeletable } from "./selectionRegistry";
```

- [ ] **Step 6.2：重写 `handleDeleteSelection`**

`AppShell.tsx:257-297` 整段替换为：

```tsx
const handleDeleteSelection = () => {
  const sel = project.selection;
  if (!sel || !isSelectionDeletable(sel, project)) return;
  let next: HouseProject;
  try {
    next = deleteSelection(project, sel);
  } catch {
    return;
  }
  dispatch({ type: "replace-project", project: next });
  dispatch({ type: "select", selection: undefined });
};
```

- [ ] **Step 6.3：重写键盘 delete 检查**

`AppShell.tsx:324-333` 段替换为：

```tsx
if (event.key !== "Delete" && event.key !== "Backspace") return;
if (editingField) return;
if (!isSelectionDeletable(project.selection, project)) return;
event.preventDefault();
handleDeleteSelection();
```

删除原来的 `const isStorey = ...` / `const isOther = ...` / `if (!isStorey && !isOther) return;` 三行。

- [ ] **Step 6.4：跑全量测试 + lint**

```bash
bun run lint && bun run test
```

**期望**：全绿。重点关注 `ui.test.tsx` 中删除相关用例（删墙、删开孔、键盘 delete 等），如果失败说明 handler 行为有偏差。

- [ ] **Step 6.5：commit**

```bash
git add src/components/AppShell.tsx
git commit -m "$(cat <<'EOF'
refactor(app-shell): 删除分发 + 键盘 delete 走 selectionRegistry

handleDeleteSelection 6-case switch、键盘 delete OR 链
全部由 isSelectionDeletable / deleteSelection 替代。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7：复制楼层按钮内嵌进 StoreyEditor

> **目标**：把 PropertyPanel 主体里仅剩的 storey 专用 sibling 按钮挪进 `StoreyEditor`，由 `ctx.onDuplicateStorey` 注入。完成后 PropertyPanel 主体不再为任何 kind 写专用分支。

**Files:**
- Modify: `src/components/PropertyPanel.tsx`

- [ ] **Step 7.1：把按钮 JSX 移入 `StoreyEditor`**

在 `StoreyEditor`（line 272 起）末尾，`</section>` 关闭前的位置添加：

```tsx
{ctx.onDuplicateStorey ? (
  <button
    type="button"
    className="property-secondary"
    onClick={() => ctx.onDuplicateStorey?.(sel.id)}
  >
    复制楼层
  </button>
) : null}
```

具体位置：在 `MmField label="进深" ...`（约 line 297-298）和 `</section>` 之间。

- [ ] **Step 7.2：从 PropertyPanel 主体删除复制按钮**

删除 `PropertyPanel.tsx`（Task 5 后）`isDeletable` 之前的：

```tsx
{selection?.kind === "storey" && onDuplicateStorey ? (
  <button ...>复制楼层</button>
) : null}
```

- [ ] **Step 7.3：跑全量测试 + lint**

```bash
bun run lint && bun run test
```

**期望**：全绿。`ui.test.tsx` 如果有"复制楼层"用例（通过 `getByRole("button", { name: "复制楼层" })` 查询），位置变了但仍能找到。

- [ ] **Step 7.4：commit**

```bash
git add src/components/PropertyPanel.tsx
git commit -m "$(cat <<'EOF'
refactor(storey-editor): 复制楼层按钮内嵌

PropertyPanel 主体彻底不再按 selection.kind 写专用 sibling。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8：验收

> **目标**：跑全量验证，做 spec Done criteria 的手动 walk-through 与 exhaustiveness 验收实验。

- [ ] **Step 8.1：跑 build + test 全绿**

```bash
bun run build
bun run test
```

**期望**：

- `bun run build`（含 `tsc --noEmit`）零错误
- `bun run test`（含新增的 `selectionRegistry.test.ts`）全绿

- [ ] **Step 8.2：启动 dev server 做手动 walk-through**

```bash
bun run dev
```

按 spec Done criteria #3 清单逐项验证：

1. 选中 8 种 kind（wall / opening / balcony / stair / skirt / storey / roof / roof-edge），编辑面板正确渲染
2. 5 种可删 kind 点删除按钮 + Delete 键 → 实体被移除，选中态清空
3. 单层时（手动删剩 1 层后再选 storey）删除按钮 disabled + Delete 键无效
4. 多层时 storey 删除按钮可用，删除当前 activeView 楼层后 activeView 切到剩余第一个
5. 选中 storey 时复制楼层按钮可用并工作

不需要 commit，验证完关 dev server。如发现回退，回到对应 task 修复，再跑测试 + 提补丁 commit。

- [ ] **Step 8.3：exhaustiveness 实验（不入库）**

`src/domain/selection.ts` 临时加一个 variant：

```ts
export type ObjectSelection =
  | { kind: "wall"; id: string }
  // ... existing variants
  | { kind: "test"; id: string }; // 临时
```

跑：

```bash
bun run lint
```

**期望**：

- TS 仅在 `src/components/selectionRegistry.tsx` 报错（"Property 'test' is missing"）
- 其他文件（PropertyPanel、AppShell）**没有** 新报错

如果其他文件也报错，说明 helper 抽象不够干净——回去修。

实验完毕**回滚**：

```bash
git checkout -- src/domain/selection.ts
```

确认 `git status` 干净。

- [ ] **Step 8.4：（可选）squash 整段或保留 commit chain**

如果想给 reviewer 一个 PR-friendly 的"原子重构"，可以：

```bash
git rebase -i <Task-1-之前的-HEAD>   # squash 所有 task commits 为一个
```

但本计划默认**保留分步 commit chain**（每个 task 一个 commit），便于 bisect / revert。

- [ ] **Step 8.5：（可选）创建 PR**

如果当前在 `xzhih-dev` 上想推到一个独立分支：

```bash
git checkout -b refactor/component-dispatch
git push -u origin refactor/component-dispatch
gh pr create --title "M1: 构件分发统一 (selectionRegistry)" --body "..."
```

否则停留 `xzhih-dev` 即可。

---

## 总结：commit 链

完成后 `git log` 应该看到：

```
refactor(storey-editor): 复制楼层按钮内嵌
refactor(app-shell): 删除分发 + 键盘 delete 走 selectionRegistry
refactor(property-panel): EditorRouter 替代 8 个 if 块
test(selection): selectionRegistry helpers + 覆盖完备性
feat(selection): selectionRegistry 类型骨架 + 全量 entries
refactor(property-panel): 导出 8 个编辑器组件 + EditorCtx
refactor(property-panel): 编辑器统一接受 (sel, ctx)
docs(spec): M1 构件分发统一设计
docs: 迭代摩擦优化路线图（M1-M4）
```

7 个代码 commit + 2 个文档 commit。

## 验收契约（重申 spec）

1. ✅ `bun run test` 全绿
2. ✅ `bun run build` 全绿
3. ✅ 8 种 selection kind 行为不回退（手动 walk-through）
4. ✅ ObjectSelection 加新 variant 时，TS 报错收敛在 `selectionRegistry.tsx` 单文件
