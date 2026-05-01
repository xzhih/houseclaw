type ElevationSideTabsProps = {
  activeView: string;
  onChange: (viewId: string) => void;
};

const SIDES: Array<{ id: string; label: string }> = [
  { id: "elevation-front", label: "FRONT" },
  { id: "elevation-back", label: "BACK" },
  { id: "elevation-left", label: "LEFT" },
  { id: "elevation-right", label: "RIGHT" },
];

export function ElevationSideTabs({ activeView, onChange }: ElevationSideTabsProps) {
  return (
    <div className="chrome-elevation-side-tabs" role="tablist">
      {SIDES.map((side) => (
        <button
          key={side.id}
          role="tab"
          className="chrome-select-pill"
          aria-selected={activeView === side.id}
          onClick={() => onChange(side.id)}
        >
          {side.label}
        </button>
      ))}
    </div>
  );
}
