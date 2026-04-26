import type { ToolId } from "../domain/types";

const TOOLS: { id: ToolId; label: string }[] = [
  { id: "select", label: "选择" },
  { id: "wall", label: "墙" },
  { id: "door", label: "门" },
  { id: "window", label: "窗" },
  { id: "opening", label: "开孔" },
  { id: "balcony", label: "阳台" },
  { id: "material", label: "材质" },
];

type ToolPaletteProps = {
  activeTool: ToolId;
  onToolChange: (toolId: ToolId) => void;
};

export function ToolPalette({ activeTool, onToolChange }: ToolPaletteProps) {
  return (
    <aside className="tool-palette" aria-label="2D tools">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="tool-button"
          aria-pressed={activeTool === tool.id}
          onClick={() => onToolChange(tool.id)}
        >
          {tool.label}
        </button>
      ))}
    </aside>
  );
}
