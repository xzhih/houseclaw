# 扁平 3D 原型重构设计

更新日期：2026-04-30
关联：`docs/2026-04-26-house-design-tool-feasibility-design.md`（产品定位 / 不变量）、`docs/2026-04-26-house-design-tool-v2-roadmap.md`（V2 路线）、`docs/2026-04-28-iteration-friction-roadmap.md`（M1-M4 已合并的减摩重构）

## 背景

V1 prototype 把所有几何对象隐式装进"楼层容器树"：墙隶属 storey、storey 强制水平切片、屋顶必须从顶层 storey 派生且要求**整层恰好 4 面墙**（`src/geometry/roofGeometry.ts:67`）、屋顶在 `HouseProject` 上是 singleton。这个模型表达不了多体量并置造型 —— 例如主屋双坡 + 2F 退台 + 右翼平顶 + 入口门廊小坡顶共存。

本次重构把数据模型从"分层堆叠"换成 **扁平 3D 原型 + 标高锚点**：墙 / 楼板 / 屋顶都是 3D 空间里的兄弟级对象，没有楼层容器；Storey 退化为"命名标高表"，仅作锚点引用使用。这是 SketchUp/Revit 的核心思路。

## 核心不变量（保留自可行性文档）

- 几何由程序生成，imagegen 仅贴外观
- 2D 永远只是同一套结构对象的投影，无独立真相
- 强约束：系统不允许产生无法生成 3D 的结构

## §1 总体架构

`HouseProject` 从"楼层容器"换成"对象池 + 标高表"：

```ts
HouseProject {
  storeys: Storey[]          // 命名标高表，不再装东西
  walls: Wall[]              // 顶层数组
  slabs: Slab[]              // 楼板 / 露台 / 雨棚底（新一等公民）
  roofs: Roof[]              // 数组，不再 singleton（吸收 SkirtRoof）
  openings: Opening[]        // 仍挂在墙上（wall-local）
  balconies: Balcony[]
  stairs: Stair[]            // 不再寄居在 Storey 上
  materials: Material[]
  // schemaVersion / mode / activeView / activeTool / selection 保留
}
```

Storey 退化：

```ts
Storey {
  id: string                 // "1f" / "2f" / "roof"
  label: string
  elevation: number          // 该层楼板顶面世界 z（米）
}
```

Storey **不再"拥有"任何对象**。它的唯一用途是被 Anchor 引用 —— 改 storey.elevation 让所有锚到它的对象自动联动。新建 storey 行时的默认层高用全局常量 `DEFAULT_STOREY_HEIGHT = 3.2m`，不进 schema。

为什么 Slab 单独留而不并进 Roof：楼板语义是"可走的水平面 + 厚度"，屋顶是"可有坡度的覆盖面 + 出檐 + 屋脊"。强行合并会让 Roof 类型为兼容楼板背上 `pitch=0, edges 全 eave, overhang=0` 的退化 case，模型反而脏。

## §2 Wall + Anchor 系统

### 2.1 Anchor

```ts
type Anchor =
  | { kind: "storey"; storeyId: string; offset: number }   // 解析为 storey.elevation + offset
  | { kind: "absolute"; z: number }                         // 直接世界 z

function resolveAnchor(a: Anchor, storeys: Storey[]): number
```

99% 情况用 `storey`；`absolute` 留给一次性场景（1.2m 矮女儿墙、特殊腰线高度）。

### 2.2 Wall

```ts
type Wall = {
  id: string
  start: Point2; end: Point2
  thickness: number
  bottom: Anchor               // 默认 { storey: 当前 plan 视图 storey, offset: 0 }
  top: Anchor                  // 默认 { storey: 下一个 storey, offset: 0 }
  exterior: boolean
  materialId: string
}
```

旧 `Wall.storeyId + height` 删除。一面墙可以**轻松跨多层**（双层挑空墙：`bottom: 1F+0, top: 顶+0`）。

### 2.3 Slab

```ts
type Slab = {
  id: string
  polygon: Point2[]            // CCW 外轮廓，至少 3 顶点，不要求矩形
  top: Anchor                  // 楼板顶面标高
  thickness: number            // 向下延伸厚度（默认 0.15m）
  materialId: string
  edgeMaterialId?: string      // 可选，楼板侧面（楣板）
}
```

楼板 / 露台 / 门廊地坪 / 雨棚底面统一用此类型。多边形支持 L 形 / 回字形（图里 1F 退台后留出的 L 形露台直接就是一块 Slab）。

### 2.4 Roof

