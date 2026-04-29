import { materialCatalog } from "../materials/catalog";
import type {
  Balcony,
  HouseProject,
  Opening,
  SkirtRoof,
  Storey,
  Wall,
} from "./types";

// 中式现代三层别墅 showcase 样板：层层退台 + 2F 披檐绕南 + 多阳台 + 3F 灰瓦坡屋顶。
// 1F/2F 同 footprint（12×7，前墙在 y=2），2F 前出双阳台经悬挑覆盖 y=0..2 的入户庭院；
// 3F 收进（9×5.5），坐在 2F 后部，前侧让出阳台。

const WALL_THICKNESS = 0.24;
const SLAB_THICKNESS = 0.24;
const STOREY_HEIGHT = 3.2;
const TOP_STOREY_HEIGHT = 3.0;

const WALL_MATERIAL_ID = "mat-white-render";
const SLAB_MATERIAL_ID = "mat-gray-stone";
const ROOF_MATERIAL_ID = "mat-gray-tile";
const FRAME_MATERIAL_ID = "mat-dark-frame";
const DECOR_MATERIAL_ID = "mat-warm-wood";

// 1F + 2F 共用占地：x ∈ [0, 12]，y ∈ [2, 9]
// 3F 内收：x ∈ [1, 11]，y ∈ [3, 9]（每侧收 1m，前收 1m，整体仍显主体）
const FOOT_X0 = 0;
const FOOT_X1 = 12;
const FOOT_Y0 = 2;
const FOOT_Y1 = 9;
const TOP_X0 = 1;
const TOP_X1 = 11;
const TOP_Y0 = 3;
const TOP_Y1 = 9;

function rectWalls(
  storeyId: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  height: number,
): Wall[] {
  const common = {
    storeyId,
    thickness: WALL_THICKNESS,
    height,
    exterior: true,
    materialId: WALL_MATERIAL_ID,
  } as const;
  return [
    { id: `wall-front-${storeyId}`, ...common, start: { x: x0, y: y0 }, end: { x: x1, y: y0 } },
    { id: `wall-right-${storeyId}`, ...common, start: { x: x1, y: y0 }, end: { x: x1, y: y1 } },
    { id: `wall-back-${storeyId}`,  ...common, start: { x: x1, y: y1 }, end: { x: x0, y: y1 } },
    { id: `wall-left-${storeyId}`,  ...common, start: { x: x0, y: y1 }, end: { x: x0, y: y0 } },
  ];
}

