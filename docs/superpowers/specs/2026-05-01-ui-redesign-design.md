# HouseClaw UI 全面重设计

更新日期：2026-05-01
参考视觉：[amaancoderx/make3d](https://github.com/amaancoderx/make3d) — 暗 chrome / 极简 / mono uppercase / glow 强度做层级

## 目标

把当前 v1 残留 + v2 hotfix 拼凑出来的 UI（`styles.css` 2013 行，多处 v1 absolute 定位 + 暗主题 bleed）整体替换为 make3d 风格的暗 chrome + 浅画布工作台，杜绝下次再出现"hotfix override"这类补丁。

不改任何数据模型 / 几何 / 投影 / dragMachineV2 行为。只重写表层：组件结构、CSS、icon、快捷键、画布上的反馈样式。

## 决策摘要

| 决策 | 选择 | 备注 |
|---|---|---|
| 画布底色 | 浅色 `#fafafa` | 平面图作图友好；与暗 chrome 形成对比 |
| 主布局 | 左 icon rail + 右 Accordion | 工具数 + 视图数都摆得开 |
| 配色风格 | make3d 原味（纯白 on 纯黑） | 不引入第二色相，靠 glow 强度做层级 |
| Accordion 行为 | 多 section 同时可展开 | 编辑墙时常常要看楼层 + selection 一起 |
| 视图切换位置 | 顶栏下独立一行 36px | 8 个 tab（3F + 4 立面 + 屋顶 + 3D），floating chip 装不下 |
| 工具切换 | 单字母快捷键 + Esc 退回 select | V/W/D/N/O/B/S/F/R/M |
| Roof 一键创建 | 画布底部居中浮 chip | 不进工具列也不进面板，跟着 activeTool 走 |

## §1 配色 + 字体 + 量规

### Color tokens

| Token | 值 | 用途 |
|---|---|---|
| `--bg-canvas` | `#fafafa` | 2D 画布底 |
| `--bg-chrome` | `#000000` | 顶栏 / 工具列 / 右侧面板底 |
| `--bg-chrome-2` | `rgba(255,255,255,0.04)` | 面板内嵌区 / 输入框底 |
| `--border-soft` | `rgba(255,255,255,0.07)` | section 分隔线 |
| `--border-mid` | `rgba(255,255,255,0.12)` | 卡片边 |
| `--border-strong` | `rgba(255,255,255,0.22)` | hover / focus |
| `--text-primary` | `#ffffff` | 激活态 / 数值 |
| `--text-secondary` | `rgba(255,255,255,0.65)` | 普通文字 |
| `--text-muted` | `rgba(255,255,255,0.45)` | label / 单位 |
| `--text-disabled` | `rgba(255,255,255,0.25)` | inactive |

### 层级靠 glow，不靠色相

- 激活态（active tool / selected pill）→ `bg-white text-black` + `shadow-[0_0_12px_rgba(255,255,255,0.25)]`
- 强激活（snap hit / drag readout chip 出现）→ `shadow-[0_0_8px_rgba(255,255,255,0.6),0_0_16px_rgba(255,255,255,0.2)]`
- 选中对象描边（**亮底反向版**）→ `stroke="#000" stroke-width="1"` + 外侧 ghost `stroke-width="4" stroke="rgba(0,0,0,0.08)"`
- handle 圆点（亮底反向）→ 6px 实心黑圆 + 1px 白外描边
- hover lift → 背景 `white/4` → `white/9`，边框 `white/12` → `white/22`

### 字体

| 用途 | 字体 | 大小 | 装饰 |
|---|---|---|---|
| UI label / 数值 / tooltip | `JetBrains Mono` (fallback `ui-monospace`) | 11–12px | uppercase, `tracking-[0.08em]` |
| 项目名 / section 标题 | `Inter` (fallback `system-ui`) | 11–13px medium | 不 uppercase |
| 画布上 label（标尺、读数）| `Inter` | 10px regular | 不 uppercase |

### 量规

- 顶栏 40px
- 视图条 36px
- 左工具列 48px
- 右 Accordion 面板 320px
- 间距阶梯 4 / 8 / 12 / 16 / 24px

## §2 右侧 Accordion 面板

替换当前 `PropertyPanel` + `StoreysEditor` 两段式结构。

### Section 列表（自上而下）

| Section | 默认状态 | 内容 |
|---|---|---|
| `STOREYS` | 展开 | 楼层列表（每行：label / 高度 / 标高 / 删除按钮）+ `⊕ ADD STOREY` |
| `SELECTION` | 选中时展开，无选中折叠 | header 显示 `SELECTION · WALL · w-front` 之类；body 按 selection.kind 渲染 WallEditor / OpeningEditor / ... |
| `MATERIALS` | 折叠 | 项目材质库的增删改（v2 已有 `Material` 类型但没 UI） |
| `EXPORT` | 折叠 | PNG / STL / GLB 触发按钮（暂可只占位） |
| `PROJECT` | 折叠 | 项目名 / 导入 JSON / 导出 JSON / 重置（接 v1 已有 persistence 逻辑） |

### 行为规则

- **多展开**：用户可同时展开任意 section，状态保留在 component state（不持久化）
- **空选中**：SELECTION header 显示 `SELECTION · NONE`，body 是 hint「在 2D 视图中点击对象以编辑属性」
- **section header 样式**：full-width button，左侧 title `tracking-[0.1em]` + 右侧 `ChevronDown` 旋转 180° 表示展开
- **section body**：`px-4 py-3` 内边距，每个 row（slider / toggle / select）`py-2.5` 等距

### 字段控件复用

- `NumberField` 已有，改皮肤即可（暗底 + 白字 + 1px white/12 边）
- 新增 `SliderRow`：标签 + 横向 slider + 当前值（参考 make3d 的实现，3px 轨道 + 14px 白圆 thumb）
- 新增 `ToggleRow`：标签 + 5x9 开关
- 新增 `SelectRow`：标签 + 横排 pill 按钮组（active 用白底黑字）
- AnchorPicker / MaterialPicker 沿用，只改皮肤

## §3 左 icon rail（48px）

### 工具列表

| # | Tool ID | 名称 | Icon | 快捷键 |
|---|---|---|---|---|
| 1 | `select` | 选择 | `MousePointer2` (lucide) | `V` |
| 2 | `wall` | 墙 | 自绘粗水平线 | `W` |
| 3 | `door` | 门 | `DoorOpen` | `D` |
| 4 | `window` | 窗 | 自绘十字窗 | `N` |
| 5 | `opening` | 开洞 | 自绘虚线方框 | `O` |
| 6 | `balcony` | 阳台 | `RectangleHorizontal` | `B` |
| 7 | `stair` | 楼梯 | 自绘梯级 | `S` |
| 8 | `slab` | 楼板 | `Layers` | `F` |
| 9 | `roof` | 屋顶 | `Triangle` | `R` |
| 10 | `material` | 材质 | `Palette` | `M` |

### 视觉规则

- **默认**：icon `text-white/45` + 透明底
- **hover**：icon `text-white/80` + bg `white/4`，1s 后浮 tooltip `WALL · W` (mono uppercase)
- **激活**：icon `text-black` + bg `white` + glow `shadow-[0_0_12px_rgba(255,255,255,0.25)]`
- **分组**：1（选择）/ 2–7（绘制）/ 8–10（结构 + 材质），每组之间 4px 高的细线（`bg-white/7`）

### 全局快捷键

- 单字母 = 切工具（在 input/textarea focus 时不响应）
- `Esc` = 退回 `select`，并取消当前未完成的创建流程（CreatePreview 重置）
- `Space + drag` = 平移画布（沿用 v1）
- `Shift` = 创建/拖拽时约束（沿用现有 createHandlers / dragMachineV2 行为）
- `?` = 弹出快捷键速查浮层

### 上下文 chip（画布底部居中）

当 `activeTool` 有专属一键操作时，画布底部居中浮 chip：

```
┌──────────────────────────────────────┐
│  PRESS ENTER · CREATE ROOF FROM      │
│  EXTERIOR WALLS                      │
└──────────────────────────────────────┘
```

- 暗底 `#000` + 白字 + `border-strong`，跟 readout chip 同款
- 当前唯一用例：`activeTool === "roof"` 时显示 + 监听 Enter 触发 `buildDefaultRoof + add-roof`
- 替换当前 `ToolPalette` 里的"+ 创建屋顶"按钮（移出工具列）
- 可扩展：未来若 `slab` 也支持一键从墙网格生成，加 case

## §4 画布反馈 / 视图条 / 顶栏

### 对象状态（亮底反向版）

| 状态 | 样式 |
|---|---|
| 默认 | `stroke="#1f1f1f"` 0.6 thickness |
| hover | `stroke="#000"` + `drop-shadow(0 0 4px rgba(0,0,0,0.15))` |
| 选中 | `stroke="#000"` 1.0 thickness + 外侧 ghost `stroke-width="4" stroke="rgba(0,0,0,0.08)"` |
| handle 端点圆 / 角点 | 6px 实心黑圆 + 1px 白外描边 |

### Snap 指示

- snap 命中: 12px 黑十字 + 6px 内圈白心，`@keyframes pulse` 1.4s 循环
- 智能对齐参考线：1px `stroke-dasharray: 2 3` 黑灰

### Drag readout chip

画布右下浮，跟随当前拖拽种类显示数值：

```
┌─────────────────────────┐
│ THICKNESS  0.20m        │   mono uppercase, 12px white
│ ─────────               │
│ Δx +0.30  Δy −0.15      │
└─────────────────────────┘
```

- 暗底 `#0a0a0c` + 白字（跨浅画布也读得清）
- 拖拽中始终显示，松开 0.4s 淡出
- 内容来源：dragMachineV2 现有的 `DragReadout`（已存在，不改 dragMachine）
- 渲染层：DrawingSurface2D 顶层 portal 或 absolute div

### 视图条（顶栏下 36px）

- tab 默认: `text-white/45`
- tab 激活: `text-white` + 底部 1px 白下划线
- hover: `text-white/80`
- 立面 tab：点击后向下展开横向子 tab 行（front/back/left/right 4 个 chip），逻辑同 v2 现有 `ElevationSideTabs`，只改皮肤
- 3D tab：进入 3D 模式（替代当前的 2D/3D 文字 toggle）

### 顶栏（40px）

```
HouseClaw   ·   未命名项目          [2D] [3D]   ⌘ ⋯
└─ logo ─┘  └ project name (可改) ┘ └ mode ┘  └ menu
```

- logo: 12px 白字 mono `tracking-[0.18em]`
- project name: 13px Inter 白字，点击 inline 编辑
- mode toggle: 2 个 pill 按钮，激活态白底黑字
- `⌘` (`?` 也触发): 弹快捷键速查浮层
- `⋯`: 项目菜单 popover（导入 JSON / 导出 JSON / 重置 / 关于），接现有 persistence

### 模式切换语义变更

当前 `set-mode` action 会把 `mode` 切到 "2d" 或 "3d"，然后 AppShell 决定渲染 Preview3D 还是 editor-2d。
新设计保留这个行为，但把"3D"概念合并进视图条（3D 是 view 的一种），同时保留顶栏 mode toggle 作为快捷入口。点击视图条 3D tab 等同于点 `[3D]` toggle。

> 内部数据：可选简化为只保留 `activeView` 一个 state，让 mode 由 `activeView === "3d" ? "3d" : "2d"` 推导。本次重设计**不做这个简化**（避免 reducer 变更），保留 mode 字段；但 ViewTabs 多加一个 "3D" tab，点击时同时 dispatch `set-mode` + `set-view`。

## 架构 / 文件改动

### 组件层（src/components/）

- `AppShell.tsx` — 重写：新顶栏 + 视图条 + 左工具列 + 主体网格
- `ToolPalette.tsx` — 重写：纯 icon 列，无文字按钮，含 tooltip + 快捷键监听
- `PropertyPanel.tsx` — 重写：Accordion 容器 + 5 个 Section（含原 StoreysEditor）
- `ViewTabs.tsx` + `ElevationSideTabs.tsx` — 改皮肤 + 加 3D tab + 立面子 tab 展开行为
- `StoreysEditor.tsx` — 改皮肤（紧凑 list 形式，不再单独占 section）
- 新增 `components/chrome/Accordion.tsx` — section 容器组件（header + animated body）
- 新增 `components/chrome/SliderRow.tsx` / `ToggleRow.tsx` / `SelectRow.tsx` —— 暗主题表单原子
- 新增 `components/chrome/IconRailButton.tsx` — 工具按钮原子
- 新增 `components/chrome/ContextChip.tsx` — 画布底部上下文 chip 容器
- 新增 `components/chrome/DragReadoutChip.tsx` — 画布右下拖拽 readout
- 新增 `components/chrome/icons.tsx` — 自绘 wall/window/opening/stair icon
- `editors/WallEditor.tsx` 等 6 个 editor — 内部沿用 NumberField/AnchorPicker，只改皮肤

### 样式层

- **删除**：`styles.css` 中 v1 残留：`brand-menu`, `mode-tabs`, `file-button`, `action-button`, `app-canvas`, `left-actions`, 以及所有 absolute 定位的 v1 panel 规则
- **新增**：`src/chrome.css`（或继续在 `styles.css` 内分段）：CSS variables（color tokens） + 新增的 Accordion / IconRail / Chip 样式
- **保留**：geometry-rendering 相关的 SVG 样式（plan-wall, plan-opening, etc.）继续可用，颜色按"亮底反向版"调整

### 不动

- `dragMachineV2.ts` / `dragStateV2.ts` / `useDragHandlersV2.ts`
- `useCreateHandlers.ts` / `createPreview.tsx`
- 所有 `projection/v2/*`
- 所有 `geometry/v2/*`
- 所有 reducer / mutation
- Preview3D 的 Three.js 场景（只改它周围的 chrome）

## 测试策略

- 现有 557 个 test 全部保持绿（行为不变）
- 既有 `ui.test.tsx` / `propertyEditing.test.tsx`（P4C-γ3 刚加的）需要 selector 微调（`getByRole`/`getByLabelText` 的 name 跟着新文案走，例如「2D drawing surface」改成「Drawing surface」之类的最小化变更）
- 不为新视觉新增单测（视觉测试 jsdom 验不出来，靠浏览器手验）

## 不在范围内（本次不做）

- 引入 Tailwind（make3d 用 Tailwind，HouseClaw 不切；继续 plain CSS + CSS variables，避免重写依赖）
- 引入 framer-motion（动画用 CSS transition / keyframes 即可）
- 引入 shadcn/ui（依赖太重，原子组件自写）
- 数据模型 / 几何 / 投影变更
- 撤销/重做（v2 reducer 没实现 undo/redo，本次不做）
- 真正的 PNG / STL / GLB 导出（EXPORT section 只占位）
- 移动端适配（保持桌面优先）

## 风险 / 回退点

1. **CSS 重写体积大** — `styles.css` 2013 行 → 估计 ~600–800 行新版。一次切换风险高。**缓解**：分两步走，先把新 chrome 样式加进来 + 让组件用新 className，旧 v1 规则保留；切完所有组件再删旧规则。
2. **快捷键冲突** — input/textarea focus 时不响应字母切工具。**缓解**：在全局 keydown handler 里检查 `event.target` 是 INPUT/TEXTAREA/[contenteditable] 时跳过。
3. **暗主题对比度** — 顶栏 / 面板纯黑可能在阳光下看不清，但 make3d 没在意，HouseClaw 也是个人工具，不做明暗主题切换。
4. **现有 ui.test.tsx 强依赖文案** — 改文案会破测试。**缓解**：改组件时同步更新测试文案，确保 commit 自包含。
