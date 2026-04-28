# 2D 编辑面板 Polish — 对齐工具集设计

日期：2026-04-27
分支：`feat/2d-edit-panel-polish`（基于 `xzhih-dev`）

## 背景与动机

`DrawingSurface2D` 当前在平面 / 立面 / 屋顶视图中支持选中、拖动、缩放、平移、snap 到 10cm 网格、snap 到端点、楼梯 4 角 resize + 旋转手柄。但缺少**视觉对齐辅助**：用户在画布上很难判断元素是否对齐到整数刻度，或与其他元素是否水平/垂直对齐。

本轮目标：把 2D 工作区从「能编辑」升级为「容易对齐」，加入工作画布常见的对齐辅助。

## 范围

本轮 5 个特性：

| ID | 特性 | 用途 |
|----|------|------|
| A  | 网格背景 | 视觉刻度参考 |
| B  | 状态读数（坐标 + 拖动数值） | 实时数值反馈 |
| C  | Smart guides（轴对齐辅助线） | 拖动时自动找齐 |
| D  | Zoom 控件 | 取代纯滚轮操作 |
| F  | 比例尺 | 估算实际尺寸 |

**不在本轮范围**：
- E. 键盘方向键 nudge
- G. 框选 / 多选
- 立面 smart guides
- 网格可见性跨会话持久化
- 屋顶视图（仍是占位）

## 架构

### 文件布局

不在已 2069 行的 `DrawingSurface2D.tsx` 内堆叠，新建 `src/components/canvas/` 子目录放覆盖层组件。主文件只做接线（拿到必要的 state，按 z-order 渲染覆盖层）。

```
src/components/canvas/
  GridOverlay.tsx       # SVG <g>：网格 + 原点十字
  StatusReadout.tsx     # HTML 浮层：左下角坐标/拖动数值
  SmartGuides.tsx       # SVG <g>：拖动时画对齐辅助线
  ZoomControls.tsx      # HTML 浮层：右上角按钮组
  ScaleRuler.tsx        # HTML 浮层：右下角比例尺
src/geometry/
  smartGuides.ts        # 纯函数：锚点匹配
  gridLines.ts          # 纯函数：网格线位置生成
  scaleRulerBucket.ts   # 纯函数：自适应比例尺挑选
```

### `DrawingSurface2D` 的改动

新增 state / 接线，不动现有渲染逻辑：

- `cursorWorld: Point2D | null` — SVG `mousemove` 时更新（用 `eventToViewBoxPoint` + `mapping.unproject`）
- `gridVisible: boolean` — 默认 `true`
- `dragReadout: { kind: ..., values: ... } | null` — 拖动期间填充，拖动结束置 null
- 把 `mapping`、`viewport`、`cursorWorld`、`dragReadout`、当前视图类型透传给覆盖层

z-order（从下到上）：
1. `GridOverlay`（在内容下面）
2. 现有内容：墙、开洞、楼梯、阳台、ghost、snap 指示
3. `SmartGuides`（在 selection handle 之上、HTML 浮层之下）
4. HTML 覆盖层：`StatusReadout`、`ZoomControls`、`ScaleRuler`

---

## A. 网格背景

### 视觉规范

| 元素 | 间距 | 颜色 | 描边宽度 | 备注 |
|------|------|------|---------|------|
| 次线（minor） | 0.1 m | `#ececec` | `1/zoom` px | spacingPx < 6 时隐藏 |
| 主线（major） | 1.0 m | `#d0d0d0` | `1/zoom` px | 始终显示 |
| 原点十字 | — | `#a0a0a0` | `1.5/zoom` px | 长度 0.2 m，仅原点 (0,0) |

### 行为

- 应用视图：平面 + 4 个立面。屋顶（`renderRoofPlaceholder`）跳过
- 默认 `gridVisible = true`；右上角按钮 toggle
- 自适应隐藏次线：当一格次线在屏幕上 < 6 px 时只画主线
  - 屏幕格距 px ≈ `(spacing 米) × mapping.scale × (svgClientWidth / SURFACE_WIDTH) × viewport.zoom`
  - 简化：直接用 `spacing × mapping.scale × viewport.zoom`，因为浮层 SVG 宽度通常 = SURFACE_WIDTH 的整数倍，估算够用

