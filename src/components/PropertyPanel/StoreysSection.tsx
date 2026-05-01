import type { ProjectAction, ProjectState } from "../../app/projectReducer";
import { Accordion } from "../chrome/Accordion";
import { StoreysEditor } from "../StoreysEditor";

type StoreysSectionProps = {
  project: ProjectState;
  dispatch: (action: ProjectAction) => void;
  showStoreyDatums: boolean;
  onSetShowStoreyDatums: (visible: boolean) => void;
};

export function StoreysSection({
  project,
  dispatch,
  showStoreyDatums,
  onSetShowStoreyDatums,
}: StoreysSectionProps) {
  return (
    <Accordion title="STOREYS" defaultOpen>
      <label className="storeys-datum-toggle">
        <input
          type="checkbox"
          checked={showStoreyDatums}
          onChange={(e) => onSetShowStoreyDatums(e.target.checked)}
        />
        <span>显示层标线（立面 / 3D）</span>
      </label>
      <StoreysEditor project={project} dispatch={dispatch} />
    </Accordion>
  );
}
