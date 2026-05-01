import { useRef, useState } from "react";
import type { ProjectActionV2, ProjectStateV2 } from "../../app/v2/projectReducer";
import { withSessionDefaults } from "../../app/v2/projectReducer";
import { createV2SampleProject } from "../../domain/v2/sampleProject";
import {
  downloadProjectJson,
  importProjectJson,
} from "../../app/v2/persistenceV2";
import { Accordion } from "../chrome/Accordion";

type ProjectSectionProps = {
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

export function ProjectSection({ project, dispatch }: ProjectSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleNew = () => {
    if (
      !confirm(
        "新建空白项目?当前未导出的修改会丢失(Cmd+Z 仍可在新建后撤销回来)。",
      )
    ) {
      return;
    }
    const fresh = withSessionDefaults({
      ...createV2SampleProject(),
      id: `proj-${Date.now().toString(36)}`,
      name: "未命名项目",
      walls: [],
      slabs: [],
      roofs: [],
      openings: [],
      balconies: [],
      stairs: [],
    });
    dispatch({ type: "replace-project", project: fresh });
  };

  const handleExport = () => {
    downloadProjectJson(project);
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // reset so picking the same file twice still fires
    if (!file) return;
    try {
      const text = await file.text();
      const imported = importProjectJson(text);
      const next = withSessionDefaults(imported);
      dispatch({ type: "replace-project", project: next });
      setImportError(null);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleRename = () => {
    const name = prompt("项目名:", project.name);
    if (name === null || name === project.name) return;
    dispatch({
      type: "replace-project",
      project: { ...project, name: name.trim() || "未命名项目" },
    });
  };

  return (
    <Accordion title="PROJECT">
      <div className="chrome-project-row">
        <span className="chrome-project-row-key">名称</span>
        <button type="button" className="chrome-project-name" onClick={handleRename}>
          {project.name || "未命名项目"}
        </button>
      </div>
      <div className="chrome-project-row">
        <span className="chrome-project-row-key">ID</span>
        <span className="chrome-project-row-value">{project.id}</span>
      </div>
      <div className="chrome-project-row">
        <span className="chrome-project-row-key">楼层</span>
        <span className="chrome-project-row-value">{project.storeys.length}</span>
      </div>
      <div className="chrome-project-row">
        <span className="chrome-project-row-key">墙</span>
        <span className="chrome-project-row-value">{project.walls.length}</span>
      </div>

      <div className="chrome-project-actions">
        <button type="button" className="chrome-project-action" onClick={handleNew}>
          + 新建
        </button>
        <button type="button" className="chrome-project-action" onClick={handleImportClick}>
          导入 JSON
        </button>
        <button type="button" className="chrome-project-action" onClick={handleExport}>
          导出 JSON
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {importError ? (
        <p className="chrome-project-error">{importError}</p>
      ) : null}
    </Accordion>
  );
}
