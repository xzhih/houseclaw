import type {
  Balcony,
  HouseProject,
  Opening,
  Roof,
  Slab,
  Stair,
  Wall,
} from "../types";
import { createCrudStore } from "./crudStore";

// ───── Patch types ─────
export type WallPatch = Partial<Omit<Wall, "id">>;
export type OpeningPatch = Partial<Omit<Opening, "id" | "wallId">>;
export type BalconyPatch = Partial<Omit<Balcony, "id" | "attachedWallId">>;
export type SlabPatch = Partial<Omit<Slab, "id">>;
export type RoofPatch = Partial<Omit<Roof, "id">>;
export type StairPatch = Partial<Omit<Stair, "id">>;

type UnsafeWallPatch = WallPatch & Partial<Pick<Wall, "id">>;
type UnsafeOpeningPatch = OpeningPatch & Partial<Pick<Opening, "id" | "wallId">>;
type UnsafeBalconyPatch = BalconyPatch & Partial<Pick<Balcony, "id" | "attachedWallId">>;
type UnsafeSlabPatch = SlabPatch & Partial<Pick<Slab, "id">>;
type UnsafeRoofPatch = RoofPatch & Partial<Pick<Roof, "id">>;
type UnsafeStairPatch = StairPatch & Partial<Pick<Stair, "id">>;

// ───── Stores ─────

export const wallStore = createCrudStore<Wall, WallPatch>({
  arrayKey: "walls",
  entityKind: "wall",
  applyPatch: (wall, patch) => {
    const { id: _id, ...allowed } = patch as UnsafeWallPatch;
    return { ...wall, ...allowed };
  },
  cascade: (project, removed) => ({
    openings: project.openings.filter((o) => o.wallId !== removed.id),
    balconies: project.balconies.filter((b) => b.attachedWallId !== removed.id),
  }),
});

export const openingStore = createCrudStore<Opening, OpeningPatch>({
  arrayKey: "openings",
  entityKind: "opening",
  applyPatch: (o, p) => {
    const { id: _id, wallId: _wallId, ...allowed } = p as UnsafeOpeningPatch;
    return { ...o, ...allowed };
  },
});

export const balconyStore = createCrudStore<Balcony, BalconyPatch>({
  arrayKey: "balconies",
  entityKind: "balcony",
  applyPatch: (b, p) => {
    const { id: _id, attachedWallId: _attachedWallId, ...allowed } = p as UnsafeBalconyPatch;
    return { ...b, ...allowed };
  },
});

export const slabStore = createCrudStore<Slab, SlabPatch>({
  arrayKey: "slabs",
  entityKind: "slab",
  applyPatch: (slab, patch) => {
    const { id: _id, ...allowed } = patch as UnsafeSlabPatch;
    return { ...slab, ...allowed };
  },
});

export const roofStore = createCrudStore<Roof, RoofPatch>({
  arrayKey: "roofs",
  entityKind: "roof",
  applyPatch: (roof, patch) => {
    const { id: _id, ...allowed } = patch as UnsafeRoofPatch;
    return { ...roof, ...allowed };
  },
});

export const stairStore = createCrudStore<Stair, StairPatch>({
  arrayKey: "stairs",
  entityKind: "stair",
  applyPatch: (stair, patch) => {
    const { id: _id, ...allowed } = patch as UnsafeStairPatch;
    return { ...stair, ...allowed };
  },
});
