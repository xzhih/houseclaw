import { computeStairConfig, rotatePoint } from "../domain/stairs";
import type { StairConfig } from "../domain/stairs";
import type { Point2, Stair } from "../domain/types";
import type { StairBox, StairGeometry } from "./types";

/** Internal shape used by the per-shape builders (buildStraight / buildL /
 *  buildU). The exported `buildStairGeometry` adds stairId + materialId on
 *  top of this to match the public StairGeometry type. */
type StairGeometryDraft = { treads: StairBox[]; landings: StairBox[] };

// 5mm gap between the top tread's top face and the slab's underside, just enough
// to avoid coplanar z-fighting and let the slab's 0.18m thickness face render
// cleanly as an independent band above the stair.
const Z_FIGHT_OFFSET = 0.005;

type Axis = "x" | "z";

type EdgeBasis = {
  runAxis: Axis;        // axis the climb runs along (in world space)
  runLength: number;    // total length along the run axis = stair's footprint extent on that axis
  crossAxis: Axis;      // perpendicular horizontal axis
  crossLength: number;  // stair's footprint extent on the cross axis
  // Returns the run-axis center (in stair-local coords, 0..runLength) for the i-th tread
  runCenterAt: (i: number, treadDepth: number) => number;
  // Maps a 2D-local run position (0 = bottomEdge, runLength = far end) to stair-local
  // runCenter, accounting for the basis's climb direction.
  runFrom2D: (run2D: number) => number;
};

function basisForEdge(stair: Stair): EdgeBasis {
  switch (stair.bottomEdge) {
    case "+y": return {
      runAxis: "z", runLength: stair.depth,
      crossAxis: "x", crossLength: stair.width,
      runCenterAt: (i, td) => stair.depth - (i + 0.5) * td,
      runFrom2D: (r) => stair.depth - r,
    };
    case "-y": return {
      runAxis: "z", runLength: stair.depth,
      crossAxis: "x", crossLength: stair.width,
      runCenterAt: (i, td) => (i + 0.5) * td,
      runFrom2D: (r) => r,
    };
    case "+x": return {
      runAxis: "x", runLength: stair.width,
      crossAxis: "z", crossLength: stair.depth,
      runCenterAt: (i, td) => stair.width - (i + 0.5) * td,
      runFrom2D: (r) => stair.width - r,
    };
    case "-x": return {
      runAxis: "x", runLength: stair.width,
      crossAxis: "z", crossLength: stair.depth,
      runCenterAt: (i, td) => (i + 0.5) * td,
      runFrom2D: (r) => r,
    };
  }
}

// Build a box from a (run, cross) center pair plus its (run, cross) sizes and vertical position/size.
// The run/cross axes map to either (z, x) or (x, z) depending on the basis.
function makeBoxAtCross(args: {
  stair: Stair;
  basis: EdgeBasis;
  runCenter: number;
  runSize: number;
  crossCenter: number;
  crossSize: number;
  cy: number;
  sy: number;
}): StairBox {
  const { stair, basis, runCenter, runSize, crossCenter, crossSize, cy, sy } = args;
  if (basis.runAxis === "z") {
    return {
      cx: stair.x + crossCenter,
      cy,
      cz: stair.y + runCenter,
      sx: crossSize, sy, sz: runSize,
    };
  }
  // runAxis === "x"
  return {
    cx: stair.x + runCenter,
    cy,
    cz: stair.y + crossCenter,
    sx: runSize, sy, sz: crossSize,
  };
}

function appendLowerFlight(
  treads: StairBox[],
  stair: Stair,
  basis: EdgeBasis,
  cfg: StairConfig,
  nLow: number,
  lowerStoreyTopY: number,
  crossCenter: number,
  crossSize: number,
): void {
  for (let i = 0; i < nLow; i += 1) {
    treads.push(
      makeBoxAtCross({
        stair, basis,
        runCenter: basis.runCenterAt(i, stair.treadDepth),
        runSize: stair.treadDepth,
        crossCenter,
        crossSize,
        cy: lowerStoreyTopY + (i + 0.5) * cfg.riserHeight,
        sy: cfg.riserHeight,
      }),
    );
  }
}

