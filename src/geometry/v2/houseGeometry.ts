import { resolveAnchor } from "../../domain/v2/anchors";
import type { HouseProject, Slab, Storey } from "../../domain/v2/types";
import { buildBalconyGeometry } from "./balconyBuilder";
import type { FootprintQuad, HouseGeometryV2 } from "./types";
import { buildOpeningFrameStrips } from "./openingFrameGeometry";
import { buildRoofGeometry } from "./roofGeometry";
import { buildSlabGeometry } from "./slabBuilder";
import { buildStairGeometry } from "./stairGeometry";
import { buildWallGeometry } from "./wallBuilder";
import { buildWallNetwork } from "./wallNetwork";

const FALLBACK_SLAB_THICKNESS = 0.18;
const SLAB_MATCH_EPS = 0.01;

function pickSlabThicknessFor(toZ: number, slabs: Slab[], storeys: Storey[]): number {
  for (const slab of slabs) {
    const slabTop = resolveAnchor(slab.top, storeys);
    if (Math.abs(slabTop - toZ) <= SLAB_MATCH_EPS) {
      return slab.thickness;
    }
  }
  return FALLBACK_SLAB_THICKNESS;
}

export function buildSceneGeometryV2(project: HouseProject): HouseGeometryV2 {
  const storeys = project.storeys;

  const fps = buildWallNetwork(project.walls, storeys);
  const footprintIndex = new Map<string, FootprintQuad>();
  for (const fp of fps) {
    const { wallId, ...quad } = fp;
    footprintIndex.set(wallId, quad);
  }

  const walls = project.walls.map((w) =>
    buildWallGeometry(w, project.openings, storeys, footprintIndex),
  );

  const slabs = project.slabs.map((s) => buildSlabGeometry(s, storeys));

  const roofs = project.roofs
    .map((r) => buildRoofGeometry(r, storeys))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);

  const stairs = project.stairs.map((stair) => {
    const lowerZ = resolveAnchor(stair.from, storeys);
    const upperZ = resolveAnchor(stair.to, storeys);
    const slabThickness = pickSlabThicknessFor(upperZ, project.slabs, storeys);
    return buildStairGeometry(stair, lowerZ, upperZ, slabThickness);
  });

  const balconies = project.balconies.map((b) => buildBalconyGeometry(b, storeys));

  const wallsById = new Map(project.walls.map((w) => [w.id, w]));
  const openingFrames = project.openings.flatMap((opening) => {
    const wall = wallsById.get(opening.wallId);
    if (!wall) return [];
    const wallBottomZ = resolveAnchor(wall.bottom, storeys);
    return buildOpeningFrameStrips(opening, wall, wallBottomZ);
  });

  return { walls, slabs, roofs, stairs, balconies, openingFrames };
}
