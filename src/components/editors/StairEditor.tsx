import type { ProjectState, ProjectAction } from "../../app/projectReducer";
import type { Stair, StairEdge, StairShape, StairTurn } from "../../domain/types";
import { NumberField } from "../NumberField";
import { DeleteRow } from "../chrome/DeleteRow";
import { AnchorPicker } from "./AnchorPicker";
import { MaterialPicker } from "./MaterialPicker";

type StairEditorProps = {
  stair: Stair;
  project: ProjectState;
  dispatch: (action: ProjectAction) => void;
};

const SHAPES: Array<{ id: StairShape; label: string }> = [
  { id: "straight", label: "直跑" },
  { id: "l", label: "L 形" },
  { id: "u", label: "U 形" },
];

const EDGES: Array<{ id: StairEdge; label: string }> = [
  { id: "+y", label: "+y（向后上）" },
  { id: "-y", label: "-y（向前上）" },
  { id: "+x", label: "+x（向左上）" },
  { id: "-x", label: "-x（向右上）" },
];

const TURNS: Array<{ id: StairTurn; label: string }> = [
  { id: "left", label: "向左转" },
  { id: "right", label: "向右转" },
];

function tryDispatch(fn: () => ProjectAction, dispatch: (action: ProjectAction) => void): string | undefined {
  try { dispatch(fn()); return undefined; } catch (e) { return e instanceof Error ? e.message : String(e); }
}

function deg(r: number): number { return (r * 180) / Math.PI; }
function rad(d: number): number { return (d * Math.PI) / 180; }

export function StairEditor({ stair, project, dispatch }: StairEditorProps) {
  return (
    <div className="entity-editor stair-editor">
      <div className="entity-editor-title">楼梯 {stair.id}</div>
      <AnchorPicker
        label="起点 z"
        anchor={stair.from}
        storeys={project.storeys}
        onChange={(from) => dispatch({ type: "update-stair", stairId: stair.id, patch: { from } })}
      />
      <AnchorPicker
        label="终点 z"
        anchor={stair.to}
        storeys={project.storeys}
        onChange={(to) => dispatch({ type: "update-stair", stairId: stair.id, patch: { to } })}
      />
      <div className="entity-editor-row">
        <label>形状</label>
        <select
          value={stair.shape}
          onChange={(e) => dispatch({ type: "update-stair", stairId: stair.id, patch: { shape: e.target.value as StairShape } })}
        >
          {SHAPES.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
        </select>
      </div>
      <div className="entity-editor-row">
        <label>底边方向</label>
        <select
          value={stair.bottomEdge}
          onChange={(e) => dispatch({ type: "update-stair", stairId: stair.id, patch: { bottomEdge: e.target.value as StairEdge } })}
        >
          {EDGES.map((s) => (<option key={s.id} value={s.id}>{s.label}</option>))}
        </select>
      </div>
      {(stair.shape === "l" || stair.shape === "u") && (
        <div className="entity-editor-row">
          <label>转向</label>
          <select
            value={stair.turn ?? "right"}
            onChange={(e) => dispatch({ type: "update-stair", stairId: stair.id, patch: { turn: e.target.value as StairTurn } })}
          >
            {TURNS.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
          </select>
        </div>
      )}
      <NumberField
        label="X 位置"
        value={stair.x}
        step={0.05}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { x: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="Y 位置"
        value={stair.y}
        step={0.05}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { y: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="宽度"
        value={stair.width}
        step={0.05}
        min={0.6}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { width: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="进深"
        value={stair.depth}
        step={0.05}
        min={0.6}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { depth: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="踏步深度"
        value={stair.treadDepth}
        step={0.01}
        min={0.2}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { treadDepth: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="旋转"
        value={deg(stair.rotation ?? 0)}
        step={1}
        min={-180}
        max={180}
        unit="°"
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-stair", stairId: stair.id, patch: { rotation: rad(v) } }),
          dispatch,
        )}
      />
      <MaterialPicker
        label="材质"
        materials={project.materials}
        value={stair.materialId}
        onChange={(materialId) => dispatch({ type: "update-stair", stairId: stair.id, patch: { materialId } })}
      />
      <DeleteRow
        label="删除楼梯"
        onConfirm={() => {
          dispatch({ type: "remove-stair", stairId: stair.id });
          dispatch({ type: "select", selection: undefined });
        }}
      />
    </div>
  );
}