function buildStraight(
  stair: Stair,
  lowerStoreyTopY: number,
  climb: number,
  slabThickness: number,
): StairGeometryDraft {
  const cfg = computeStairConfig(climb, slabThickness, stair.treadDepth);
  const basis = basisForEdge(stair);
  const treads: StairBox[] = [];
  // Standard treads, except the topmost is widened to cover [(treadCount-1)*td, runLength]
  // so a walker stepping in from the upper floor lands on a tread regardless of where
  // exactly they step over the bbox edge.
  const td = stair.treadDepth;
  const topRun2DStart = (cfg.treadCount - 1) * td;
  const topRun2DEnd = Math.max(basis.runLength, cfg.treadCount * td);
  for (let i = 0; i < cfg.treadCount; i += 1) {
    const isTop = i === cfg.treadCount - 1;
    const runCenter = isTop
      ? basis.runFrom2D((topRun2DStart + topRun2DEnd) / 2)
      : basis.runCenterAt(i, td);
    const runSize = isTop ? topRun2DEnd - topRun2DStart : td;
    // Top tread sits 5mm below the slab bottom to avoid coplanar z-fighting
    // between its top face (= slab bottom) and the slab's underside, and to
    // make the slab read as an independent thickness band above the stair.
    const topTreadDrop = isTop ? Z_FIGHT_OFFSET : 0;
    treads.push(
      makeBoxAtCross({
        stair, basis,
        runCenter, runSize,
        crossCenter: basis.crossLength / 2,
        crossSize: basis.crossLength,
        cy: lowerStoreyTopY + (i + 0.5) * cfg.riserHeight - topTreadDrop,
        sy: cfg.riserHeight,
      }),
    );
  }
  return { treads, landings: [] };
}

function buildL(
  stair: Stair,
  lowerStoreyTopY: number,
  climb: number,
  slabThickness: number,
): StairGeometryDraft {
  const cfg = computeStairConfig(climb, slabThickness, stair.treadDepth);
  const basis = basisForEdge(stair);
  const lw = Math.min(stair.width, stair.depth) / 2;

  // Tread height invariant for L (and U):
  //   treadCount = nLow + 1 (landing) + nUp.
  //   Tread i (0-indexed) has top y = lowerStoreyTopY + (i+1)*riserHeight.
  //   After nLow lower treads, the player is at nLow*r; the landing sits one
  //   riser higher at (nLow+1)*r. The first upper-flight tread is at
  //   (nLow+2)*r and the last upper-flight tread (j = nUp-1) tops out at
  //   (nLow+1+nUp)*r = treadCount*r — exactly one riser below the upper
  //   floor, which the walker reaches via the existing vertical-snap logic.
  const nLow = Math.floor(cfg.treadCount / 2);
  const nUp = cfg.treadCount - nLow - 1;
  const turn = stair.turn ?? "right";

  // Lower flight + landing share the same cross half.
  // turn=right → lower on cross-low half ([0, LW])
  // turn=left  → lower on cross-high half ([crossLength-LW, crossLength])
  const lowerCrossOffset = turn === "right" ? 0 : basis.crossLength - lw;
  const lowerCrossCenter = lowerCrossOffset + lw / 2;

  const treads: StairBox[] = [];
  appendLowerFlight(treads, stair, basis, cfg, nLow, lowerStoreyTopY, lowerCrossCenter, lw);

  // Landing: square LW × LW at the lower flight's inner corner, one riser above tread nLow.
  const landingRunEnd = basis.runLength - nLow * stair.treadDepth;
  const landingRunCenter = landingRunEnd - lw / 2;
  const landingTopY = lowerStoreyTopY + (nLow + 1) * cfg.riserHeight;
  const landings: StairBox[] = [
    makeBoxAtCross({
      stair, basis,
      runCenter: landingRunCenter, runSize: lw,
      crossCenter: lowerCrossCenter, crossSize: lw,
      cy: landingTopY - cfg.riserHeight / 2, sy: cfg.riserHeight,
    }),
  ];

  // Upper flight: along cross axis from the landing's far cross edge into the opposite cross half.
  // turn=right → starts at cross=LW, extends toward +cross (centers at LW + (j+0.5)*td)
  // turn=left  → starts at cross=crossLength-LW, extends toward -cross (centers at (crossLength-LW) - (j+0.5)*td)
  for (let j = 0; j < nUp; j += 1) {
    const crossCenter = turn === "right"
      ? lw + (j + 0.5) * stair.treadDepth
      : (basis.crossLength - lw) - (j + 0.5) * stair.treadDepth;
    const isTop = j === nUp - 1;
    const cy =
      lowerStoreyTopY + (nLow + 1 + j + 0.5) * cfg.riserHeight - (isTop ? Z_FIGHT_OFFSET : 0);
    treads.push(
      makeBoxAtCross({
        stair, basis,
        runCenter: landingRunCenter, runSize: lw,
        crossCenter, crossSize: stair.treadDepth,
        cy, sy: cfg.riserHeight,
      }),
    );
  }

  return { treads, landings };
}

