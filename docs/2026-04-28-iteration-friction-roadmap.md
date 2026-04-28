# 迭代摩擦优化路线图

更新日期：2026-04-28
关联：`docs/2026-04-26-house-design-tool-v2-roadmap.md`（功能路线）

## 背景

随着 stair → roof → skirt 三轮构件相继落地，每加一个新构件需要修改约 **22 个文件、7 个目录**：

- `domain/` — types union、mutations 三件套、selection union、drafts、persistence backfill
- `geometry/` — 几何 builder + 类型
- `projection/` — plan + elevation 各一遍 builder
- `rendering/threeScene.ts` — mesh builder
- `components/` — PropertyPanel 编辑器、ToolPalette 入口、AppShell 删除分发、DrawingSurface2D 选中态绘制
- `__tests__/` — mutation / persistence / projection / UI 各一份

这条路径不可持续：再加 1-2 个构件就该重构了。本路线图把"减少每加一个构件的成本"这件事拆成 4 个独立子项目，按顺序推进。

## 硬约束

- 每个里程碑结束后 `bun run test` + `bun run build` 必须全绿
- 所有重构不允许引入功能回退；必要时通过 manual walkthrough 验证关键交互
- 持久化向前兼容：老 `.house.json` 必须能加载（M2 给出版本化机制后由 migrate 保证）
- 重构以"下一个构件加进来要少改 N 处"为可量化收益，避免无目的的抽象

## 总目标

把"加一个构件"的成本从 **22 文件 / 7 目录** 降到 **≤ 8 文件 / 3 目录**，且每一处改动都集中在与该构件直接相关的代码（不再有"散在 4 处的 selection 分发"或"散在 8 处的 if 链"）。

---

## M1 — 构件分发统一

> 目标：消灭 PropertyPanel 与 AppShell 中按 `selection.kind` 散布的 if/switch，让"加一个构件"在 UI 分发层只动一处。

### 范围

- `components/PropertyPanel.tsx`：把 `selection?.kind === "..."` 的 8+ 个 if 分支替换为 registry map，类似 `{ wall: WallEditor, opening: OpeningEditor, ..., skirt: SkirtEditor }`
- `domain/selection.ts`：抽出 `isDeletable(sel)`、`deleteSelection(sel, project)`、`getSelectionKind(sel)` 等 helpers
- `components/AppShell.tsx`：删除分发 switch（262-291）、deletable 谓词（328-330）、键盘删除处理统一调用上面 helpers
- 不动 mutation 层（保持现有 add/update/remove 三件套），不动 geometry / projection / rendering

### Done criteria

- 在 `domain/selection.ts` 任何一个 union variant 增加新值后，TypeScript 报错必须收敛在 ≤ 3 处（registry map + helper switch）
- 单测：registry 命中所有 selection kind；isDeletable 对所有 kind 返回正确值
- 手动验证：选中 wall/opening/balcony/storey/stair/skirt/roof 七种类型，编辑面板 + 删除键 + 删除按钮全部行为不变

---

## M2 — 持久化版本化

> 目标：给 `.house.json` 加 schema version，把现在散在 `app/persistence.ts:40-68` 的手动默认回填换成显式 migrate 链；老存档可升级，缺失字段不再静默丢失。

### 范围

- `domain/types.ts`：`HouseProject` 增 `schemaVersion: number`
- `app/persistence.ts`：抽 `migrate(raw)` 接受任意旧版本 json，返回当前 schema；每次新增数组/字段加一个迁移 step
- 老存档（无 `schemaVersion` 或值为 1）走 v1 → 当前的 migrate 链；现有"补 `balconies: []` / `skirts: []` / `roof: undefined`"的逻辑挪到 migrate 里
- 单测：v1 fixture 加载 → 当前 schema；当前 schema → 序列化 → 反序列化 round-trip
- 不变更：`assert*Shape` 校验函数保留（migrate 之后仍要校验）

### Done criteria

- 加载现有所有 sample 与已存在的 `.house.json` 文件无回退
- 加新构件数组时，路线是清晰的："加 type → 加 migrate step → 加 assert* → 加 mutation"，不会再"忘了改 persistence.ts"

