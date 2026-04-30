import type { PlanProjectionV2, PlanWallSegmentV2 } from "../../projection/v2/types";
import type { Anchor, GuideMatch } from "../smartGuides";
import { findAxisAlignedGuides } from "../smartGuides";

export type { Anchor, GuideMatch };
export { findAxisAlignedGuides };

/** Collect alignment anchors from a v2 plan projection. excludes uses tag:id form
 *  ("wall:abc", "opening:xyz", "balcony:b1", "stair:s1") to skip the dragged element. */
export function collectPlanAnchorsV2(
  projection: PlanProjectionV2,
  excludes: Set<string>,
): Anchor[] {
  const anchors: Anchor[] = [];
  const segByWallId = new Map<string, PlanWallSegmentV2>();
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
    if (excludes.has(`stair:${s.stairId}`)) continue;
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
        sourceId: `stair-corner-${i}:${s.stairId}`,
      });
    }
  }
  return anchors;
}
