import type { ProjectAction, ProjectState } from "../../app/projectReducer";
import { Accordion } from "../chrome/Accordion";
import { StoreysEditor } from "../StoreysEditor";

type StoreysSectionProps = {
  project: ProjectState;
  dispatch: (action: ProjectAction) => void;
};

export function StoreysSection({ project, dispatch }: StoreysSectionProps) {
  return (
    <Accordion title="STOREYS" defaultOpen>
      <StoreysEditor project={project} dispatch={dispatch} />
    </Accordion>
  );
}
