import type { ViewId } from "../domain/types";

const VIEW_TABS: { id: ViewId; label: string }[] = [
  { id: "elevation-front", label: "正面" },
  { id: "elevation-back", label: "背面" },
  { id: "elevation-left", label: "左侧" },
  { id: "elevation-right", label: "右侧" },
  { id: "roof", label: "屋顶" },
];

type ViewTabsProps = {
  activeView: ViewId;
  onViewChange: (viewId: ViewId) => void;
};

export function ViewTabs({ activeView, onViewChange }: ViewTabsProps) {
  return (
    <nav className="view-tabs" aria-label="2D views">
      {VIEW_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className="tab-button"
          aria-pressed={activeView === tab.id}
          onClick={() => onViewChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
