# M1：构件分发统一

日期：2026-04-28
分支：`xzhih-dev`（M1 完成后视情况另起 `refactor/component-dispatch`）
路线图：`docs/2026-04-28-iteration-friction-roadmap.md`

## 背景

随着 stair → roof → skirt 三轮构件落地，每个构件的"被选中后该如何编辑/删除"逻辑散布在两个 UI 文件中：

- `components/PropertyPanel.tsx:121-149` — 8 个 `selection?.kind === "..."` 的 if 块，每个 kind 一个编辑器
- `components/PropertyPanel.tsx:106-112` — `isDeletable` 谓词的 OR 链
- `components/AppShell.tsx:262-291` — `handleDeleteSelection` switch，6 个 case
- `components/AppShell.tsx:328-330` — 键盘 delete 处理里的另一条 OR 链
- `components/PropertyPanel.tsx:151-158` — storey 专用的"复制楼层"按钮 sibling

加一个新构件需要同时改这 5 处。本轮目标：把所有"按 selection.kind 分歧"的行为收敛到**一个 registry**，加新 kind 只动 1 处。

## 目标

- 删除 PropertyPanel / AppShell 中所有按 `selection.kind` 的 if-chain / switch / OR 链
- 给 `ObjectSelection` 增加 union variant 时，TypeScript 报错收敛在 ≤ 3 处（registry map + 任何剩余 helper）
- 行为不回退：8 种 selection kind 的编辑面板渲染、删除按钮、键盘删除、复制楼层按钮表现完全不变

## 非目标

明确不在 M1 范围（推到后续 milestone 或单独项目）：

- mutation 层重构（`add/update/remove` 三件套统一）—— M3 范围
- `select-after-add` 流的统一（`addSkirt → dispatch select`）—— M3 范围
- 持久化 schema 版本化 —— M2 范围
- `DrawingSurface2D.tsx` 拆分 —— M4 范围
- 编辑器组件（`WallEditor` 等）的内部逻辑重写 —— 仅入参形态调整为 `(sel, ctx)`，组件主体的字段编辑/校验/渲染逻辑全部保持原样

## 方案

### 整体结构

新增 1 个文件，修改 3 个文件：

```
+ src/components/selectionRegistry.tsx
~ src/components/PropertyPanel.tsx
~ src/components/AppShell.tsx
~ src/__tests__/selectionRegistry.test.ts        # 新建
```

### selectionRegistry.tsx（新）

定义 descriptor 类型 + 全量 map + 三个 helper：

```ts
import type { ReactNode } from "react";
import type { HouseProject } from "../domain/types";
import type { ObjectSelection, ObjectSelectionKind } from "../domain/selection";

export type EditorCtx = {
  project: HouseProject;
  onProjectChange: (p: HouseProject) => void;
  onApplyWallMaterial: (wallId: string, materialId: string) => void;
  onDuplicateStorey?: (storeyId: string) => void;
};

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

export const selectionRegistry: SelectionDescriptorMap = { /* 见下表 */ };

export function getDescriptor(sel: ObjectSelection): SelectionDescriptor<ObjectSelection>;
export function isSelectionDeletable(
  sel: ObjectSelection | undefined,
  project: HouseProject,
): boolean;
export function deleteSelection(
  project: HouseProject,
  sel: ObjectSelection,
): HouseProject;
```

`deleteSelection` 内部行为：
1. 调用 `descriptor.remove(project, sel)` 得到 next；若无 `remove` 抛错（caller 应先用 `isSelectionDeletable` 判断）
2. 若有 `descriptor.afterRemove`，调用之得到 next'
3. 返回 next'；selection 由 caller（AppShell）统一清空

每个 entry 的具体实现：

| kind | renderEditor | isDeletable | remove | afterRemove | deleteLabel |
|---|---|---|---|---|---|
| wall | `<WallEditor sel ctx />` | – | `removeWall` | – | – |
| opening | `<OpeningEditor sel ctx />` | – | `removeOpening` | – | – |
| balcony | `<BalconyEditor sel ctx />` | – | `removeBalcony` | – | – |
| stair | `<StairEditor sel ctx />` | – | `removeStair` | – | – |
| skirt | `<SkirtEditor sel ctx />` | – | `removeSkirt` | – | – |
| storey | `<StoreyEditor sel ctx />` | `(_, p) => p.storeys.length > 1` | `removeStorey` | activeView fallback（见下） | "删除楼层" |
| roof | `<RoofEditor sel ctx />` | – | – | – | – |
| roof-edge | `<RoofEdgeEditor sel ctx />` | – | – | – | – |

**可删除的判定规则**（实现 `isSelectionDeletable` 时遵守）：

```ts
function isSelectionDeletable(sel, project) {
  if (!sel) return false;
  const d = selectionRegistry[sel.kind];
  if (!d.remove) return false;                       // 没有 remove → 不可删（roof / roof-edge）
  return d.isDeletable?.(sel, project) ?? true;      // 有 remove，再看可选谓词；无谓词默认可删
}
```

这样多数 entry 不需要写 `isDeletable`，只有 storey 这种"上下文相关"的才写。

storey 的 `afterRemove`（迁移自 `AppShell.tsx:281-287` 现有逻辑）：

```ts
afterRemove(project, sel) {
  if (project.activeView !== `plan-${sel.id}`) return project;
  const fallback = project.storeys[0]?.id;
  if (!fallback) return project;
  return { ...project, activeView: `plan-${fallback}` as ViewId };
}
```

注意：`afterRemove` 接收的 `project` 已经是 `removeStorey` 之后的，所以 `project.storeys[0]` 是删除后剩余的第一个楼层。

### PropertyPanel.tsx 改造

