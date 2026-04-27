import { computeStairConfig, rotatePoint } from "../domain/stairs";
import type { StairConfig } from "../domain/stairs";
import type { Stair, Storey } from "../domain/types";

export type StairBox = {
  cx: number; cy: number; cz: number;  // world-space center
  sx: number; sy: number; sz: number;  // dimensions
  /** Rotation around world Y axis at the box's own center (radians). Matches stair.rotation. */
  rotationY?: number;
};

export type StairGeometry = {
  treads: StairBox[];
  landings: StairBox[];
};

type Axis = "x" | "z";

type EdgeBasis = {
  runAxis: Axis;        // axis the climb runs along (in world space)
  runLength: number;    // total length along the run axis = stair's footprint extent on that axis
  crossAxis: Axis;      // perpendicular horizontal axis
  crossLength: number;  // stair's footprint extent on the cross axis
  // Returns the run-axis center (in stair-local coords, 0..runLength) for the i-th tread
  runCenterAt: (i: number, treadDepth: number) => number;
};

function basisForEdge(stair: Stair): EdgeBasis {
  switch (stair.bottomEdge) {
    case "+y": return {
      runAxis: "z", runLength: stair.depth,
      crossAxis: "x", crossLength: stair.width,
      runCenterAt: (i, td) => stair.depth - (i + 0.5) * td,
    };
    case "-y": return {
      runAxis: "z", runLength: stair.depth,
      crossAxis: "x", crossLength: stair.width,
      runCenterAt: (i, td) => (i + 0.5) * td,
    };
    case "+x": return {
      runAxis: "x", runLength: stair.width,
      crossAxis: "z", crossLength: stair.depth,
      runCenterAt: (i, td) => stair.width - (i + 0.5) * td,
    };
    case "-x": return {
      runAxis: "x", runLength: stair.width,
      crossAxis: "z", crossLength: stair.depth,
      runCenterAt: (i, td) => (i + 0.5) * td,
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

function buildStraight(stair: Stair, lowerStoreyTopY: number, climb: number): StairGeometry {
  const cfg = computeStairConfig(climb, stair.treadDepth);
  const basis = basisForEdge(stair);
  const treads: StairBox[] = [];
  appendLowerFlight(treads, stair, basis, cfg, cfg.treadCount, lowerStoreyTopY, basis.crossLength / 2, basis.crossLength);
  return { treads, landings: [] };
}

function buildL(
  stair: Stair,
  lowerStoreyTopY: number,
  climb: number,
): StairGeometry {
  const cfg = computeStairConfig(climb, stair.treadDepth);
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
    const cy = lowerStoreyTopY + (nLow + 1 + j + 0.5) * cfg.riserHeight;
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

function buildU(stair: Stair, lowerStoreyTopY: number, climb: number): StairGeometry {
  const cfg = computeStairConfig(climb, stair.treadDepth);
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

  // Landing: one tread-depth deep at far end of run axis, full crossLength wide.
  const landingRunSize = stair.treadDepth;
  const landingRunCenter = basis.runLength - nLow * stair.treadDepth - landingRunSize / 2;
  const landingTopY = lowerStoreyTopY + (nLow + 1) * cfg.riserHeight;
  const landings: StairBox[] = [
    makeBoxAtCross({
      stair, basis,
      runCenter: landingRunCenter, runSize: landingRunSize,
      crossCenter: basis.crossLength / 2, crossSize: basis.crossLength,
      cy: landingTopY - cfg.riserHeight / 2, sy: cfg.riserHeight,
    }),
  ];

  // Upper flight: from landing's near edge stepping toward bottomEdge.
  const landingNearRun = basis.runLength - nLow * stair.treadDepth - landingRunSize;
  for (let j = 0; j < nUp; j += 1) {
    const runCenter = landingNearRun - (j + 0.5) * stair.treadDepth;
    const cy = lowerStoreyTopY + (nLow + 1 + j + 0.5) * cfg.riserHeight;
    treads.push(
      makeBoxAtCross({
        stair, basis,
        runCenter, runSize: stair.treadDepth,
        crossCenter: upperCrossCenter, crossSize: flightWidth,
        cy, sy: cfg.riserHeight,
      }),
    );
  }

  return { treads, landings };
}

export function buildStairGeometry(
  stair: Stair,
  storey: Storey,
  lowerStoreyTopY: number,
): StairGeometry {
  const climb = storey.elevation - lowerStoreyTopY;
  let geom: StairGeometry;
  switch (stair.shape) {
    case "straight":
      geom = buildStraight(stair, lowerStoreyTopY, climb);
      break;
    case "l":
      geom = buildL(stair, lowerStoreyTopY, climb);
      break;
    case "u":
      geom = buildU(stair, lowerStoreyTopY, climb);
      break;
  }

  const angle = stair.rotation ?? 0;
  if (angle !== 0) {
    // Plan-space center maps directly to world (cx, cz): plan-x → world-x, plan-y → world-z.
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

  return geom;
}
