# HouseClaw V2 路线图

更新日期：2026-04-26
对应可行性文档：`docs/2026-04-26-house-design-tool-feasibility-design.md`
对应现状评估：`docs/2026-04-26-implementation-status.md`

## 总目标

在不偏离"轻量住宅外观沟通工具"产品定位的前提下，把 V1 prototype 从"只能查看 sample"提升到"业主能在浏览器里搭出三层别墅外观、调整尺寸/材质、保存方案、和设计师沟通"。

每个阶段必须保留两条硬约束：

- **几何由程序生成**，imagegen 永远只贴外观，不决定结构（可行性文档 §2.4）
- **2D 永远只是 HouseModel 的投影**，没有独立真相（§3.1）

每个 Phase 结束都必须满足：`bun run test` + `bun run build` 全绿，关键交互在浏览器手动验过。

---

## Phase 1 — 跑通可行性文档第 14 节最小闭环

> 目标：让用户能够画墙、加窗、改尺寸、看 3D，覆盖文档 §14 的 8 步。

### 1.1 多开孔切分修复

修 `src/geometry/wallPanels.ts`，支持任意数量开孔。算法：

1. 按 `offset` 排序所有开孔。
2. 横向用 sweep line 切出"无开孔"列。
3. 每列在垂直方向按 sill / opening top 切成 `below` / `above` 段。
4. 输出所有正面积矩形面片。

新增测试：双开孔不丢面片、开孔跨墙长拒绝、开孔重叠拒绝。

### 1.2 选中态升级为统一 selection

新增 `src/domain/selection.ts`：

```ts
export type Selection =
  | { kind: "wall"; wallId: string }
  | { kind: "opening"; openingId: string }
  | { kind: "balcony"; balconyId: string }
  | { kind: "storey"; storeyId: string }
  | undefined;
```

替换 `selectedObjectId: string | undefined`。Reducer 增 `select` action；DrawingSurface 把所有 SVG 元素挂上 click。

### 1.3 PropertyPanel 全面可编辑

按 selection.kind 分支：

- wall：长度只读，厚度 + 高度 + 材质可改
- opening：宽 / 高 / 离地 / offset 可改，type 可切换 door/window/void
- balcony：宽 / 进深 / 栏杆高 / offset 可改
- storey：层高、楼板厚度、label

所有数值输入用 `<input type="number" step="0.05">`，blur 触发 mutation；非法输入由 `assertValidProject` 拦截，UI 显示 inline error。

测试：输入合法值 → reducer 更新；输入越界值 → 红字错误，state 不变。

### 1.4 ToolPalette 接入画墙工具

最小可用版本：

- 选中"墙"工具 + 在某个 plan view 中点两次 → 添加新墙到当前楼层。
- 第二点用网格吸附（默认 0.1m），按住 Shift 解除吸附。
- 端点距离已有墙端点 < 0.2m 时强吸附到已有端点。
- 新墙默认 thickness = `defaultWallThickness`、materialId = 第一个 wall 类材质。

不做：偏移/修剪/延伸。新墙不允许零长度，长度合法性走 `assertValidProject`。

后续门/窗/阳台工具按相同模式（点墙 → 输入参数）实现。

### 1.5 楼层高度 UI

在每个平面 view 顶部加横向 strip，显示 `1F: 3.2m / 2F: 3.2m / 3F: 3.2m`，单击当前层进入编辑（已有 `setStoreyHeight` mutation 支持）。改一层后，**所有楼层 elevation 自动重计算**（mutation 已实现）；3D 重渲染。

### 1.6 多开孔重叠校验

`constraints.ts` 增加：同墙开孔之间不重叠（offset+width 不能落入另一开孔区间）。新增测试。

**Phase 1 完成判据**：在浏览器里完整执行可行性文档 §14 的 8 步，全部成功。

---

## Phase 2 — 让 3D 真正可看

> 目标：把 3D 从"装饰图片"升级为"沟通载体"。

### 2.1 OrbitControls + 实时渲染循环

引入 `three/examples/jsm/controls/OrbitControls.js`（或 v0.160+ 的 addons API），加 `requestAnimationFrame` 循环。注意 cleanup：组件卸载或 project 变更时停止 RAF、dispose controls。

测试：useEffect 重跑时不留旧 RAF（用 vitest fake timer 验证）。

### 2.2 四向快捷视角

