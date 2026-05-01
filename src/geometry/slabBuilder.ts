import { resolveAnchor } from "../domain/anchors";
import type { Point2, Slab, Storey } from "../domain/types";
import type { SlabGeometry } from "./types";

function clonePoint(p: Point2): Point2 {
  return { x: p.x, y: p.y };
}

export function buildSlabGeometry(slab: Slab, storeys: Storey[]): SlabGeometry {
  return {
    slabId: slab.id,
    outline: slab.polygon.map(clonePoint),
    holes: (slab.holes ?? []).map((hole) => hole.map(clonePoint)),
    topZ: resolveAnchor(slab.top, storeys),
    thickness: slab.thickness,
    materialId: slab.materialId,
    edgeMaterialId: slab.edgeMaterialId,
  };
}
