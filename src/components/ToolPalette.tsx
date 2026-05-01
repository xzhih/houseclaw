import type { ComponentType, SVGProps } from "react";
import type { ProjectActionV2, ProjectStateV2 } from "../app/v2/projectReducer";
import { IconRailButton } from "./chrome/IconRailButton";
import { useGlobalShortcuts } from "./chrome/useGlobalShortcuts";
import {
  SelectIcon,
  WallIcon,
  DoorIcon,
  WindowIcon,
  OpeningIcon,
  BalconyIcon,
  StairIcon,
  SlabIcon,
  RoofIcon,
  MaterialIcon,
} from "./chrome/icons";

type ToolDef = {
  id: string;
  label: string;
  shortcut: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const SELECT_TOOLS: ToolDef[] = [
  { id: "select", label: "SELECT", shortcut: "V", Icon: SelectIcon },
];
const DRAW_TOOLS: ToolDef[] = [
  { id: "wall", label: "WALL", shortcut: "W", Icon: WallIcon },
  { id: "door", label: "DOOR", shortcut: "D", Icon: DoorIcon },
  { id: "window", label: "WINDOW", shortcut: "N", Icon: WindowIcon },
  { id: "opening", label: "OPENING", shortcut: "O", Icon: OpeningIcon },
  { id: "balcony", label: "BALCONY", shortcut: "B", Icon: BalconyIcon },
  { id: "stair", label: "STAIR", shortcut: "S", Icon: StairIcon },
];
const STRUCT_TOOLS: ToolDef[] = [
  { id: "slab", label: "SLAB", shortcut: "F", Icon: SlabIcon },
  { id: "roof", label: "ROOF", shortcut: "R", Icon: RoofIcon },
  { id: "material", label: "MATERIAL", shortcut: "M", Icon: MaterialIcon },
];

type ToolPaletteProps = {
  project: ProjectStateV2;
  activeTool: string;
  onChange: (toolId: string) => void;
  dispatch: (action: ProjectActionV2) => void;
};

export function ToolPalette({ activeTool, onChange }: ToolPaletteProps) {
  const allTools = [...SELECT_TOOLS, ...DRAW_TOOLS, ...STRUCT_TOOLS];

  const shortcutMap: Record<string, () => void> = {
    Escape: () => onChange("select"),
  };
  for (const tool of allTools) {
    shortcutMap[tool.shortcut.toLowerCase()] = () => onChange(tool.id);
  }
  useGlobalShortcuts(shortcutMap);

  const renderGroup = (group: ToolDef[]) =>
    group.map((tool) => (
      <IconRailButton
        key={tool.id}
        label={tool.label}
        shortcut={tool.shortcut}
        active={activeTool === tool.id}
        onClick={() => onChange(tool.id)}
      >
        <tool.Icon />
      </IconRailButton>
    ));

  return (
    <div className="chrome-icon-rail" role="toolbar" aria-label="工具">
      {renderGroup(SELECT_TOOLS)}
      <div className="chrome-icon-rail-divider" aria-hidden />
      {renderGroup(DRAW_TOOLS)}
      <div className="chrome-icon-rail-divider" aria-hidden />
      {renderGroup(STRUCT_TOOLS)}
    </div>
  );
}