```ts
type RoofEdgeKind = "eave" | "gable" | "hip"

type Roof = {
  id: string
  polygon: Point2[]            // 自己的外轮廓，不再借顶层墙的 ring
  base: Anchor                 // 檐口高度（坡屋顶最低点）
  edges: RoofEdgeKind[]        // 与 polygon 边一一对应（按顶点序，长度 === polygon.length）
  pitch: number                // 弧度，范围 [π/36, π/3]
  overhang: number             // 出檐，范围 [0, 2]
  materialId: string
}
```

**SkirtRoof 类型 + `skirtGeometry.ts` 删除**。披檐 = 小尺寸矩形 polygon + 低 base + `[eave, gable, gable, gable]` 的 Roof，shed-case 几何完全吃得下。

`Roof.polygon` 在创建时可由"选中一组墙 → 取 bbox + overhang"自动生成（保留作为创建快捷方式），但生成后是**独立数据**，不随墙变化重算 —— 让用户能调一个不严格贴合墙的屋顶轮廓（例如主屋顶覆盖到门廊上方）。

### 2.5 其余对象

- **Opening**：保持 `wallId + offset + sillHeight + width + height`，wall-local。`sillHeight` 相对 `wall.bottom`。
- **Balcony**：`attachedWallId + offset + width + depth + slabTop: Anchor + railingHeight + slabThickness + materialId + railingMaterialId`，用 anchor 替代 storeyId。
- **Stair**：`from: Anchor + to: Anchor + footprint(x, y, width, depth) + shape + treadDepth + bottomEdge + turn? + rotation? + materialId`，不再寄居在 Storey 上。

### 2.6 校验（assertValidProject）

- 所有 anchor 引用的 storeyId 存在
- 每面墙 `resolve(top) - resolve(bottom) ≥ MIN_WALL_HEIGHT (0.5m)`
- 每个 `Roof.edges.length === polygon.length`
- 每个 `Slab.polygon` 至少 3 顶点、不自交、CCW
- Opening 仍保证 `sillHeight + height ≤ resolve(top) - resolve(bottom)`
- Stair `resolve(to) > resolve(from)`

## §3 投影系统

旧"按 storey tag 过滤"换成**真正的水平切片**。

### 3.1 平面视图（1F / 2F / ... plan）

每个 storey 对应一个切平面：

```
cutZ(storey) = storey.elevation + PLAN_CUT_HEIGHT   // PLAN_CUT_HEIGHT = 1.2m
```

视图显示规则：

| 对象 | 显示条件 |
|------|----------|
| Wall | `[resolve(bottom), resolve(top)]` 区间包含 cutZ |
| Slab（地面） | `top.resolved === storey.elevation` |
| Slab（中间夹层） | thickness 区间包含 cutZ → 实线轮廓 |
| Opening | 所属墙在切片中 + 开洞 z 区间与 cutZ 有交（v1 简化：所属墙在切片中即显示，z 严格判定留 v2） |
| Balcony | `slabTop.resolved` 落在 `[storey.elevation - 0.05, storey.elevation + 0.05]` |
| Stair | `from` anchor 解析在当前 storey ± 0.05（沿用"在出发层显示"约定） |
| Roof | 不显示（在专属 roof 视图） |

跨多层的双层挑空墙**自动**在多个 plan 里都画出来（无需特殊 case）。中间夹层自然出现。

### 3.2 立面视图（front / back / left / right）

整栋房子一起投影到对应平面，**不分楼层**：

- Wall → 带高度的矩形（z 区间用 anchor 解析）
- Slab → 水平线段（位于 z = top.resolved；端点 = polygon 投影到立面平面后的最小/最大水平坐标）
- Roof → 按 polygon + edges 投影：迎面侧画檐口线 + 山墙轮廓；侧面画屋脊轮廓
- Opening → 现有 wall-local 投影逻辑保留

### 3.3 屋顶视图

显示**所有 Roof.polygon 的并集**，每个 polygon 标出屋脊线 + edge 类型视觉区分：

- eave: 粗实线
- gable: 细线
- hip: 点划线

点击 edge 切换 kind 即在此视图编辑。

### 3.4 接口

```ts
function projectPlan(project: HouseProject, storeyId: string): PlanScene
function projectElevation(project: HouseProject, side: "front"|"back"|"left"|"right"): ElevationScene
function projectRoofView(project: HouseProject): RoofScene
```

`PlanScene / ElevationScene / RoofScene` 是一组 2D 图元（segments + polygons + labels）。`DrawingSurface2D` 拿到就画 —— 现有 M4 拆好的 8 个 `canvas/*` 模块及拖拽状态机原样复用。

## §4 几何生成

### 4.1 Wall