function buildU(
  stair: Stair,
  lowerStoreyTopY: number,
  climb: number,
  slabThickness: number,
): StairGeometryDraft {
  const cfg = computeStairConfig(climb, slabThickness, stair.treadDepth);
  const basis = basisForEdge(stair);
  const GAP = 0.05;
  const flightWidth = (basis.crossLength - GAP) / 2;

  // Same tread-height invariant as L (see buildL comment).
  const nLow = Math.floor(cfg.treadCount / 2);
  const nUp = cfg.treadCount - nLow - 1;

  const lowerCrossCenter = flightWidth / 2;
  const upperCrossCenter = basis.crossLength - flightWidth / 2;

  const treads: StairBox[] = [];
  appendLowerFlight(treads, stair, basis, cfg, nLow, lowerStoreyTopY, lowerCrossCenter, flightWidth);

  // Landing is the U-turn platform sitting BEYOND the flights: full crossLength wide,
  // ideally one flight deep so a person can walk across and turn 180°. Capped to the
  // remaining run space so it doesn't overflow the stair bbox; if there's no room left
  // (the stair is too shallow for U-shape) the landing collapses to zero and the user
  // sees flights with no platform — a hint to give the stair more depth.
  const landing2DRunStart = nLow * stair.treadDepth;
  const landingRunSize = Math.max(
    0,
    Math.min(flightWidth, basis.runLength - landing2DRunStart),
  );
  const landingTopY = lowerStoreyTopY + (nLow + 1) * cfg.riserHeight;
  const landings: StairBox[] =
    landingRunSize > 0
      ? [
          makeBoxAtCross({
            stair, basis,
            runCenter: basis.runFrom2D(landing2DRunStart + landingRunSize / 2),
            runSize: landingRunSize,
            crossCenter: basis.crossLength / 2, crossSize: basis.crossLength,
            cy: landingTopY - cfg.riserHeight / 2, sy: cfg.riserHeight,
          }),
        ]
      : [];

  // Upper flight runs parallel to the lower flight on the opposite cross half,
  // right-justified so its far edge meets the lower flight's far edge (run = nLow*td).
  // The TOPMOST tread (j = nUp-1) is widened to cover [0, 2*td] in 2D-run, extending
  // all the way to the bottomEdge of the bbox. That way a walker stepping in from the
  // upper floor (which is solid slab outside the bbox) lands on a tread instead of
  // free-falling through the open well.
  for (let j = 0; j < nUp; j += 1) {
    const isTop = j === nUp - 1;
    const runCenter = isTop
      ? basis.runFrom2D(stair.treadDepth) // center of [0, 2*td]
      : basis.runCenterAt(nLow - 1 - j, stair.treadDepth);
    const runSize = isTop ? 2 * stair.treadDepth : stair.treadDepth;
    const cy =
      lowerStoreyTopY + (nLow + 1 + j + 0.5) * cfg.riserHeight - (isTop ? Z_FIGHT_OFFSET : 0);
    treads.push(
      makeBoxAtCross({
        stair, basis,
        runCenter, runSize,
        crossCenter: upperCrossCenter, crossSize: flightWidth,
        cy, sy: cfg.riserHeight,
      }),
    );
  }

  return { treads, landings };
}

