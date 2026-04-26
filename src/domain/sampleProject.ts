import { materialCatalog } from "../materials/catalog";
import type { Balcony, HouseProject, Opening, Storey, Wall } from "./types";

const DEFAULT_STOREY_HEIGHT = 3.2;
const DEFAULT_WALL_THICKNESS = 0.24;
const DEFAULT_SLAB_THICKNESS = 0.18;
const WALL_MATERIAL_ID = "mat-white-render";
const BALCONY_MATERIAL_ID = "mat-gray-stone";
const FRAME_MATERIAL_ID = "mat-dark-frame";

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
      width: 1.8,
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

  return {
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
  };
}
