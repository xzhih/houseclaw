import type { ProjectStateV2 } from "../app/v2/projectReducer";

type ViewTabsProps = {
  project: ProjectStateV2;
  onChange: (viewId: string) => void;
};

export function ViewTabs({ project, onChange }: ViewTabsProps) {
  const planTabs = project.storeys.map((s) => ({
    id: `plan-${s.id}`,
    label: s.label,
  }));
  return (
    <div className="view-tabs" role="tablist">
      {planTabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={project.activeView === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      <button
        role="tab"
        aria-selected={project.activeView.startsWith("elevation-")}
        onClick={() => onChange("elevation-front")}
      >
        立面
      </button>
      <button
        role="tab"
        aria-selected={project.activeView === "roof"}
        onClick={() => onChange("roof")}
      >
        屋顶
      </button>
    </div>
  );
}
