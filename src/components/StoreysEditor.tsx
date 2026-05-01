import type { ProjectState, ProjectAction } from "../app/projectReducer";
import { removeStorey, swapStoreyElevations } from "../domain/mutations";

type StoreysEditorProps = {
  project: ProjectState;
  dispatch: (action: ProjectAction) => void;
};

function formatElevation(z: number): string {
  if (Math.abs(z) < 0.001) return "±0.000";
  const sign = z >= 0 ? "+" : "−";
  return `${sign}${Math.abs(z).toFixed(3)}`;
}

export function StoreysEditor({ project, dispatch }: StoreysEditorProps) {
  const sorted = [...project.storeys].sort((a, b) => a.elevation - b.elevation);

  // Pre-validate by running the mutation directly. The reducer can't surface
  // its own throws synchronously (it runs during render), so we check here
  // first and dispatch only if the resulting project would still be valid.
  const swapWith = (aId: string, bId: string) => {
    try {
      swapStoreyElevations(project, aId, bId);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      alert(`无法调整顺序：交换会让某些墙体或开孔不再合法。\n\n${raw}`);
      return;
    }
    dispatch({ type: "swap-storey-elevations", aId, bId });
  };

  const removeWithCheck = (storeyId: string, label: string) => {
    try {
      removeStorey(project, storeyId);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      alert(`无法删除「${label}」：\n\n${raw}`);
      return;
    }
    dispatch({ type: "remove-storey", storeyId });
  };

  return (
    <div className="storeys-editor" role="group" aria-label="楼层管理">
      <div className="storeys-editor-row storeys-editor-header">
        <span>楼层</span>
        <span>标签</span>
        <span>标高 (m)</span>
        <span>层高 (m)</span>
        <span></span>
      </div>
      {sorted.map((storey, i) => {
        const next = sorted[i + 1];
        const prev = sorted[i - 1];
        const computedHeight = next ? next.elevation - storey.elevation : null;
        return (
          <div key={storey.id} className="storeys-editor-row">
            <span className="storey-id">{storey.id}</span>
            <input
              type="text"
              value={storey.label}
              onChange={(e) =>
                dispatch({
                  type: "set-storey-label",
                  storeyId: storey.id,
                  label: e.target.value,
                })
              }
            />
            <input
              type="number"
              step="0.05"
              value={storey.elevation.toFixed(3)}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) {
                  dispatch({
                    type: "set-storey-elevation",
                    storeyId: storey.id,
                    elevation: v,
                  });
                }
              }}
              aria-label={`${storey.label} 标高`}
              title={`${storey.label} 标高 ${formatElevation(storey.elevation)}m`}
            />
            {computedHeight !== null ? (
              <input
                type="number"
                step="0.05"
                min="0.5"
                value={computedHeight.toFixed(3)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v >= 0.5) {
                    dispatch({
                      type: "set-storey-height",
                      storeyId: storey.id,
                      height: v,
                    });
                  }
                }}
                aria-label={`${storey.label} 层高`}
              />
            ) : (
              <span className="storey-no-height">—</span>
            )}
            <div className="storey-actions">
              <button
                type="button"
                className="storey-move"
                onClick={() => prev && swapWith(storey.id, prev.id)}
                disabled={!prev}
                aria-label={`下移 ${storey.label}`}
                title={prev ? `下移到 ${prev.label} 位置` : "已在最底层"}
              >
                ↓
              </button>
              <button
                type="button"
                className="storey-move"
                onClick={() => next && swapWith(storey.id, next.id)}
                disabled={!next}
                aria-label={`上移 ${storey.label}`}
                title={next ? `上移到 ${next.label} 位置` : "已在最顶层"}
              >
                ↑
              </button>
              <button
                type="button"
                className="storey-remove"
                onClick={() => removeWithCheck(storey.id, storey.label)}
                title={`删除 ${storey.label}`}
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="storey-add-button"
        onClick={() => dispatch({ type: "add-storey" })}
      >
        + 添加楼层
      </button>
    </div>
  );
}
