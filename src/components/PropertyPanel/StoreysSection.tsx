import type { ProjectActionV2, ProjectStateV2 } from "../../app/v2/projectReducer";
import { Accordion } from "../chrome/Accordion";
import { StoreysEditor } from "../StoreysEditor";

type StoreysSectionProps = {
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

export function StoreysSection({ project, dispatch }: StoreysSectionProps) {
  return (
    <Accordion title="STOREYS" defaultOpen>
      <StoreysEditor project={project} dispatch={dispatch} />
    </Accordion>
  );
}
