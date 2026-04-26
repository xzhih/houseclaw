import type { ViewId } from "../domain/types";

export type PrimaryView = "plan" | "elevation";

const PRIMARY_TABS: { type: PrimaryView; label: string }[] = [
  { type: "plan", label: "俯视" },
  { type: "elevation", label: "正视" },
];

export function primaryFromView(view: ViewId): PrimaryView {
  if (view.startsWith("plan-")) return "plan";
  return "elevation";
}

type ViewTabsProps = {
  activeView: ViewId;
  onPrimaryChange: (primary: PrimaryView) => void;
};

export function ViewTabs({ activeView, onPrimaryChange }: ViewTabsProps) {
  const current = primaryFromView(activeView);
  return (
    <nav className="view-tabs" aria-label="view mode">
      {PRIMARY_TABS.map((tab) => (
        <button
          key={tab.type}
          type="button"
          className="tab-button"
          aria-pressed={current === tab.type}
          onClick={() => onPrimaryChange(tab.type)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
