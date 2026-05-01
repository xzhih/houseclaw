export {
  wallStore,
  openingStore,
  balconyStore,
  slabStore,
  roofStore,
  stairStore,
  type WallPatch,
  type OpeningPatch,
  type BalconyPatch,
  type SlabPatch,
  type RoofPatch,
  type StairPatch,
} from "./mutations/stores";

import {
  wallStore,
  openingStore,
  balconyStore,
  slabStore,
  roofStore,
  stairStore,
} from "./mutations/stores";

export const addWall = wallStore.add;
export const updateWall = wallStore.update;
export const removeWall = wallStore.remove;

export const addOpening = openingStore.add;
export const updateOpening = openingStore.update;
export const removeOpening = openingStore.remove;

export const addBalcony = balconyStore.add;
export const updateBalcony = balconyStore.update;
export const removeBalcony = balconyStore.remove;

export const addSlab = slabStore.add;
export const updateSlab = slabStore.update;
export const removeSlab = slabStore.remove;

export const addRoof = roofStore.add;
export const updateRoof = roofStore.update;
export const removeRoof = roofStore.remove;

export const addStair = stairStore.add;
export const updateStair = stairStore.update;
export const removeStair = stairStore.remove;

export {
  setStoreyLabel,
  setStoreyElevation,
  setStoreyHeight,
  addStorey,
  removeStorey,
} from "./mutations/storeys";

export {
  EntityNotFoundError,
  EntityRangeError,
  EntityStateError,
  type EntityKind,
} from "./mutations/errors";
