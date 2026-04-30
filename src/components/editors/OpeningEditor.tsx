import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Opening, OpeningType } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { MaterialPicker } from "./MaterialPicker";

type OpeningEditorProps = {
  opening: Opening;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

const TYPES: Array<{ id: OpeningType; label: string }> = [
  { id: "door", label: "门" },
  { id: "window", label: "窗" },
  { id: "void", label: "空洞" },
];

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

export function OpeningEditor({ opening, project, dispatch }: OpeningEditorProps) {
  return (
    <div className="entity-editor opening-editor">
      <div className="entity-editor-title">开洞 {opening.id} (墙 {opening.wallId})</div>
      <div className="entity-editor-row">
        <label>类型</label>
        <select
          value={opening.type}
          onChange={(e) => dispatch({
            type: "update-opening",
            openingId: opening.id,
            patch: { type: e.target.value as OpeningType },
          })}
        >
          {TYPES.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
        </select>
      </div>
      <NumberField
        label="距墙起点"
        value={opening.offset}
        step={0.05}
        min={0}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { offset: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="离地高度"
        value={opening.sillHeight}
        step={0.05}
        min={0}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { sillHeight: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="宽度"
        value={opening.width}
        step={0.05}
        min={0.1}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { width: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="高度"
        value={opening.height}
        step={0.05}
        min={0.1}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { height: v } }),
          dispatch,
        )}
      />
      <MaterialPicker
        label="框架材质"
        materials={project.materials}
        value={opening.frameMaterialId}
        kinds={["frame"]}
        onChange={(materialId) => dispatch({ type: "update-opening", openingId: opening.id, patch: { frameMaterialId: materialId } })}
      />
    </div>
  );
}