### 网格线位置生成（`gridLines.ts`）

```ts
type GridLine = { axis: "x" | "y"; pos: number; major: boolean };

export function buildGridLines(
  visibleBounds: Bounds,
  minorSpacing: number,
  majorSpacing: number,
  showMinor: boolean,
): GridLine[]
```

- `pos` 是世界坐标（米）
- 实现：`floor(min/spacing)*spacing` 到 `ceil(max/spacing)*spacing`
- 主线优先：若一条线既是主线也是次线，只保留主线（避免重复绘制）

### `GridOverlay.tsx`

输入：`mapping`、`viewport`、`gridVisible`、当前 view 是否平面/立面（roof 不渲染）。
输出：一个 SVG `<g class="grid-overlay">`，里面是 `<line>` × N，根据可见 viewBox 范围生成。

不渲染时返回 `null`。

---

## B. 状态读数

### 布局

`StatusReadout.tsx` — 绝对定位的 div，左下角 8px × 8px 边距。两行文本：

```
X: 3.42 m   Y: 1.20 m
L: 4.23 m
```

- 行 1：`cursorWorld` 不为 null 时显示，2 位小数（cm 精度）
- 行 2：`dragReadout` 不为 null 时显示

### 拖动场景映射

依据当前 `DragState` 联合（见 `DrawingSurface2D.tsx:46`），按 `kind` 映射：

| `kind` | 行 2 内容 |
|--------|----------|
| `wall-translate` | `Δ: (<dx>, <dy>) m`（相对拖动起点） |
| `wall-endpoint` | `L: <new length> m`（端点移动后的整墙长度） |
| `opening` | `offset: <new offset> m` |
| `plan-opening-resize` | `width: <new width> m` |
| `balcony` | `offset: <new offset> m` |
| `plan-balcony-resize` | `width: <new width> m` |
| `elev-opening-move` | `offset: <off> m  sill: <sill> m`（同一行，2 个值） |
| `elev-opening-resize` | `W×H: <w> × <h> m` |
| `elev-balcony-move` | `offset: <new offset> m` |
| `elev-balcony-resize` | `width: <new width> m` |
| `stair-resize` | `W×D: <w> × <d> m`（new footprint width × depth） |
| `stair-rotate` | `α: <角度>°`（1 位小数） |
| `elev-storey-translate` | `Δy: <dy> m`（垂直平移距离） |

`DrawingSurface2D` 在每次 drag move handler 算出新值时**顺带**算出 `dragReadout = { kind, values }` 并 `setDragReadout`；drag end 时置 `null`。

### 样式

- 字体：等宽（`monospace`），12px，深灰文字
- 背景：半透明白 `rgba(255,255,255,0.85)`，4px padding，2px border-radius
- `pointer-events: none`，不挡操作

---

## C. Smart guides

### 适用场景

仅平面视图，且仅当被拖动的"点"在 2D 平面内**自由移动**时启用：

| `kind` | 适用 | 说明 |
|--------|------|------|
| `wall-endpoint` | ✅ | 拖动点 = 端点新位置 |
| `stair-resize` | ✅ | 拖动点 = corner 新位置 |
| `wall-translate` | ❌ | 移动 2 个端点，本轮不做（v2 可对两端各算一遍） |
| `opening` / `plan-opening-resize` | ❌ | 1D 沿墙约束，对齐意义弱 |
| `balcony` / `plan-balcony-resize` | ❌ | 同上 |
| `stair-rotate` | ❌ | 旋转，无对齐概念 |
| 立面所有 `elev-*` | ❌ | smart guides 本轮不做立面 |

### 锚点收集

锚点 = 当前平面视图内**其他**元素（被拖动元素自身排除）的关键点：
- 墙：`start`、`end`
- 开洞：投影到墙线上的中心点（已有 `openingLine` 中心计算）
- 楼梯：4 个 footprint 角点（旋转后，已有 `buildStairSymbolGeometry`）
- 阳台：4 个角点（已有 `balconyPolygon`）

### 匹配算法（`smartGuides.ts`）

```ts
type Anchor = { x: number; y: number; sourceId: string };
type GuideMatch = {
  axis: "x" | "y";
  pos: number;        // 命中坐标
  anchor: Anchor;     // 命中的锚点
};

export function findAxisAlignedGuides(
  cursor: Point2D,
  anchors: Anchor[],
  tolerance: number,
): GuideMatch[]
```

