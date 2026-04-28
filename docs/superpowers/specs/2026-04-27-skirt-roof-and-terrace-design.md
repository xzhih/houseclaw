# 阶段 1：副披檐 + 退台楼板 + 灰瓦材质

> 目标：让当前项目能近似还原中式三层别墅造型——主体 hipped/gable 主屋顶 + 中段披檐（腰檐）+ 退台露台 + 灰瓦材质。
> 参考图：用户 2026-04-27 提供的中式别墅渲染。

## 背景

现有屋顶系统（`feat/roof-optimize` 分支已修复 + 立面投影）支持单一主屋顶，挂在顶层 4 面轴对齐墙形成的矩形上。参考图需要：
1. 主屋顶之外再挂一段**副披檐**（lean-to skirt roof），覆盖一部分中段墙面
2. 上层退缩时下层屋顶自然形成**露台地面**
3. 灰色瓦面材质（catalog 当前只有红棕陶瓦）

阶段 1 不做：parapet 自动生成、L 形主屋顶 footprint、翘角檐、脊饰、主屋顶多实例。

## 范围

**包含**
- 新实体 `SkirtRoof`（沿一段墙挂载，单坡 lean-to + 两端 gable-style 垂直端封）
- 灰瓦材质 `mat-gray-tile`
- 退台楼板自动生成（上层比下层小 → 下层屋顶面自动作为上层露台地面）
- 完整 UI：工具栏「披檐」工具、平面/立面视图添加、PropertyPanel 编辑、3D 渲染

**不包含**
- 主屋顶仍是单一 `project.roof?`，不升级为 `roofs[]`
- 露台栏板（parapet）需用现有 Balcony 多段拼接（暂不自动）
- 悬挑场景（上层比下层大）：退台逻辑不裁剪楼板，但也不自动延伸下层
- L/T 形主屋顶 footprint
- 翘角檐、脊饰
- 披檐端封暂仅支持 `hipped`，未来可扩展 `gable`/`open`

## 数据模型

### SkirtRoof

```ts
type SkirtRoof = {
  id: string;
  hostWallId: string;        // 所挂的外墙 id
  offset: number;            // 沿 host wall 起点偏移 (m)
  width: number;             // 沿墙覆盖宽度 (m)
  depth: number;             // 垂直墙向外深度 (m)，到檐线（不含 overhang）
  elevation: number;         // 披檐高侧（与墙交接处）的 z (m)
  pitch: number;             // 弧度，[π/36, π/3]
  overhang: number;          // 出檐 (m)，沿墙两端 + 檐外侧三个方向都加
  materialId: string;
};
```

**约束**（在 mutations 层强制）
- `0 ≤ offset`，`offset + width ≤ wallLength(hostWall)`
- `0.3 ≤ width`
- `0.3 ≤ depth ≤ 4`
- `0.05 ≤ overhang ≤ 1.5`
- `π/36 ≤ pitch ≤ π/3`（5°–60°）
- `storey.elevation < elevation ≤ storey.elevation + storey.height`（host wall 所在 storey 内，必须高于楼板，可达 wallTop）
- `hostWallId` 必须指向现有外墙

### HouseProject 字段

```ts
type HouseProject = {
  ...existing
  skirts: SkirtRoof[];       // 新字段，默认 []
};
```

### Selection model

`ObjectSelection` 增加：
```ts
| { kind: "skirt"; id: string }
```

### 灰瓦材质

`src/materials/catalog.ts` 增加：
```ts
{ id: "mat-gray-tile", name: "灰瓦", kind: "roof", color: "#3a3f43" }
```

## 几何

### SkirtRoof 几何（`src/geometry/skirtGeometry.ts` 新文件）

输入：`SkirtRoof` + host wall（带方向）。

派生量：
- `û` = host wall 单位方向向量（start → end）
- `n̂` = host wall 外法向单位向量（指向墙外侧；用现有 wall footprint 的 right side 推导）
- `wallLen` = wall 长度
- `dropZ = depth · tan(pitch)` （从锚线到檐线的下沉量）
- `overhangZ = overhang · tan(pitch)` （檐外侧 overhang 再下沉）

锚线（高侧，紧贴墙；含两端沿墙 overhang）：
- `A0 = wall.start + û · (offset - overhang)`，z = elevation
- `A1 = wall.start + û · (offset + width + overhang)`，z = elevation

檐线（低侧，外伸 `depth + overhang`）：
- `E0 = A0 + n̂ · (depth + overhang)`，z = elevation - dropZ - overhangZ
- `E1 = A1 + n̂ · (depth + overhang)`，z = elevation - dropZ - overhangZ