export function buildStairGeometry(
  stair: Stair,
  lowerZ: number,
  upperZ: number,
  slabThickness: number,
): StairGeometry {
  const climb = upperZ - lowerZ;
  let geom: StairGeometryDraft;
  switch (stair.shape) {
    case "straight":
      geom = buildStraight(stair, lowerZ, climb, slabThickness);
      break;
    case "l":
      geom = buildL(stair, lowerZ, climb, slabThickness);
      break;
    case "u":
      geom = buildU(stair, lowerZ, climb, slabThickness);
      break;
  }

  const angle = stair.rotation ?? 0;
  if (angle !== 0) {
    const worldCenter = { x: stair.x + stair.width / 2, y: stair.y + stair.depth / 2 };
    const applyRotation = (box: StairBox): StairBox => {
      const rotated = rotatePoint({ x: box.cx, y: box.cz }, worldCenter, angle);
      return { ...box, cx: rotated.x, cz: rotated.y, rotationY: angle };
    };
    geom = {
      treads: geom.treads.map(applyRotation),
      landings: geom.landings.map(applyRotation),
    };
  }

  return {
    stairId: stair.id,
    treads: geom.treads,
    landings: geom.landings,
    materialId: stair.materialId,
  };
}

// Map a stair-local (run, cross) point to world plan (x, y) using the bottomEdge.
function localToWorld(stair: Stair, run: number, cross: number): Point2 {
  switch (stair.bottomEdge) {
    case "+y": return { x: stair.x + cross, y: stair.y + stair.depth - run };
    case "-y": return { x: stair.x + cross, y: stair.y + run };
    case "+x": return { x: stair.x + stair.width - run, y: stair.y + cross };
    case "-x": return { x: stair.x + run, y: stair.y + cross };
  }
}

/**
 * Plan-space polygon (CCW in world plan) of the slab hole carved by this stair.
 * The whole stair well is open — slab hole = stair bbox. The stair's TOPMOST tread
 * is widened to cover the bbox edge on the exit side (see buildStraight/buildU)
 * so a walker stepping from the upper floor into the bbox lands on a tread, not
 * empty space.
 */
export function stairFootprintPolygon(stair: Stair, _climb: number): Point2[] {
  const runLength =
    stair.bottomEdge === "+y" || stair.bottomEdge === "-y" ? stair.depth : stair.width;
  const crossLength =
    stair.bottomEdge === "+y" || stair.bottomEdge === "-y" ? stair.width : stair.depth;

  const local: Array<{ run: number; cross: number }> = [
    { run: 0, cross: 0 },
    { run: runLength, cross: 0 },
    { run: runLength, cross: crossLength },
    { run: 0, cross: crossLength },
  ];

  const world = local.map((p) => localToWorld(stair, p.run, p.cross));
  const angle = stair.rotation ?? 0;
  const rotated =
    angle === 0
      ? world
      : (() => {
          const center = { x: stair.x + stair.width / 2, y: stair.y + stair.depth / 2 };
          return world.map((p) => rotatePoint(p, center, angle));
        })();
  // For "-y" and "+x" bottomEdges the local→world mapping flips orientation, so the
  // polygon ends up CW in world plan even though it was constructed CCW in stair-local.
  // Match the existing bbox-hole CCW convention by reversing when needed.
  let area = 0;
  for (let i = 0; i < rotated.length; i += 1) {
    const a = rotated[i];
    const b = rotated[(i + 1) % rotated.length];
    area += a.x * b.y - b.x * a.y;
  }
  if (area < 0) rotated.reverse();
  return rotated;
}
