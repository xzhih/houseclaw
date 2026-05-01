import type { ProjectAction, ProjectState } from "../app/projectReducer";
import type { WorkspaceCatalog } from "../app/workspace";
import type { HouseProject } from "../domain/types";
import { StoreysSection } from "./PropertyPanel/StoreysSection";
import { SelectionSection } from "./PropertyPanel/SelectionSection";
import { MaterialsSection } from "./PropertyPanel/MaterialsSection";
import { ExportSection } from "./PropertyPanel/ExportSection";
import { ProjectSection } from "./PropertyPanel/ProjectSection";

type PropertyPanelProps = {
  project: ProjectState;
  dispatch: (action: ProjectAction) => void;
  catalog: WorkspaceCatalog;
  onSwitchProject: (id: string) => void;
  onAddProject: (project: HouseProject) => void;
  onRemoveProject: (id: string) => void;
  showStoreyDatums: boolean;
  onSetShowStoreyDatums: (visible: boolean) => void;
};

export function PropertyPanel({
  project,
  dispatch,
  catalog,
  onSwitchProject,
  onAddProject,
  onRemoveProject,
  showStoreyDatums,
  onSetShowStoreyDatums,
}: PropertyPanelProps) {
  return (
    <aside aria-label="属性面板">
      <StoreysSection
        project={project}
        dispatch={dispatch}
        showStoreyDatums={showStoreyDatums}
        onSetShowStoreyDatums={onSetShowStoreyDatums}
      />
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
