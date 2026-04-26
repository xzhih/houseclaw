import * as THREE from "three";
import { wallLength } from "../domain/measurements";
import type { HouseProject, Wall } from "../domain/types";
import { buildHouseGeometry } from "../geometry/houseGeometry";
import type { HouseGeometry, WallGeometry, WallPanel } from "../geometry/types";

type MountedScene = {
  dispose: () => void;
};

type SceneBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  maxY: number;
};

const FALLBACK_WALL_COLOR = "#f2eee6";
const GROUND_COLOR = "#dfe6e2";
const BACKGROUND_COLOR = "#eef3f2";

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
  renderer.domElement.setAttribute("aria-hidden", "true");

  return { renderer, width, height };
}

function projectBounds(project: HouseProject): SceneBounds {
  const storeyElevations = new Map(project.storeys.map((storey) => [storey.id, storey.elevation]));
  const bounds = project.walls.reduce<SceneBounds>(
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

  if (![bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ].every(Number.isFinite)) {
    return { minX: -4, maxX: 4, minZ: -4, maxZ: 4, maxY: project.defaultStoreyHeight };
  }

  return bounds;
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
  const direction = new THREE.Vector3(0.85, 0.62, 1).normalize();

  camera.position.copy(center).addScaledVector(direction, distance);
  camera.lookAt(center);

  return camera;
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
  wall: Wall,
  panel: WallPanel,
  storeyElevation: number,
  material: THREE.Material,
) {
  const length = wallLength(wall);
  if (length <= 0) return undefined;

  const directionX = (wall.end.x - wall.start.x) / length;
  const directionZ = (wall.end.y - wall.start.y) / length;
  const centerOffset = panel.x + panel.width / 2;
  const geometry = new THREE.BoxGeometry(panel.width, panel.height, wallGeometry.thickness);
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(
    wallGeometry.start.x + directionX * centerOffset,
    storeyElevation + panel.y + panel.height / 2,
    wallGeometry.start.y + directionZ * centerOffset,
  );
  mesh.rotation.y = -Math.atan2(directionZ, directionX);

  return mesh;
}

function createWallMeshes(project: HouseProject, geometry: HouseGeometry) {
  const wallsById = new Map(project.walls.map((wall) => [wall.id, wall]));
  const storeyElevations = new Map(project.storeys.map((storey) => [storey.id, storey.elevation]));
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const meshes: THREE.Mesh[] = [];

  for (const wallGeometry of geometry.walls) {
    const wall = wallsById.get(wallGeometry.wallId);
    if (!wall) continue;

    let material = materials.get(wallGeometry.materialId);
    if (!material) {
      material = createMaterial(project, wallGeometry.materialId);
      materials.set(wallGeometry.materialId, material);
    }

    const storeyElevation = storeyElevations.get(wallGeometry.storeyId) ?? 0;

    for (const panel of wallGeometry.panels) {
      const mesh = createWallPanelMesh(wallGeometry, wall, panel, storeyElevation, material);
      if (mesh) meshes.push(mesh);
    }
  }

  return { meshes, materials: [...materials.values()] };
}

function createGround(bounds: SceneBounds) {
  const width = bounds.maxX - bounds.minX;
  const depth = bounds.maxZ - bounds.minZ;
  const size = Math.max(width, depth, 8) * 1.5;
  const geometry = new THREE.PlaneGeometry(size, size);
  const material = new THREE.MeshStandardMaterial({
    color: GROUND_COLOR,
    roughness: 0.9,
    metalness: 0,
  });
  const ground = new THREE.Mesh(geometry, material);

  ground.rotation.x = -Math.PI / 2;
  ground.position.set((bounds.minX + bounds.maxX) / 2, -0.02, (bounds.minZ + bounds.maxZ) / 2);

  return { ground, geometry, material };
}

export function mountHouseScene(container: HTMLElement, project: HouseProject): MountedScene {
  const { renderer, width, height } = createRenderer(container);
  const scene = new THREE.Scene();
  const houseGeometry = buildHouseGeometry(project);
  const bounds = projectBounds(project);
  const camera = createCamera(bounds, width / height);
  const { meshes, materials } = createWallMeshes(project, houseGeometry);
  const { ground, geometry: groundGeometry, material: groundMaterial } = createGround(bounds);
  const ambient = new THREE.HemisphereLight("#ffffff", "#9aa7a0", 1.6);
  const keyLight = new THREE.DirectionalLight("#ffffff", 2.4);

  keyLight.position.set(5, 9, 6);
  scene.add(ambient, keyLight, ground, ...meshes);

  container.replaceChildren(renderer.domElement);
  renderer.render(scene, camera);

  return {
    dispose: () => {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
      }

      for (const material of materials) {
        material.dispose();
      }

      groundGeometry.dispose();
      groundMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      container.replaceChildren();
    },
  };
}
