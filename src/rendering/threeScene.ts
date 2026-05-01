import * as THREE from "three";
import type { HouseProject, Wall } from "../domain/types";
import { buildSceneGeometry } from "../geometry/houseGeometry";
import { slicePanelFootprint } from "../geometry/wallNetwork";
import type {
  BalconyGeometry,
  HouseGeometry,
  SlabGeometry,
  WallGeometry,
  WallPanel,
} from "../geometry/types";
import { attachWalkControls, type WalkCallbacks, type WalkSpawn } from "./walkControls";

function wallLength(wall: Wall): number {
  return Number(Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y).toFixed(4));
}
import { pickFloorSwitchXZ } from "./walkPhysics";

export type CameraMode = "orbit" | "walk";

export type LightingParams = {
  exposure: number;
  hemiIntensity: number;
  keyIntensity: number;
  fillIntensity: number;
  /**
   * Compass azimuth in degrees, anchored to the user's plan view (top of plan = north).
   * 0 = north, 90 = east, 180 = south, 270 = west. The plan→scene mapping
   * (see planYToSceneZ) decides how this lands in 3D, so the conversion lives in
   * sunOffsetFrom — never read +Z/-Z directly from this value.
   */
  sunAzimuthDeg: number;
  /** 0 = horizon, 90 = zenith */
  sunAltitudeDeg: number;
};

export const DEFAULT_LIGHTING: LightingParams = {
  exposure: 1.0,
  hemiIntensity: 0.7,
  keyIntensity: 1.5,
  fillIntensity: 0.6,
  sunAzimuthDeg: 160,
  sunAltitudeDeg: 36,
};

export type MountedSceneOptions = {
  onWalkExit?: () => void;
  onDigitKey?: (digit: number) => void;
  onCameraMove?: (cameraY: number) => void;
  lighting?: LightingParams;
};

export type MountedScene = {
  setCameraMode(mode: CameraMode): void;
  /** Explicit floor switch — teleports the player to the requested storey,
   * preserving XZ when they're inside the building footprint and their
   * current view direction. Distinct from the passive HUD update driven by
   * onCameraMove (walking up stairs must NOT teleport). */
  teleportToStorey(storeyId: string): void;
  setLighting(params: LightingParams): void;
  dispose(): void;
};

function sunOffsetFrom(azimuthDeg: number, altitudeDeg: number, distance: number): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const alt = THREE.MathUtils.degToRad(altitudeDeg);
  const horizontal = distance * Math.cos(alt);
  // Compass → 3D conversion. The user's mental compass is anchored to the plan
  // view (top of plan = north); the scene maps plan +y to -z via planYToSceneZ,
  // so compass-north ends up at world -z. Hence the negation on the cos term —
  // without it, lighting would track the building's mirror, not the user's compass.
  return new THREE.Vector3(
    Math.sin(az) * horizontal,
    distance * Math.sin(alt),
    -Math.cos(az) * horizontal,
  );
}

type SceneBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
};

const FALLBACK_WALL_COLOR = "#dedbd2";
const GROUND_COLOR = "#a3a8a4";
const BACKGROUND_COLOR = "#d9e1e4";

function requireWebGL() {
  if (!("WebGLRenderingContext" in globalThis)) {
    throw new Error("WebGL is not available in this environment.");
  }
}

function createRenderer(container: HTMLElement) {
  requireWebGL();

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const rect = container.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || container.clientWidth || 960));
  const height = Math.max(360, Math.floor(rect.height || container.clientHeight || 520));

  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
  renderer.setClearColor(BACKGROUND_COLOR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute("aria-hidden", "true");

  return { renderer, width, height };
}

// 3D scene maps the plan-view Y axis to -Z so the front facade (smallest plan Y)
// ends up on the +Z side. With the standard "looking down -Z" camera, that puts
// world +X on screen-right, matching the elevation projections (no left/right mirror).
const planYToSceneZ = (y: number) => -y;

