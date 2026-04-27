import { describe, expect, it } from "vitest";
import {
  resolveHorizontalCollision,
  resolveVerticalState,
  type HorizontalProbe,
  type VerticalProbe,
} from "../rendering/walkPhysics";
import { computeStairConfig } from "../domain/stairs";

type AABB = { min: [number, number, number]; max: [number, number, number] };

function rayAabb(
  origin: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  maxDistance: number,
  box: AABB,
): number | null {
  let tmin = 0;
  let tmax = maxDistance;
  const o = [origin.x, origin.y, origin.z];
  const d = [dir.x, dir.y, dir.z];
  for (let axis = 0; axis < 3; axis += 1) {
    const lo = box.min[axis];
    const hi = box.max[axis];
    if (Math.abs(d[axis]) < 1e-9) {
      if (o[axis] < lo || o[axis] > hi) return null;
    } else {
      let t1 = (lo - o[axis]) / d[axis];
      let t2 = (hi - o[axis]) / d[axis];
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  return tmin >= 0 ? tmin : null;
}

describe("resolveHorizontalCollision", () => {
  const radius = 0.3;

  it("passes desired move through unchanged when no walls block", () => {
    const probe: HorizontalProbe = () => null;
    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: 0 },
      radius,
      probe,
    );
    expect(out).toEqual({ x: 0.5, z: 0 });
  });

  it("clamps motion along the +x axis when a wall is in the way", () => {
    // Wall hit at distance 0.4 along +x; allowed move = 0.4 - radius = 0.1.
    const probe: HorizontalProbe = (origin, dir) =>
      dir.x > 0.5 ? 0.4 : null;

    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: 0 },
      radius,
      probe,
    );
    expect(out.x).toBeCloseTo(0.1, 4);
    expect(out.z).toBe(0);
  });

  it("slides along walls: +x blocked still allows -z motion", () => {
    const probe: HorizontalProbe = (origin, dir) =>
      dir.x > 0.5 ? 0.4 : null;

    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: -0.6 },
      radius,
      probe,
    );
    expect(out.x).toBeCloseTo(0.1, 4);
    expect(out.z).toBeCloseTo(-0.6, 4);
  });

  it("never lets motion go below zero distance from a wall", () => {
    // Wall already inside the radius (e.g. starting position is touching).
    const probe: HorizontalProbe = (origin, dir) =>
      dir.x > 0.5 ? 0.1 : null;

    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: 0 },
      radius,
      probe,
    );
    expect(out.x).toBeCloseTo(0, 4);
  });

  it("returns zero motion when desired is zero", () => {
    const probe: HorizontalProbe = () => null;
    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0, z: 0 },
      radius,
      probe,
    );
    expect(out).toEqual({ x: 0, z: 0 });
  });
});

describe("resolveVerticalState", () => {
  const config = {
    eyeHeight: 1.6,
    snapThreshold: 0.2,
    gravity: -9.8,
    maxRayLength: 5,
  } as const;

  it("snaps the camera to the surface when the player is grounded", () => {
    const probe: VerticalProbe = () => 0; // surface at y=0

    const next = resolveVerticalState(
      { cameraY: 1.6 + 0.05, vy: 0 },
      { x: 0, z: 0 },
      0.016,
      config,
      probe,
    );

    expect(next).not.toBe("respawn");
    if (next === "respawn") return;
    expect(next.cameraY).toBeCloseTo(1.6, 4);
    expect(next.vy).toBe(0);
  });

  it("snaps up small steps within the snap threshold", () => {
    const probe: VerticalProbe = () => 0.15; // tread 15cm above last footing

    const next = resolveVerticalState(
      { cameraY: 1.6, vy: 0 },
      { x: 0, z: 0 },
      0.016,
      config,
      probe,
    );

    if (next === "respawn") throw new Error("expected snap");
    expect(next.cameraY).toBeCloseTo(0.15 + 1.6, 4);
    expect(next.vy).toBe(0);
  });

  it("falls under gravity when the surface is far below", () => {
    const probe: VerticalProbe = () => -3.0; // 3m drop

    const next = resolveVerticalState(
      { cameraY: 1.6, vy: 0 },
      { x: 0, z: 0 },
      0.1,
      config,
      probe,
    );

    if (next === "respawn") throw new Error("expected falling");
    // After 0.1s of -9.8 m/s² gravity, vy = -0.98 and cameraY ≈ 1.6 + (-0.98)*0.1 = 1.502
    expect(next.vy).toBeCloseTo(-0.98, 3);
    expect(next.cameraY).toBeCloseTo(1.502, 3);
  });

  it("returns 'respawn' when the probe finds no surface within range", () => {
    const probe: VerticalProbe = () => null;

    const next = resolveVerticalState(
      { cameraY: 1.6, vy: 0 },
      { x: 0, z: 0 },
      0.016,
      config,
      probe,
    );
    expect(next).toBe("respawn");
  });
});

