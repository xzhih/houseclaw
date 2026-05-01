import type { ProjectState, ProjectAction } from "../../app/projectReducer";
import type { Roof, RoofEdgeKind } from "../../domain/types";
import { NumberField } from "../NumberField";
import { DeleteRow } from "../chrome/DeleteRow";
import { AnchorPicker } from "./AnchorPicker";
import { MaterialPicker } from "./MaterialPicker";

type RoofEditorProps = {
  roof: Roof;
  project: ProjectState;
  dispatch: (action: ProjectAction) => void;
};

const EDGE_KINDS: Array<{ id: RoofEdgeKind; label: string }> = [
  { id: "eave", label: "檐口" },
  { id: "gable", label: "山墙" },
  { id: "hip", label: "戗脊" },
];

function tryDispatch(fn: () => ProjectAction, dispatch: (action: ProjectAction) => void): string | undefined {
  try { dispatch(fn()); return undefined; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

function deg(r: number): number { return (r * 180) / Math.PI; }
function rad(d: number): number { return (d * Math.PI) / 180; }

export function RoofEditor({ roof, project, dispatch }: RoofEditorProps) {
  return (
    <div className="entity-editor roof-editor">
      <div className="entity-editor-title">屋顶 {roof.id}</div>
      <AnchorPicker
        label="檐口高度"
        anchor={roof.base}
        storeys={project.storeys}
        onChange={(base) => dispatch({ type: "update-roof", roofId: roof.id, patch: { base } })}
      />
      <NumberField
        label="坡度"
        value={deg(roof.pitch)}
        step={1}
        min={5}
        max={60}
        unit="°"
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-roof", roofId: roof.id, patch: { pitch: rad(v) } }),
          dispatch,
        )}
      />
      <NumberField
        label="出檐"
        value={roof.overhang}
        step={0.05}
        min={0}
        max={2}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-roof", roofId: roof.id, patch: { overhang: v } }),
          dispatch,
        )}
      />
      <MaterialPicker
        label="瓦面材质"
        materials={project.materials}
        value={roof.materialId}
        kinds={["roof"]}
        onChange={(materialId) => dispatch({ type: "update-roof", roofId: roof.id, patch: { materialId } })}
      />
      <div className="entity-editor-edges">
        <div className="entity-editor-row-header">边类型</div>
        {roof.edges.map((edgeKind, i) => (
          <div className="entity-editor-row" key={i}>
            <label>边 {i}</label>
            <select
              value={edgeKind}
              onChange={(e) => {
                const newEdges = [...roof.edges];
                newEdges[i] = e.target.value as RoofEdgeKind;
                dispatch({ type: "update-roof", roofId: roof.id, patch: { edges: newEdges } });
              }}
            >
              {EDGE_KINDS.map((k) => (<option key={k.id} value={k.id}>{k.label}</option>))}
            </select>
          </div>
        ))}
      </div>
      <DeleteRow
        label="删除屋顶"
        onConfirm={() => {
          dispatch({ type: "remove-roof", roofId: roof.id });
          dispatch({ type: "select", selection: undefined });
        }}
      />
    </div>
  );
}