function projectBounds(project: HouseProject): SceneBounds {
  const wallBounds = project.walls.reduce<SceneBounds>(
    (current, wall) => ({
      minX: Math.min(current.minX, wall.start.x, wall.end.x),
      maxX: Math.max(current.maxX, wall.start.x, wall.end.x),
      minZ: Math.min(current.minZ, planYToSceneZ(wall.start.y), planYToSceneZ(wall.end.y)),
      maxZ: Math.max(current.maxZ, planYToSceneZ(wall.start.y), planYToSceneZ(wall.end.y)),
      maxY: Math.max(current.maxY, 0), // refined below after geometry is built
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
      maxY: 0,
    },
  );

  if (![wallBounds.minX, wallBounds.maxX, wallBounds.minZ, wallBounds.maxZ].every(Number.isFinite)) {
    const defaultH = project.storeys.length > 0
      ? Math.max(...project.storeys.map((s) => s.elevation)) + 3.0
      : 3.0;
    return { minX: -4, maxX: 4, minZ: -4, maxZ: 4, maxY: defaultH };
  }

  return project.balconies.reduce((current, balcony) => {
    const wall = project.walls.find((candidate) => candidate.id === balcony.attachedWallId);
    if (!wall) return current;

    const len = wallLength(wall);
    if (len <= 0) return current;

    const directionX = (wall.end.x - wall.start.x) / len;
    const directionZ = (planYToSceneZ(wall.end.y) - planYToSceneZ(wall.start.y)) / len;
    const normalX = -directionZ;
    const normalZ = directionX;
    const startX = wall.start.x + directionX * balcony.offset + normalX * balcony.depth;
    const startZ = planYToSceneZ(wall.start.y) + directionZ * balcony.offset + normalZ * balcony.depth;
    const endX = wall.start.x + directionX * (balcony.offset + balcony.width) + normalX * balcony.depth;
    const endZ = planYToSceneZ(wall.start.y) + directionZ * (balcony.offset + balcony.width) + normalZ * balcony.depth;

    return {
      minX: Math.min(current.minX, startX, endX),
      maxX: Math.max(current.maxX, startX, endX),
      minZ: Math.min(current.minZ, startZ, endZ),
      maxZ: Math.max(current.maxZ, startZ, endZ),
      maxY: current.maxY,
    };
  }, wallBounds);
}

function refineBoundsMaxY(bounds: SceneBounds, geometry: HouseGeometry, project: HouseProject): SceneBounds {
  let maxY = bounds.maxY;
  for (const wall of geometry.walls) {
    maxY = Math.max(maxY, wall.topZ);
  }
  for (const slab of geometry.slabs) {
    maxY = Math.max(maxY, slab.topZ);
  }
  for (const roof of geometry.roofs) {
    for (const panel of roof.panels) {
      for (const v of panel.vertices) maxY = Math.max(maxY, v.z);
    }
  }
  // Storeys above all geometry should still be in frame, so the camera
  // doesn't crop empty levels the user just added.
  for (const storey of project.storeys) {
    maxY = Math.max(maxY, storey.elevation);
  }
  return { ...bounds, maxY };
}

function createCamera(bounds: SceneBounds, aspect: number) {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const span = Math.max(width, depth, bounds.maxY, 1);
  const radius = Math.sqrt(width ** 2 + depth ** 2 + bounds.maxY ** 2) / 2;
  const verticalFov = THREE.MathUtils.degToRad(42);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * aspect);
  const fitFov = Math.min(verticalFov, horizontalFov);
  const distance = Math.max(span, radius / Math.sin(fitFov / 2)) * 1.18;
  const center = new THREE.Vector3(
    (bounds.minX + bounds.maxX) / 2,
    bounds.maxY / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  );
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, Math.max(span * 12, distance * 2));
  // +Z side of the (flipped) scene = the front facade. Standard "looking down -Z"
  // camera then renders world +X on screen-right, matching elevation projections.
  const direction = new THREE.Vector3(0.85, 0.62, 1).normalize();

  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);

  return { camera, center, distance };
}

type OrbitControls = {
  dispose: () => void;
};

