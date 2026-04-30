import { resolveAnchor } from "../../domain/v2/anchors";
import type { Point2, Slab, Storey } from "../../domain/v2/types";
import type { SlabGeometryV2 } from "./types";

function clonePoint(p: Point2): Point2 {
  return { x: p.x, y: p.y };
}

export function buildSlabGeometry(slab: Slab, storeys: Storey[]): SlabGeometryV2 {
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
