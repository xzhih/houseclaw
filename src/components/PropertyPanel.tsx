import type { ProjectActionV2, ProjectStateV2 } from "../app/v2/projectReducer";
import { StoreysSection } from "./PropertyPanel/StoreysSection";
import { SelectionSection } from "./PropertyPanel/SelectionSection";
import { MaterialsSection } from "./PropertyPanel/MaterialsSection";
import { ExportSection } from "./PropertyPanel/ExportSection";
import { ProjectSection } from "./PropertyPanel/ProjectSection";

type PropertyPanelProps = {
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

export function PropertyPanel({ project, dispatch }: PropertyPanelProps) {
  return (
    <aside aria-label="属性面板">
      <StoreysSection project={project} dispatch={dispatch} />
      <SelectionSection project={project} dispatch={dispatch} />
      <MaterialsSection project={project} />
      <ExportSection />
      <ProjectSection project={project} dispatch={dispatch} />
    </aside>
  );
}