- 对每个锚点：若 `|cursor.x - anchor.x| < tolerance` → 加 `{ axis: "x", pos: anchor.x, anchor }`
- 对每个锚点：若 `|cursor.y - anchor.y| < tolerance` → 加 `{ axis: "y", pos: anchor.y, anchor }`
- 同一轴向多个命中时：取最近的一个（最小 |delta|）
- 最多返回 2 条（一条 X、一条 Y）

`tolerance` 用 `PLAN_ENDPOINT_THRESHOLD = 0.2` m（与现有端点 snap 一致）。

### Snap 行为

匹配命中后：
- `axis === "x"`：把拖动点的 X 改写为 `pos`
- `axis === "y"`：把拖动点的 Y 改写为 `pos`
- 同时命中两轴：两个都改写

与现有 `snapToEndpoint` / `snapToGrid` 的优先级：**端点 > smart guide > grid**。
端点 snap 命中即不再走 guide / grid（避免双重修正）。

### 渲染（`SmartGuides.tsx`）

每条 guide 画一条 1px 橙色（`#ff8a3d`）虚线（dasharray `4 3`），用 `1/zoom` 描边宽度：
- `axis === "x"`：垂直线，X = `pos`，Y 从 `min(cursor.y, anchor.y) - 0.5m` 到 `max + 0.5m`
- `axis === "y"`：水平线，Y = `pos`，X 范围同理

仅 `dragState` 非空 + 平面视图时渲染。

---

## D. Zoom 控件

### 设计决定

`createPointMapping` 已把 content 装进 `SURFACE_WIDTH × SURFACE_HEIGHT` 并加 padding，所以 `viewport = DEFAULT_VIEWPORT` 已经是"适应内容"。
"100%" 和"适应"在当前架构下等价 → **不放 ⤢ 按钮**，最终 4 个按钮。

### 布局

`ZoomControls.tsx` — 绝对定位，右上角 8px 边距。垂直堆叠 4 个小按钮（28×28px）：

```
[+]
[−]
[⌂]    ← 重置视图
[⊞]    ← toggle 网格
```

| 按钮 | 行为 |
|------|------|
| `+`  | `viewport.zoom *= 1.5`，clamp 到 `ZOOM_MAX`，缩放中心 = viewBox 中心 |
| `−`  | `viewport.zoom /= 1.5`，clamp 到 `ZOOM_MIN`，缩放中心 = viewBox 中心 |
| `⌂`  | `setViewport(DEFAULT_VIEWPORT)` |
| `⊞`  | 切换 `gridVisible` |

### 样式

- 按钮：白底、淡灰 1px border、4px radius、悬停加深背景
- 字体：14px、深灰
- pointer-events 正常

---

## F. 比例尺

### 布局

`ScaleRuler.tsx` — 绝对定位，右下角 8px 边距。一个 HTML 元素：

```
|―――――――|  1 m
```

- 一条横线 + 两端短竖线（端点小帽）
- 文本标签紧挨右侧

### 自适应桶（`scaleRulerBucket.ts`）

```ts
const NICE_LENGTHS = [0.1, 0.2, 0.5, 1, 2, 5, 10] as const;
const TARGET_PX_MIN = 60;
const TARGET_PX_MAX = 150;

export function pickRulerLength(pixelsPerMeter: number): number {
  // 返回 NICE_LENGTHS 中：屏幕 px 落在 [60, 150] 的最大值
  // 若无候选落入区间，取最接近 105 (中点) 的
}
```

- `pixelsPerMeter = mapping.scale × (svgClientWidth / SURFACE_WIDTH) × viewport.zoom`
- 简化用 `mapping.scale × viewport.zoom`（同 GridOverlay 的简化）

### 样式

- 线条颜色：深灰 `#555`
- 字体：12px、深灰
- 背景：半透明白 `rgba(255,255,255,0.85)`，padding 4px，border-radius 2px

---

## 测试

### 单元测试（vitest）

