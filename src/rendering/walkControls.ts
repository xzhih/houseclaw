import * as THREE from "three";
import {
  resolveHorizontalCollision,
  resolveVerticalState,
  type HorizontalProbe,
  type VerticalProbe,
} from "./walkPhysics";

const EYE_HEIGHT = 1.6;
const CHEST_OFFSET_BELOW_EYE = 0.6;
const PLAYER_RADIUS = 0.3;
const FOV_DEGREES = 80;
const WALK_SPEED = 1.4;
const RUN_SPEED = 2.8;
const GRAVITY = -9.8;
const SNAP_THRESHOLD = 0.2;
// Down-ray spans the whole house plus margin so falling from a rooftop lands on
// the ground instead of triggering a respawn (formerly 5m, which respawned the
// player whenever they were >5m above any geometry).
const MAX_DOWN_RAY = 50;
// Vertical lerp speed when snapping onto a new surface. Higher = stairs feel
// more like a smooth ramp than a sequence of micro-pops.
const STEP_RATE = 8;
// Initial upward velocity on jump. ~1m apex over ~0.45s — enough to step over
// thresholds but not pop above doorways.
const JUMP_VELOCITY = 4.5;
const MOUSE_SENSITIVITY = 0.0025;
const PITCH_LIMIT = THREE.MathUtils.degToRad(85);

export type WalkSpawn = {
  x: number;
  z: number;
  y: number;
  yaw: number;
  pitch: number;
};

export type WalkCallbacks = {
  onWalkExit: () => void;             // fired when pointer-lock is released (Esc)
  onDigitKey: (digit: number) => void; // 1, 2, 3 — used to switch storeys without leaving lock
  onCameraMove?: (cameraY: number) => void;
};

export type WalkControls = {
  enable(spawn: WalkSpawn): void;
  disable(): void;
  setSpawn(spawn: WalkSpawn): void;
  /** Teleport the camera to a new position while preserving yaw/pitch. Used
   * for explicit floor switches so the user keeps their look direction. */
  teleportTo(position: { x: number; y: number; z: number }): void;
  getYaw(): number;
  getPosition(): { x: number; z: number };
  dispose(): void;
};

