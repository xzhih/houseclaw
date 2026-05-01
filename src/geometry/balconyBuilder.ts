import { resolveAnchor } from "../domain/anchors";
import type { Balcony, Storey } from "../domain/types";
import type { BalconyGeometry } from "./types";

export function buildBalconyGeometry(balcony: Balcony, storeys: Storey[]): BalconyGeometry {
  return {
    balconyId: balcony.id,
    attachedWallId: balcony.attachedWallId,
    offset: balcony.offset,
    width: balcony.width,
    depth: balcony.depth,
    slabThickness: balcony.slabThickness,
    slabTopZ: resolveAnchor(balcony.slabTop, storeys),
    railingHeight: balcony.railingHeight,
    materialId: balcony.materialId,
    railingMaterialId: balcony.railingMaterialId,
  };
}
