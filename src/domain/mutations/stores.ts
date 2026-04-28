import { wallLength } from "../measurements";
import type {
  Balcony,
  HouseProject,
  Opening,
  Roof,
  SkirtRoof,
  Stair,
  Wall,
} from "../types";
import { createCrudStore } from "./crudStore";
import { createAttachStore } from "./attachStore";
import { createSingletonStore } from "./singletonStore";
import { EntityRangeError, EntityStateError } from "./errors";

// ───── Patch 类型 ─────
export type OpeningPatch = Partial<Omit<Opening, "id" | "wallId">>;
export type WallPatch = Partial<Omit<Wall, "id" | "storeyId" | "start" | "end">>;
export type BalconyPatch = Partial<Omit<Balcony, "id" | "storeyId" | "attachedWallId">>;
export type StairPatch = Partial<Omit<Stair, never>>;
export type SkirtPatch = Partial<Omit<SkirtRoof, "id" | "hostWallId">>;
export type RoofPatch = Partial<Pick<Roof, "pitch" | "overhang" | "materialId">>;

// stores.ts 内部用的 unsafe 形态（保留运行期剔除受保护字段）
type UnsafeOpeningPatch = OpeningPatch & Partial<Pick<Opening, "id" | "wallId">>;
type UnsafeWallPatch = WallPatch & Partial<Pick<Wall, "id" | "storeyId" | "start" | "end">>;
type UnsafeBalconyPatch = BalconyPatch & Partial<Pick<Balcony, "id" | "storeyId" | "attachedWallId">>;

// ───── roof clamp 常量 ─────
const PITCH_MIN = Math.PI / 36;
const PITCH_MAX = Math.PI / 3;
const OVERHANG_MIN = 0;
const OVERHANG_MAX = 2;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ───── stores ─────
export const wallStore = createCrudStore<Wall, WallPatch>({
  arrayKey: "walls",
  entityKind: "wall",
  applyPatch: (wall, patch) => {
    const {
      id: _id,
      storeyId: _storeyId,
      start: _start,
      end: _end,
      ...allowed
    } = patch as UnsafeWallPatch;
    return { ...wall, ...allowed };
  },
  cascade: (project, removed) => ({
    openings: project.openings.filter((o) => o.wallId !== removed.id),
    balconies: project.balconies.filter((b) => b.attachedWallId !== removed.id),
    skirts: project.skirts.filter((s) => s.hostWallId !== removed.id),
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
    const {
      id: _id,
      storeyId: _storeyId,
      attachedWallId: _attachedWallId,
      ...allowed
    } = p as UnsafeBalconyPatch;
    return { ...b, ...allowed };
  },
});

export const skirtStore = createCrudStore<SkirtRoof, SkirtPatch>({
  arrayKey: "skirts",
  entityKind: "skirt",
  applyPatch: (s, p) => ({ ...s, ...p }),
  validate: (skirt, project) => {
    const wall = project.walls.find((w) => w.id === skirt.hostWallId);
    if (!wall) throw new EntityStateError(`Host wall ${skirt.hostWallId} not found`);
    const wlen = wallLength(wall);
    const storey = project.storeys.find((s) => s.id === wall.storeyId);
    if (!storey) throw new EntityStateError(`Storey ${wall.storeyId} not found`);

    if (skirt.offset < 0) throw new EntityRangeError("offset", "offset 不能为负");
    if (skirt.width < 0.3) throw new EntityRangeError("width", "宽度过小");
    if (skirt.offset + skirt.width > wlen + 1e-6)
      throw new EntityRangeError("width", "披檐超出墙长");
    if (skirt.depth < 0.3 || skirt.depth > 4)
      throw new EntityRangeError("depth", "外伸深度超出范围");
    if (skirt.overhang < 0.05 || skirt.overhang > 1.5)
      throw new EntityRangeError("overhang", "出檐超出范围");
    if (skirt.pitch < Math.PI / 36 || skirt.pitch > Math.PI / 3)
      throw new EntityRangeError("pitch", "坡度超出范围");
    if (
      skirt.elevation <= storey.elevation ||
      skirt.elevation > storey.elevation + storey.height + 1e-6
    ) {
      throw new EntityRangeError("elevation", "挂接高度必须在所属楼层范围内");
    }
  },
});

export const stairStore = createAttachStore<Stair, StairPatch>({
  hostArrayKey: "storeys",
  field: "stair",
});

export const roofStore = createSingletonStore<Roof, RoofPatch>({
  field: "roof",
  entityKind: "roof",
  applyPatch: (roof, patch) => ({
    ...roof,
    ...(patch.pitch !== undefined ? { pitch: clamp(patch.pitch, PITCH_MIN, PITCH_MAX) } : {}),
    ...(patch.overhang !== undefined
      ? { overhang: clamp(patch.overhang, OVERHANG_MIN, OVERHANG_MAX) }
      : {}),
    ...(patch.materialId !== undefined ? { materialId: patch.materialId } : {}),
  }),
});
