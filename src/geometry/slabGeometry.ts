import type { Point2, Storey, Wall } from "../domain/types";
import { buildExteriorRing } from "./footprintRing";
import type { SlabGeometry } from "./types";
import type { FootprintQuad } from "./wallNetwork";

// 0 = slab outline coincides with the exterior wall outline (flush facade).
// A tiny positive value would create a visible seam in three.js renderer.
const FACADE_INSET = 0;

function insetRing(ring: Point2[], distance: number): Point2[] {
  const n = ring.length;
  if (n < 3 || distance === 0) return ring;

  let signedArea = 0;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    signedArea += a.x * b.y - b.x * a.y;
  }
  // Shoelace > 0 = CCW (inward is left of edge); < 0 = CW (inward is right).
  const inwardSign = signedArea >= 0 ? 1 : -1;

  type EdgeInfo = { ux: number; uy: number; nx: number; ny: number };
  const edges: EdgeInfo[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      edges[i] = { ux: 0, uy: 0, nx: 0, ny: 0 };
      continue;
    }
    const ux = dx / len;
    const uy = dy / len;
    edges[i] = { ux, uy, nx: -uy * inwardSign, ny: ux * inwardSign };
  }

  const result: Point2[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const e0 = edges[(i - 1 + n) % n];
    const e1 = edges[i];
    const denom = 1 + e0.ux * e1.ux + e0.uy * e1.uy;
    if (Math.abs(denom) < 1e-6) {
      result[i] = {
        x: ring[i].x + distance * e1.nx,
        y: ring[i].y + distance * e1.ny,
      };
    } else {
      result[i] = {
        x: ring[i].x + (distance * (e0.nx + e1.nx)) / denom,
        y: ring[i].y + (distance * (e0.ny + e1.ny)) / denom,
      };
    }
  }

  return result;
}

export function buildSlabGeometry(
  storey: Storey,
  walls: Wall[],
  footprintIndex: Map<string, FootprintQuad>,
  materialId: string,
  customHole?: Point2[],
  outlineWalls?: Wall[],  // when provided, use these walls' exterior ring as outline
): SlabGeometry | undefined {
  const wallsForOutline = outlineWalls ?? walls.filter((wall) => wall.storeyId === storey.id);
  const outline = buildExteriorRing(wallsForOutline, footprintIndex);
  if (!outline) return undefined;

  const hole = customHole;

  return {
    storeyId: storey.id,
    kind: "floor",
    outline: insetRing(outline, FACADE_INSET),
    hole,
    topY: storey.elevation,
    thickness: storey.slabThickness,
    materialId,
  };
}