`wallPanels.ts` 算法**完全保留**。改动：墙顶 z 来源从 `storey.elevation + height` 换成 `resolveAnchor(wall.top)`，墙底 z 从 0 换成 `resolveAnchor(wall.bottom)`。

### 4.2 Slab

旧 `slabGeometry.ts` 删除重写：

```ts
function buildSlabMesh(slab: Slab, storeys: Storey[]): Mesh
// 用 THREE.Shape 接 slab.polygon → ExtrudeGeometry(depth=thickness)
// 顶面定位在 resolveAnchor(slab.top)，向下 extrude
```

支持非矩形多边形，使用 Three.js 内建 `Shape + ExtrudeGeometry`，不引入 earcut。

### 4.3 Roof

`roofGeometry.ts` 现有 5-case dispatcher（1 / 2-opp / 2-adj / 3 / 4 eave）**保留**，输入改为：

```ts
function buildRoofMesh(roof: Roof, storeys: Storey[]): { panels: RoofPanel[]; gables: RoofGable[] }
```

**v1 限制**：`Roof.polygon` 必须为 4 顶点矩形。覆盖图里全部屋顶（主屋矩形、门廊小矩形、右翼矩形、披檐矩形）。L 形 / T 形屋顶（straight skeleton 算法）**v1 不做**，明确留 v2。

`SkirtRoof` 类型 + `skirtGeometry.ts` **删除**。

**山墙三角片**（`RoofGable`）：旧版引用 `wallId`，新版改为**独立三角形多边形 + materialId**，不再绑定具体墙。Builder 直接输出三角面片到对应位置；底下的墙按自己的 top anchor 收顶 —— 视觉对齐靠用户把墙顶 anchor 调到屋顶 base 同标高。**不实现"墙自动按屋顶斜面收顶"** 的联动（v1 工作量取舍）。

### 4.4 Opening Frame / Stair / Balcony

- `openingFrameGeometry.ts` 不动（输入 wall-local）
- `stairGeometry.ts` 不动，bottom/top z 改用 `resolveAnchor` 解析
- Balcony 几何不动，slabTop 改用 anchor 解析

### 4.5 渲染入口

`rendering/threeScene.ts` 简化：

```ts
function buildSceneGeometry(project: HouseProject) {
  const storeys = project.storeys
  return {
    walls:     project.walls.map(w => buildWallMesh(w, project.openings, storeys)),
    slabs:     project.slabs.map(s => buildSlabMesh(s, storeys)),
    roofs:     project.roofs.map(r => buildRoofMesh(r, storeys)),
    stairs:    project.stairs.map(st => buildStairMesh(st, storeys)),
    balconies: project.balconies.map(b => buildBalconyMesh(b, project.walls, storeys)),
    openings:  project.openings.map(o => buildOpeningFrame(o, project.walls, storeys)),
  }
}
```

每个 builder 依赖参数显式，无隐式全局，便于测试与未来缓存。

## §5 编辑体验

### 5.1 工具栏

```
旧:  select | wall | door | window | opening | balcony | stair | skirt | material
新:  select | wall | door | window | opening | balcony | stair | slab | roof | material
                                                       ↑ 新     ↑ 改造
```

- `skirt` 工具删除
- `slab` 新增：plan 视图点击多边形顶点，回车闭合 → 创建 Slab（默认 top = 当前 storey, thickness = 0.15）
- `roof` 改造：从单例变多个；两种创建路径 ——
  1. 选中一组墙 → 工具按钮"加屋顶" → 取所选墙 bbox 自动生成矩形 polygon + 4 边全 eave + base = 所选墙 top anchor 最高值
  2. 在 roof 视图内手动画 4 顶点矩形

### 5.2 PropertyPanel Anchor 选择器

每个有 anchor 字段的对象（Wall.bottom/top, Slab.top, Roof.base, Stair.from/to, Balcony.slabTop）显示：

```
锚点:  [1F ▼]  偏移: [+0.000] m
       └─ 下拉项: 各 storey + 一项 "自定义"
          - 选 storey → anchor = { kind: "storey", storeyId, offset }
          - 选 "自定义" → anchor = { kind: "absolute", z }，偏移输入框改为绝对 z
```

新建对象的默认锚点靠"猜"：新建墙 bottom = 当前 plan 视图所属 storey + 0，top = 下一个 storey + 0；99% 用户不用碰此面板。

### 5.3 Storey 列表编辑器

PropertyPanel 顶部全局区块（不依赖选中），管理 storeys 表：

