import { materialCatalog } from "../materials/catalog";
import type { Balcony, HouseProject, Opening, Storey, Wall } from "./types";

const DEFAULT_STOREY_HEIGHT = 3.2;
const DEFAULT_WALL_THICKNESS = 0.24;
const DEFAULT_SLAB_THICKNESS = DEFAULT_WALL_THICKNESS; // 楼板厚度与墙体一致
const WALL_MATERIAL_ID = "mat-white-render";
const BALCONY_MATERIAL_ID = "mat-gray-stone";
const FRAME_MATERIAL_ID = "mat-dark-frame";
const STAIR_MATERIAL_ID = WALL_MATERIAL_ID;

function createStoreyWalls(storeyId: string): Wall[] {
  return [
    {
      id: `wall-front-${storeyId}`,
      storeyId,
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 },
      thickness: DEFAULT_WALL_THICKNESS,
      height: DEFAULT_STOREY_HEIGHT,
      exterior: true,
      materialId: WALL_MATERIAL_ID,
    },
    {
      id: `wall-right-${storeyId}`,
      storeyId,
      start: { x: 10, y: 0 },
      end: { x: 10, y: 8 },
      thickness: DEFAULT_WALL_THICKNESS,
      height: DEFAULT_STOREY_HEIGHT,
      exterior: true,
      materialId: WALL_MATERIAL_ID,
    },
    {
      id: `wall-back-${storeyId}`,
      storeyId,
      start: { x: 10, y: 8 },
      end: { x: 0, y: 8 },
      thickness: DEFAULT_WALL_THICKNESS,
      height: DEFAULT_STOREY_HEIGHT,
      exterior: true,
      materialId: WALL_MATERIAL_ID,
    },
    {
      id: `wall-left-${storeyId}`,
      storeyId,
      start: { x: 0, y: 8 },
      end: { x: 0, y: 0 },
      thickness: DEFAULT_WALL_THICKNESS,
      height: DEFAULT_STOREY_HEIGHT,
      exterior: true,
      materialId: WALL_MATERIAL_ID,
    },
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
      height: DEFAULT_STOREY_HEIGHT,
      slabThickness: DEFAULT_SLAB_THICKNESS,
      stair: {
        x: 0.6,
        y: 5.0,
        width: 1.2,
        depth: 2.5,
        shape: "straight",
        treadDepth: 0.27,
        bottomEdge: "+y",
        materialId: STAIR_MATERIAL_ID,
      },
    },
    {
      id: "2f",
      label: "2F",
      elevation: 3.2,
      height: DEFAULT_STOREY_HEIGHT,
      slabThickness: DEFAULT_SLAB_THICKNESS,
      stair: {
        x: 0.6,
        y: 5.0,
        width: 1.2,
        depth: 2.5,
        shape: "straight",
        treadDepth: 0.27,
        bottomEdge: "+y",
        materialId: STAIR_MATERIAL_ID,
      },
    },
    {
      id: "3f",
      label: "3F",
      elevation: 6.4,
      height: DEFAULT_STOREY_HEIGHT,
      slabThickness: DEFAULT_SLAB_THICKNESS,
    },
  ];

  const walls: Wall[] = storeys.flatMap((storey) => createStoreyWalls(storey.id));

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
    {
      id: "window-front-2f",
      wallId: "wall-front-2f",
      type: "window",
      offset: 3.8,
      sillHeight: 0.9,
      width: 0.8,
      height: 1.4,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "window-front-3f",
      wallId: "wall-front-3f",
      type: "window",
      offset: 4.1,
      sillHeight: 0.9,
      width: 1.5,
      height: 1.2,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "door-front-1f",
      wallId: "wall-front-1f",
      type: "door",
      offset: 6.0,
      sillHeight: 0,
      width: 1.0,
      height: 2.1,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
    {
      id: "door-front-2f",
      wallId: "wall-front-2f",
      type: "door",
      offset: 5.0,
      sillHeight: 0,
      width: 1.0,
      height: 2.2,
      frameMaterialId: FRAME_MATERIAL_ID,
    },
  ];

  const balconies: Balcony[] = [
    {
      id: "balcony-front-2f",
      storeyId: "2f",
      attachedWallId: "wall-front-2f",
      offset: 3.1,
      width: 3.2,
      depth: 1.25,
      slabThickness: DEFAULT_SLAB_THICKNESS,
      railingHeight: 1.05,
      materialId: BALCONY_MATERIAL_ID,
      railingMaterialId: FRAME_MATERIAL_ID,
    },
  ];

  const topStorey = storeys[storeys.length - 1];
  const roofMaterial = materials.find((m) => m.kind === "roof") ?? materials[0];
  const roof = {
    edges: {
      [`wall-front-${topStorey.id}`]: "eave" as const,
      [`wall-back-${topStorey.id}`]: "eave" as const,
      [`wall-left-${topStorey.id}`]: "gable" as const,
      [`wall-right-${topStorey.id}`]: "gable" as const,
    },
    pitch: Math.PI / 6,
    overhang: 0.6,
    materialId: roofMaterial.id,
  };

  return {
    schemaVersion: 1,
    id: "sample-house",
    name: "三层别墅草案",
    unitSystem: "metric",
    defaultWallThickness: DEFAULT_WALL_THICKNESS,
    defaultStoreyHeight: DEFAULT_STOREY_HEIGHT,
    mode: "2d",
    activeView: "plan-1f",
    activeTool: "select",
    selection: { kind: "storey", id: storeys[0].id },
    storeys,
    materials,
    walls,
    openings,
    balconies,
    roof,
    skirts: [],
  };
}
