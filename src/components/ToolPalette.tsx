import type { ToolIdV2 } from "../app/v2/projectReducer";

const TOOL_DEFS: { id: ToolIdV2; label: string }[] = [
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
];

type ToolPaletteProps = {
  activeTool: string;
  onChange: (toolId: string) => void;
};

export function ToolPalette({ activeTool, onChange }: ToolPaletteProps) {
  return (
    <aside className="tool-palette" aria-label="工具栏">
      {TOOL_DEFS.map((def) => (
        <button
          key={def.id}
          type="button"
          className="tool-button"
          aria-label={def.label}
          aria-pressed={activeTool === def.id}
          title={def.label}
          onClick={() => onChange(def.id)}
        >
          <span className="tool-button-label">{def.label}</span>
        </button>
      ))}
    </aside>
  );
}