function attachOrbitControls(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
  scene: THREE.Scene,
  center: THREE.Vector3,
  initialDistance: number,
  container: HTMLElement,
): OrbitControls {
  const canvas = renderer.domElement;
  const offset = new THREE.Vector3().subVectors(camera.position, center);
  let distance = offset.length();
  let yaw = Math.atan2(offset.x, offset.z);
  let pitch = Math.asin(Math.max(-1, Math.min(1, offset.y / distance)));

  let targetYaw = yaw;
  let targetPitch = pitch;
  let targetDistance = distance;
  let velYaw = 0;
  let velPitch = 0;

  const minPitch = THREE.MathUtils.degToRad(-10);
  const maxPitch = THREE.MathUtils.degToRad(82);
  const minDistance = Math.max(initialDistance * 0.35, 1.2);
  const maxDistance = initialDistance * 4.5;
  const damping = 0.16;
  const friction = 0.9;
  const sensitivity = 0.0055;

  let dragging = false;
  let activePointerId: number | null = null;
  let lastX = 0;
  let lastY = 0;

  const onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragging = true;
    activePointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);
    lastX = event.clientX;
    lastY = event.clientY;
    velYaw = 0;
    velPitch = 0;
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging || event.pointerId !== activePointerId) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    const dyaw = -dx * sensitivity;
    const dpitch = dy * sensitivity;
    targetYaw += dyaw;
    targetPitch = Math.max(minPitch, Math.min(maxPitch, targetPitch + dpitch));
    velYaw = dyaw;
    velPitch = dpitch;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== activePointerId) return;
    dragging = false;
    activePointerId = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const onWheel = (event: WheelEvent) => {
    event.preventDefault();
    const factor = Math.exp(event.deltaY * 0.0012);
    targetDistance = Math.max(minDistance, Math.min(maxDistance, targetDistance * factor));
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.style.touchAction = "none";
  canvas.style.cursor = "grab";

  let rafId = 0;
  const tick = () => {
    if (!dragging && (Math.abs(velYaw) > 1e-5 || Math.abs(velPitch) > 1e-5)) {
      targetYaw += velYaw;
      targetPitch = Math.max(minPitch, Math.min(maxPitch, targetPitch + velPitch));
      velYaw *= friction;
      velPitch *= friction;
    }
    yaw += (targetYaw - yaw) * damping;
    pitch += (targetPitch - pitch) * damping;
    distance += (targetDistance - distance) * damping;

    const cosP = Math.cos(pitch);
    camera.position.set(
      center.x + distance * cosP * Math.sin(yaw),
      center.y + distance * Math.sin(pitch),
      center.z + distance * cosP * Math.cos(yaw),
    );
    camera.lookAt(center);
    renderer.render(scene, camera);

    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  const resize = () => {
    const rect = container.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width || container.clientWidth || 960));
    const h = Math.max(360, Math.floor(rect.height || container.clientHeight || 520));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  let resizeObserver: ResizeObserver | undefined;
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
  }

  return {
    dispose: () => {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      resizeObserver?.disconnect();
    },
  };
}

function createMaterial(project: HouseProject, materialId: string) {
  const material = project.materials.find((candidate) => candidate.id === materialId);

  return new THREE.MeshStandardMaterial({
    color: material?.color ?? FALLBACK_WALL_COLOR,
    roughness: 0.78,
    metalness: 0.02,
  });
}

// ─── Wall meshes ────────────────────────────────────────────────────────────