---

## M3 — EntityStore\<T\>

> 目标：消除 `domain/mutations.ts` 中 add/update/remove 三件套的手抄风。统一 wall / opening / balcony / skirt / stair / roof 的 mutation 接口，并把例外（stair 无 toolbar add、roof singleton）显式建模。

### 范围

- 设计 `EntityStore<T>` 接口，覆盖：
  - 标准实体（wall、opening、balcony、skirt）：`add(draft) → update(id, patch) → remove(id)`
  - 例外 1：stair——无独立 add，只能通过 storey 上的 attach；建模为 `attach(storeyId, draft)` / `detach(storeyId)`
  - 例外 2：roof——singleton，建模为 `set(value)` / `clear()`
- 把 `mutations.ts` 30+ 函数收敛到统一接口；validation 从内联（updateSkirt 56-91）挪到 store 的 hook
- 错误类型：从抛字符串改成 typed error（区分 `RangeError` vs `NotFoundError` vs `StateError`）
- `components/PropertyPanel.tsx:78-84` 的 `tryMutate` 包装可以保留，但内部基于新 error type 而非字符串

### 设计未决项（brainstorm 时再敲定）

- store 是 class 还是函数集？是否需要中间层 reducer，还是直接 mutate `HouseProject`?
- error type 如何在 UI 显示（红字 / toast / inline）？
- selection 失效是否随 remove 自动触发，还是仍由 caller 处理？

### Done criteria

- 加新构件时，`mutations.ts` 改动 ≤ 1 处（注册新 store）
- 所有现有 mutation 单测通过；新增 store 接口契约测试
- 手动验证：所有现有编辑/添加/删除/撤销路径不回退

### 依赖

M1 已完成（M3 重构 PropertyPanel 时仍会调用 `tryMutate`，需要 registry pattern 已落地）

---

## M4 — DrawingSurface2D 拆分

> 目标：把 `components/DrawingSurface2D.tsx` 2393 LOC 切成可独立测试的模块，把 5+ 种拖拽状态机抽出来加测试覆盖。

### 范围

- 拆分目标（最终边界 brainstorm 时定）：
  - `DrawSurface`：纯 SVG 渲染层
  - `SelectionOverlay`：选中态绘制
  - `ConstraintGuides`：吸附辅助线渲染
  - `DragStateMachine`：拖拽状态机（移动/缩放/绘制 5+ branch）
  - `EventRouter`：鼠标/键盘事件分发
- 拖拽状态机改成纯函数 / state machine 对象，可独立单测
- 加 `__tests__/dragStateMachine.test.ts`：覆盖每条状态转换
- 不改外部行为；DrawingSurface2D 作为壳保留，只组装上述模块

### Done criteria

- 主入口文件 ≤ 400 LOC，每个子模块 ≤ 600 LOC
- 状态机 100% 状态转换被单测覆盖
- 手动验证：画墙、移动、调尺寸、吸附、键盘 esc/delete 等所有 2D 交互不回退

### 依赖

M3 已完成（M4 大量调用 mutation，需要稳定接口）

---

## 顺序与节奏

```
M1 (小，1-2 晚)
  ↓
M2 (小，独立，可与 M1 并行做也行，但建议先 M1 验证 registry 套路)
  ↓
M3 (中，最大设计未决项，需独立 brainstorm)
  ↓
M4 (大，纯交互层重构，独立 brainstorm)
```

每个 milestone 各自产出 spec → plan → ship 循环，对应文件：

- M1 spec: `docs/superpowers/specs/YYYY-MM-DD-m1-component-dispatch-design.md`
- M2 spec: `docs/superpowers/specs/YYYY-MM-DD-m2-persistence-versioning-design.md`
- M3 spec: `docs/superpowers/specs/YYYY-MM-DD-m3-entity-store-design.md`
- M4 spec: `docs/superpowers/specs/YYYY-MM-DD-m4-drawing-surface-split-design.md`

完成的 milestone 在本文档对应小节末尾标注 `状态：✅ 已合并 @ <commit>`。
