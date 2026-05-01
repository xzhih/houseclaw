import type { ProjectState } from "../../app/projectReducer";
import type { Roof, RoofEdgeKind } from "../../domain/types";

export function buildDefaultRoof(project: ProjectState): Roof | undefined {
  const exterior = project.walls.filter((w) => w.exterior);
  if (exterior.length === 0) return undefined;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of exterior) {
    for (const p of [w.start, w.end]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const overhang = 0.5;
  const polygon = [
    { x: minX - overhang, y: minY - overhang },
    { x: maxX + overhang, y: minY - overhang },
    { x: maxX + overhang, y: maxY + overhang },
    { x: minX - overhang, y: maxY + overhang },
  ];
  const topStorey = [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
  if (!topStorey) return undefined;
  const roofMaterial = project.materials.find((m) => m.kind === "roof") ?? project.materials[0];
  if (!roofMaterial) return undefined;
  const edges: RoofEdgeKind[] = ["eave", "gable", "eave", "gable"];
  return {
    id: `roof-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`,
    polygon,
    base: { kind: "storey", storeyId: topStorey.id, offset: 0 },
    edges,
    pitch: Math.PI / 6,
    overhang,
    materialId: roofMaterial.id,
  };
}