| 文件 | 用例 |
|------|------|
| `src/__tests__/smartGuides.test.ts` | 空锚点 → []；单 H 命中；单 V 命中；H+V 同时；同轴多锚点取最近；阈值边界 0.2/0.21 |
| `src/__tests__/gridLines.test.ts` | bounds=(0,0)-(2,1)，spacing=0.1 → x 21 条 + y 11 条；主线/次线分级；showMinor=false 时只返回主线 |
| `src/__tests__/scaleRulerBucket.test.ts` | px/m=100 → 1m（100px）；px/m=10 → 10m（100px）；px/m=1000 → 0.1m（100px）；边界值 |

### 视觉验证

`npm run dev` 启动后手动验证：
- 平面：网格清晰、拖墙端点弹出 smart guide、左下角数值实时更新、右上角按钮可点、右下角比例尺随 zoom 变化
- 立面：网格显示但 smart guide 不出现
- 屋顶：均不显示这些覆盖层
- 切换项目 / 视图：覆盖层正常重置

---

## 实施顺序建议

按依赖关系：

1. **基础设施**：在 `DrawingSurface2D` 加 `cursorWorld` state + 把 `mapping/viewport` 透传出来；建立 `src/components/canvas/` 目录约定
2. **A. 网格** + 单测 — 立刻可见、风险最低
3. **F. 比例尺** + 单测 — 同样独立、纯展示
4. **D. Zoom 控件** — 复用 viewport setter
5. **B. 状态读数** — 需要从 `dragState` 派生 `dragReadout`
6. **C. Smart guides** + 单测 — 最复杂，需要在拖动管线里插入 snap 修正

---

## 风险与备注

- **DrawingSurface2D 体积**：本轮新增不在主文件，但主文件已 2069 行，未来重构压力会持续。本 spec 不做重构。
- **覆盖层 z-order**：要确保 GridOverlay 在最底层（在 ghost、wall、stair 下），SmartGuides 在 selection handle 上，HTML 浮层永远在最上。
- **simplifying 简化**：所有屏幕 px 计算用 `mapping.scale × viewport.zoom` 估算，不取真实 svgClientWidth。如果 SVG 容器尺寸严重偏离 SURFACE_WIDTH/HEIGHT，比例尺/网格隐藏阈值会有偏差；可后续再校正。
- **性能**：网格线在大 zoom out 时仍可能 100+ 条，使用 `<line>` 元素够用（< 1000 个）；后续可改 `<path>` 合并。

---

## 完成记录

实施时间：2026-04-27
分支：`feat/2d-edit-panel-polish`

### 实施情况

A / B / C / D / F 五个特性按 spec 完成。共新增：
- 5 个 React 覆盖层组件（GridOverlay / ScaleRuler / ZoomControls / StatusReadout / SmartGuides）
- 3 个纯函数 + 19 个单元测试（gridLines / scaleRulerBucket / smartGuides）
- DragReadout 联合类型 + applyDrag 13 个 case 写入

`DrawingSurface2D` 主体未重构，仅加新 state + 接线 + smart guide 集成到 wall-endpoint / stair-resize 两个 case。

### 与 spec 的关键偏差

1. **Theme 修正**：spec 给覆盖层的 `rgba(255, 255, 255, 0.85)` 白色背景在 `#ffffff` canvas 上不可见，改用 `var(--panel)` 等主题 tokens（与已有 `.zoom-reset` 一致）。
2. **scaleRulerBucket 删除未用导出**：`RULER_TARGET_PX_MIN/MAX` 两个 const 导出当前无消费者，按 YAGNI 删除。
3. **D 节按钮简化**：Spec 之前提到的 5 按钮含适应内容 `⤢` 在 spec 内已说明取消，最终 4 按钮（+/−/⌂/⊞）。
4. **`elev-storey-translate` readout 标签**：plan 写 `Δy:`，最终用 `Δ:`（值是 1D 沿立面轴的位移，不是世界 y delta）。

### 视觉验证

由用户在 dev server 完成（spec 视觉清单：平面所有覆盖层 / 立面无 smart guide / 屋顶无覆盖层 / 切换项目视图重置）。

### 测试

| 文件 | 用例数 |
|------|--------|
| gridLines.test.ts | 5 |
| scaleRulerBucket.test.ts | 8 |
| smartGuides.test.ts | 6 |
| **新增合计** | **19** |
| 全套通过 | 235 |
