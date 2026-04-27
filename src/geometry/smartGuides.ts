import type { PlanProjection, PlanWallSegment } from "../projection/types";
import type { Point2D } from "../components/canvas/types";

export type Anchor = { x: number; y: number; sourceId: string };
export type GuideMatch = { axis: "x" | "y"; pos: number; anchor: Anchor };

export function findAxisAlignedGuides(
  cursor: Point2D,
  anchors: Anchor[],
  tolerance: number,
): GuideMatch[] {
  let bestX: { delta: number; anchor: Anchor } | null = null;
  let bestY: { delta: number; anchor: Anchor } | null = null;
  for (const a of anchors) {
    const dx = Math.abs(cursor.x - a.x);
    if (dx < tolerance && (bestX === null || dx < bestX.delta)) {
      bestX = { delta: dx, anchor: a };
    }
    const dy = Math.abs(cursor.y - a.y);
    if (dy < tolerance && (bestY === null || dy < bestY.delta)) {
      bestY = { delta: dy, anchor: a };
    }
  }
  const out: GuideMatch[] = [];
  if (bestX) out.push({ axis: "x", pos: bestX.anchor.x, anchor: bestX.anchor });
  if (bestY) out.push({ axis: "y", pos: bestY.anchor.y, anchor: bestY.anchor });
  return out;
}

/** 收集平面视图中可用作对齐的关键点（排除 sourceId 命中的元素自身）。 */
export function collectPlanAnchors(
  projection: PlanProjection,
  excludes: Set<string>,
): Anchor[] {
  const anchors: Anchor[] = [];
  const segByWallId = new Map<string, PlanWallSegment>();
  for (const wall of projection.wallSegments) {
    segByWallId.set(wall.wallId, wall);
    if (excludes.has(`wall:${wall.wallId}`)) continue;
    anchors.push({ x: wall.start.x, y: wall.start.y, sourceId: `wall-start:${wall.wallId}` });
    anchors.push({ x: wall.end.x, y: wall.end.y, sourceId: `wall-end:${wall.wallId}` });
  }
  for (const op of projection.openings) {
    if (excludes.has(`opening:${op.openingId}`)) continue;
    const seg = segByWallId.get(op.wallId);
    if (!seg) continue;
    const dx = seg.end.x - seg.start.x;
    const dy = seg.end.y - seg.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const t = (op.offset + op.width / 2) / len;
    anchors.push({
      x: seg.start.x + dx * t,
      y: seg.start.y + dy * t,
      sourceId: `opening:${op.openingId}`,
    });
  }
  for (const bal of projection.balconies) {
    if (excludes.has(`balcony:${bal.balconyId}`)) continue;
    const seg = segByWallId.get(bal.wallId);
    if (!seg) continue;
    const dx = seg.end.x - seg.start.x;
    const dy = seg.end.y - seg.start.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len;
    const uy = dy / len;
    anchors.push({
      x: seg.start.x + ux * bal.offset,
      y: seg.start.y + uy * bal.offset,
      sourceId: `balcony-start:${bal.balconyId}`,
    });
    anchors.push({
      x: seg.start.x + ux * (bal.offset + bal.width),
      y: seg.start.y + uy * (bal.offset + bal.width),
      sourceId: `balcony-end:${bal.balconyId}`,
    });
  }
  for (const s of projection.stairs) {
    if (excludes.has(`stair:${s.storeyId}`)) continue;
    const cos = Math.cos(s.rotation);
    const sin = Math.sin(s.rotation);
    const w = s.rect.width;
    const d = s.rect.depth;
    const corners: Array<[number, number]> = [
      [-w / 2, -d / 2],
      [ w / 2, -d / 2],
      [ w / 2,  d / 2],
      [-w / 2,  d / 2],
    ];
    for (let i = 0; i < corners.length; i++) {
      const [lx, ly] = corners[i];
      anchors.push({
        x: s.center.x + lx * cos - ly * sin,
        y: s.center.y + lx * sin + ly * cos,
        sourceId: `stair-corner-${i}:${s.storeyId}`,
      });
    }
  }
  return anchors;
}
