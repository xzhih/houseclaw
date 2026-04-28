export type Vec3 = { x: number; y: number; z: number };
export type Vec2XZ = { x: number; z: number };

export type HorizontalProbe = (
  origin: Vec3,
  direction: { x: number; z: number },
  maxDistance: number,
) => number | null;

export type VerticalProbe = (
  origin: Vec3,
  maxDistance: number,
) => number | null;

export type WalkConfig = {
  eyeHeight: number;
  snapThreshold: number;
  gravity: number;
  maxRayLength: number;
  /** Max vertical speed (m/s) when snapping toward a new ground surface. Lerping
   * to the snap target instead of teleporting smooths out per-riser step-ups so
   * climbing stairs reads as continuous motion. */
  stepRate: number;
};

export type VerticalState = {
  cameraY: number;
  vy: number;
};

/** Result of a vertical resolve. `grounded` is true when the player is on a
 * walkable surface (snap branch); used by walkControls to gate jump input. */
export type VerticalResult = VerticalState & { grounded: boolean };

export type Bounds2D = { minX: number; maxX: number; minZ: number; maxZ: number };

/** When the player explicitly switches floors, keep them at their current XZ if
 * they're inside the building footprint; otherwise fall back to the building
 * center. Avoids losing your spot when peeking at another floor. */
export function pickFloorSwitchXZ(current: Vec2XZ, bounds: Bounds2D): Vec2XZ {
  const insideX = current.x >= bounds.minX && current.x <= bounds.maxX;
  const insideZ = current.z >= bounds.minZ && current.z <= bounds.maxZ;
  if (insideX && insideZ) return current;
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
}

export function resolveHorizontalCollision(
  position: Vec3,
  desiredMove: Vec2XZ,
  radius: number,
  probe: HorizontalProbe,
): Vec2XZ {
  let dx = desiredMove.x;
  let dz = desiredMove.z;

  // X axis
  if (dx !== 0) {
    const dirX = dx > 0 ? 1 : -1;
    const queryDir = { x: dirX, z: 0 };
    const max = Math.abs(dx) + radius;
    const hit = probe(position, queryDir, max);
    if (hit !== null) {
      const allowed = Math.max(0, hit - radius);
      dx = dirX * Math.min(Math.abs(dx), allowed);
    }
  }

  // Z axis (independent — sliding falls out for free)
  if (dz !== 0) {
    const dirZ = dz > 0 ? 1 : -1;
    const queryDir = { x: 0, z: dirZ };
    const max = Math.abs(dz) + radius;
    const hit = probe(position, queryDir, max);
    if (hit !== null) {
      const allowed = Math.max(0, hit - radius);
      dz = dirZ * Math.min(Math.abs(dz), allowed);
    }
  }

  return { x: dx, z: dz };
}

export function resolveVerticalState(
  state: VerticalState,
  cameraXZ: Vec2XZ,
  dt: number,
  config: WalkConfig,
  probe: VerticalProbe,
): VerticalResult | "respawn" {
  const feetY = state.cameraY - config.eyeHeight;
  const origin: Vec3 = { x: cameraXZ.x, y: feetY + config.snapThreshold, z: cameraXZ.z };
  const surfaceY = probe(origin, config.maxRayLength);

  if (surfaceY === null) {
    return "respawn";
  }

  const drop = feetY - surfaceY;
  // Snap only when the player isn't actively rising. A positive vy means a jump
  // impulse is in flight; snapping would cancel it on the very next frame.
  if (state.vy <= 0 && drop <= config.snapThreshold) {
    // Lerp camera Y toward the snap target at a fixed rate (m/s) instead of
    // teleporting. Each riser becomes a few-frame smooth ramp, eliminating the
    // jarring per-step jumps when climbing stairs.
    const targetCameraY = surfaceY + config.eyeHeight;
    const maxDelta = config.stepRate * dt;
    const delta = targetCameraY - state.cameraY;
    const newCameraY =
      Math.abs(delta) <= maxDelta
        ? targetCameraY
        : state.cameraY + Math.sign(delta) * maxDelta;
    return { cameraY: newCameraY, vy: 0, grounded: true };
  }

  // Free fall (or jump rise: positive vy decays under gravity until apex)
  const newVy = state.vy + config.gravity * dt;
  const newCameraY = state.cameraY + newVy * dt;
  return { cameraY: newCameraY, vy: newVy, grounded: false };
}