function createWallPanelMesh(
  wallGeometry: WallGeometry,
  panel: WallPanel,
  material: THREE.Material,
) {
  const slice = slicePanelFootprint(wallGeometry.footprint, wallGeometry, panel);
  // In v2 the panel.y is already measured from bottomZ (wall bottom).
  const baseY = wallGeometry.bottomZ + panel.y;
  const topY = baseY + panel.height;

  const brs: [number, number, number] = [slice.rightStart.x, baseY, planYToSceneZ(slice.rightStart.y)];
  const bre: [number, number, number] = [slice.rightEnd.x, baseY, planYToSceneZ(slice.rightEnd.y)];
  const ble: [number, number, number] = [slice.leftEnd.x, baseY, planYToSceneZ(slice.leftEnd.y)];
  const bls: [number, number, number] = [slice.leftStart.x, baseY, planYToSceneZ(slice.leftStart.y)];
  const trs: [number, number, number] = [slice.rightStart.x, topY, planYToSceneZ(slice.rightStart.y)];
  const tre: [number, number, number] = [slice.rightEnd.x, topY, planYToSceneZ(slice.rightEnd.y)];
  const tle: [number, number, number] = [slice.leftEnd.x, topY, planYToSceneZ(slice.leftEnd.y)];
  const tls: [number, number, number] = [slice.leftStart.x, topY, planYToSceneZ(slice.leftStart.y)];

  const positions: number[] = [];
  const indices: number[] = [];
  const addFace = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => {
    const base = positions.length / 3;
    positions.push(...a, ...b, ...c, ...d);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // CCW from each face's outward side. Vertex order is reversed from the natural
  // CCW order because the planY → sceneZ negation flips orientation in the XZ plane.
  addFace(brs, bre, tre, trs); // wall right side
  addFace(bls, tls, tle, ble); // wall left side
  addFace(trs, tre, tle, tls); // top
  addFace(brs, bls, ble, bre); // bottom
  addFace(brs, trs, tls, bls); // start cap
  addFace(bre, ble, tle, tre); // end cap

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, material);
}

function createWallMeshes(project: HouseProject, geometry: HouseGeometry) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];

  const getMaterial = (materialId: string) => {
    let mat = materials.get(materialId);
    if (!mat) {
      mat = createMaterial(project, materialId);
      materials.set(materialId, mat);
    }
    return mat;
  };

  for (const wallGeometry of geometry.walls) {
    const material = getMaterial(wallGeometry.materialId);
    for (const panel of wallGeometry.panels) {
      meshes.push(createWallPanelMesh(wallGeometry, panel, material));
    }
  }

  return { meshes, materials: [...materials.values()] };
}

// ─── Opening frame meshes ────────────────────────────────────────────────────

function createOpeningFrameMeshes(project: HouseProject, geometry: HouseGeometry) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];

  for (const strip of geometry.openingFrames) {
    let mat = materials.get(strip.materialId);
    if (!mat) {
      mat = createMaterial(project, strip.materialId);
      materials.set(strip.materialId, mat);
    }
    const box = new THREE.BoxGeometry(strip.size.alongWall, strip.size.height, strip.size.depth);
    const mesh = new THREE.Mesh(box, mat);
    // Convert plan-space (x, y, z=height) to scene coords (x, height, -y).
    mesh.position.set(strip.center.x, strip.center.z, planYToSceneZ(strip.center.y));
    mesh.rotation.y = strip.rotationY;
    meshes.push(mesh);
  }

  return { meshes, materials: [...materials.values()] };
}

// ─── Slab meshes ─────────────────────────────────────────────────────────────

const SLAB_FALLBACK_COLOR = "#a1a8a3";

function createSlabMaterial(project: HouseProject, materialId: string) {
  const material = project.materials.find((candidate) => candidate.id === materialId);
  return new THREE.MeshStandardMaterial({
    color: material?.color ?? SLAB_FALLBACK_COLOR,
    roughness: 0.85,
    metalness: 0.02,
    flatShading: true,
  });
}

function buildSlabMesh(slab: SlabGeometry, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(
    slab.outline.map((point) => new THREE.Vector2(point.x, planYToSceneZ(point.y))),
  );
  for (const hole of slab.holes) {
    shape.holes.push(
      new THREE.Path(hole.map((point) => new THREE.Vector2(point.x, planYToSceneZ(point.y)))),
    );
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: slab.thickness,
    bevelEnabled: false,
  });
  // ExtrudeGeometry lays the shape on the XY plane and extrudes +Z.
  // Rotate so the shape's XY becomes world XZ and extrusion becomes -Y.
  geo.rotateX(Math.PI / 2);
  // After rotation: top face sits at y=0, bottom at y=-thickness. Translate
  // so the top face matches slab.topZ.
  geo.translate(0, slab.topZ, 0);

  return new THREE.Mesh(geo, material);
}

function createSlabMeshes(project: HouseProject, geometry: HouseGeometry) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];

  for (const slab of geometry.slabs) {
    let mat = materials.get(slab.materialId);
    if (!mat) {
      mat = createSlabMaterial(project, slab.materialId);
      materials.set(slab.materialId, mat);
    }
    meshes.push(buildSlabMesh(slab, mat));
  }

  return { meshes, materials: [...materials.values()] };
}

