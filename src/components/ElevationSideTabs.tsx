import type { ViewId } from "../domain/types";
import type { ElevationSide } from "../projection/types";

const SIDE_TABS: { side: ElevationSide; label: string }[] = [
  { side: "front", label: "正面" },
  { side: "back", label: "背面" },
  { side: "left", label: "左面" },
  { side: "right", label: "右面" },
];

function sideFromView(view: ViewId): ElevationSide | undefined {
  if (view === "elevation-front") return "front";
  if (view === "elevation-back") return "back";
  if (view === "elevation-left") return "left";
  if (view === "elevation-right") return "right";
  return undefined;
}

type ElevationSideTabsProps = {
  activeView: ViewId;
  onSideChange: (side: ElevationSide) => void;
};

export function ElevationSideTabs({ activeView, onSideChange }: ElevationSideTabsProps) {
  const current = sideFromView(activeView);
  return (
    <nav className="view-tabs" aria-label="elevation side">
      {SIDE_TABS.map((tab) => (
        <button
          key={tab.side}
          type="button"
          className="tab-button"
          aria-pressed={current === tab.side}
          onClick={() => onSideChange(tab.side)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
