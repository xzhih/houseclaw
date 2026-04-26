import * as THREE from "three";
import { wallLength } from "../domain/measurements";
import type { HouseProject, Wall } from "../domain/types";
import { buildHouseGeometry } from "../geometry/houseGeometry";
import type { BalconyGeometry, HouseGeometry, SlabGeometry, WallGeometry, WallPanel } from "../geometry/types";
import { slicePanelFootprint } from "../geometry/wallNetwork";
import { attachWalkControls, type WalkCallbacks, type WalkSpawn } from "./walkControls";

export type CameraMode = "orbit" | "walk";

export type LightingParams = {
  exposure: number;
  hemiIntensity: number;
  keyIntensity: number;
  fillIntensity: number;
  /** 0 = north (+Z), 90 = east (+X), 180 = south (-Z), 270 = west (-X) */
  sunAzimuthDeg: number;
  /** 0 = horizon, 90 = zenith */
  sunAltitudeDeg: number;
};

export const DEFAULT_LIGHTING: LightingParams = {
  exposure: 1.0,
  hemiIntensity: 0.7,
  keyIntensity: 1.5,
  fillIntensity: 1.3,
  sunAzimuthDeg: 200,
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
  setActiveStorey(storeyId: string): void;
  setLighting(params: LightingParams): void;
  dispose(): void;
};

