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
};

export type VerticalState = {
  cameraY: number;
  vy: number;
};

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
): VerticalState | "respawn" {
  const feetY = state.cameraY - config.eyeHeight;
  const origin: Vec3 = { x: cameraXZ.x, y: feetY + 0.01, z: cameraXZ.z };
  const surfaceY = probe(origin, config.maxRayLength);

  if (surfaceY === null) {
    return "respawn";
  }

  const drop = feetY - surfaceY;
  if (drop <= config.snapThreshold) {
    return { cameraY: surfaceY + config.eyeHeight, vy: 0 };
  }

  // Free fall
  const newVy = state.vy + config.gravity * dt;
  const newCameraY = state.cameraY + newVy * dt;
  return { cameraY: newCameraY, vy: newVy };
}
