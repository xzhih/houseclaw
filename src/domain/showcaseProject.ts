import type { HouseProject, Storey, Wall, Slab, Roof, Opening, Balcony, Stair, Material } from "./types";
import { generateProjectId } from "../app/workspace";

// Chinese-style 3-storey house — pitched tile roof, large front-facing
// glazing, balconies on 2F/3F. Inspired by the reference photo the user
// provided. Dimensions tuned so stairs/openings stay valid by default.

const W = 12;          // building width (x)
const D = 8;           // building depth (y)
const H = 3.2;         // storey height
const SLAB = 0.18;
const WALL = 0.24;

const STOREYS: Storey[] = [
  { id: "1f", label: "一层", elevation: 0 },
  { id: "2f", label: "二层", elevation: H },
  { id: "3f", label: "三层", elevation: H * 2 },
  { id: "roof", label: "屋面", elevation: H * 3 },
];

const MATERIALS: Material[] = [
  { id: "mat-wall-white", name: "白漆外墙", kind: "wall", color: "#f4efe6" },
  { id: "mat-roof-tile", name: "深灰瓦", kind: "roof", color: "#3a3a3a" },
  { id: "mat-frame-wood", name: "木色窗框", kind: "frame", color: "#7a4a2b" },
  { id: "mat-door-walnut", name: "深木门", kind: "frame", color: "#5b3a26" },
  { id: "mat-slab-stone", name: "混凝土楼板", kind: "decor", color: "#bdbdbd" },
  { id: "mat-railing-wood", name: "木栏杆", kind: "railing", color: "#6b4a2e" },
];

const fullHeightWall = (id: string, sx: number, sy: number, ex: number, ey: number): Wall => ({
  id,
  start: { x: sx, y: sy }, end: { x: ex, y: ey },
  thickness: WALL,
  bottom: { kind: "storey", storeyId: "1f", offset: 0 },
  top: { kind: "storey", storeyId: "roof", offset: 0 },
  exterior: true,
  materialId: "mat-wall-white",
});

const WALLS: Wall[] = [
  fullHeightWall("w-front", 0, 0, W, 0),
  fullHeightWall("w-right", W, 0, W, D),
  fullHeightWall("w-back", W, D, 0, D),
  fullHeightWall("w-left", 0, D, 0, 0),
];

const slabAtStorey = (id: string, storeyId: string): Slab => ({
  id,
  polygon: [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: D },
    { x: 0, y: D },
  ],
  top: { kind: "storey", storeyId, offset: 0 },
  thickness: SLAB,
  materialId: "mat-slab-stone",
});

const SLABS: Slab[] = [
  slabAtStorey("slab-1f", "1f"),
  slabAtStorey("slab-2f", "2f"),
  slabAtStorey("slab-3f", "3f"),
];

const ROOFS: Roof[] = [
  {
    id: "roof-main",
    polygon: [
      { x: -0.6, y: -0.6 },
      { x: W + 0.6, y: -0.6 },
      { x: W + 0.6, y: D + 0.6 },
      { x: -0.6, y: D + 0.6 },
    ],
    base: { kind: "storey", storeyId: "roof", offset: 0 },
    edges: ["eave", "gable", "eave", "gable"],
    pitch: Math.PI / 6, // ~30°
    overhang: 0.6,
    materialId: "mat-roof-tile",
  },
];

// Front facade — door + tall windows on 1F, big windows on 2F/3F (mimicking
// the reference's floor-to-ceiling glazing).
const front1F: Opening[] = [
  { id: "o-front-door", wallId: "w-front", type: "door",
    offset: 5.5, sillHeight: 0, width: 1.2, height: 2.2,
    frameMaterialId: "mat-door-walnut" },
  { id: "o-front-1f-w1", wallId: "w-front", type: "window",
    offset: 1.2, sillHeight: 0.4, width: 2.4, height: 2.2,
    frameMaterialId: "mat-frame-wood" },
  { id: "o-front-1f-w2", wallId: "w-front", type: "window",
    offset: 8.4, sillHeight: 0.4, width: 2.4, height: 2.2,
    frameMaterialId: "mat-frame-wood" },
];
const front2F: Opening[] = [
  { id: "o-front-2f-w1", wallId: "w-front", type: "window",
    offset: 1.2, sillHeight: H + 0.3, width: 2.4, height: 2.4,
    frameMaterialId: "mat-frame-wood" },
  { id: "o-front-2f-w2", wallId: "w-front", type: "window",
    offset: 4.4, sillHeight: H + 0.3, width: 3.2, height: 2.4,
    frameMaterialId: "mat-frame-wood" },
  { id: "o-front-2f-w3", wallId: "w-front", type: "window",
    offset: 8.4, sillHeight: H + 0.3, width: 2.4, height: 2.4,
    frameMaterialId: "mat-frame-wood" },
];
const front3F: Opening[] = [
  { id: "o-front-3f-w1", wallId: "w-front", type: "window",
    offset: 4.4, sillHeight: 2 * H + 0.3, width: 3.2, height: 2.4,
    frameMaterialId: "mat-frame-wood" },
];

