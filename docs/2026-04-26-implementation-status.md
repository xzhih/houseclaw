# HouseClaw 实现现状与差距分析

更新日期：2026-04-26

## 一句话结论

V1 prototype plan 已完成结构骨架（结构化数据模型 + 多视图投影 + Three.js 实时预览 + JSON 持久化），但**编辑能力几乎为零**：用户只能查看 sample project、切换视角、给唯一一面墙换材质。可行性文档第 14 节定义的“最小可验证闭环”里，第 1–4 步（画墙、改墙厚、加窗、改离地高度）目前都不能在 UI 中完成。

下一阶段的核心目标应该是：**让用户能在 2D 中真正修改房子**，而不是再扩张更多对象类型。

---

## 1. 已实现 vs 计划

### 1.1 v1 prototype plan 11 个 Task 的进度

| Task | 内容 | 状态 |
|---|---|---|
| 1 | Vite/Bun/TS scaffold | ✅ |
| 2 | 结构化领域模型 | ✅ |
| 3 | 约束与 mutation | ✅ |
| 4 | Plan/Elevation 投影 | ✅ |
| 5 | 几何描述符（与 WebGL 解耦） | ✅ |
| 6 | Reducer + JSON 持久化 | ✅ |
| 7 | 2D/3D 应用骨架 | ✅ |
| 8 | Three.js 预览 | ✅ |
| 9 | 材质库 + 应用 UI | ✅ |
| 10 | JSON 导入导出 | ✅ |
| 11 | 最终验证 | 部分（自动化测试 51 通过、build 成功；人工烟雾测试未记录） |

v1 之外，已新增：

- **阳台模型**（`Balcony` 类型 + 约束 + 平面/立面投影 + 3D 渲染 + 选中交互），属于可行性文档原计划在“阶段 3”的能力。

### 1.2 与可行性文档七大核心模块的对照

| 模块 | 现状 | 关键缺口 |
|---|---|---|
| HouseModel | Project / Storey / Wall / Opening / Balcony / Material 已成型 | 缺 Roof、FacadePatch；selectedObjectId 仅平面/立面 SVG 内可写 |
| ConstraintEngine | 引用合法性、正负值、长宽高 | 不检测开孔重叠、阳台重叠、墙端点不闭合、跨层墙体重影 |
| ViewProjection | plan + elevation 完整 | roof view 仅占位字符串 |
| EditTools | 工具按钮可切换 | 无任何工具真正落到画布操作；属性面板纯只读 |
| GeometryBuilder | 单开孔切分 + 阳台几何 | **每堵墙只处理 openings[0]，多窗会被静默丢弃**；无楼板、无屋顶、无门框/玻璃细节 |
| MaterialSystem | 颜色 swatch + apply | 缺纹理贴图、缺 wall 之外的种类 UI、无 sprite/facade patch |
| Renderer3D | 单帧 render，墙 + 阳台 + 地面 + 双光源 | 无 OrbitControls/动画循环、无快捷视角、无阴影、无截图导出、无楼板 |

---

## 2. 可行性文档第 14 节最小闭环检查

> 1. 1F 平面画矩形 → 2. 输入墙厚层高 → 3. 加窗 → 4. 立面改离地高度 → 5. 3D 看到带洞墙 → 6. 换材质 → 7. 保存 JSON → 8. 重新加载

| 步骤 | 状态 | 说明 |
|---|---|---|
| 1 | ❌ | 没有画墙工具，仅能加载 sample |
| 2 | ✅ | 属性面板没有数值输入 |
| 3 | ❌ | 没有加开孔工具 |
| 4 | ✅ | 选中开孔后只能看尺寸，不能改 |
| 5 | ✅ | sample 自带窗时正常 |
| 6 | ✅ | 仅作用于 `walls[0]`；无法选择具体墙 |
| 7 | ✅ | 导出 JSON 通过 |
| 8 | ✅ | 导入 JSON 通过严格 schema 校验 |

**结论：8 步现在 6 步走通**。剩余 2 步（在 1F 平面画矩形外墙、加新窗）由后续 wall-drawing 计划覆盖；本期 V2 路线图 Phase 1 已覆盖编辑现有对象的所有维度。

