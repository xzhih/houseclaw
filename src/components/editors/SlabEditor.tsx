import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Slab } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { AnchorPicker } from "./AnchorPicker";
import { MaterialPicker } from "./MaterialPicker";

type SlabEditorProps = {
  slab: Slab;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function tryDispatch(fn: () => ProjectActionV2, dispatch: (action: ProjectActionV2) => void): string | undefined {
  try { dispatch(fn()); return undefined; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

export function SlabEditor({ slab, project, dispatch }: SlabEditorProps) {
  return (
    <div className="entity-editor slab-editor">
      <div className="entity-editor-title">楼板 {slab.id}</div>
      <AnchorPicker
        label="顶面"
        anchor={slab.top}
        storeys={project.storeys}
        onChange={(top) => dispatch({ type: "update-slab", slabId: slab.id, patch: { top } })}
      />
      <NumberField
        label="厚度"
        value={slab.thickness}
        step={0.01}
        min={0.05}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-slab", slabId: slab.id, patch: { thickness: v } }),
          dispatch,
        )}
      />
      <MaterialPicker
        label="顶面材质"
        materials={project.materials}
        value={slab.materialId}
        kinds={["decor", "wall"]}
        onChange={(materialId) => dispatch({ type: "update-slab", slabId: slab.id, patch: { materialId } })}
      />
      <div className="entity-editor-readonly">
        多边形 {slab.polygon.length} 顶点{slab.holes && slab.holes.length ? `, ${slab.holes.length} 个 hole` : ""}
      </div>
    </div>
  );
}