export function createSampleProject(): HouseProject {
  const materials = materialCatalog.map((material) => ({
    ...material,
    ...(material.repeat ? { repeat: { ...material.repeat } } : {}),
  }));

  const storeys: Storey[] = [
    {
      id: "1f",
      label: "1F",
      elevation: 0,
      height: STOREY_HEIGHT,
      slabThickness: SLAB_THICKNESS,
      // 直跑楼梯，靠左后内置（不与门窗冲突）
      stair: {
        x: 0.5,
        y: 4.4,
        width: 1.4,
        depth: 3.2,
        shape: "straight",
        treadDepth: 0.27,
        bottomEdge: "+y",
        materialId: DECOR_MATERIAL_ID,
      },
    },
    {
      id: "2f",
      label: "2F",
      elevation: STOREY_HEIGHT,
      height: STOREY_HEIGHT,
      slabThickness: SLAB_THICKNESS,
      stair: {
        x: 0.5,
        y: 4.4,
        width: 1.4,
        depth: 3.2,
        shape: "straight",
        treadDepth: 0.27,
        bottomEdge: "+y",
        materialId: DECOR_MATERIAL_ID,
      },
    },
    {
      id: "3f",
      label: "3F",
      elevation: STOREY_HEIGHT * 2,
      height: TOP_STOREY_HEIGHT,
      slabThickness: SLAB_THICKNESS,
    },
  ];

  const walls: Wall[] = [
    ...rectWalls("1f", FOOT_X0, FOOT_Y0, FOOT_X1, FOOT_Y1, STOREY_HEIGHT),
    ...rectWalls("2f", FOOT_X0, FOOT_Y0, FOOT_X1, FOOT_Y1, STOREY_HEIGHT),
    ...rectWalls("3f", TOP_X0, TOP_Y0, TOP_X1, TOP_Y1, TOP_STOREY_HEIGHT),
  ];

  // 1F：中式入户——居中木门 + 两侧落地窗 + 两侧窗
  // 2F：客厅大面落地窗（朝阳台），立面分两段
  // 3F：两扇大窗
  const openings: Opening[] = [
    // 1F 前面：左落地窗 + 居中入户门 + 右落地窗（窗子收紧，墙面更实）
    {
      id: "win-front-1f-l",
      wallId: "wall-front-1f",
      type: "window",
      offset: 1.5,
      sillHeight: 0.6,
      width: 2.0,
      height: 1.8,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "door-front-1f",
      wallId: "wall-front-1f",
      type: "door",
      offset: 5.3,
      sillHeight: 0.0,
      width: 1.4,
      height: 2.3,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-front-1f-r",
      wallId: "wall-front-1f",
      type: "window",
      offset: 8.5,
      sillHeight: 0.6,
      width: 2.0,
      height: 1.8,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    // 1F 侧窗
    {
      id: "win-right-1f",
      wallId: "wall-right-1f",
      type: "window",
      offset: 2.5,
      sillHeight: 0.9,
      width: 1.4,
      height: 1.4,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-left-1f",
      wallId: "wall-left-1f",
      type: "window",
      offset: 2.5,
      sillHeight: 0.9,
      width: 1.4,
      height: 1.4,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    // 2F 前面：3 段落地窗，留中柱与边墙形成三段式立面
    {
      id: "win-front-2f-l",
      wallId: "wall-front-2f",
      type: "window",
      offset: 1.5,
      sillHeight: 0.3,
      width: 2.6,
      height: 2.2,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-front-2f-c",
      wallId: "wall-front-2f",
      type: "window",
      offset: 4.7,
      sillHeight: 0.3,
      width: 2.6,
      height: 2.2,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-front-2f-r",
      wallId: "wall-front-2f",
      type: "window",
      offset: 7.9,
      sillHeight: 0.3,
      width: 2.6,
      height: 2.2,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    // 2F 侧窗
    {
      id: "win-right-2f",
      wallId: "wall-right-2f",
      type: "window",
      offset: 2.5,
      sillHeight: 0.9,
      width: 1.4,
      height: 1.6,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-left-2f",
      wallId: "wall-left-2f",
      type: "window",
      offset: 2.5,
      sillHeight: 0.9,
      width: 1.4,
      height: 1.6,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    // 3F 前面：两扇大窗（中式立面对称）
    {
      id: "win-front-3f-l",
      wallId: "wall-front-3f",
      type: "window",
      offset: 1.5,
      sillHeight: 0.5,
      width: 2.6,
      height: 1.8,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-front-3f-r",
      wallId: "wall-front-3f",
      type: "window",
      offset: 5.9,
      sillHeight: 0.5,
      width: 2.6,
      height: 1.8,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    // 3F 山墙小窗
    {
      id: "win-right-3f",
      wallId: "wall-right-3f",
      type: "window",
      offset: 1.8,
      sillHeight: 1.0,
      width: 1.2,
      height: 1.2,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "win-left-3f",
      wallId: "wall-left-3f",
      type: "window",
      offset: 1.8,
      sillHeight: 1.0,
      width: 1.2,
      height: 1.2,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
  ];

  // 阳台：2F 前小窄台（披檐之下、视觉作为窗台延伸）+ 2F 后大阳台 + 3F 前小阳台
  // 前阳台 depth 0.8m、披檐 depth 1.2m，披檐外伸超过阳台不会撞栏杆
  const balconies: Balcony[] = [
    {
      id: "balcony-front-2f",
      storeyId: "2f",
      attachedWallId: "wall-front-2f",
      offset: 0,
      width: 12,
      depth: 0.8,
      slabThickness: SLAB_THICKNESS,
      railingHeight: 0.9,
      materialId: SLAB_MATERIAL_ID,
      railingMaterialId: WALL_MATERIAL_ID,
    },
    {
      id: "balcony-back-2f",
      storeyId: "2f",
      attachedWallId: "wall-back-2f",
      offset: 2.0,
      width: 5.0,
      depth: 1.2,
      slabThickness: SLAB_THICKNESS,
      railingHeight: 1.05,
      materialId: SLAB_MATERIAL_ID,
      railingMaterialId: WALL_MATERIAL_ID,
    },
    {
      id: "balcony-front-3f",
      storeyId: "3f",
      attachedWallId: "wall-front-3f",
      offset: 0,
      width: 10,
      depth: 0.8,
      slabThickness: SLAB_THICKNESS,
      railingHeight: 1.05,
      materialId: SLAB_MATERIAL_ID,
      railingMaterialId: WALL_MATERIAL_ID,
    },
  ];

  // 单条 2F 前披檐：贯通全前墙、外挑 1.2m、30° 坡，作为中式立面核心特征
  // 双侧披檐去掉——之前与前披檐在角部撞结构
  const SKIRT_ELEVATION = STOREY_HEIGHT + 0.2;
  const skirts: SkirtRoof[] = [
    {
      id: "skirt-front-2f",
      hostWallId: "wall-front-2f",
      offset: 0,
      width: 12,
      depth: 1.2,
      elevation: SKIRT_ELEVATION,
      pitch: Math.PI / 6,
      overhang: 0.3,
      materialId: ROOF_MATERIAL_ID,
    },
  ];

  // 3F 主屋面：南北 eave / 东西 gable，30° 坡，40cm 出挑，灰瓦
  const roof = {
    edges: {
      "wall-front-3f": "eave" as const,
      "wall-back-3f": "eave" as const,
      "wall-left-3f": "gable" as const,
      "wall-right-3f": "gable" as const,
    },
    pitch: Math.PI / 6,
    overhang: 0.4,
    materialId: ROOF_MATERIAL_ID,
  };

  return {
    schemaVersion: 1,
    id: "sample-house",
    name: "中式三层别墅",
    unitSystem: "metric",
    defaultWallThickness: WALL_THICKNESS,
    defaultStoreyHeight: STOREY_HEIGHT,
    mode: "2d",
    activeView: "plan-1f",
    activeTool: "select",
    selection: { kind: "storey", id: "1f" },
    storeys,
    materials,
    walls,
    openings,
    balconies,
    roof,
    skirts,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// createBasicProject —— 测试 fixture 用的最小有效项目（10×8 三层方盒子）。
// 不进入 UI 流程，仅给单测做"已知形态"参照。修改任何字段会同步影响
// constraints / projection / geometry / persistence 等多份测试，谨慎调整。
// ───────────────────────────────────────────────────────────────────────────

const BASIC_STOREY_HEIGHT = 3.2;
const BASIC_WALL_THICKNESS = 0.24;
const BASIC_SLAB_THICKNESS = BASIC_WALL_THICKNESS;

function basicStoreyWalls(storeyId: string): Wall[] {
  const common = {
    storeyId,
    thickness: BASIC_WALL_THICKNESS,
    height: BASIC_STOREY_HEIGHT,
    exterior: true,
    materialId: WALL_MATERIAL_ID,
  } as const;
  return [
    { id: `wall-front-${storeyId}`, ...common, start: { x: 0, y: 0 },  end: { x: 10, y: 0 } },
    { id: `wall-right-${storeyId}`, ...common, start: { x: 10, y: 0 }, end: { x: 10, y: 8 } },
    { id: `wall-back-${storeyId}`,  ...common, start: { x: 10, y: 8 }, end: { x: 0, y: 8 } },
    { id: `wall-left-${storeyId}`,  ...common, start: { x: 0, y: 8 },  end: { x: 0, y: 0 } },
  ];
}

export function createBasicProject(): HouseProject {
  const materials = materialCatalog.map((material) => ({
    ...material,
    ...(material.repeat ? { repeat: { ...material.repeat } } : {}),
  }));

  const storeys: Storey[] = [
    {
      id: "1f", label: "1F", elevation: 0,
      height: BASIC_STOREY_HEIGHT, slabThickness: BASIC_SLAB_THICKNESS,
      stair: {
        x: 0.6, y: 5.0, width: 1.2, depth: 2.5, shape: "straight",
        treadDepth: 0.27, bottomEdge: "+y", materialId: WALL_MATERIAL_ID,
      },
    },
    {
      id: "2f", label: "2F", elevation: 3.2,
      height: BASIC_STOREY_HEIGHT, slabThickness: BASIC_SLAB_THICKNESS,
      stair: {
        x: 0.6, y: 5.0, width: 1.2, depth: 2.5, shape: "straight",
        treadDepth: 0.27, bottomEdge: "+y", materialId: WALL_MATERIAL_ID,
      },
    },
    {
      id: "3f", label: "3F", elevation: 6.4,
      height: BASIC_STOREY_HEIGHT, slabThickness: BASIC_SLAB_THICKNESS,
    },
  ];

  const walls: Wall[] = storeys.flatMap((storey) => basicStoreyWalls(storey.id));

  const openings: Opening[] = [
    { id: "window-front-1f", wallId: "wall-front-1f", type: "window",
      offset: 3,   sillHeight: 0.9, width: 1.6, height: 1.3, frameMaterialId: FRAME_MATERIAL_ID },
    { id: "window-front-2f", wallId: "wall-front-2f", type: "window",
      offset: 3.8, sillHeight: 0.9, width: 0.8, height: 1.4, frameMaterialId: FRAME_MATERIAL_ID },
    { id: "window-front-3f", wallId: "wall-front-3f", type: "window",
      offset: 4.1, sillHeight: 0.9, width: 1.5, height: 1.2, frameMaterialId: FRAME_MATERIAL_ID },
    { id: "door-front-1f",   wallId: "wall-front-1f", type: "door",
      offset: 6.0, sillHeight: 0,   width: 1.0, height: 2.1, frameMaterialId: FRAME_MATERIAL_ID },
    { id: "door-front-2f",   wallId: "wall-front-2f", type: "door",
      offset: 5.0, sillHeight: 0,   width: 1.0, height: 2.2, frameMaterialId: FRAME_MATERIAL_ID },
  ];

  const balconies: Balcony[] = [
    {
      id: "balcony-front-2f", storeyId: "2f", attachedWallId: "wall-front-2f",
      offset: 3.1, width: 3.2, depth: 1.25,
      slabThickness: BASIC_SLAB_THICKNESS, railingHeight: 1.05,
      materialId: SLAB_MATERIAL_ID, railingMaterialId: FRAME_MATERIAL_ID,
    },
  ];

  const roof = {
    edges: {
      "wall-front-3f": "eave"  as const,
      "wall-back-3f":  "eave"  as const,
      "wall-left-3f":  "gable" as const,
      "wall-right-3f": "gable" as const,
    },
    pitch: Math.PI / 6,
    overhang: 0.6,
    materialId: "mat-clay-tile",
  };

  return {
    schemaVersion: 1,
    id: "sample-house",
    name: "三层别墅草案",
    unitSystem: "metric",
    defaultWallThickness: BASIC_WALL_THICKNESS,
    defaultStoreyHeight: BASIC_STOREY_HEIGHT,
    mode: "2d",
    activeView: "plan-1f",
    activeTool: "select",
    selection: { kind: "storey", id: "1f" },
    storeys,
    materials,
    walls,
    openings,
    balconies,
    roof,
    skirts: [],
  };
}