// ─── Roof meshes ─────────────────────────────────────────────────────────────

const ROOF_FALLBACK_COLOR = "#8a4f3a";

function createRoofPanelMaterial(project: HouseProject, materialId: string) {
  const material = project.materials.find((m) => m.id === materialId);
  return new THREE.MeshStandardMaterial({
    color: material?.color ?? ROOF_FALLBACK_COLOR,
    side: THREE.DoubleSide,
  });
}

function createRoofGableMaterial(project: HouseProject, materialId: string) {
  const material = project.materials.find((m) => m.id === materialId);
  return new THREE.MeshStandardMaterial({
    color: material?.color ?? FALLBACK_WALL_COLOR,
    roughness: 0.85,
    metalness: 0.02,
    flatShading: true,
    side: THREE.DoubleSide,
  });
}

function buildRoofFaceMesh(
  vertices: { x: number; y: number; z: number }[],
  material: THREE.Material,
): THREE.Mesh {
  // Fan-triangulate from vertex 0 (panels and gables are convex).
  const positions: number[] = [];
  for (let i = 1; i < vertices.length - 1; i += 1) {
    const a = vertices[0];
    const b = vertices[i];
    const c = vertices[i + 1];
    // Point3 in v2 geometry: x = plan-x, y = plan-y (south-north), z = world height.
    positions.push(a.x, a.z, planYToSceneZ(a.y));
    positions.push(b.x, b.z, planYToSceneZ(b.y));
    positions.push(c.x, c.z, planYToSceneZ(c.y));
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return new THREE.Mesh(geom, material);
}

function createRoofMeshes(project: HouseProject, geometry: HouseGeometry) {
  const meshes: THREE.Mesh[] = [];
  const materials: THREE.Material[] = [];
  const panelCache = new Map<string, THREE.Material>();
  const gableCache = new Map<string, THREE.Material>();

  for (const roof of geometry.roofs) {
    for (const panel of roof.panels) {
      let mat = panelCache.get(panel.materialId);
      if (!mat) {
        mat = createRoofPanelMaterial(project, panel.materialId);
        panelCache.set(panel.materialId, mat);
        materials.push(mat);
      }
      meshes.push(buildRoofFaceMesh(panel.vertices, mat));
    }
    for (const gable of roof.gables) {
      let mat = gableCache.get(gable.materialId);
      if (!mat) {
        mat = createRoofGableMaterial(project, gable.materialId);
        gableCache.set(gable.materialId, mat);
        materials.push(mat);
      }
      meshes.push(buildRoofFaceMesh(gable.vertices, mat));
    }
  }

  return { meshes, materials };
}

// ─── Stair meshes ─────────────────────────────────────────────────────────────

const STAIR_FALLBACK_COLOR = "#8a7d6b";

function createStairMaterial(project: HouseProject, materialId: string) {
  const material = project.materials.find((candidate) => candidate.id === materialId);
  return new THREE.MeshStandardMaterial({
    color: material?.color ?? STAIR_FALLBACK_COLOR,
    roughness: 0.6,
    metalness: 0.05,
  });
}

function createStairMeshes(project: HouseProject, geometry: HouseGeometry) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];

  const getMaterial = (materialId: string) => {
    let mat = materials.get(materialId);
    if (!mat) {
      mat = createStairMaterial(project, materialId);
      materials.set(materialId, mat);
    }
    return mat;
  };

  for (const stair of geometry.stairs) {
    for (const box of [...stair.treads, ...stair.landings]) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(box.sx, box.sy, box.sz),
        getMaterial(stair.materialId),
      );
      // box.cz is in plan-y space; mirror to scene-z to match walls/slabs.
      mesh.position.set(box.cx, box.cy, planYToSceneZ(box.cz));
      // Negate rotation: plan uses CCW-positive (standard math), but three.js Y-axis rotation
      // with the default right-hand rule rotates CW when viewed from above, so we negate.
      mesh.rotation.y = -(box.rotationY ?? 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      meshes.push(mesh);
    }
  }

  return { meshes, materials: [...materials.values()] };
}

