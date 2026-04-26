import type { ViewId } from "../domain/types";

export type ViewType = "plan" | "front" | "back" | "left" | "right" | "roof";

const VIEW_TABS: { type: ViewType; label: string }[] = [
  { type: "plan", label: "俯视" },
  { type: "front", label: "正视" },
  { type: "back", label: "背视" },
  { type: "left", label: "左视" },
  { type: "right", label: "右视" },
  { type: "roof", label: "屋顶" },
];

export function viewTypeFromView(view: ViewId): ViewType {
  if (view.startsWith("plan-")) return "plan";
  if (view === "elevation-front") return "front";
  if (view === "elevation-back") return "back";
  if (view === "elevation-left") return "left";
  if (view === "elevation-right") return "right";
  return "roof";
}

type ViewTabsProps = {
  activeView: ViewId;
  onViewTypeChange: (type: ViewType) => void;
};

export function ViewTabs({ activeView, onViewTypeChange }: ViewTabsProps) {
  const current = viewTypeFromView(activeView);
  return (
    <nav className="view-tabs" aria-label="2D views">
      {VIEW_TABS.map((tab) => (
        <button
          key={tab.type}
          type="button"
          className="tab-button"
          aria-pressed={current === tab.type}
          onClick={() => onViewTypeChange(tab.type)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
