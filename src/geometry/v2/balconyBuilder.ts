import { resolveAnchor } from "../../domain/v2/anchors";
import type { Balcony, Storey } from "../../domain/v2/types";
import type { BalconyGeometryV2 } from "./types";

export function buildBalconyGeometry(balcony: Balcony, storeys: Storey[]): BalconyGeometryV2 {
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