`Preview3D` 顶部加按钮 `正面 / 背面 / 左侧 / 右侧 / 俯视 / 透视`。点击后 camera lerp 到对应位置 + lookAt center。Camera state 不写入 project。

### 2.3 楼板 + 屋面板渲染

每个 storey 渲染一块 `BoxGeometry(width, slabThickness, depth)`，根据该层墙体外轮廓 bounding box 计算 width/depth。第三层之上加一块 placeholder 平屋顶（厚度 = 0.2m，颜色取 `mat-gray-stone` fallback）。这块为 Phase 3 真正屋顶让位。

### 2.4 阴影 + ToneMapping

`renderer.shadowMap.enabled = true`，`keyLight.castShadow = true`，墙/楼板 cast+receive。`renderer.toneMapping = ACESFilmicToneMapping`，`outputColorSpace = SRGBColorSpace`。验收：3D 中能看到墙在地面投影。

### 2.5 截图导出

加按钮"导出 3D 截图"：当前 `WebGLRenderer({preserveDrawingBuffer: true})` 已是 V1 的方向，确认开启。截图调用 `renderer.domElement.toBlob` → `downloadTextFile` 类比的 `downloadBlob` helper。同时加"导出 2D 截图"：把当前 SVG serialize 后用 `<img>` + canvas 转 PNG。

测试：mock canvas，断言 anchor.click 调用一次，filename 含视图名 + 时间戳。

**Phase 2 完成判据**：用户能在 3D 里转动相机看清三层别墅，能截一张 PNG 发给设计师。

---

## Phase 3 — 屋顶模型与立面装饰

> 目标：进入可行性文档阶段 3，让模型像别墅而不像火柴盒。

### 3.1 Roof 领域对象

```ts
export type RoofType = "flat" | "single-slope" | "gable";
export type Roof = {
  id: string;
  type: RoofType;
  storeyId: string;       // 所基于的最高楼层
  slope: number;          // 0..60 度
  ridgeAxis: "x" | "y";   // 对 gable
  eaveOverhang: number;   // 檐口外挑
  materialId: string;
};
```

加入 `HouseProject.roofs: Roof[]`，约束：基于的 storey 必须存在；斜率 [0, 60]；屋顶 polygon 由该层墙外轮廓自动派生。

### 3.2 Roof 投影

立面里把屋顶画成三角形/平行四边形；屋顶视图（roof view）画俯视轮廓 + 屋脊线。

### 3.3 Roof Geometry

`buildRoofMesh`：

- flat：BoxGeometry，厚度 0.2m。
- single-slope：根据墙轮廓 + slope 生成倾斜 ExtrudeGeometry。
- gable：ridgeAxis 决定屋脊方向，输出两块斜面 + 两块山墙三角面片。

不做：复杂多坡、攒尖、四坡组合。文档 §5.6 明确禁止。

### 3.4 屋顶 UI

`ViewTabs` 的 roof tab 启用：在该视图下展示屋顶轮廓 + 屋脊；属性面板支持 roof.type 切换、slope slider、eaveOverhang 数值。

### 3.5 简单门窗框

`Opening` 增加 `frameThickness`（默认 0.05m）。3D 中以洞口外圈再叠一圈薄框（用 `frameMaterialId`），玻璃用半透明 `MeshPhysicalMaterial(transmission=0.5)`。

**Phase 3 完成判据**：能搭一个带双坡屋顶 + 阳台 + 多窗的三层别墅，3D 看起来像实物。

---

## Phase 4 — 材质纹理与 imagegen 接入

> 目标：替换"色块外墙"为真实纹理，但**imagegen 永远不生成结构**（§2.4）。

### 4.1 静态纹理库

在 `public/materials/` 下放 PNG（白漆、灰石、文化石、深灰瓦、红棕瓦、木格栅、黑色金属栏杆、白窗框、深灰窗框、米白真石漆共 10 种，对应 §8.1）。

`Material` 已有 `textureUrl` + `repeat`，扩展：

- `roughnessMapUrl?: string`
- `normalMapUrl?: string`

`createMaterial` 用 `THREE.TextureLoader` 加载，`material.map.wrapS = wrapT = RepeatWrapping`，`map.repeat.set(repeat.x, repeat.y)`。

UI：材质卡片预览图替换色块。

### 4.2 imagegen 接入抽象

新增 `src/imagegen/types.ts`：

```ts
export type ImagegenProvider = {
  generateMaterial: (prompt: string, hints: { kind: MaterialKind }) => Promise<Material>;
  generateFacadePatch: (prompt: string, hints: { aspectRatio: number }) => Promise<FacadePatch>;
};
```