function sunOffsetFrom(azimuthDeg: number, altitudeDeg: number, distance: number): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const alt = THREE.MathUtils.degToRad(altitudeDeg);
  const horizontal = distance * Math.cos(alt);
  return new THREE.Vector3(
    Math.sin(az) * horizontal,
    distance * Math.sin(alt),
    Math.cos(az) * horizontal,
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

function projectBounds(project: HouseProject): SceneBounds {
  const storeyElevations = new Map(project.storeys.map((storey) => [storey.id, storey.elevation]));
  const wallBounds = project.walls.reduce<SceneBounds>(
    (current, wall) => ({
      minX: Math.min(current.minX, wall.start.x, wall.end.x),
      maxX: Math.max(current.maxX, wall.start.x, wall.end.x),
      minZ: Math.min(current.minZ, wall.start.y, wall.end.y),
      maxZ: Math.max(current.maxZ, wall.start.y, wall.end.y),
      maxY: Math.max(current.maxY, (storeyElevations.get(wall.storeyId) ?? 0) + wall.height),
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
    return { minX: -4, maxX: 4, minZ: -4, maxZ: 4, maxY: project.defaultStoreyHeight };
  }

  return project.balconies.reduce((current, balcony) => {
    const wall = project.walls.find((candidate) => candidate.id === balcony.attachedWallId);
    if (!wall) return current;

    const length = wallLength(wall);
    if (length <= 0) return current;

    const directionX = (wall.end.x - wall.start.x) / length;
    const directionZ = (wall.end.y - wall.start.y) / length;
    const normalX = directionZ;
    const normalZ = -directionX;
    const startX = wall.start.x + directionX * balcony.offset + normalX * balcony.depth;
    const startZ = wall.start.y + directionZ * balcony.offset + normalZ * balcony.depth;
    const endX = wall.start.x + directionX * (balcony.offset + balcony.width) + normalX * balcony.depth;
    const endZ = wall.start.y + directionZ * (balcony.offset + balcony.width) + normalZ * balcony.depth;

    return {
      minX: Math.min(current.minX, startX, endX),
      maxX: Math.max(current.maxX, startX, endX),
      minZ: Math.min(current.minZ, startZ, endZ),
      maxZ: Math.max(current.maxZ, startZ, endZ),
      maxY: current.maxY,
    };
  }, wallBounds);
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
  const direction = new THREE.Vector3(0.85, 0.62, -1).normalize();

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
    const width = Math.max(320, Math.floor(rect.width || container.clientWidth || 960));
    const height = Math.max(360, Math.floor(rect.height || container.clientHeight || 520));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
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

function createWallPanelMesh(
  wallGeometry: WallGeometry,
  panel: WallPanel,
  storeyElevation: number,
  material: THREE.Material,
) {
  const slice = slicePanelFootprint(wallGeometry.footprint, wallGeometry, panel);
  const baseY = storeyElevation + panel.y;
  const topY = baseY + panel.height;

  const brs: [number, number, number] = [slice.rightStart.x, baseY, slice.rightStart.y];
  const bre: [number, number, number] = [slice.rightEnd.x, baseY, slice.rightEnd.y];
  const ble: [number, number, number] = [slice.leftEnd.x, baseY, slice.leftEnd.y];
  const bls: [number, number, number] = [slice.leftStart.x, baseY, slice.leftStart.y];
  const trs: [number, number, number] = [slice.rightStart.x, topY, slice.rightStart.y];
  const tre: [number, number, number] = [slice.rightEnd.x, topY, slice.rightEnd.y];
  const tle: [number, number, number] = [slice.leftEnd.x, topY, slice.leftEnd.y];
  const tls: [number, number, number] = [slice.leftStart.x, topY, slice.leftStart.y];

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

  // CCW from each face's outward side:
  addFace(brs, trs, tre, bre); // wall right side
  addFace(bls, ble, tle, tls); // wall left side
  addFace(trs, tls, tle, tre); // top
  addFace(brs, bre, ble, bls); // bottom
  addFace(brs, bls, tls, trs); // start cap
  addFace(bre, tre, tle, ble); // end cap

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, material);
}

function createWallMeshes(project: HouseProject, geometry: HouseGeometry) {
  const storeyElevations = new Map(project.storeys.map((storey) => [storey.id, storey.elevation]));
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];

  for (const wallGeometry of geometry.walls) {
    let material = materials.get(wallGeometry.materialId);
    if (!material) {
      material = createMaterial(project, wallGeometry.materialId);
      materials.set(wallGeometry.materialId, material);
    }

    const storeyElevation = storeyElevations.get(wallGeometry.storeyId) ?? 0;

    for (const panel of wallGeometry.panels) {
      meshes.push(createWallPanelMesh(wallGeometry, panel, storeyElevation, material));
    }
  }

  return { meshes, materials: [...materials.values()] };
}

function createBalconyMaterial(project: HouseProject, materialId: string) {
  const material = project.materials.find((candidate) => candidate.id === materialId);

  return new THREE.MeshStandardMaterial({
    color: material?.color ?? FALLBACK_WALL_COLOR,
    roughness: 0.72,
    metalness: 0.02,
  });
}

function createBalconyMeshes(project: HouseProject, geometry: HouseGeometry) {
  const wallsById = new Map(project.walls.map((wall) => [wall.id, wall]));
  const storeyElevations = new Map(project.storeys.map((storey) => [storey.id, storey.elevation]));
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];

  const getMaterial = (materialId: string) => {
    let material = materials.get(materialId);
    if (!material) {
      material = createBalconyMaterial(project, materialId);
      materials.set(materialId, material);
    }

    return material;
  };

  for (const balcony of geometry.balconies) {
    const wall = wallsById.get(balcony.attachedWallId);
    if (!wall) continue;

    meshes.push(...createBalconyParts(wall, balcony, storeyElevations.get(balcony.storeyId) ?? 0, getMaterial));
  }

  return { meshes, materials: [...materials.values()] };
}

function createBalconyParts(
  wall: Wall,
  balcony: BalconyGeometry,
  storeyElevation: number,
  getMaterial: (materialId: string) => THREE.MeshStandardMaterial,
) {
  const length = wallLength(wall);
  if (length <= 0) return [];

  const directionX = (wall.end.x - wall.start.x) / length;
  const directionZ = (wall.end.y - wall.start.y) / length;
  const normalX = directionZ;
  const normalZ = -directionX;
  const rotationY = -Math.atan2(directionZ, directionX);
  const centerOffset = balcony.offset + balcony.width / 2;
  const baseX = wall.start.x + directionX * centerOffset + normalX * (wall.thickness / 2 + balcony.depth / 2);
  const baseZ = wall.start.y + directionZ * centerOffset + normalZ * (wall.thickness / 2 + balcony.depth / 2);
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
  const railY = storeyElevation + balcony.slabThickness + balcony.railingHeight / 2;
  const sideOffset = balcony.width / 2 - 0.04;

  slab.position.set(baseX, storeyElevation + balcony.slabThickness / 2, baseZ);
  outerRail.position.set(
    wall.start.x + directionX * centerOffset + normalX * (wall.thickness / 2 + balcony.depth),
    railY,
    wall.start.y + directionZ * centerOffset + normalZ * (wall.thickness / 2 + balcony.depth),
  );
  leftRail.position.set(baseX - directionX * sideOffset, railY, baseZ - directionZ * sideOffset);
  rightRail.position.set(baseX + directionX * sideOffset, railY, baseZ + directionZ * sideOffset);

  for (const mesh of [slab, outerRail, leftRail, rightRail]) {
    mesh.rotation.y = rotationY;
  }

  return [slab, outerRail, leftRail, rightRail];
}

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
    slab.outline.map((point) => new THREE.Vector2(point.x, point.y)),
  );
  if (slab.hole) {
    shape.holes.push(
      new THREE.Path(slab.hole.map((point) => new THREE.Vector2(point.x, point.y))),
    );
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: slab.thickness,
    bevelEnabled: false,
  });
  // ExtrudeGeometry lays the shape on the XY plane and extrudes +Z.
  // Rotate so the shape's XY becomes world XZ and extrusion becomes -Y.
  geometry.rotateX(Math.PI / 2);
  // After rotation: top face sits at y=0, bottom at y=-thickness. Translate
  // so the top face matches slab.topY.
  geometry.translate(0, slab.topY, 0);

  return new THREE.Mesh(geometry, material);
}

function createSlabMeshes(project: HouseProject, geometry: HouseGeometry) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];

  for (const slab of geometry.slabs) {
    let material = materials.get(slab.materialId);
    if (!material) {
      material = createSlabMaterial(project, slab.materialId);
      materials.set(slab.materialId, material);
    }
    meshes.push(buildSlabMesh(slab, material));
  }

  return { meshes, materials: [...materials.values()] };
}

