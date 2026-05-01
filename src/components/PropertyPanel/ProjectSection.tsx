import type { ProjectStateV2 } from "../../app/v2/projectReducer";
import { Accordion } from "../chrome/Accordion";

type ProjectSectionProps = {
  project: ProjectStateV2;
};

export function ProjectSection({ project }: ProjectSectionProps) {
  return (
    <Accordion title="PROJECT">
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
        }}
      >
        ID · {project.id}
      </p>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
        }}
      >
        STOREYS · {project.storeys.length}
      </p>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
        }}
      >
        WALLS · {project.walls.length}
      </p>
      <p className="chrome-panel-empty-hint">导入 / 导出 / 重置功能尚未接通</p>
    </Accordion>
  );
}
