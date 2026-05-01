import type { ProjectActionV2, ProjectStateV2 } from "../app/v2/projectReducer";
import type { WorkspaceCatalog } from "../app/v2/workspaceV2";
import type { HouseProject } from "../domain/v2/types";
import { StoreysSection } from "./PropertyPanel/StoreysSection";
import { SelectionSection } from "./PropertyPanel/SelectionSection";
import { MaterialsSection } from "./PropertyPanel/MaterialsSection";
import { ExportSection } from "./PropertyPanel/ExportSection";
import { ProjectSection } from "./PropertyPanel/ProjectSection";

type PropertyPanelProps = {
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
  catalog: WorkspaceCatalog;
  onSwitchProject: (id: string) => void;
  onAddProject: (project: HouseProject) => void;
  onRemoveProject: (id: string) => void;
};

export function PropertyPanel({
  project,
  dispatch,
  catalog,
  onSwitchProject,
  onAddProject,
  onRemoveProject,
}: PropertyPanelProps) {
  return (
    <aside aria-label="属性面板">
      <StoreysSection project={project} dispatch={dispatch} />
      <SelectionSection project={project} dispatch={dispatch} />
      <MaterialsSection project={project} />
      <ExportSection />
      <ProjectSection
        project={project}
        dispatch={dispatch}
        catalog={catalog}
        onSwitchProject={onSwitchProject}
        onAddProject={onAddProject}
        onRemoveProject={onRemoveProject}
      />
    </aside>
  );
}
