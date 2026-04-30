import type { HouseProject, Storey, Wall, Slab, Roof, Opening, Stair, Material } from "./types";

const W = 8;
const D = 6;
const STOREY_H = 3.2;
const SLAB_THICK = 0.18;
const WALL_THICK = 0.24;

const STOREYS: Storey[] = [
  { id: "1f", label: "一层", elevation: 0 },
  { id: "2f", label: "二层", elevation: STOREY_H },
  { id: "roof", label: "屋面", elevation: STOREY_H * 2 },
];

const MATERIALS: Material[] = [
  { id: "mat-wall-white", name: "白漆外墙", kind: "wall", color: "#f4efe6" },
  { id: "mat-roof-tile", name: "深灰瓦", kind: "roof", color: "#3a3a3a" },
  { id: "mat-frame-dark", name: "深灰窗框", kind: "frame", color: "#2a2a2a" },
  { id: "mat-door-walnut", name: "深木门", kind: "frame", color: "#5b3a26" },
  { id: "mat-slab-stone", name: "混凝土楼板", kind: "decor", color: "#bdbdbd" },
];

const WALLS: Wall[] = [
  {
    id: "w-front",
    start: { x: 0, y: 0 }, end: { x: W, y: 0 },
    thickness: WALL_THICK,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "roof", offset: 0 },
    exterior: true,
    materialId: "mat-wall-white",
  },
  {
    id: "w-right",
    start: { x: W, y: 0 }, end: { x: W, y: D },
    thickness: WALL_THICK,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "roof", offset: 0 },
    exterior: true,
    materialId: "mat-wall-white",
  },
  {
    id: "w-back",
    start: { x: W, y: D }, end: { x: 0, y: D },
    thickness: WALL_THICK,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "roof", offset: 0 },
    exterior: true,
    materialId: "mat-wall-white",
  },
  {
    id: "w-left",
    start: { x: 0, y: D }, end: { x: 0, y: 0 },
    thickness: WALL_THICK,
    bottom: { kind: "storey", storeyId: "1f", offset: 0 },
    top: { kind: "storey", storeyId: "roof", offset: 0 },
    exterior: true,
    materialId: "mat-wall-white",
  },
];

const SLABS: Slab[] = [
  {
    id: "slab-1f",
    polygon: [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: D },
      { x: 0, y: D },
    ],
    top: { kind: "storey", storeyId: "1f", offset: 0 },
    thickness: SLAB_THICK,
    materialId: "mat-slab-stone",
  },
  {
    id: "slab-2f",
    polygon: [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: D },
      { x: 0, y: D },
    ],
    top: { kind: "storey", storeyId: "2f", offset: 0 },
    thickness: SLAB_THICK,
    materialId: "mat-slab-stone",
  },
];

const ROOFS: Roof[] = [
  {
    id: "roof-main",
    polygon: [
      { x: -0.5, y: -0.5 },
      { x: W + 0.5, y: -0.5 },
      { x: W + 0.5, y: D + 0.5 },
      { x: -0.5, y: D + 0.5 },
    ],
    base: { kind: "storey", storeyId: "roof", offset: 0 },
    edges: ["eave", "gable", "eave", "gable"],
    pitch: Math.PI / 6,
    overhang: 0.5,
    materialId: "mat-roof-tile",
  },
];

const OPENINGS: Opening[] = [
  {
    id: "o-front-door",
    wallId: "w-front",
    type: "door",
    offset: 3.5,
    sillHeight: 0,
    width: 1.0,
    height: 2.1,
    frameMaterialId: "mat-door-walnut",
  },
  {
    id: "o-front-1f-win",
    wallId: "w-front",
    type: "window",
    offset: 1.0,
    sillHeight: 0.9,
    width: 1.6,
    height: 1.4,
    frameMaterialId: "mat-frame-dark",
  },
  {
    id: "o-front-2f-win",
    wallId: "w-front",
    type: "window",
    offset: 5.5,
    sillHeight: STOREY_H + 0.9,
    width: 1.6,
    height: 1.4,
    frameMaterialId: "mat-frame-dark",
  },
  {
    id: "o-back-2f-win",
    wallId: "w-back",
    type: "window",
    offset: 3.0,
    sillHeight: STOREY_H + 0.9,
    width: 2.0,
    height: 1.4,
    frameMaterialId: "mat-frame-dark",
  },
  {
    id: "o-right-1f-win",
    wallId: "w-right",
    type: "window",
    offset: 2.5,
    sillHeight: 0.9,
    width: 1.0,
    height: 1.2,
    frameMaterialId: "mat-frame-dark",
  },
];

const STAIRS: Stair[] = [
  {
    id: "stair-1f-2f",
    x: 0.3, y: 0.3, width: 1, depth: 3,
    shape: "straight",
    treadDepth: 0.27,
    bottomEdge: "+y",
    from: { kind: "storey", storeyId: "1f", offset: 0 },
    to: { kind: "storey", storeyId: "2f", offset: 0 },
    materialId: "mat-slab-stone",
  },
];

export function createV2SampleProject(): HouseProject {
  return {
    schemaVersion: 2,
    id: "showcase-v2",
    name: "Showcase v2",
    storeys: STOREYS,
    materials: MATERIALS,
    walls: WALLS,
    slabs: SLABS,
    roofs: ROOFS,
    openings: OPENINGS,
    balconies: [],
    stairs: STAIRS,
  };
}
