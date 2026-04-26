# Spec — 楼梯组件（可走、可选样式）

更新日期：2026-04-27
前置 Spec：Spec 1 室内可视化（已完成，洞口/walk physics/collidables 已就位）
后续：本 Spec 落地后，可拆出 Spec — 真屋顶 / 多架楼梯 等

## 一句话目标

把现有的"楼板上一个矩形洞口"升级为可以选样式（直跑 / L 形 / U 形）、自动按楼层高度和踏步深度算的楼梯组件，并且在 3D 漫游模式下能直接走上去。

## 范围

**做：**

1. 数据模型：`Storey.stairOpening` 改名 `Storey.stair` 并扩字段（shape / treadDepth / bottomEdge / turn / materialId）。
2. 自动计算：踢踏数 / 踢踏高度 / 踏步数从 storeyHeight + treadDepth 派生。
3. 几何：三种形状（straight / L / U）的视觉踏步 + L/U 平台。
4. 平面图：跨上下两层渲染楼梯符号（UP / DN + 折线）。
5. 3D 漫游：踏步 + 平台 mesh 加入 `collidables`，沿用现有 walk physics，零物理代码修改。
6. UI：ToolPalette 加 `stair` 工具；PropertyPanel 选中楼梯时编辑形状/踏步深度/朝向/转向/材质；只读显示派生值。
7. 数据迁移：`stairOpening` → `stair` 一刀切，sample data + 现有 tests + 切洞代码同步改。

**不做（明确切出本 Spec）：**

- 一层多架楼梯（保持每层最多一架）。
- 旋转楼梯 / 弧形楼梯 / 直跑带休息平台（非 L/U 的中段平台）。
- 楼梯栏杆 / 扶手 / stringer 侧板（视觉只画踏步本体）。
- 楼梯踏步在断线处的精细建筑制图符号（先用直斜杠折线，够看）。
- 楼梯通往屋顶 / 阁楼（最顶层 storey 禁用楼梯）。
- 楼梯位置/尺寸的合规性检查（坡度、净宽、防火等规范不强制）。
- 与现有"按钮瞬移楼层"按钮的去留：本 Spec 不删，保留作为 fallback。

## 设计

### 1. 数据模型

`src/domain/types.ts`：

```ts
export type StairShape = "straight" | "l" | "u";
export type StairEdge  = "+x" | "-x" | "+y" | "-y";
export type StairTurn  = "left" | "right";

export type Stair = {
  // 平面占位（同时也是 slab 切洞用的矩形）
  x: number;       // 楼层局部坐标，洞口左下角 X
  y: number;       // 楼层局部坐标，洞口左下角 Y
  width: number;   // 沿 +X 长度
  depth: number;   // 沿 +Y 长度

  // 形状参数
  shape: StairShape;
  treadDepth: number;     // 踏步深度，默认 0.27
  bottomEdge: StairEdge;  // 第一级踏步贴哪条边（即从下层进楼梯口的入口边），默认 "+y"
  turn?: StairTurn;       // 仅 L 形使用，决定上跑朝哪一侧转，默认 "right"

  materialId: string;     // 复用 frame 或 decor 类材质
};
```

`Storey` 字段：

```ts
export type Storey = {
  // ... 原有字段
  stair?: Stair;          // 替代原 stairOpening
};
```

**归属规则**：楼梯挂在它**通往的那一层**（上层）。即 stair 在 storey N 上意味着"从 storey N-1 顶面爬到 storey N 顶面"。

**禁用规则**：**最底层** storey 不能有 stair（脚下没楼层来），由 `constraints.ts` 现有规则继续强制。最顶层 storey **可以**有 stair（即顶层的入口楼梯，从下层爬上来）。

### 2. 自动计算（`src/domain/stairs.ts`）

```ts
export const TARGET_RISER = 0.165;

export type StairConfig = {
  riserCount: number;
  riserHeight: number;
  treadCount: number;
};

export function computeStairConfig(storeyHeight: number, treadDepth: number): StairConfig {
  const riserCount = Math.max(2, Math.round(storeyHeight / TARGET_RISER));
  const riserHeight = storeyHeight / riserCount;
  const treadCount = riserCount - 1;
  return { riserCount, riserHeight, treadCount };
}
```

`treadDepth × treadCount` 不强制等于洞口深度——超出/不足都不报错，由用户视觉判断后调整洞口或 treadDepth。

### 3. 几何（`src/geometry/stairGeometry.ts`）

每架楼梯生成一组踏步 mesh（box per tread）+ L/U 形的平台 mesh。**不再额外生成隐形斜面碰撞体**——见下文 "3D 漫游" 节，现有物理常量已经能让人直接踩着 box 上下楼。

每级踏步是一个 box：
- 厚度 = `riserHeight`
- 跑长方向上深度 = `treadDepth`
- 横向宽度 = 跑宽（见各形状）
- 顶面 y = (i+1) × riserHeight + lowerStoreyTopY，其中 i 从 0 算起

