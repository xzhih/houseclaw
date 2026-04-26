import type { ReactNode } from "react";
import type { ToolId } from "../domain/types";

const TOOLS: { id: ToolId; label: string; icon: ReactNode }[] = [
  {
    id: "select",
    label: "选择",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 3l5 16 2.2-6.8L19 10z" />
      </svg>
    ),
  },
  {
    id: "wall",
    label: "墙",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 6h18M3 12h18M3 18h18" />
      </svg>
    ),
  },
  {
    id: "door",
    label: "门",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17" />
        <path d="M3 21h18" />
        <circle cx="14.5" cy="12" r="0.6" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "window",
    label: "窗",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="1" />
        <path d="M12 4v16M4 12h16" />
      </svg>
    ),
  },
  {
    id: "opening",
    label: "开孔",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 2" aria-hidden="true">
        <rect x="4" y="6" width="16" height="12" rx="1" />
      </svg>
    ),
  },
  {
    id: "balcony",
    label: "阳台",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9h18M3 14h18M5 9v9M19 9v9M9 14v5M15 14v5" />
      </svg>
    ),
  },
  {
    id: "material",
    label: "材质",
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="8" />
        <circle cx="9" cy="9.5" r="1" fill="currentColor" stroke="none" />
        <circle cx="14.5" cy="9" r="1" fill="currentColor" stroke="none" />
        <circle cx="16" cy="13" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
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
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
          title={tool.label}
          onClick={() => onToolChange(tool.id)}
        >
          {tool.icon}
          <span className="tool-button-label">{tool.label}</span>
        </button>
      ))}
    </aside>
  );
}
