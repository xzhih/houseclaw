import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Wall } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { ToggleRow } from "../chrome/ToggleRow";
import { AnchorPicker } from "./AnchorPicker";
import { MaterialPicker } from "./MaterialPicker";

type WallEditorProps = {
  wall: Wall;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function tryDispatch(
  fn: () => ProjectActionV2,
  dispatch: (action: ProjectActionV2) => void,
): string | undefined {
  try {
    dispatch(fn());
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function WallEditor({ wall, project, dispatch }: WallEditorProps) {
  return (
    <div className="entity-editor wall-editor">
      <div className="entity-editor-title">墙 {wall.id}</div>
      <AnchorPicker
        label="底"
        anchor={wall.bottom}
        storeys={project.storeys}
        onChange={(bottom) => dispatch({ type: "update-wall", wallId: wall.id, patch: { bottom } })}
      />
      <AnchorPicker
        label="顶"
        anchor={wall.top}
        storeys={project.storeys}
        onChange={(top) => dispatch({ type: "update-wall", wallId: wall.id, patch: { top } })}
      />
      <NumberField
        label="厚度"
        value={wall.thickness}
        step={0.01}
        min={0.05}
        unit="m"
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-wall", wallId: wall.id, patch: { thickness: v } }),
          dispatch,
        )}
      />
      <ToggleRow
        label="EXTERIOR"
        value={wall.exterior}
        onChange={(exterior) => dispatch({ type: "update-wall", wallId: wall.id, patch: { exterior } })}
      />
      <MaterialPicker
        label="材质"
        materials={project.materials}
        value={wall.materialId}
        kinds={["wall", "decor"]}
        onChange={(materialId) => dispatch({ type: "update-wall", wallId: wall.id, patch: { materialId } })}
      />
    </div>
  );
}