describe("walkPhysics — straight stair ascent", () => {
  it("camera y reaches upper floor when walking forward up steps", () => {
    const climb = 3.2;
    const treadDepth = 0.27;
    const cfg = computeStairConfig(climb, treadDepth);
    const width = 1.2;

    // Stair geometry: treads stepping in -Z direction starting at z=5.0
    // Tread i (i=0..treadCount-1): cz = 5.0 - (i+0.5)*0.27, top y = (i+1)*r
    const treadBoxes: AABB[] = [];
    for (let i = 0; i < cfg.treadCount; i += 1) {
      const cz = 5.0 - (i + 0.5) * treadDepth;
      const topY = (i + 1) * cfg.riserHeight;
      treadBoxes.push({
        min: [0, i * cfg.riserHeight, cz - treadDepth / 2],
        max: [width, topY, cz + treadDepth / 2],
      });
    }
    // Lower floor: at y=0, extends in +Z beyond stair start (z >= 5.0 means lower floor area)
    const lowerFloor: AABB = {
      min: [-5, -0.18, 5.0],
      max: [width + 5, 0, 12],
    };
    // Upper floor: top surface at y=climb (slab extends downward by 0.18, matching lower floor convention)
    const stairEndZ = 5.0 - cfg.treadCount * treadDepth;
    const upperFloor: AABB = {
      min: [-5, climb - 0.18, -5],
      max: [width + 5, climb, stairEndZ],
    };
    const all = [...treadBoxes, lowerFloor, upperFloor];

    const horizontalProbe: HorizontalProbe = (origin, direction, maxDistance) => {
      let best: number | null = null;
      for (const box of all) {
        const t = rayAabb(
          origin,
          { x: direction.x, y: 0, z: direction.z },
          maxDistance,
          box,
        );
        if (t !== null && (best === null || t < best)) best = t;
      }
      return best;
    };
    const verticalProbe: VerticalProbe = (origin, maxDistance) => {
      let bestY: number | null = null;
      for (const box of all) {
        const t = rayAabb(origin, { x: 0, y: -1, z: 0 }, maxDistance, box);
        if (t !== null) {
          const y = origin.y - t;
          if (bestY === null || y > bestY) bestY = y;
        }
      }
      return bestY;
    };

    const EYE_HEIGHT = 1.6;
    const SNAP_THRESHOLD = 0.2;
    const PLAYER_RADIUS = 0.3;
    const config = {
      eyeHeight: EYE_HEIGHT,
      snapThreshold: SNAP_THRESHOLD,
      gravity: -9.8,
      maxRayLength: 5,
    };

    // Start: standing on lower floor at z=6 (just before stair), facing -Z
    let pos = { x: width / 2, y: EYE_HEIGHT, z: 6.0 };
    let vy = 0;
    const ys: number[] = [pos.y];
    const dt = 1 / 60;
    const speed = 1.4;

    for (let frame = 0; frame < 600; frame += 1) {
      // Walk in -Z direction
      const desired = { x: 0, z: -speed * dt };
      const adjusted = resolveHorizontalCollision(
        pos,
        desired,
        PLAYER_RADIUS,
        horizontalProbe,
      );
      pos.x += adjusted.x;
      pos.z += adjusted.z;

      const next = resolveVerticalState(
        { cameraY: pos.y, vy },
        { x: pos.x, z: pos.z },
        dt,
        config,
        verticalProbe,
      );
      if (next === "respawn") {
        throw new Error(
          `fell off stair at frame ${frame}, pos=${JSON.stringify(pos)}`,
        );
      }
      pos.y = next.cameraY;
      vy = next.vy;
      ys.push(pos.y);

      // Once past stair end into upper floor area, stop
      if (pos.z < stairEndZ - 0.5) break;
    }

    // Final position should be on upper floor
    expect(pos.y).toBeCloseTo(climb + EYE_HEIGHT, 1);

    // Check mostly-monotonic increase: allow per-frame jitter up to 1cm
    // (snap behavior produces a step-shaped curve, but should never drop)
    let drops = 0;
    for (let i = 1; i < ys.length; i += 1) {
      if (ys[i] < ys[i - 1] - 0.01) drops += 1;
    }
    expect(drops).toBe(0);
  });
});