// Side (east) — narrow portrait windows like the reference's three small
// windows stacked.
const right: Opening[] = [
  { id: "o-right-1f", wallId: "w-right", type: "window",
    offset: 3.5, sillHeight: 1.0, width: 1.0, height: 1.4,
    frameMaterialId: "mat-frame-wood" },
  { id: "o-right-2f", wallId: "w-right", type: "window",
    offset: 3.5, sillHeight: H + 1.0, width: 1.0, height: 1.4,
    frameMaterialId: "mat-frame-wood" },
  { id: "o-right-3f", wallId: "w-right", type: "window",
    offset: 3.5, sillHeight: 2 * H + 1.0, width: 1.0, height: 1.4,
    frameMaterialId: "mat-frame-wood" },
];

const back: Opening[] = [
  { id: "o-back-1f", wallId: "w-back", type: "window",
    offset: 5.0, sillHeight: 0.9, width: 2.0, height: 1.4,
    frameMaterialId: "mat-frame-wood" },
  { id: "o-back-2f", wallId: "w-back", type: "window",
    offset: 5.0, sillHeight: H + 0.9, width: 2.0, height: 1.4,
    frameMaterialId: "mat-frame-wood" },
  { id: "o-back-3f", wallId: "w-back", type: "window",
    offset: 5.0, sillHeight: 2 * H + 0.9, width: 2.0, height: 1.4,
    frameMaterialId: "mat-frame-wood" },
];

const left: Opening[] = [
  { id: "o-left-1f", wallId: "w-left", type: "window",
    offset: 3.5, sillHeight: 1.0, width: 1.0, height: 1.4,
    frameMaterialId: "mat-frame-wood" },
  { id: "o-left-2f", wallId: "w-left", type: "window",
    offset: 3.5, sillHeight: H + 1.0, width: 1.0, height: 1.4,
    frameMaterialId: "mat-frame-wood" },
];

const OPENINGS: Opening[] = [...front1F, ...front2F, ...front3F, ...right, ...back, ...left];

// 2F balcony spans ~70% of front; 3F balcony narrower (matches the reference).
const BALCONIES: Balcony[] = [
  {
    id: "balcony-2f",
    attachedWallId: "w-front",
    offset: 1.0, width: 10.0, depth: 1.4,
    slabTop: { kind: "storey", storeyId: "2f", offset: 0 },
    slabThickness: 0.16,
    railingHeight: 1.05,
    materialId: "mat-slab-stone",
    railingMaterialId: "mat-railing-wood",
  },
  {
    id: "balcony-3f",
    attachedWallId: "w-front",
    offset: 3.5, width: 5.0, depth: 1.2,
    slabTop: { kind: "storey", storeyId: "3f", offset: 0 },
    slabThickness: 0.16,
    railingHeight: 1.05,
    materialId: "mat-slab-stone",
    railingMaterialId: "mat-railing-wood",
  },
];

// Two interior stairs: 1F→2F, 2F→3F. Tucked in the right-rear corner so they
// don't conflict with front rooms. Tread depth × count chosen to keep them
// inside the footprint.
const STAIRS: Stair[] = [
  {
    id: "stair-1f-2f",
    x: 9.0, y: 4.5, width: 1.0, depth: 3.4,
    shape: "straight",
    treadDepth: 0.27,
    bottomEdge: "+y",
    from: { kind: "storey", storeyId: "1f", offset: 0 },
    to: { kind: "storey", storeyId: "2f", offset: 0 },
    materialId: "mat-slab-stone",
  },
  {
    id: "stair-2f-3f",
    x: 9.0, y: 4.5, width: 1.0, depth: 3.4,
    shape: "straight",
    treadDepth: 0.27,
    bottomEdge: "+y",
    from: { kind: "storey", storeyId: "2f", offset: 0 },
    to: { kind: "storey", storeyId: "3f", offset: 0 },
    materialId: "mat-slab-stone",
  },
];

export function createShowcaseProject(name = "Showcase 三层中式"): HouseProject {
  return {
    schemaVersion: 2,
    id: generateProjectId(),
    name,
    storeys: STOREYS,
    materials: MATERIALS,
    walls: WALLS,
    slabs: SLABS,
    roofs: ROOFS,
    openings: OPENINGS,
    balconies: BALCONIES,
    stairs: STAIRS,
  };
}