```
楼层               标高           层高（计算）       操作
─────────────────────────────────────────────────────
1F  [一层      ]  ±0.000 m       3.200 m
2F  [二层      ]  +3.200 m       3.200 m
顶  [屋顶层    ]  +6.400 m       —             [删]
                                              [+ 添加]
```

- **标高列**：改某行 elevation → 所有锚到它的对象自动联动；不级联（只动这一行，相邻行 elevation 不变）
- **层高列**：可编辑。编辑某行的"层高 H"等价于把"下一行 elevation"设为"本行 elevation + H"，**并把更上面所有 storey 一起平移相同 delta**（保持上层房间高度不变）。这是用户改"1F 高一点"时期望的行为。
- 顶部最后一行无"下一行"，层高列显示 "—" 不可编辑
- 删除 storey 前校验是否仍有对象锚到它；有则阻止 + 提示先迁移

### 5.4 屋顶 edge 编辑

Roof 视图内点击 polygon 某条 edge 循环切换 `eave → gable → hip → eave`。PropertyPanel 选中 roof 时也显示 edge 列表（4 行下拉）便于精确编辑。

## §6 迁移与分阶段落地

### 6.1 迁移策略：废弃 v1 schema，重写 sample

不写 v1 → v2 migration。理由：

1. v1 数据本身装不下新模型表达力
2. 写迁移 = 双倍维护两个不一致语义
3. 重写 sample 让用户亲手验证图里造型可达，是天然端到端验收

具体：

- `domain/types.ts` 整体重写为新 schema，`schemaVersion: 2`
- `app/persistence.ts` 加载 v1 文件直接报错"此版本不再支持，请重新搭建"
- `domain/sampleProject.ts` 重写：用新模型搭一栋接近图里造型的样板（主屋双坡 + 2F 退台 + 右翼平顶 + 入口小坡顶 + 门廊 slab）作为新 showcase

### 6.2 分阶段（每阶段独立 spec → plan → ship）

```
P1  domain/types + Anchor + assertValidProject + 纯函数单测
    ───── 不动 UI / geometry / projection；类型层立起来 + 测试覆盖

P2  geometry builder 重写（wall 用 anchor、slab polygon、roof 独立 polygon、删 skirt）
    ───── headless 单测覆盖；UI 仍用旧数据，3D 暂时无法显示

P3  projection 重写（水平切片 plan / 整栋立面 / 多 roof 屋顶视图）
    ───── 单测覆盖；UI 仍未接通

P4  UI 接通（DrawingSurface2D 接新 projection、ToolPalette 调整、PropertyPanel anchor picker、Storey 列表编辑）
    ───── 端到端浏览器验证：能打开新 sample、3D 显示对、改 storey 高度联动正确

P5  重建 sample showcase：用新工具搭出图里那栋房子（多体量、退台、多屋顶）
    ───── 验收：能在浏览器完整搭出 + 截图对比图片
```

P1+P2+P3 在没有可见 UI 的情况下推进（domain/geometry/projection 全是纯函数），不影响主分支既有功能 —— 等 P4 一锤子接通。

**无 feature flag、无双轨**：旧路径在 P4 之前都跑老逻辑，P4 一刀切换。这是接受"原仓库重写但不渐进"的取舍。

**本 spec 是伞文档**。下一步 writing-plans 只消费 **P1**（domain/types + Anchor + assertValidProject），落地完毕后再启动 P2 的 spec → plan → ship 循环，依此类推。每个 P 阶段单独成 plan、单独 PR、单独验收。

### 6.3 测试策略

- domain / projection / geometry 维持 100% 行覆盖目标
- 老 projection / mutation 测试重写 fixture，断言形态一致
- 新增"image-style 房子"端到端 fixture：扁平对象列表 → 全套 builder → 验证关键 invariant（屋顶面数、墙板数等数字断言）

## §7 范围边界（v1 不做）

- L 形 / T 形屋顶（straight skeleton）→ v2
- 墙按屋顶斜面 auto-trim 收顶 → v2
- Plan view cut height 用户可调 → v2（v1 写死 1.2m）
- Anchor 引用其他对象（如"这面墙顶锚到那块 slab 的顶"）→ v2（v1 仅 storey / absolute）
- Opening z 严格判定（截面以上的开洞虚线显示）→ v2

## §8 完成判据

- 所有 P1–P5 阶段 `bun run test` + `bun run build` 全绿
- 浏览器内能打开新 sample，3D 视图能看见多体量造型
- 改 storey.elevation 时，锚到它的所有对象在 2D + 3D 同步联动
- 用扁平工具能搭出图里那栋房子（多体量 + 退台 + 多屋顶 + 门廊），与原图视觉对位可接受