输出 `SkirtGeometry`：
```ts
type SkirtGeometry = {
  skirtId: string;
  panel: { vertices: [Point3, Point3, Point3, Point3] };  // CCW from outside: A0, A1, E1, E0
  endCaps: [
    { vertices: [Point3, Point3, Point3] },  // start cap (offset side)
    { vertices: [Point3, Point3, Point3] },  // end cap (offset+width side)
  ];
  materialId: string;
};
```

**端封三角形**（vertical gable triangle，flush 端面，phase 1 简化方案）：
- 每个端面在 host wall 平面内 + 垂直，把斜板的下端"切平"
- start cap 三个顶点：
  - `A0`（锚线起点，紧贴墙，z = elevation）
  - `E0`（檐线起点，外伸 depth+overhang，z = elevation - dropZ - overhangZ）
  - `W0`（A0 沿 -n̂ 方向不动，但 z 降到 E0 的高度）—— 即 wall 上 A0 正下方对应低点
- end cap 同理（A1 / E1 / W1）

> 注：脑暴时口语称"hipped"，实际 phase 1 实现是 gable-style 垂直端封（更简单且与图中端面观感一致）。后续真正 hipped 斜面端封作为扩展项。

> 实现注意：winding 顺序统一 CCW（从外面看），与现有 RoofPanel/RoofGable 一致，方便共用 mesh builder。

### 退台楼板（修改 `src/geometry/slabGeometry.ts` + `houseGeometry.ts`）

规则改写：
- 底层 storey：slab outline = 该 storey 自己的外墙构成的 ring（现状不变）
- 非底层 storey N：slab outline = **storey N-1 的外墙构成的 ring**（自动覆盖 N-1 屋顶面 = N 的楼板/露台面）

实现位置：在 `buildHouseGeometry` 中已经按顺序排了 `sortedStoreys`。给 `buildSlabGeometry` 传入"用于 outline 的 walls 集合"参数（默认 = storey 自己的 walls）。在 `buildHouseGeometry` 里对 N>0 的 storey 用 N-1 的 walls 替换。

楼梯口 hole 逻辑保留（已有 `slabHoleByStorey`）。

边界情形：
- N-1 不存在外墙环 → fallback 到 N 自己的 walls
- 等大 footprint → 行为不变（视觉无变化）
- 悬挑（N 比 N-1 大）：slab 跟 N-1，会比 N 的实际 footprint 小。此时 N 的部分墙下方无楼板。Phase 1 已知限制。

## 渲染

### 3D（`src/rendering/threeScene.ts`）

新增 `createSkirtMeshes(project, houseGeometry)`，返回 `{ meshes, materials }`，结构与 `createRoofMeshes` 平行：
- 每段 SkirtRoof 一个 panel mesh（材质从 SkirtRoof.materialId 读）
- 两个端封 mesh（用 host wall 材质，与主屋顶 gable 一致）

mesh 加入 scene，纳入 `collidables`（漫游模式可走过 / 撞到）。

### 2D 平面（`src/components/DrawingSurface2D.tsx`）

在 `renderPlan` 里：对每段 SkirtRoof，画一个矩形覆盖区在 host wall 外侧：
- 矩形 = host wall 在 [offset, offset+width] 段沿外侧延伸 depth 的投影
- 浅灰 fill + 灰瓦色 stroke
- 中心方向画一条短线代表坡向（高→低指向外）
- 选中态：橙色 outline（沿用 `is-selected` 类）

### 2D 立面（`src/projection/elevation.ts` + `DrawingSurface2D`）

复用 `projectRoofToElevation` 模式：
- 给 `ElevationProjection` 加 `skirts?: ElevationRoofPolygon[]`（与 `roof` 同结构，复用 `ElevationRoofPolygon`）
- `projectElevationView` 中遍历 `project.skirts`，调 `buildSkirtGeometry`，把 panel + 两端封投影
- `elevationBounds` 把披檐顶点纳入
- `renderElevation` 像渲染 `projection.roof` 一样渲染 `projection.skirts`

### 屋顶 tab 不变

披檐属于墙附属构件，不在屋顶 tab 的 edge 配置语义里。屋顶 tab 仍然只管主屋顶。

## UI / 交互

### 工具栏

`ToolId` 增加 `"skirt"`。`Toolbar.tsx`（或对应组件）的工具组里加按钮「披檐」。

### 添加流程

平面视图（plan-Nf）：
1. 选「披檐」工具
2. hover 一面外墙 → 该墙整段高亮（与现有 wall hover 一致）
3. 点击 → `addSkirt(project, hostWallId, defaults)`：
   - offset = 0
   - width = wall 长度
   - depth = 1.0 m
   - elevation = host wall 所在 storey 的 wallTop（`storey.elevation + storey.height`）
   - pitch = π/6 (30°)
   - overhang = 0.3 m
   - materialId = `mat-gray-tile`
