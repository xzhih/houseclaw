import type { Point2 } from "./types";

/** Shoelace formula. Positive => CCW, negative => CW. */
export function signedArea(polygon: Point2[]): number {
  let sum = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    sum += (b.x - a.x) * (b.y + a.y);
  }
  return -sum / 2;
}

export function isPolygonCCW(polygon: Point2[]): boolean {
  return signedArea(polygon) > 0;
}

/** Check that no two non-adjacent edges intersect. O(n²) — fine for ≤ ~20-vertex
 *  building outlines. */
export function isPolygonSimple(polygon: Point2[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a1 = polygon[i];
    const a2 = polygon[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent edges (they share a vertex).
      if (j === i || (j + 1) % n === i) continue;
      const b1 = polygon[j];
      const b2 = polygon[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return false;
    }
  }
  return true;
}

function segmentsIntersect(p1: Point2, p2: Point2, p3: Point2, p4: Point2): boolean {
  const d1 = cross(p4, p3, p1);
  const d2 = cross(p4, p3, p2);
  const d3 = cross(p2, p1, p3);
  const d4 = cross(p2, p1, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

function cross(a: Point2, b: Point2, c: Point2): number {
  return (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
}
