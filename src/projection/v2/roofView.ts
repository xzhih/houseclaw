import type { HouseProject, Point2 } from "../../domain/v2/types";
import { buildRoofGeometry } from "../../geometry/v2/roofGeometry";
import type {
  RoofViewEdgeStroke,
  RoofViewPolygon,
  RoofViewProjectionV2,
  RoofViewRidgeLine,
} from "./types";

const RIDGE_TOL = 0.001;

function topDown(p: { x: number; y: number; z: number }): Point2 {
  return { x: p.x, y: p.y };
}

/** A ridge is a panel edge that (a) sits at the panel's max-z, (b) is non-
 *  degenerate (length > tolerance), and (c) is SHARED between two or more
 *  panels. The "shared" gate is what excludes shed roofs (1 panel = no
 *  shared edges) and includes 2-opp-gable / hip4 / half-hip ridges. */
function extractRidgeLines(panels: { vertices: { x: number; y: number; z: number }[] }[]): RoofViewRidgeLine[] {
  type EdgeRecord = { from: Point2; to: Point2; key: string };
  const allEdges: EdgeRecord[] = [];
  for (const panel of panels) {
    if (panel.vertices.length < 3) continue;
    const maxZ = Math.max(...panel.vertices.map((v) => v.z));
    const n = panel.vertices.length;
    for (let i = 0; i < n; i += 1) {
      const a = panel.vertices[i];
      const b = panel.vertices[(i + 1) % n];
      if (Math.abs(a.z - maxZ) > RIDGE_TOL || Math.abs(b.z - maxZ) > RIDGE_TOL) continue;
      const ax = topDown(a);
      const bx = topDown(b);
      // Skip degenerate (zero-length) edges — happens at hip4 apex when W == D.
      if (Math.hypot(ax.x - bx.x, ax.y - bx.y) < RIDGE_TOL) continue;
      // Canonical key (smaller endpoint first) so shared edges across panels
      // collapse to one entry.
      const key =
        ax.x + ax.y < bx.x + bx.y
          ? `${ax.x.toFixed(4)},${ax.y.toFixed(4)}|${bx.x.toFixed(4)},${bx.y.toFixed(4)}`
          : `${bx.x.toFixed(4)},${bx.y.toFixed(4)}|${ax.x.toFixed(4)},${ax.y.toFixed(4)}`;
      allEdges.push({ from: ax, to: bx, key });
    }
  }
  // A ridge is shared by ≥ 2 panels.
  const counts = new Map<string, { from: Point2; to: Point2; count: number }>();
  for (const e of allEdges) {
    const existing = counts.get(e.key);
    if (existing) existing.count += 1;
    else counts.set(e.key, { from: e.from, to: e.to, count: 1 });
  }
  return [...counts.values()]
    .filter((e) => e.count >= 2)
    .map((e) => ({ from: e.from, to: e.to }));
}

export function projectRoofViewV2(project: HouseProject): RoofViewProjectionV2 {
  const polygons: RoofViewPolygon[] = [];
  for (const roof of project.roofs) {
    const verts = roof.polygon.map((p) => ({ x: p.x, y: p.y }));
    const edges: RoofViewEdgeStroke[] = roof.polygon.map((p, i) => {
      const next = roof.polygon[(i + 1) % roof.polygon.length];
      return {
        from: { x: p.x, y: p.y },
        to: { x: next.x, y: next.y },
        kind: roof.edges[i],
      };
    });

    const geom = buildRoofGeometry(roof, project.storeys);
    const ridgeLines = geom ? extractRidgeLines(geom.panels) : [];

    polygons.push({
      roofId: roof.id,
      vertices: verts,
      edges,
      ridgeLines,
    });
  }
  return { viewId: "roof", polygons };
}