4. 自动选中新建披檐（`{ kind: "skirt", id }`），工具回到「选择」

立面视图：选「披檐」工具 → 点击墙 band → 同上。

### PropertyPanel

`SkirtEditor`，结构对齐现有 `WallEditor` / `StairEditor`：

```
披檐 · skirt-xxxx
  起点偏移   [____] mm
  宽度       [____] mm
  外伸深度   [____] mm
  挂接高度   [____] mm
  坡度       [____] °
  出檐       [____] mm
  [删除]

材质
  [陶瓦] [灰瓦]   ← swatch 网格 (kind=roof)
```

删除走 `onDeleteSelection`（PropertyPanel 已有 hook）+ Backspace/Delete 键，与 wall/balcony/stair 一致。

### Mutations（`src/domain/mutations.ts`）

新增：
- `addSkirt(project, hostWallId, defaults?) → project`
- `updateSkirt(project, id, patch) → project`，patch 类型 `Partial<Omit<SkirtRoof, "id">>`
- `removeSkirt(project, id) → project`

约束失败抛 `Error`（与 `updateOpening` 等一致）。

## 持久化

`src/app/persistence.ts`：
- schema 加 `skirts: SkirtRoof[]`
- validator：每段 SkirtRoof 字段在合理区间且 `hostWallId` 存在；不合法则**丢弃该段**（与现有 roof 验证策略一致：`drops on failure`）
- 旧项目加载：缺 `skirts` 字段 → 默认 `[]`

灰瓦材质：catalog 是从代码 import 的，旧项目加载会自动获得新材质条目（不需要 migration）。

## 测试

### 单元
- `__tests__/skirtGeometry.test.ts`（新）
  - 默认参数下 panel 4 顶点位置、CCW winding
  - overhang 应用：锚线沿墙两端 + 檐线外侧、向下 z 都正确
  - 端封三角形 winding 朝外
  - 倾斜墙（非轴对齐）的法向量计算
- `__tests__/slabGeometry.test.ts` 加：
  - 退台场景（2F 走 1F 外圈），断言 outline 与 1F 一致
  - 等大 footprint 行为不变（已有断言不破）
- `__tests__/mutations.test.ts` 加：
  - addSkirt 默认值
  - updateSkirt patch 应用
  - removeSkirt 移除 + 同时清掉 selection 若选中
  - 约束失败用例（offset+width 超墙长 / pitch 越界 / hostWallId 不存在）
- `__tests__/persistence.test.ts` 加：
  - 旧项目（无 skirts 字段）加载得到 `skirts: []`
  - 含非法 skirt 的项目加载，丢弃非法段

### 集成
- `__tests__/projection.test.ts` 加：
  - 含 1 段 skirt 的 project → plan 投影含披檐区域、4 个 elevation 投影含披檐多边形

### UI
- `__tests__/ui.test.tsx` 加：
  - 工具栏「披檐」按钮存在
  - 选「披檐」工具 → 点墙 → 项目里多了 skirt 且自动选中
  - 选中 skirt → PropertyPanel 出现宽度/深度/坡度等字段
  - 删除按钮移除 skirt
  - 材质 swatch 网格出现且可切换

`sampleProject.test.ts` 不动以保护现有断言。

## 实施切片

每片可独立 commit / 独立 ship：

1. **灰瓦材质** (~30 min) — catalog 加一项 + 单测
2. **数据模型 + 持久化** (~半天) — SkirtRoof 类型、HouseProject 字段、Selection kind、mutations、persistence schema、单测
3. **几何** (~1 天) — `skirtGeometry.ts` + 单测；退台 slab outline 调整 + 单测
4. **3D 渲染** (~半天) — `createSkirtMeshes` 接入 threeScene
5. **2D 平面渲染** (~半天) — DrawingSurface2D 平面绘制 + 选中
6. **2D 立面渲染** (~半天) — elevation 投影管线复用 + 集成测试
7. **PropertyPanel + 工具栏** (~半天) — 新工具按钮、SkirtEditor、UI 测试

合计 ≈ 4 工作日。

## 已知限制 / 后续阶段

- 主屋顶仍单一；多个主屋顶留待阶段 2/3
- 退台不支持悬挑场景
- 露台栏板需手动用 Balcony 多段拼接
- 端封仅 gable-style 垂直三角；真正 hipped 斜面端封 / open 端封后续按需扩展
- 翘角檐、脊饰、L/T 屋顶 footprint 留待后续阶段