---

## 3. 主要技术债与 bug 风险

### 3.1 多开孔 silent drop（Bug-grade）

`src/geometry/wallPanels.ts:36` 的 `buildWallPanels` 取 `const opening = openings[0];`，剩余开孔被忽略。在 sample project 中每堵外墙正好只有一个窗，掩盖了这个问题。一旦用户加第二扇窗，就会从 3D 中消失，但 2D 依然显示——会让用户怀疑数据错了。

应升级为多开孔切分算法（按 offset 排序，在水平条带内逐段切矩形面片）。

### 3.2 Three.js 单帧渲染、无相机控制

`mountHouseScene` 只在挂载时 `renderer.render(scene, camera)` 一次；改窗后 React effect 重跑会重建场景，但用户**不能旋转/缩放**模型，也没有快捷视角按钮。可行性文档 §7.2 明确要求轨道相机 + 四向快捷视角。

### 3.3 选中状态只在 SVG 内部生效

平面/立面里点击开孔/阳台后，`selectedObjectId` 写到 reducer，但属性面板只识别 `openings.find(...)` 一种情况，阳台被选中后属性面板仍然显示"选择门、窗或开孔查看属性"，既无尺寸，也无操作。

### 3.4 材质应用范围错误

`PropertyPanel` 把材质按钮硬编码作用于 `walls[0]`：第一面墙永远显示 `aria-pressed`，其它墙用户不能改。

### 3.5 屋顶视图与屋顶模型缺失

`ViewId` 含 `"roof"`，UI 显示"屋顶视图待建模"占位 SVG。可行性文档 §5.6 明确把 `Roof` 列入 `HouseModel`，是阶段 3 的核心能力。

### 3.6 没有楼板（slab）几何

每个 `Storey` 有 `slabThickness`，但 3D 场景里看不到楼板，所以从立面/3D 上很难感知三层关系。这是体量沟通的关键缺失。

### 3.7 工具按钮无副作用

`ToolPalette` 切换 `activeTool`，但 `DrawingSurface2D` 完全没有读它，所以"墙/门/窗/开孔/阳台"按钮目前是装饰性的。

### 3.8 dist/ 进入了 git？

`bun run build` 默认输出到 `dist/`。`gitStatus` 没有显示它修改，但 `dist/` 出现在 `ls`，需要确认是否已 `.gitignore`。

---

## 4. 强项

事先把它写出来，避免后续重构时改坏：

- **领域模型干净**：types.ts → constraints.ts → mutations.ts → projection/* 是正确的分层；3D 与编辑解耦；JSON schema 校验严格。
- **测试覆盖**：51 个 Vitest 测试，domain/projection/geometry/persistence/UI 全覆盖；新功能必须保持 TDD 节奏。
- **强约束起步**：opening 必须依附墙、阳台必须同层墙、负值/越界都拦截。
- **不可变 reducer**：所有变更走 `assertValidProject`，不存在"半合法"中间态。

这套地基适合扩展功能，不适合推倒重来。

---

## 5. 与可行性文档"不做什么"边界的一致性

文档 §10.3 明确不建议做：任意自由线条、CAD 命令集、AI 直接生成可编辑模型、追求照片级实时渲染。当前实现都未触碰，方向正确。

---

## 6. 下一步建议

排序按"投入 vs 产出"：

1. **先把最小闭环跑通**（画墙 / 改尺寸 / 加窗 / 立面改高度）— 这是文档的验收基线。
2. **修多开孔渲染 bug** — 一行算法改动避免长期数据污染。
3. **Three.js 加 OrbitControls + 4 个快捷视角 + 楼板** — 让 3D 真正可看。
4. **属性面板支持阳台 + 数值编辑 + 选中墙** — 让选中状态有意义。
5. **加 Roof 模型 + 简单坡屋顶生成** — 进入可行性文档阶段 3。
6. **截图导出 + 多材质纹理** — 进入"沟通交付"阶段。
7. **imagegen 接入** — 仅生成材质，不生成几何，遵守 §2.4。

详细路线在 `docs/2026-04-26-house-design-tool-v2-roadmap.md`。
