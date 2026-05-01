import type { ProjectState } from "../app/projectReducer";

type ViewTabsProps = {
  project: ProjectState;
  onChange: (viewId: string) => void;
};

export function ViewTabs({ project, onChange }: ViewTabsProps) {
  const planTabs = project.storeys.map((s) => ({
    id: `plan-${s.id}`,
    label: s.label,
  }));
  const isElevation = project.activeView.startsWith("elevation-");
  const isRoof = project.activeView === "roof";
  const is3D = project.mode === "3d";

  return (
    <div className="chrome-viewbar" role="tablist">
      {planTabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          className="chrome-viewbar-tab"
          aria-selected={!is3D && project.activeView === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      <button
        role="tab"
        className="chrome-viewbar-tab"
        aria-selected={!is3D && isElevation}
        onClick={() => onChange("elevation-front")}
      >
        立面
      </button>
      <button
        role="tab"
        className="chrome-viewbar-tab"
        aria-selected={!is3D && isRoof}
        onClick={() => onChange("roof")}
      >
        屋顶
      </button>
      <span style={{ flex: 1 }} aria-hidden />
      {/* "3d" is a mode sentinel — AppShell decodes it into set-mode without a set-view. */}
      <button
        role="tab"
        className="chrome-viewbar-tab"
        aria-selected={is3D}
        onClick={() => onChange("3d")}
      >
        3D
      </button>
    </div>
  );
}