export function attachWalkControls(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  scene: THREE.Scene,
  collidables: THREE.Object3D[],
  callbacks: WalkCallbacks,
): WalkControls {
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();

  const keys = new Set<string>();
  let yaw = 0;
  let pitch = 0;
  let vy = 0;
  let grounded = false;
  let enabled = false;
  let respawnPosition: WalkSpawn = { x: 0, y: EYE_HEIGHT, z: 0, yaw: 0, pitch: 0 };
  let rafId = 0;
  let lastTimestamp = 0;
  let savedFov = camera.fov;

  const horizontalProbe: HorizontalProbe = (origin, direction, maxDistance) => {
    const dirVec = new THREE.Vector3(direction.x, 0, direction.z).normalize();
    raycaster.set(
      new THREE.Vector3(origin.x, origin.y - CHEST_OFFSET_BELOW_EYE, origin.z),
      dirVec,
    );
    raycaster.near = 0;
    raycaster.far = maxDistance;
    const hits = raycaster.intersectObjects(collidables, false);
    if (hits.length === 0) return null;
    return hits[0].distance;
  };

  const verticalProbe: VerticalProbe = (origin, maxDistance) => {
    raycaster.set(
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(0, -1, 0),
    );
    raycaster.near = 0;
    raycaster.far = maxDistance;
    const hits = raycaster.intersectObjects(collidables, false);
    if (hits.length === 0) return null;
    return hits[0].point.y;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!enabled) return;
    if (event.key === "Escape") {
      // Browser will release pointer-lock; pointerlockchange handler triggers disable + onWalkExit.
      return;
    }
    if (event.key === "1" || event.key === "2" || event.key === "3") {
      callbacks.onDigitKey(Number(event.key));
      return;
    }
    if (event.code === "Space" || event.key === " ") {
      // Block default scroll; jump only when grounded so you can't double-jump.
      event.preventDefault();
      if (grounded) {
        vy = JUMP_VELOCITY;
        grounded = false;
      }
      return;
    }
    keys.add(event.key.toLowerCase());
  };

  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.key.toLowerCase());
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!enabled || document.pointerLockElement !== canvas) return;
    yaw -= event.movementX * MOUSE_SENSITIVITY;
    pitch -= event.movementY * MOUSE_SENSITIVITY;
    pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  };

  const onPointerLockChangeNative = () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked && enabled) {
      // User pressed Esc → fully disable, notify Preview3D so it flips back to orbit.
      disable();
      callbacks.onWalkExit();
    }
  };

  const tick = (timestamp: number) => {
    if (!enabled) return;
    const dt = lastTimestamp ? Math.min(0.05, (timestamp - lastTimestamp) / 1000) : 0.016;
    lastTimestamp = timestamp;

    // 1. Build desired horizontal move
    const speed = keys.has("shift") ? RUN_SPEED : WALK_SPEED;
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const rightX = forwardZ;
    const rightZ = -forwardX;
    let intentForward = 0;
    let intentRight = 0;
    if (keys.has("w") || keys.has("arrowup")) intentForward -= 1;
    if (keys.has("s") || keys.has("arrowdown")) intentForward += 1;
    if (keys.has("d") || keys.has("arrowright")) intentRight += 1;
    if (keys.has("a") || keys.has("arrowleft")) intentRight -= 1;
    const desiredX = (forwardX * intentForward + rightX * intentRight) * speed * dt;
    const desiredZ = (forwardZ * intentForward + rightZ * intentRight) * speed * dt;

    // 2. Horizontal collision
    const adjusted = resolveHorizontalCollision(
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      { x: desiredX, z: desiredZ },
      PLAYER_RADIUS,
      horizontalProbe,
    );
    camera.position.x += adjusted.x;
    camera.position.z += adjusted.z;

    // 3. Vertical
    const verticalNext = resolveVerticalState(
      { cameraY: camera.position.y, vy },
      { x: camera.position.x, z: camera.position.z },
      dt,
      {
        eyeHeight: EYE_HEIGHT,
        snapThreshold: SNAP_THRESHOLD,
        gravity: GRAVITY,
        maxRayLength: MAX_DOWN_RAY,
        stepRate: STEP_RATE,
      },
      verticalProbe,
    );

    if (verticalNext === "respawn") {
      camera.position.set(respawnPosition.x, respawnPosition.y, respawnPosition.z);
      vy = 0;
      grounded = false;
    } else {
      camera.position.y = verticalNext.cameraY;
      vy = verticalNext.vy;
      grounded = verticalNext.grounded;
    }

    // 4. Apply look
    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch, yaw, 0);

    callbacks.onCameraMove?.(camera.position.y);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  };

  const enable = (spawn: WalkSpawn) => {
    if (enabled) return;
    enabled = true;
    respawnPosition = { ...spawn };
    setSpawn(spawn);
    savedFov = camera.fov;
    camera.fov = FOV_DEGREES;
    camera.updateProjectionMatrix();
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("pointerlockchange", onPointerLockChangeNative);
    canvas.requestPointerLock?.();
    lastTimestamp = 0;
    rafId = requestAnimationFrame(tick);
  };

  const disable = () => {
    if (!enabled) return;
    enabled = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("pointerlockchange", onPointerLockChangeNative);
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock?.();
    }
    keys.clear();
    camera.fov = savedFov;
    camera.updateProjectionMatrix();
  };

  const setSpawn = (spawn: WalkSpawn) => {
    camera.position.set(spawn.x, spawn.y, spawn.z);
    yaw = spawn.yaw;
    pitch = spawn.pitch;
    vy = 0;
    grounded = false;
    respawnPosition = { ...spawn };
  };

  const teleportTo = (position: { x: number; y: number; z: number }) => {
    camera.position.set(position.x, position.y, position.z);
    vy = 0;
    grounded = false;
    respawnPosition = { x: position.x, y: position.y, z: position.z, yaw, pitch };
  };

  return {
    enable,
    disable,
    setSpawn,
    teleportTo,
    getYaw: () => yaw,
    getPosition: () => ({ x: camera.position.x, z: camera.position.z }),
    dispose: () => {
      disable();
    },
  };
}