实现先做 `mock` provider（直接返回固定贴图）+ 一个空壳 `claude-imagegen` provider。生产时通过环境变量切换。**绝不暴露任何对 HouseModel 写入的接口给 imagegen**。

### 4.3 FacadePatch

新增类型：

```ts
export type FacadePatch = {
  id: string;
  attachedTo: { kind: "wall"; wallId: string } | { kind: "balcony"; balconyId: string };
  x: number; y: number;       // 局部坐标
  width: number; height: number;
  imageUrl: string;
};
```

3D 中以 PlaneGeometry + alphaTest 贴图实现，依附 wall 平面，z-fighting 用 `polygonOffset`。

UI：选中墙时，属性面板下半部出现"加装饰"按钮 → 弹出 imagegen prompt 输入 → mock provider 返回 patch 对象 → 写入 project。

**Phase 4 完成判据**：可以一键给某面墙加上"白色窗套"贴片，3D 中正确显示，导出 JSON 后重新加载完整保留。

---

## Phase 5 — 沟通交付

> 目标：让工具能真正发送材料给设计师。

### 5.1 对象备注

每个对象（wall/opening/balcony/roof）增加 `note?: string`。属性面板暴露多行输入。导出 JSON 时保留。

### 5.2 一页方案说明导出

`/export/scheme.tsx` 渲染：

- 项目名 + 三视图（正/侧/3D 透视）截图
- 材质列表
- 楼层高度表
- 用户备注汇总

输出 PDF（`html2canvas + jsPDF` 或 `react-pdf`，二选一时优先 `react-pdf` 因为字体可控）。

### 5.3 视角预设保存

`Project.viewBookmarks: ViewBookmark[]` 保存相机位置 + 视角名。导出 JSON 包含。

**Phase 5 完成判据**：用户点一次按钮拿到 PDF，里面包含 3 张截图、对象备注、材质表，可直接发给设计师。

---

## 不做（Phase X 后讨论）

可行性文档 §10.2 / §10.3 已明确：

- 自动户型生成（让 AI 决定房间布局）
- 完整 CAD 命令集（offset / trim / mirror / array）
- 任意自由曲线参与 3D 生成
- 施工图、规范校验、报规
- 室内精装、家具系统
- 多人实时协作 / 云端项目管理
- 地形 / 景观 / 场地

这些不进入路线图，等核心闭环验证完毕后再单独立项。

---

## 架构决策清单

新阶段开始前明确：

1. **状态库**：当前是 `useReducer`。Phase 1 加入选中态后，如果出现多个组件读 selection，可考虑 `useSyncExternalStore` + 单例 store；不建议引入 Redux/Zustand，规模不需要。
2. **历史记录**：撤销/重做属于 Phase 2 的隐性需求。reducer 已经天然 immutable，加 `pastStates: HouseProject[] / futureStates: HouseProject[]` 即可。每次 mutation 推 past、清 future。
3. **网格/吸附配置**：项目级 `Project.gridSize: number`，默认 0.1m。所有画墙吸附走它。
4. **三角化与几何**：Phase 3 的 roof 用 Three.js 内建 ExtrudeGeometry/Shape 即可，不引入 earcut。

---

## 测试策略

- 域层 (`domain/*`、`projection/*`、`geometry/*`)：纯函数 → 100% 行覆盖目标。
- Reducer：每个 action 至少一个测试；新加 selection action 必有"非法 → 不写入"用例。
- UI：核心交互（画墙、改尺寸、应用材质、加开孔）每条都要 RTL 测试，断言可见的 ARIA 状态。
- Three.js：场景挂载/销毁/重建用 jsdom + mock WebGL 测试 dispose 路径，不验证像素。

任何 Phase 都不允许 `bun run test` 标黄；TDD 顺序：测试先写，看失败，再实现。

---

## 风险与回退点

- 多开孔切分如果在复杂用例下产生破面 → 先回退到单开孔实现并在 UI 拒绝第二个开孔。
- OrbitControls 在 React StrictMode 下双重挂载 → 用 `useEffect` 清理函数 + RAF cancel 严格匹配。
- 屋顶生成失败的情况下渲染应展示原墙体 + 红色边界提示，不要 throw 阻断 3D。
- imagegen 接入要严守"只读外观、不写结构"边界。任何允许其修改 HouseModel 的代码都视为 bug。