**Before（精简示意）**：
```tsx
const isDeletable = selection?.kind === "wall" || selection?.kind === "opening" || ...;
const deleteLabel = selection?.kind === "storey" ? "删除楼层" : "删除";

{selection?.kind === "opening" ? <OpeningEditor ... /> : null}
{selection?.kind === "wall" ? <WallEditor ... /> : null}
// ... 8 个 if 块
{selection?.kind === "storey" && onDuplicateStorey ? <button>复制楼层</button> : null}
```

**After**：
```tsx
const ctx: EditorCtx = { project, onProjectChange, onApplyWallMaterial, onDuplicateStorey };
const isDeletable = isSelectionDeletable(selection, project);
const deleteLabel = selection ? (getDescriptor(selection).deleteLabel ?? "删除") : "删除";

{selection ? <EditorRouter selection={selection} ctx={ctx} /> : <Placeholder />}
```

`EditorRouter` 组件本体：
```tsx
function EditorRouter({ selection, ctx }: { selection: ObjectSelection; ctx: EditorCtx }) {
  const descriptor = selectionRegistry[selection.kind] as SelectionDescriptor<typeof selection>;
  return <>{descriptor.renderEditor(selection, ctx)}</>;
}
```

复制楼层按钮**挪进 StoreyEditor 内部**，由 `ctx.onDuplicateStorey` 注入回调；与现状一致，`ctx.onDuplicateStorey` 为 undefined 时按钮不渲染。PropertyPanel 主体不再为任何 kind 写专用 sibling。

### AppShell.tsx 改造

**handleDeleteSelection**：
```ts
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

**键盘 delete 处理**（原 `AppShell.tsx:328-330` 的 OR 链）：
```ts
if (!isSelectionDeletable(project.selection, project)) return;
event.preventDefault();
handleDeleteSelection();
```

`AppShell.tsx:144-145`（`if (project.selection?.kind === "wall")`）等其他单点判断**不动** —— 它们是真业务分歧（特定行为），不是分发。本轮只消灭"按 kind 分发到 N 个不同 handler"的模式。

### 编辑器组件签名调整

8 个 editor 组件统一改成 `(sel: S, ctx: EditorCtx) => ReactNode`（在 registry 的 `renderEditor` 里调用，因此实际签名是 props 形式 `{ sel, ctx }`）。函数体内部从 `ctx` 取所需字段：

- `WallEditor` 用 `ctx.onApplyWallMaterial`
- `StoreyEditor` 用 `ctx.onDuplicateStorey`
- 其他编辑器只用 `ctx.project` + `ctx.onProjectChange`

各编辑器内部实现保持不动；只调整入参形态。

### 测试

新增 `src/__tests__/selectionRegistry.test.ts`：

1. **覆盖完备性**：runtime 哨兵——`for kind of allObjectSelectionKinds: assert(kind in selectionRegistry)`。配合 mapped type 是双保险。
2. **isSelectionDeletable**：参数化测试覆盖 9 个 case：
   - `wall / opening / balcony / stair / skirt / storey(>1)` → true
   - `storey(=1) / roof / roof-edge` → false
3. **deleteSelection**：
   - `removeStorey` 删除当前 activeView 的楼层 → activeView 切换到剩余第一个楼层
   - `removeStorey` 删除非当前 activeView 的楼层 → activeView 不变
   - `removeWall / removeOpening` 等不触发 afterRemove（行为与直接调用 mutation 一致）
4. **`deleteLabel`**：storey 返回 "删除楼层"，其他 kind 缺省 → 文案逻辑由调用方处理为 "删除"

现有测试（`ui.test.tsx` / `propertyEditing.test.tsx` / `mutations.test.ts` / `selection.test.ts`）**不应需要修改**。如果改动说明语义偏差，需重新审视。

## 迁移路径

单个 PR / 一次提交完成。改动量估算：

- `selectionRegistry.tsx`：~120 行新文件
- `PropertyPanel.tsx`：删除 ~50 行 if 链 + 增加 ~20 行 router；StoreyEditor 内嵌复制按钮 ~10 行
- `AppShell.tsx`：删除 ~35 行 switch + OR 链；增加 ~10 行 helper 调用
- `selectionRegistry.test.ts`：~80 行新测试

原子换比分阶段安全：避免出现 "registry 已用一半、switch 还剩一半" 的中间态。

## Done criteria

1. `bun run test` 全绿（含新增 registry 测试）
2. `bun run build` 全绿（TS 严格通过，mapped type 不允许漏掉任何 kind）
3. 手动验证清单：
   - 选中 wall / opening / balcony / stair / skirt / storey / roof / roof-edge 八种类型 → 编辑面板渲染正确
   - 5 种可删 kind（wall / opening / balcony / stair / skirt） → 点删除按钮 + Delete 键 → 实体被移除，选中态清空
   - storey 单层时 → 删除按钮 disabled + Delete 键无效；多层时 → 删除按钮可用，删除后 activeView fallback 正确
   - storey 选中时 → 复制楼层按钮可用
4. 验收实验：在 `ObjectSelection` 临时加一个 `{ kind: "test"; id: string }` variant，TS 编译错误必须只出现在 `selectionRegistry.ts` 一个文件里（registry map 缺 key）。回滚此变更后入库。

## 风险与回滚

- **风险 1**：编辑器签名调整可能破坏现有测试。如果 `propertyEditing.test.tsx` 直接渲染单个编辑器，需要传入 ctx 而非散参。把签名改造放在第一步，跑一次测试验证。
- **风险 2**：storey 的 `afterRemove` 时序——必须在 `removeStorey` 后、`activeView` 检查前；spec 中已明确 `afterRemove` 接收 mutate 之后的 project。
- **回滚**：纯 UI 重构，无数据格式变更，git revert 单个 commit 即可。
