import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Balcony } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { AnchorPicker } from "./AnchorPicker";
import { MaterialPicker } from "./MaterialPicker";

type BalconyEditorProps = {
  balcony: Balcony;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function tryDispatch(fn: () => ProjectActionV2, dispatch: (action: ProjectActionV2) => void): string | undefined {
  try { dispatch(fn()); return undefined; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

export function BalconyEditor({ balcony, project, dispatch }: BalconyEditorProps) {
  return (
    <div className="entity-editor balcony-editor">
      <div className="entity-editor-title">阳台 {balcony.id} (墙 {balcony.attachedWallId})</div>
      <AnchorPicker
        label="楼板顶"
        anchor={balcony.slabTop}
        storeys={project.storeys}
        onChange={(slabTop) => dispatch({ type: "update-balcony", balconyId: balcony.id, patch: { slabTop } })}
      />
      <NumberField
        label="距墙起点"
        value={balcony.offset}
        step={0.05}
        min={0}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-balcony", balconyId: balcony.id, patch: { offset: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="宽度"
        value={balcony.width}
        step={0.05}
        min={0.5}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-balcony", balconyId: balcony.id, patch: { width: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="进深"
        value={balcony.depth}
        step={0.05}
        min={0.5}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-balcony", balconyId: balcony.id, patch: { depth: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="楼板厚度"
        value={balcony.slabThickness}
        step={0.01}
        min={0.05}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-balcony", balconyId: balcony.id, patch: { slabThickness: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="栏杆高度"
        value={balcony.railingHeight}
        step={0.05}
        min={0.5}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-balcony", balconyId: balcony.id, patch: { railingHeight: v } }),
          dispatch,
        )}
      />
      <MaterialPicker
        label="底面材质"
        materials={project.materials}
        value={balcony.materialId}
        onChange={(materialId) => dispatch({ type: "update-balcony", balconyId: balcony.id, patch: { materialId } })}
      />
      <MaterialPicker
        label="栏杆材质"
        materials={project.materials}
        value={balcony.railingMaterialId}
        kinds={["frame", "railing"]}
        onChange={(materialId) => dispatch({ type: "update-balcony", balconyId: balcony.id, patch: { railingMaterialId: materialId } })}
      />
    </div>
  );
}
