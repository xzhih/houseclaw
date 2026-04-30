import { useReducer } from "react";
import { withSessionDefaults, projectReducerV2, type ProjectStateV2 } from "../app/v2/projectReducer";
import { createV2SampleProject } from "../domain/v2/sampleProject";
import { Preview3D } from "./Preview3D";

function init(): ProjectStateV2 {
  return withSessionDefaults(createV2SampleProject());
}

export function AppShell() {
  const [project, dispatch] = useReducer(projectReducerV2, undefined, init);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">HouseClaw</h1>
        <div className="mode-toggle" role="group" aria-label="模式">
          <button
            type="button"
            aria-pressed={project.mode === "2d"}
            onClick={() => dispatch({ type: "set-mode", mode: "2d" })}
          >
            2D
          </button>
          <button
            type="button"
            aria-pressed={project.mode === "3d"}
            onClick={() => dispatch({ type: "set-mode", mode: "3d" })}
          >
            3D
          </button>
        </div>
      </header>

      <main className="app-main">
        {project.mode === "3d" ? (
          <Preview3D project={project} />
        ) : (
          <div className="wip-placeholder">
            <h2>v2 2D 编辑器即将上线</h2>
            <p>P4B 阶段会接通 plan / elevation / roof 视图。当前阶段只有 3D 预览可用。</p>
            <button
              type="button"
              onClick={() => dispatch({ type: "set-mode", mode: "3d" })}
            >
              返回 3D 预览
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