// ─── Balcony meshes ───────────────────────────────────────────────────────────

function createBalconyMaterial(project: HouseProject, materialId: string) {
  const material = project.materials.find((candidate) => candidate.id === materialId);
  return new THREE.MeshStandardMaterial({
    color: material?.color ?? FALLBACK_WALL_COLOR,
    roughness: 0.72,
    metalness: 0.02,
  });
}

function createBalconyParts(
  wall: Wall,
  balcony: BalconyGeometry,
  getMaterial: (materialId: string) => THREE.MeshStandardMaterial,
) {
  const len = wallLength(wall);
  if (len <= 0) return [];

  const directionX = (wall.end.x - wall.start.x) / len;
  const directionZ = (planYToSceneZ(wall.end.y) - planYToSceneZ(wall.start.y)) / len;
  const normalX = -directionZ;
  const normalZ = directionX;
  const rotationY = -Math.atan2(directionZ, directionX);
  const centerOffset = balcony.offset + balcony.width / 2;

  // slabTopZ is world-y of slab top; slab center is slabTopZ - slabThickness/2
  const slabCenterY = balcony.slabTopZ - balcony.slabThickness / 2;

  const baseX = wall.start.x + directionX * centerOffset + normalX * (wall.thickness / 2 + balcony.depth / 2);
  const baseZ = planYToSceneZ(wall.start.y) + directionZ * centerOffset + normalZ * (wall.thickness / 2 + balcony.depth / 2);

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(balcony.width, balcony.slabThickness, balcony.depth),
    getMaterial(balcony.materialId),
  );
  const outerRail = new THREE.Mesh(
    new THREE.BoxGeometry(balcony.width, balcony.railingHeight, 0.08),
    getMaterial(balcony.railingMaterialId),
  );
  const leftRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, balcony.railingHeight, balcony.depth),
    getMaterial(balcony.railingMaterialId),
  );
  const rightRail = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, balcony.railingHeight, balcony.depth),
    getMaterial(balcony.railingMaterialId),
  );

  // Rail center Y = slabTopZ + railingHeight/2
  const railY = balcony.slabTopZ + balcony.railingHeight / 2;
  const sideOffset = balcony.width / 2 - 0.04;

  slab.position.set(baseX, slabCenterY, baseZ);
  outerRail.position.set(
    wall.start.x + directionX * centerOffset + normalX * (wall.thickness / 2 + balcony.depth),
    railY,
    planYToSceneZ(wall.start.y) + directionZ * centerOffset + normalZ * (wall.thickness / 2 + balcony.depth),
  );
  leftRail.position.set(baseX - directionX * sideOffset, railY, baseZ - directionZ * sideOffset);
  rightRail.position.set(baseX + directionX * sideOffset, railY, baseZ + directionZ * sideOffset);

  for (const mesh of [slab, outerRail, leftRail, rightRail]) {
    mesh.rotation.y = rotationY;
  }

  return [slab, outerRail, leftRail, rightRail];
}

function createBalconyMeshes(project: HouseProject, geometry: HouseGeometry) {
  const wallsById = new Map(project.walls.map((wall) => [wall.id, wall]));
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];

  const getMaterial = (materialId: string) => {
    let mat = materials.get(materialId);
    if (!mat) {
      mat = createBalconyMaterial(project, materialId);
      materials.set(materialId, mat);
    }
    return mat;
  };

  for (const balcony of geometry.balconies) {
    const wall = wallsById.get(balcony.attachedWallId);
    if (!wall) continue;
    meshes.push(...createBalconyParts(wall, balcony, getMaterial));
  }

  return { meshes, materials: [...materials.values()] };
}

// ─── Ground ───────────────────────────────────────────────────────────────────

function createGround(bounds: SceneBounds) {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const size = Math.max(width, depth, 8) * 6;
  const finalSize = Math.max(size, 40);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  const groundGeometry = new THREE.PlaneGeometry(finalSize, finalSize);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: GROUND_COLOR,
    roughness: 0.92,
    metalness: 0,
  });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, -0.001, centerZ);

  const grid = new THREE.GridHelper(
    finalSize,
    Math.max(1, Math.round(finalSize / 0.8)),
    "#7e7d77",
    "#aaa8a1",
  );
  grid.position.set(centerX, 0.001, centerZ);

  return { ground, grid, groundGeometry, groundMaterial };
}

