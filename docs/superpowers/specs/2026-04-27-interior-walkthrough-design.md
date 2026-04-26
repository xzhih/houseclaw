# Spec 1 — 室内可视化基础

更新日期：2026-04-27  
所属路线图：v2 路线图 §2.3（楼板/屋面板）+ §3.1 屋顶 polygon 派生的前置依赖  
后续 Spec：Spec 2（真屋顶 / Phase 3）、Spec 3（楼梯领域对象）

## 一句话目标

让用户能在 3D 中以 FPS 视角站进自己设计的别墅里走动，看到完整封闭的楼板、占位屋顶、80cm 网格地面，并能从楼板洞口物理地下落到下层、用按钮回到上层。

## 范围

**做：**

1. 数据模型：`Storey.stairOpening` 可选字段。
2. 几何：从外墙 footprint 串接出每层外环 polygon，挤出楼板（带可选洞口）；同形状无洞挤出顶层占位屋顶。
3. 渲染：场景中加楼板 + 占位屋顶；地面放大并叠 80cm 网格。
4. 双相机模式：原 orbit + 新 FPS。FPS 含 1.6m 眼高、WASD/Shift 移动、鼠标看、墙体碰撞、重力贴地、洞口自由下落。
5. UI：3D 视图右上角 `环视 / 漫游` 切换；FPS 模式下底部 `1F / 2F / 3F` 楼层瞬移按钮 + 中心准星。

**不做（明确切出本 Spec）：**

- 任何 `Stair` 领域对象——洞口的"上行入口"用按钮瞬移代偿（→ Spec 3）。
- 真屋顶（坡屋顶/单坡/檐口）——只放占位平板（→ Spec 2 / Phase 3）。
- 草地纹理或景观（→ Phase 4 之后）。
- 跳跃 / 蹲下 / 物体拾取 / 伤害系统（永远不做）。
- 阴影 / ToneMapping 优化（→ 路线图 Phase 2.4，与本 Spec 解耦）。
- 像素级渲染测试（沿用既定测试策略）。

## 设计

### 1. 数据模型增量

在 `src/domain/types.ts` 给 `Storey` 加可选字段：

```ts
export type StairOpening = {
  x: number;       // 局部楼层 XZ 平面左下角 X（米）
  y: number;       // 局部楼层 XZ 平面左下角 Z（米）
  width: number;   // 沿 +X 长度（米），> 0
  depth: number;   // 沿 +Z 长度（米），> 0
};

export type Storey = {
  id: string;
  label: string;
  elevation: number;
  height: number;
  slabThickness: number;
  stairOpening?: StairOpening;
};
```

**约束（加入 `assertValidProject`）：**

- `width > 0`、`depth > 0`；
- 洞口矩形必须完全落在该层墙体外环 polygon 内：对四个角点都做 point-in-polygon 判定，全在内部才合法（防止洞口漂浮在墙外或骑在墙上）；外环不可达时（缺墙/未闭合）放过该约束，由几何层在渲染阶段静默忽略楼板。
- 1F 不允许有 `stairOpening`（基础底板，没下层）。

**Sample project 改动：**

- 2F 与 3F 的 `Storey` 各加一处 `stairOpening`，位于建筑后部偏左：`{ x: 0.6, y: 5.0, width: 1.2, depth: 2.5 }`（10×8m 矩形别墅内：洞口占 X=[0.6,1.8]、Z=[5.0,7.5]，完全在 0.12–9.88 / 0.12–7.88 室内净空里）。
- 1F 不加。

**为什么不引入顶层 `Slab` / `Roof` 类型：** 楼板从 `Storey + walls + stairOpening` 派生；占位屋顶从顶层 storey 派生。它们是 `geometry/` 层的产物，不是 domain 真相。Spec 2 真屋顶才会引入 `Roof` 顶层类型。

### 2. 几何层

**新文件 `src/geometry/footprintRing.ts`：**

```ts
export function buildExteriorRing(
  walls: Wall[],
  footprintIndex: Map<string, FootprintQuad>,
  options?: { tolerance?: number },
): Point2[] | undefined;
```

算法：

