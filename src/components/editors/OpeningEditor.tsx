import type { ProjectState, ProjectAction } from "../../app/projectReducer";
import type { Opening, OpeningType } from "../../domain/types";
import { NumberField } from "../NumberField";
import { SelectRow } from "../chrome/SelectRow";
import { DeleteRow } from "../chrome/DeleteRow";
import { MaterialPicker } from "./MaterialPicker";

type OpeningEditorProps = {
  opening: Opening;
  project: ProjectState;
  dispatch: (action: ProjectAction) => void;
};

const TYPE_OPTIONS: Array<{ value: OpeningType; label: string }> = [
  { value: "door", label: "DOOR" },
  { value: "window", label: "WINDOW" },
  { value: "void", label: "VOID" },
];

function tryDispatch(
  fn: () => ProjectAction,
  dispatch: (action: ProjectAction) => void,
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
      <SelectRow
        label="TYPE"
        value={opening.type}
        options={TYPE_OPTIONS}
        onChange={(type) => dispatch({
          type: "update-opening",
          openingId: opening.id,
          patch: { type },
        })}
      />
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
      <DeleteRow
        label="删除开洞"
        onConfirm={() => {
          dispatch({ type: "remove-opening", openingId: opening.id });
          dispatch({ type: "select", selection: undefined });
        }}
      />
    </div>
  );
}
