import type { HouseProject, Material, Opening, Storey, Wall } from "./types";

const DEFAULT_STOREY_HEIGHT = 3.2;
const DEFAULT_WALL_THICKNESS = 0.24;
const DEFAULT_SLAB_THICKNESS = 0.18;
const WALL_MATERIAL_ID = "mat-white-render";
const FRAME_MATERIAL_ID = "mat-dark-frame";

export function createSampleProject(): HouseProject {
  const materials: Material[] = [
    {
      id: WALL_MATERIAL_ID,
      name: "白色外墙涂料",
      kind: "wall",
      color: "#f2eee6",
      repeat: { x: 2, y: 2 },
    },
    {
      id: FRAME_MATERIAL_ID,
      name: "深灰窗框",
      kind: "frame",
      color: "#263238",
    },
  ];

  const storeys: Storey[] = [
    {
      id: "1f",
      label: "1F",
      elevation: 0,
      height: DEFAULT_STOREY_HEIGHT,
      slabThickness: DEFAULT_SLAB_THICKNESS,
    },
    {
      id: "2f",
      label: "2F",
      elevation: 3.2,
      height: DEFAULT_STOREY_HEIGHT,
      slabThickness: DEFAULT_SLAB_THICKNESS,
    },
    {
      id: "3f",
      label: "3F",
      elevation: 6.4,
      height: DEFAULT_STOREY_HEIGHT,
      slabThickness: DEFAULT_SLAB_THICKNESS,
    },
  ];

  const walls: Wall[] = [
    {
      id: "wall-front-1f",
      storeyId: "1f",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      thickness: DEFAULT_WALL_THICKNESS,
      height: DEFAULT_STOREY_HEIGHT,
      exterior: true,
      materialId: WALL_MATERIAL_ID,
    },
    {
      id: "wall-right-1f",
      storeyId: "1f",
      start: { x: 10, y: 0 },
      end: { x: 10, y: 8 },
      thickness: DEFAULT_WALL_THICKNESS,
      height: DEFAULT_STOREY_HEIGHT,
      exterior: true,
      materialId: WALL_MATERIAL_ID,
    },
    {
      id: "wall-back-1f",
      storeyId: "1f",
      start: { x: 10, y: 8 },
      end: { x: 0, y: 8 },
      thickness: DEFAULT_WALL_THICKNESS,
      height: DEFAULT_STOREY_HEIGHT,
      exterior: true,
      materialId: WALL_MATERIAL_ID,
    },
    {
      id: "wall-left-1f",
      storeyId: "1f",
      start: { x: 0, y: 8 },
      end: { x: 0, y: 0 },
      thickness: DEFAULT_WALL_THICKNESS,
      height: DEFAULT_STOREY_HEIGHT,
      exterior: true,
      materialId: WALL_MATERIAL_ID,
    },
  ];

  const openings: Opening[] = [
    {
      id: "window-front-1f",
      wallId: "wall-front-1f",
      type: "window",
      offset: 3,
      sillHeight: 0.9,
      width: 1.6,
      height: 1.3,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
  ];

  return {
    id: "sample-house",
    name: "三层别墅草案",
    unitSystem: "metric",
    defaultWallThickness: DEFAULT_WALL_THICKNESS,
    defaultStoreyHeight: DEFAULT_STOREY_HEIGHT,
    mode: "2d",
    activeView: "plan-1f",
    activeTool: "select",
    storeys,
    materials,
    walls,
    openings,
  };
}