1. 从 `walls` 过滤 `exterior=true`。
2. 用墙端点（容差 5mm）建邻接图。
3. 任选一根外墙作为起点，沿 CCW 方向环游：每到一个 junction，下一根墙取"在该 junction 处方向最右转的"那根（保证沿外环走）。
4. 沿途从每根墙取 `footprint.rightStart` → `footprint.rightEnd`（外侧两个角点）依次入 polygon。
5. 回到起点 → 返回 polygon；无法回到起点 → 返回 `undefined`。

**新文件 `src/geometry/slabGeometry.ts`：**

```ts
export type SlabGeometry = {
  storeyId: string;
  outline: Point2[];
  hole?: Point2[];
  topY: number;
  thickness: number;
  materialId: string;
  kind: "floor" | "roof";  // 决定材质与是否绘制洞口
};

export function buildSlabGeometry(
  storey: Storey,
  walls: Wall[],
  footprintIndex: Map<string, FootprintQuad>,
  materialId: string,
): SlabGeometry | undefined;

export function buildRoofPlaceholder(
  topStorey: Storey,
  walls: Wall[],
  footprintIndex: Map<string, FootprintQuad>,
  materialId: string,
): SlabGeometry | undefined;
```

`HouseGeometry` 扩展：

```ts
export type HouseGeometry = {
  walls: WallGeometry[];
  balconies: BalconyGeometry[];
  slabs: SlabGeometry[];      // 包含楼板（含洞）+ 屋顶占位（无洞）
};
```

`buildHouseGeometry` 在循环 `project.storeys` 时为每个 storey 调 `buildSlabGeometry`，最后给顶层 storey 多调一次 `buildRoofPlaceholder` 追加到 `slabs`。

**楼板放置约定：**

- 顶面 y = `storey.elevation`
- 底面 y = `storey.elevation - storey.slabThickness`
- 顶层屋顶占位：顶面 y = `topStorey.elevation + topStorey.height + ROOF_PLACEHOLDER_THICKNESS`，厚度 0.2m，材质 fallback `mat-gray-stone`（路线图 §2.3 写法）

| 楼板 | 顶面 y | 底面 y | 备注 |
|---|---|---|---|
| 1F | 0 | -0.18 | 基础底板，无洞 |
| 2F | 3.2 | 3.02 | 1F 顶 / 2F 地，含洞 |
| 3F | 6.4 | 6.22 | 2F 顶 / 3F 地，含洞 |
| 屋顶占位 | 9.8 | 9.6 | 顶层墙顶 + 0.2，无洞 |

### 3. 渲染层

**新增 `createSlabMeshes(project, geometry)`** 在 `src/rendering/threeScene.ts`：

```ts
const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p.x, p.y)));
if (hole) shape.holes.push(new THREE.Path(hole.map(p => new THREE.Vector2(p.x, p.y))));
const geom = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
geom.rotateX(Math.PI / 2);          // shape 在 XY 平面，挤出沿 +Z；旋转后挤出沿 -Y
geom.translate(0, topY, 0);          // 顶面在 topY，底面在 topY - thickness
```

材质：楼板与屋顶占位都 fallback 到 `mat-gray-stone`（catalog 里仅有 white-render / gray-stone / dark-frame 三种，灰色石材对楼板与平屋顶最合适；后续 catalog 扩到 §8.1 的十种素材时再细分）。在 dispose 时一并 dispose 几何体。

**地面改造（`createGround`）：**

```ts
const groundSize = max(buildingMaxExtent * 6, 40);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(groundSize, groundSize),
  new THREE.MeshStandardMaterial({ color: GROUND_COLOR, roughness: 0.92 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(centerX, -0.001, centerZ);

const grid = new THREE.GridHelper(
  groundSize,
  Math.round(groundSize / 0.8),
  "#a8b2ad",  // 主轴
  "#c8d0cb",  // 次轴
);
grid.position.set(centerX, 0.001, centerZ);
```

z-fighting：地面 y=-0.001，网格 y=+0.001，1F 楼板顶 y=0；视觉上网格在地面上方 1mm，被楼板压住，从大门外看去地面有清晰 80cm 网格。

### 4. 双相机模式

**模式状态：**

- `Preview3D.tsx` 维护本地 state `cameraMode: "orbit" | "walk"`，刷新即丢，不进 `HouseProject`。
- `mountHouseScene` 返回扩展为：

```ts
type MountedScene = {
  setCameraMode(mode: "orbit" | "walk"): void;
  setActiveStorey(storeyId: string): void;
  dispose(): void;
};
```