function createGround(bounds: SceneBounds) {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const size = Math.max(width, depth, 8) * 6;
  const finalSize = Math.max(size, 40);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;

  const geometry = new THREE.PlaneGeometry(finalSize, finalSize);
  const material = new THREE.MeshStandardMaterial({
    color: GROUND_COLOR,
    roughness: 0.92,
    metalness: 0,
  });
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, -0.001, centerZ);

  const grid = new THREE.GridHelper(
    finalSize,
    Math.max(1, Math.round(finalSize / 0.8)),
    "#7e7d77", // main axes — slightly darker than concrete
    "#aaa8a1", // sub grid — soft, low contrast
  );
  grid.position.set(centerX, 0.001, centerZ);

  return { ground, grid, geometry, material };
}

export function mountHouseScene(
  container: HTMLElement,
  project: HouseProject,
  options?: MountedSceneOptions,
): MountedScene {
  const { renderer, width, height } = createRenderer(container);
  const scene = new THREE.Scene();
  const houseGeometry = buildHouseGeometry(project);
  const bounds = projectBounds(project);
  const { camera, center, distance } = createCamera(bounds, width / height);
  const { meshes: wallMeshes, materials: wallMaterials } = createWallMeshes(project, houseGeometry);
  const { meshes: balconyMeshes, materials: balconyMaterials } = createBalconyMeshes(project, houseGeometry);
  const { meshes: slabMeshes, materials: slabMaterials } = createSlabMeshes(project, houseGeometry);
  const { ground, grid, geometry: groundGeometry, material: groundMaterial } = createGround(bounds);

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

  const initialLighting: LightingParams = options?.lighting ?? DEFAULT_LIGHTING;

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

  // Fill always opposes the sun in azimuth, sits at modest altitude.
  const fillLight = new THREE.DirectionalLight("#aac6dc", initialLighting.fillIntensity);
  fillLight.position
    .copy(buildingCenter)
    .add(sunOffsetFrom((initialLighting.sunAzimuthDeg + 180) % 360, 25, 12));
  fillLight.target.position.copy(buildingCenter);

  renderer.toneMappingExposure = initialLighting.exposure;

  const meshes = [...wallMeshes, ...balconyMeshes, ...slabMeshes];
  const materials = [...wallMaterials, ...balconyMaterials, ...slabMaterials];

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
    fillLight.target,
    ground,
    grid,
    ...meshes,
  );

  container.replaceChildren(renderer.domElement);
  renderer.render(scene, camera);

  const collidables: THREE.Object3D[] = [...wallMeshes, ...slabMeshes, ...balconyMeshes, ground];

  const callbacks: WalkCallbacks = {
    onWalkExit: () => options?.onWalkExit?.(),
    onDigitKey: (digit) => options?.onDigitKey?.(digit),
    onCameraMove: (cameraY) => options?.onCameraMove?.(cameraY),
  };

  const walkControls = attachWalkControls(renderer, camera, scene, collidables, callbacks);

  let currentOrbit: OrbitControls | null = attachOrbitControls(renderer, camera, scene, center, distance, container);
  let activeMode: CameraMode = "orbit";

  const computeSpawn = (storeyId: string): WalkSpawn => {
    const storey = project.storeys.find((s) => s.id === storeyId) ?? project.storeys[0];
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      z: (bounds.minZ + bounds.maxZ) / 2,
      y: storey.elevation + 1.6,
      yaw: activeMode === "walk" ? walkControls.getYaw() : 0,
      pitch: 0,
    };
  };

  const computeInitialSpawn = (): WalkSpawn => {
    const lowestStorey = [...project.storeys].sort((a, b) => a.elevation - b.elevation)[0];
    const groundElevation = lowestStorey?.elevation ?? 0;
    return {
      x: (bounds.minX + bounds.maxX) / 2,
      z: bounds.minZ - 3,
      y: groundElevation + 1.6,
      yaw: Math.PI, // face +Z, looking at the front facade
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
      camera.position.copy(center).addScaledVector(new THREE.Vector3(0.85, 0.62, -1).normalize(), distance);
      camera.lookAt(center);
      currentOrbit = attachOrbitControls(renderer, camera, scene, center, distance, container);
    }
  };

  const setActiveStorey = (storeyId: string) => {
    if (activeMode !== "walk") return;
    walkControls.setSpawn(computeSpawn(storeyId));
  };

  const setLighting = (params: LightingParams) => {
    renderer.toneMappingExposure = params.exposure;
    ambient.intensity = params.hemiIntensity;
    keyLight.intensity = params.keyIntensity;
    keyLight.position
      .copy(buildingCenter)
      .add(sunOffsetFrom(params.sunAzimuthDeg, params.sunAltitudeDeg, 14));
    fillLight.intensity = params.fillIntensity;
    fillLight.position
      .copy(buildingCenter)
      .add(sunOffsetFrom((params.sunAzimuthDeg + 180) % 360, 25, 12));
  };

  return {
    setCameraMode,
    setActiveStorey,
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
      renderer.dispose();
      renderer.forceContextLoss();
      container.replaceChildren();
    },
  };
}
