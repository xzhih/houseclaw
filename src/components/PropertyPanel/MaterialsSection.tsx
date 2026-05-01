import type { ProjectState } from "../../app/projectReducer";
import { Accordion } from "../chrome/Accordion";

type MaterialsSectionProps = {
  project: ProjectState;
};

export function MaterialsSection({ project }: MaterialsSectionProps) {
  return (
    <Accordion title="MATERIALS">
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {project.materials.map((m) => (
          <li
            key={m.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                borderRadius: 2,
                background: m.color,
                border: "1px solid var(--border-mid)",
              }}
            />
            {m.name}
          </li>
        ))}
      </ul>
    </Accordion>
  );
}
