import { useRef, useState } from "react";
import type { ProjectAction, ProjectState } from "../../app/projectReducer";
import type { HouseProject } from "../../domain/types";
import {
  generateProjectId,
  nextProjectName,
  type WorkspaceCatalog,
} from "../../app/workspace";
import {
  downloadProjectJson,
  importProjectJson,
} from "../../app/persistence";
import { createShowcaseProject } from "../../domain/showcaseProject";
import { Accordion } from "../chrome/Accordion";

type ProjectSectionProps = {
  project: ProjectState;
  dispatch: (action: ProjectAction) => void;
  catalog: WorkspaceCatalog;
  onSwitchProject: (id: string) => void;
  onAddProject: (project: HouseProject) => void;
  onRemoveProject: (id: string) => void;
};

function emptyProject(name: string): HouseProject {
  return {
    schemaVersion: 2,
    id: generateProjectId(),
    name,
    storeys: [
      { id: "1f", label: "一层", elevation: 0 },
      { id: "2f", label: "二层", elevation: 3 },
      { id: "roof", label: "屋面", elevation: 6 },
    ],
    walls: [],
    slabs: [],
    roofs: [],
    openings: [],
    balconies: [],
    stairs: [],
    materials: [
      { id: "mat-wall-white", name: "白漆外墙", kind: "wall", color: "#f4efe6" },
      { id: "mat-roof-tile", name: "深灰瓦", kind: "roof", color: "#3a3a3a" },
      { id: "mat-frame-dark", name: "深灰窗框", kind: "frame", color: "#2a2a2a" },
      { id: "mat-door-walnut", name: "深木门", kind: "frame", color: "#5b3a26" },
      { id: "mat-slab-stone", name: "混凝土楼板", kind: "decor", color: "#bdbdbd" },
    ],
  };
}

export function ProjectSection({
  project,
  dispatch,
  catalog,
  onSwitchProject,
  onAddProject,
  onRemoveProject,
}: ProjectSectionProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const existingNames = catalog.projects.map((p) => p.name);

  const handleNew = () => {
    const name = nextProjectName(existingNames);
    onAddProject(emptyProject(name));
  };

  const handleNewShowcase = () => {
    const showcase = createShowcaseProject();
    // Avoid name collision with any existing project (e.g. another showcase).
    const name = existingNames.includes(showcase.name)
      ? nextProjectName(existingNames)
      : showcase.name;
    onAddProject({ ...showcase, name });
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
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const imported = importProjectJson(text);
      // Always assign a fresh id so importing twice doesn't collide with an
      // existing project in the catalog.
      const fresh: HouseProject = {
        ...imported,
        id: generateProjectId(),
      };
      onAddProject(fresh);
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

  const handleDelete = (id: string) => {
    if (catalog.projects.length <= 1) {
      setImportError("不能删除最后一个项目。");
      return;
    }
    const entry = catalog.projects.find((p) => p.id === id);
    if (!entry) return;
    if (!confirm(`确认删除项目 "${entry.name}"?此操作不可撤销。`)) return;
    onRemoveProject(id);
    setImportError(null);
  };

  return (
    <Accordion title="PROJECT">
      <div className="chrome-project-list">
        {catalog.projects.map((entry) => {
          const active = entry.id === catalog.activeId;
          return (
            <div
              key={entry.id}
              className={`chrome-project-item${active ? " is-active" : ""}`}
            >
              <button
                type="button"
                className="chrome-project-item-name"
                onClick={() => (active ? handleRename() : onSwitchProject(entry.id))}
                title={active ? "点击重命名" : "切换到这个项目"}
              >
                {active ? "● " : "○ "}
                {entry.name}
              </button>
              {!active ? (
                <button
                  type="button"
                  className="chrome-project-item-delete"
                  onClick={() => handleDelete(entry.id)}
                  title={`删除 ${entry.name}`}
                  aria-label={`删除项目 ${entry.name}`}
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="chrome-project-actions">
        <button type="button" className="chrome-project-action" onClick={handleNew}>
          + 新建空项目
        </button>
        <button type="button" className="chrome-project-action" onClick={handleNewShowcase}>
          + 新建示例项目（三层中式）
        </button>
        <button type="button" className="chrome-project-action" onClick={handleImportClick}>
          导入 JSON
        </button>
        <button type="button" className="chrome-project-action" onClick={handleExport}>
          导出当前 JSON
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

      <div className="chrome-project-row" style={{ marginTop: 12 }}>
        <span className="chrome-project-row-key">楼层</span>
        <span className="chrome-project-row-value">{project.storeys.length}</span>
      </div>
      <div className="chrome-project-row">
        <span className="chrome-project-row-key">墙</span>
        <span className="chrome-project-row-value">{project.walls.length}</span>
      </div>
    </Accordion>
  );
}
