import type { Point2, Wall } from "../domain/types";
import type { FootprintQuad } from "./types";

const DEFAULT_TOLERANCE = 0.005;

type EndpointKey = string;

function endpointKey(point: Point2, tolerance: number): EndpointKey {
  const cell = 1 / tolerance;
  return `${Math.round(point.x * cell)}|${Math.round(point.y * cell)}`;
}

type DirectedSegment = {
  wallId: string;
  startKey: EndpointKey;
  endKey: EndpointKey;
  outerStart: Point2;
  outerEnd: Point2;
  outgoingAngle: number; // angle of (end - start) at startKey
};

export type BuildExteriorRingOptions = {
  tolerance?: number;
};

export function buildExteriorRing(
  walls: Wall[],
  footprintIndex: Map<string, FootprintQuad>,
  options?: BuildExteriorRingOptions,
): Point2[] | undefined {
  const tolerance = options?.tolerance ?? DEFAULT_TOLERANCE;
  const exteriorWalls = walls.filter((wall) => wall.exterior);
  if (exteriorWalls.length < 3) return undefined;

  // Each wall contributes two directed segments (one in each direction along
  // its centerline) so the tracer can follow either way around the ring.
  const segments: DirectedSegment[] = [];
  for (const wall of exteriorWalls) {
    const fp = footprintIndex.get(wall.id);
    if (!fp) return undefined;
    const startKey = endpointKey(wall.start, tolerance);
    const endKey = endpointKey(wall.end, tolerance);

    const forwardAngle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
    const backwardAngle = Math.atan2(wall.start.y - wall.end.y, wall.start.x - wall.end.x);

    segments.push({
      wallId: wall.id,
      startKey,
      endKey,
      outerStart: fp.rightStart,
      outerEnd: fp.rightEnd,
      outgoingAngle: forwardAngle,
    });
    segments.push({
      wallId: wall.id,
      startKey: endKey,
      endKey: startKey,
      // Reversed direction → "right" side flips, so we use leftEnd → leftStart.
      outerStart: fp.leftEnd,
      outerEnd: fp.leftStart,
      outgoingAngle: backwardAngle,
    });
  }

  // Index outgoing segments by their starting junction.
  const outgoing = new Map<EndpointKey, DirectedSegment[]>();
  for (const segment of segments) {
    const list = outgoing.get(segment.startKey);
    if (list) list.push(segment);
    else outgoing.set(segment.startKey, [segment]);
  }

  // Pick a deterministic starting segment: smallest startKey, smallest angle.
  const sortedStarts = [...outgoing.keys()].sort();
  const startKey = sortedStarts[0];
  const initialList = outgoing.get(startKey);
  if (!initialList || initialList.length === 0) return undefined;
  const start = [...initialList].sort((a, b) => a.outgoingAngle - b.outgoingAngle)[0];

  const ring: Point2[] = [];
  const visited = new Set<string>();

  const startSegmentKey = `${start.wallId}|${start.startKey}`;

  let current = start;
  while (true) {
    const segmentKey = `${current.wallId}|${current.startKey}`;
    if (visited.has(segmentKey)) break;
    visited.add(segmentKey);

    ring.push(current.outerStart);

    const choices = outgoing.get(current.endKey);
    if (!choices) return undefined;

    // Pick the segment that turns rightmost (i.e. smallest CCW angle from
    // the *reverse* of the incoming direction). This keeps us hugging the
    // exterior boundary even at branched junctions.
    const incomingReverse = current.outgoingAngle + Math.PI;
    const next = pickRightmost(choices, current.wallId, incomingReverse);
    if (!next) return undefined;

    // Use key-based closure check rather than object identity, so the
    // termination is stable regardless of how `start` was obtained.
    if (`${next.wallId}|${next.startKey}` === startSegmentKey) {
      break;
    }

    current = next;
  }

  if (ring.length < 3) return undefined;
  return ring;
}

function pickRightmost(
  choices: DirectedSegment[],
  incomingWallId: string,
  incomingReverseAngle: number,
): DirectedSegment | undefined {
  // Filter out U-turn back along the same wall.
  const filtered = choices.filter((c) => c.wallId !== incomingWallId);
  const pool = filtered.length > 0 ? filtered : choices;

  let best: DirectedSegment | undefined;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const candidate of pool) {
    let delta = candidate.outgoingAngle - incomingReverseAngle;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    // Rightmost = most-negative CCW delta = sharpest right turn.
    // Smaller delta → more right.
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }

  return best;
}
