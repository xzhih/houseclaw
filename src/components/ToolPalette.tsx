import type { ProjectActionV2, ProjectStateV2 } from "../app/v2/projectReducer";
import type { Roof, RoofEdgeKind } from "../domain/v2/types";

const TOOL_DEFS = [
  { id: "select", label: "选择" },
  { id: "wall", label: "墙" },
  { id: "door", label: "门" },
  { id: "window", label: "窗" },
  { id: "opening", label: "开洞" },
  { id: "balcony", label: "阳台" },
  { id: "stair", label: "楼梯" },
  { id: "slab", label: "楼板" },
  { id: "roof", label: "屋顶" },
  { id: "material", label: "材质" },
] as const;

type ToolPaletteProps = {
  project: ProjectStateV2;
  activeTool: string;
  onChange: (toolId: string) => void;
  dispatch: (action: ProjectActionV2) => void;
};

function buildDefaultRoof(project: ProjectStateV2): Roof | undefined {
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
  const roofMaterial =
    project.materials.find((m) => m.kind === "roof") ?? project.materials[0];
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

export function ToolPalette({ project, activeTool, onChange, dispatch }: ToolPaletteProps) {
  return (
    <div className="tool-palette" role="toolbar" aria-label="工具">
      {TOOL_DEFS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          aria-pressed={activeTool === tool.id}
          onClick={() => onChange(tool.id)}
        >
          {tool.label}
        </button>
      ))}
      {activeTool === "roof" ? (
        <button
          type="button"
          className="tool-action-button"
          onClick={() => {
            const roof = buildDefaultRoof(project);
            if (roof) {
              try {
                dispatch({ type: "add-roof", roof });
              } catch (e) {
                console.warn("Failed to add roof:", e);
              }
            }
          }}
        >
          + 创建屋顶
        </button>
      ) : null}
    </div>
  );
}