切换模式只重建相机控件，不动 scene（保留所有 mesh）。

**Orbit 模式：** 维持现状（已有 `attachOrbitControls`）。  
**Walk 模式：** 新增 `attachWalkControls(renderer, camera, scene, project)`。

#### FPS 控制规格

| 项 | 值 |
|---|---|
| 眼高 | 1.6 m |
| 玩家碰撞半径 | 0.30 m |
| FOV | 70° |
| 走速 | 1.4 m/s |
| 跑速（按住 Shift） | 2.8 m/s |
| 重力 | -9.8 m/s² |
| 鼠标灵敏度 | 0.0025 rad/px |
| Pitch 范围 | ±85° |
| 步上自动吸附阈值 | 0.2 m |
| 脚下 ray 最远 | 5 m |

**键位：**

- `W/A/S/D` 或 `↑←↓→`：水平移动（基于相机 yaw 投影到水平面）
- `Shift`：跑（移动期间按住）
- `Esc`：退出漫游
- 鼠标：yaw + pitch（**非反向**，标准 FPS：右移看右，下移看下）
- `Pointer Lock` API：进入漫游时 `canvas.requestPointerLock()`；退出时 `document.exitPointerLock()`

**初始位姿：** 1F 中心 XZ + 眼高（y=1.6），yaw=0，pitch=0。

**每帧物理（伪代码）：**

```ts
function tickWalk(dt: number) {
  // 1. 输入 → 期望水平位移
  const speed = keys.shift ? 2.8 : 1.4;
  const forward = vec2FromYaw(yaw);
  const right = vec2RotateBy(forward, -PI/2);
  const desiredMove = scale(forward, (keys.w - keys.s) * speed * dt)
                  .add(scale(right,   (keys.d - keys.a) * speed * dt));

  // 2. 水平碰撞（4 条 ray，前后左右各一）
  const adjustedMove = resolveHorizontalCollision(camera.position, desiredMove, raycaster, collidables);

  camera.position.x += adjustedMove.x;
  camera.position.z += adjustedMove.y;

  // 3. 垂直处理
  const feetY = camera.position.y - 1.6;
  const downRay = new Raycaster(new Vector3(camera.position.x, feetY + 0.01, camera.position.z), DOWN, 0, 5);
  const hits = downRay.intersectObjects(collidables);
  if (hits.length > 0) {
    const surfaceY = hits[0].point.y;
    const drop = feetY - surfaceY;
    if (drop <= 0.2) {
      // 贴地（也覆盖小台阶）
      camera.position.y = surfaceY + 1.6;
      vy = 0;
    } else {
      // 自由落体
      vy += GRAVITY * dt;
      camera.position.y += vy * dt;
    }
  } else {
    // 没命中任何楼板（已掉到所有楼板下） → 重生 1F 中心
    respawn();
  }

  // 4. 鼠标 yaw/pitch（在 pointermove 中累积，此处仅应用）
  camera.rotation.set(pitch, yaw, 0, "YXZ");
}
```

**碰撞 mesh 来源：** 直接对 `wallMeshes ∪ slabMeshes` 用 `THREE.Raycaster`。墙面板 mesh 已在场景里（不需要专门 collider）；door/void 类 opening 处没有 panel mesh，自然走得过去；窗洞 sill 仍是 panel，把人的胶囊底部挡住。

**摔出洞口：** 步骤 3 的 down ray 在洞口位置不命中本层楼板（被 hole 挖掉），命中下层楼板顶面，距离 > 0.2m → 自由落体；落到下层后重新进入贴地。**没有缓冲、没有伤害、没有动画**——纯物理。

**HUD（FPS 模式覆盖在 canvas 上）：**

```
                      ·                        <- 4px 圆点准星
                                               
[1F]  [2F]  [3F]                Esc 退出       <- 底部 toolbar
```

- React 层渲染（Preview3D.tsx），通过 `setActiveStorey()` 调用 scene。
- 楼层按钮：点击 → 相机瞬移到该层中心 + 眼高，pitch 归零，yaw 保持。
- 当前所在楼层（基于 cameraY 落在 `[storey.elevation, storey.elevation+storey.height)` 区间）按钮高亮。

### 5. 文件改动清单