由 `treadCount = riserCount - 1`，最顶级踏步（i = treadCount-1）的顶面在 `treadCount × riserHeight = (riserCount-1) × riserHeight`，**比上层楼板低一个 riserHeight**。这是建筑学标准——顶级踏步与上层楼板之间还有一级 riser，那一级的"踏面"就是上层楼板本身。Walker 从顶级踏步走到上层楼板时，垂直 snap（drop = -riserHeight，绝对值 < SNAP_THRESHOLD）自动把人推上去。

**straight**
- 跑宽 = 洞口宽度（垂直于 bottomEdge 方向）
- treadCount 级踏步沿 bottomEdge → 对边方向累加
- 起点：bottomEdge 边上向洞口内 0 偏移；终点：treadCount × treadDepth 处
- 顶级踏步无特殊处理——顶面在 `(riserCount-1) × riserHeight`，靠 vertical snap 完成最后一级

**L 形**
- 划成两段垂直跑，转角处 1 个方平台
- **跑宽** `LW = min(洞口宽, 洞口深) / 2`（简化默认；用户可调洞口尺寸来调跑宽）
- **下跑级数** `nLow = floor(treadCount / 2)`
- **上跑级数** `nUp  = treadCount - nLow - 1`（减 1 给平台占的那一级高差）
- 下跑：从 bottomEdge 起，沿 bottomEdge 法向爬 `nLow` 级，每级 box 尺寸 `LW × treadDepth × riserHeight`
- 平台：方形，边长 `LW`，顶面 y = `lowerStoreyTopY + nLow × riserHeight`，紧接下跑末端的转角
- 上跑：从平台另一侧水平转 90°（方向由 `turn` 决定），爬 `nUp` 级
- 平台占哪个角（即"L"开口朝向）：`turn=right` 时上跑朝 bottomEdge 法向×右手系（具体到代码：bottomEdge 法向旋转 -90°），`turn=left` 时旋转 +90°

**U 形**
- 两跑沿 bottomEdge 轴平行，远端 1 个长方平台
- 每跑宽 ≈ (洞口宽 - 中间间隙) / 2，间隙取 0.05m
- 平台：长方形，宽 = 洞口宽，深 = 一级 treadDepth 或更大（按剩余空间分）
- 下跑：bottomEdge 起到平台前，level = floor(treadCount / 2)
- 上跑：平台另一侧返回，剩余级数

#### B. 平台（仅 L / U）

L 的转角方平台、U 的远端长平台，各 1 个 box mesh，位置见上文。

#### 顶部对齐

由建筑学惯例，顶级踏步顶面 = `(riserCount-1) × riserHeight = climb - riserHeight`，比上层楼板低一级。Walker 上到顶级踏步后再往前走一步即上到上层楼板，靠 vertical snap（snapThreshold > riserHeight）自动衔接。

### 4. 平面视图渲染（`src/components/DrawingSurface2D.tsx`）

楼梯在 storey N，渲染规则：

- **storey N 平面**（上层视图，看到下来这一段）：
  - 上半段踏步（上跑/上半部分），按踏步线绘制
  - 折线（直斜杠）穿过中段
  - "DN" 文字 + 朝下箭头（朝 bottomEdge 方向）
- **storey N-1 平面**（下层视图，看到上去那一段）：
  - 下半段踏步
  - 折线
  - "UP" 文字 + 朝上箭头（朝 -bottomEdge 方向，即背离 bottomEdge）

L/U 的折线放在转角平台位置；箭头沿主跑方向。

实现：在 DrawingSurface2D 现有的"按 storey 过滤要画的东西"逻辑里，加一条：当当前 plan 视图的 storey 是 N-1 时，也把 storey N 上的 stair 拿出来画下半段（下层视角的下半段 = 楼梯靠 bottomEdge 的那一半）。

### 5. 3D 漫游（`src/rendering/threeScene.ts`）

`threeScene.ts:631` 的 `collidables` 数组追加每架楼梯的所有踏步 + 平台 mesh。

**为什么只用 box 不需要斜面**：
- chest probe 高度 = `EYE_HEIGHT - CHEST_OFFSET = 1.0m`，远高于单级 `riserHeight ≈ 0.165m`。
- 要把多级踏步累计到 chest 高度（1m）需要 6+ 级，对应运行距离 ≥ 6 × treadDepth ≈ 1.6m，远超 chest probe 的最大射程（`movement + PLAYER_RADIUS ≈ 0.3m`）。所以走路时 chest probe 永远不会撞到踏步立面。
- `SNAP_THRESHOLD = 0.2 > riserHeight = 0.165`，且 `resolveVerticalState` 的 snap 逻辑对 negative drop 也生效——所以踩级时会被自动拉上下一级。