/** Faint horizontal level rings at each storey above ground (z > 0).
 *  Anchors empty storeys in 3D so adding a level produces a visible
 *  reference even before any wall/slab is drawn there. The ring traces
 *  the building's footprint — same x/z extent as the walls, so empty
 *  storeys feel attached to the building instead of floating in space. */
function createStoreyLevelHelpers(project: HouseProject, bounds: SceneBounds) {
  const width = Math.max(bounds.maxX - bounds.minX, 4);
  const depth = Math.max(bounds.maxZ - bounds.minZ, 4);
  const minX = bounds.minX;
  const maxX = bounds.minX + width;
  const minZ = bounds.minZ;
  const maxZ = bounds.minZ + depth;
  const helpers: THREE.LineSegments[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  for (const storey of project.storeys) {
    if (storey.elevation <= 0.001) continue;
    const positions = new Float32Array([
      minX, storey.elevation, minZ,
      maxX, storey.elevation, minZ,
      maxX, storey.elevation, minZ,
      maxX, storey.elevation, maxZ,
      maxX, storey.elevation, maxZ,
      minX, storey.elevation, maxZ,
      minX, storey.elevation, maxZ,
      minX, storey.elevation, minZ,
    ]);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineDashedMaterial({
      color: "#5a5a5a",
      dashSize: 0.25,
      gapSize: 0.15,
      transparent: true,
      opacity: 0.4,
    });
    const lines = new THREE.LineSegments(geom, mat);
    lines.computeLineDistances();
    helpers.push(lines);
    geometries.push(geom);
    materials.push(mat);
  }

  return { helpers, geometries, materials };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function mountHouseScene(
  host: HTMLElement,
  project: HouseProject,
  options: MountedSceneOptions,
): MountedScene {
  const { renderer, width, height } = createRenderer(host);
  const scene = new THREE.Scene();

  const houseGeometry: HouseGeometry = buildSceneGeometry(project);

  let bounds = projectBounds(project);
  bounds = refineBoundsMaxY(bounds, houseGeometry, project);

  const { camera, center, distance } = createCamera(bounds, width / height);

  const { meshes: wallMeshes, materials: wallMaterials } = createWallMeshes(project, houseGeometry);
  const { meshes: frameMeshes, materials: frameMaterials } = createOpeningFrameMeshes(project, houseGeometry);
  const { meshes: slabMeshes, materials: slabMaterials } = createSlabMeshes(project, houseGeometry);
  const { meshes: stairMeshes, materials: stairMaterials } = createStairMeshes(project, houseGeometry);
  const { meshes: roofMeshes, materials: roofMaterials } = createRoofMeshes(project, houseGeometry);
  const { meshes: balconyMeshes, materials: balconyMaterials } = createBalconyMeshes(project, houseGeometry);
  const { ground, grid, groundGeometry, groundMaterial } = createGround(bounds);
  const { helpers: storeyHelpers, geometries: storeyHelperGeometries, materials: storeyHelperMaterials } = createStoreyLevelHelpers(project, bounds);

  const buildingCenter = new THREE.Vector3(
    (bounds.minX + bounds.maxX) / 2,
    bounds.maxY / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  );
  const buildingExtent = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxZ - bounds.minZ,
    bounds.maxY,
  );
  const shadowSpan = Math.max(buildingExtent * 2, 24);

  const initialLighting: LightingParams = options.lighting ?? DEFAULT_LIGHTING;

  const ambient = new THREE.HemisphereLight("#d8e3eb", "#3c4348", initialLighting.hemiIntensity);

  const keyLight = new THREE.DirectionalLight("#fdfcff", initialLighting.keyIntensity);
  keyLight.position
    .copy(buildingCenter)
    .add(sunOffsetFrom(initialLighting.sunAzimuthDeg, initialLighting.sunAltitudeDeg, 14));
  keyLight.target.position.copy(buildingCenter);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -shadowSpan;
  keyLight.shadow.camera.right = shadowSpan;
  keyLight.shadow.camera.top = shadowSpan;
  keyLight.shadow.camera.bottom = -shadowSpan;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = shadowSpan * 4;
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.02;

  const fillLight = new THREE.AmbientLight("#e8edf0", initialLighting.fillIntensity);

  renderer.toneMappingExposure = initialLighting.exposure;

  const meshes = [
    ...wallMeshes,
    ...frameMeshes,
    ...slabMeshes,
    ...stairMeshes,
    ...roofMeshes,
    ...balconyMeshes,
  ];
  const materials = [
    ...wallMaterials,
    ...frameMaterials,
    ...slabMaterials,
    ...stairMaterials,
    ...roofMaterials,
    ...balconyMaterials,
  ];

  for (const mesh of meshes) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }
  ground.receiveShadow = true;

  scene.add(
    ambient,
    keyLight,
    keyLight.target,
    fillLight,
    ground,
    grid,
    ...storeyHelpers,
    ...meshes,
  );

  host.replaceChildren(renderer.domElement);
  renderer.render(scene, camera);

  const collidables: THREE.Object3D[] = [
    ...wallMeshes,
    ...slabMeshes,
    ...balconyMeshes,
    ...stairMeshes,
    ...roofMeshes,
    ground,
  ];

  const callbacks: WalkCallbacks = {
    onWalkExit: () => options.onWalkExit?.(),
    onDigitKey: (digit) => options.onDigitKey?.(digit),
    onCameraMove: (cameraY) => options.onCameraMove?.(cameraY),
  };

  const walkControls = attachWalkControls(renderer, camera, scene, collidables, callbacks);

  let currentOrbit: OrbitControls | null = attachOrbitControls(renderer, camera, scene, center, distance, host);
  let activeMode: CameraMode = "orbit";

  const computeInitialSpawn = (): WalkSpawn => {
    const lowestStorey = [...project.storeys].sort((a, b) => a.elevation - b.elevation)[0];
    const groundElevation = lowestStorey?.elevation ?? 0;
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      z: bounds.maxZ + 3,
      y: groundElevation + 1.6,
      yaw: 0, // face -Z (Three.js default) so the front facade is in front of the player
      pitch: 0,
    };
  };

  const setCameraMode = (mode: CameraMode) => {
    if (mode === activeMode) return;
    activeMode = mode;
    if (mode === "walk") {
      currentOrbit?.dispose();
      currentOrbit = null;
      walkControls.enable(computeInitialSpawn());
    } else {
      walkControls.disable();
      camera.position.copy(center).addScaledVector(new THREE.Vector3(0.85, 0.62, 1).normalize(), distance);
      camera.lookAt(center);
      currentOrbit = attachOrbitControls(renderer, camera, scene, center, distance, host);
    }
  };

  const teleportToStorey = (storeyId: string) => {
    if (activeMode !== "walk") return;
    const storey = project.storeys.find((s) => s.id === storeyId) ?? project.storeys[0];
    if (!storey) return;
    const xz = pickFloorSwitchXZ(walkControls.getPosition(), bounds);
    walkControls.teleportTo({
      x: xz.x,
      z: xz.z,
      y: storey.elevation + 1.6,
    });
  };

  const setLighting = (params: LightingParams) => {
    renderer.toneMappingExposure = params.exposure;
    ambient.intensity = params.hemiIntensity;
    keyLight.intensity = params.keyIntensity;
    keyLight.position
      .copy(buildingCenter)
      .add(sunOffsetFrom(params.sunAzimuthDeg, params.sunAltitudeDeg, 14));
    fillLight.intensity = params.fillIntensity;
  };

  return {
    setCameraMode,
    teleportToStorey,
    setLighting,
    dispose: () => {
      walkControls.dispose();
      currentOrbit?.dispose();
      for (const mesh of meshes) mesh.geometry.dispose();
      for (const material of materials) material.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      grid.geometry.dispose();
      const gridMaterial = grid.material;
      if (Array.isArray(gridMaterial)) gridMaterial.forEach((m) => m.dispose());
      else gridMaterial.dispose();
      for (const g of storeyHelperGeometries) g.dispose();
      for (const m of storeyHelperMaterials) m.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      host.replaceChildren();
    },
  };
}