| 文件 | 改动 |
|---|---|
| `src/domain/types.ts` | + `StairOpening` 类型；+ `Storey.stairOpening` 字段 |
| `src/domain/sampleProject.ts` | 给 2F/3F storey 加默认 stairOpening |
| `src/domain/constraints.ts` | + 三条 stairOpening 约束 |
| `src/geometry/footprintRing.ts` | 新建：外环抽取（pure，TDD） |
| `src/geometry/slabGeometry.ts` | 新建：buildSlabGeometry + buildRoofPlaceholder（pure，TDD） |
| `src/geometry/types.ts` | + SlabGeometry；+ HouseGeometry.slabs |
| `src/geometry/houseGeometry.ts` | 在管线中调 slabGeometry，结果挂入 geometry.slabs |
| `src/rendering/threeScene.ts` | + createSlabMeshes；改造 createGround；加 GridHelper；扩展 MountedScene；attachWalkControls；resolveHorizontalCollision（提取为纯函数便于测试） |
| `src/components/Preview3D.tsx` | 模式 state；浮窗按钮；HUD（楼层按钮 + 准星 + 提示文案） |
| `src/styles.css` | 模式按钮 / HUD / 准星样式 |
| `src/__tests__/footprintRing.test.ts` | 新建：矩形 / L / U 形 / 非闭合 |
| `src/__tests__/slabGeometry.test.ts` | 新建：含洞 / 无洞 / 屋顶占位 |
| `src/__tests__/walkPhysics.test.ts` | 新建：resolveHorizontalCollision 纯函数测试（mock Raycaster） |
| `src/__tests__/preview3d.test.tsx` | 新建：模式按钮点击 → setCameraMode 调用 |

### 6. 测试策略

| 层 | 测什么 | 工具 |
|---|---|---|
| 几何（footprintRing, slabGeometry） | 矩形、L、U、非闭合、含洞、屋顶占位 | vitest（纯函数） |
| 约束 | stairOpening 越界、零尺寸、1F 上挂洞 | vitest + assertValidProject |
| FPS 物理 | resolveHorizontalCollision 的贴墙滑动；脚下 ray 的贴地/落体分支 | vitest + 假 Raycaster 接口 |
| Preview3D UI | 模式切换按钮、HUD 楼层按钮渲染与点击 | RTL |
| 像素 | 不测（沿用既定方针） | 浏览器手验 |

`bun run test` 必须全绿；`bun run build` 必须无 TS 错误。

### 7. 风险与回退

- **外环抽取在分支墙体上失败**：返回 `undefined` → `createSlabMeshes` 跳过该 storey 的楼板渲染，但其他几何照常。3D 视图会出现"该层没楼板"的视觉裸露——可接受的退化，不阻断；UI 可后续加红色边界提示。
- **FPS 卡墙缝隙**：4 条 cardinal ray 可能漏掉对角碰撞（玩家斜向插进墙缝）。可后续升级为胶囊 sweep test，本 Spec 的 4-ray 方案已经覆盖正交 8 个方向（45° 倾角下水平 ray 仍命中相邻墙），实测应足够。
- **PointerLock 在 iframe 或非 secure context 下失败**：捕获错误 → 回退为"鼠标拖拽看"模式（不锁鼠标）。本机开发与生产 https 下都不会触发。
- **GridHelper 性能**：80cm 网格 + 240m 见方 = 300×300 = 90000 线段。Three.js GridHelper 用单 LineSegments 一次性绘制，性能可接受；若 FPS 掉则减小 groundSize 而非降低密度。

### 8. 验收

完成本 Spec 后用户能在浏览器里走完以下场景：

1. 打开 sample project，3D 视图默认 orbit，看到一栋三层别墅外形 + 80cm 网格地面 + 平屋顶。
2. 点 `漫游`，鼠标锁定，玩家落在 1F 中心。
3. WASD 走到前墙，撞上停下；按 Shift 加速；鼠标看四周。
4. 走到后墙楼梯洞口下方（投影到 2F 楼板的洞口），抬头能看到 2F 洞口（楼板被挖空一块）。
5. 点底部 `2F` 按钮，瞬移到 2F 中心 1.6m 高度。
6. 走到 2F 后部洞口，跨过去 → 自由落体，掉到 1F 站起。
7. 按 `Esc`，回到 orbit 模式。

`bun run test` 全绿，`bun run build` 通过。