物理代码（`walkControls.ts` / `walkPhysics.ts`）零修改。

### 6. 选择 + 编辑

#### Selection（`src/domain/selection.ts`）

加新种类：

```ts
type ObjectSelection =
  | { kind: "wall"; wallId: string }
  | { kind: "opening"; openingId: string }
  | { kind: "balcony"; balconyId: string }
  | { kind: "stair"; storeyId: string };  // 新增
```

#### ToolPalette（`src/components/ToolPalette.tsx`）

加 `stair` 工具按钮（中文标签"楼梯"）。

工作流：选中 stair 工具 → 在 plan 视图按住拖出矩形 → 松开后用默认值生成：
- shape: "straight"
- treadDepth: 0.27
- bottomEdge: "+y"（以洞口本地坐标为准）
- materialId: 项目中第一个 frame 类材质

如果该 storey 已经有 stair，新画的矩形直接替换旧的（不弹窗，简单）。

#### PropertyPanel（`src/components/PropertyPanel.tsx`）

stair 选中时显示：
- **形状**：三按钮 [一字 / L / U]
- **踏步深度**：NumberField（米，最小 0.20，最大 0.40）
- **朝向**：四向按钮 [+X / -X / +Y / -Y]，标"入口边"
- **转向**：仅 shape=L 时显示，[左转 / 右转]
- **材质**：现有材质选择器（filter: kind in [frame, decor]）
- **只读派生**：`riserCount`、`riserHeight`（自动算后展示）

#### Mutations（`src/domain/mutations.ts`）

新增：
- `addStair(state, storeyId, rect)`：创建 stair（默认参数）。最底层 storey 由现有 `constraints.ts` 校验拒绝（无须额外检查）。
- `setStair(state, storeyId, patch)`：partial 更新。
- `removeStair(state, storeyId)`：删除。

### 7. 数据迁移

一刀切重命名，不保留兼容字段：

| 文件 | 变更 |
|---|---|
| `src/domain/types.ts` | `StairOpening` 删，`Stair` 加；`Storey.stairOpening` → `Storey.stair` |
| `src/domain/sampleProject.ts` | 两处 `stairOpening: {...}` → `stair: { ...原四个字段, shape: "straight", treadDepth: 0.27, bottomEdge: "+y", materialId: <现有 frame 材质 id> }` |
| `src/domain/constraints.ts:152` | `storey.stairOpening` 引用 → `storey.stair`（字段子集兼容） |
| `src/geometry/slabGeometry.ts:87` | 同上 |
| `src/__tests__/constraints.test.ts` | 测试 fixture 字段名同步 |
| `src/__tests__/slabGeometry.test.ts` | 同上 |
| `src/app/persistence.ts` | 检查是否有 schema 版本号；若有则 bump，写迁移；若没有则简单替换 |

### 8. 测试

新增：
- `src/__tests__/stairs.test.ts`：
  - `computeStairConfig` 各种 storeyHeight × treadDepth 边界
  - `buildStairGeometry` × 三形状：踏步坐标、L/U 平台位置、最顶级踏步与上层楼板对齐
  - 最底层 storey `addStair` 被拒（沿用现有 constraints 规则）
- `src/__tests__/walkPhysics.test.ts` 加：
  - 直跑楼梯：模拟相机水平推进 + 重力，期望 cameraY 单调递增直到上层标高
  - 上层落点：从楼梯顶踏出后 cameraY 稳定在 `upperStoreyTopY + EYE_HEIGHT`
- `src/__tests__/preview3d.test.tsx` 或新文件：
  - 创建含 stair 的项目 → 渲染 → `collidables` 包含所有踏步与平台 mesh
- `src/__tests__/wallDrawing.test.tsx` 类比扩展：
  - 选 stair 工具 → 拖矩形 → 项目里 storey.stair 出现，参数 = 默认值

回归：现有 `slabGeometry.test.ts` 切洞测试改用新字段名后仍通过。

### 9. UI / 交互细节

- 漫游模式下走到楼梯顶踏出，必须能落到上层地面正常行走。最顶级踏步顶面与上层楼板顶面同高 + 视觉延伸 1cm 覆盖楼板边缘下方，确保垂直探针不掉缝。
- 平面图楼梯被点击 → selection 变为 `{ kind: "stair", storeyId }`。
- 楼梯矩形高亮样式与现有 selection（balcony）一致。

## 风险 & 待办

- L 形在长方形（width:depth 远离 1:1）洞口里跑长被挤压——本 Spec 不修，由用户调整洞口比例。
- 走路上下楼"踏感"：每级会有视觉跳变（snap 一级），不是平滑斜坡。这是预期行为，对 personal tool 够用；要真正平滑可以以后再加 ramp collider。
- 默认 `bottomEdge="+y"` 不会自动按洞口长边方向调整——本 Spec 接受这个简单默认，用户进 PropertyPanel 改。
