import { computeStairConfig } from "../domain/stairs";
import type { Stair, Storey } from "../domain/types";

export type StairBox = {
  cx: number; cy: number; cz: number;  // world-space center
  sx: number; sy: number; sz: number;  // dimensions
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
function makeBoxAtCross(
  stair: Stair,
  basis: EdgeBasis,
  runCenter: number, runSize: number,
  crossCenter: number, crossSize: number,
  cy: number, sy: number,
): StairBox {
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

function buildStraight(stair: Stair, lowerStoreyTopY: number, climb: number): StairGeometry {
  const cfg = computeStairConfig(climb, stair.treadDepth);
  const basis = basisForEdge(stair);
  const treads: StairBox[] = [];
  for (let i = 0; i < cfg.treadCount; i += 1) {
    const runCenter = basis.runCenterAt(i, stair.treadDepth);
    // Tread i: top at (i+1)*r, center at (i+0.5)*r relative to lowerStoreyTopY.
    const cy = lowerStoreyTopY + (i + 0.5) * cfg.riserHeight;
    treads.push(
      makeBoxAtCross(
        stair, basis,
        runCenter, stair.treadDepth,
        basis.crossLength / 2, basis.crossLength,
        cy, cfg.riserHeight,
      ),
    );
  }
  return { treads, landings: [] };
}

export function buildStairGeometry(
  stair: Stair,
  storey: Storey,
  lowerStoreyTopY: number,
): StairGeometry {
  const climb = storey.elevation - lowerStoreyTopY;
  switch (stair.shape) {
    case "straight":
      return buildStraight(stair, lowerStoreyTopY, climb);
    case "l":
    case "u":
      // Implemented in T7 / T8.
      return { treads: [], landings: [] };
  }
}
