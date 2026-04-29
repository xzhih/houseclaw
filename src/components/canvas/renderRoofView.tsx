import type { ObjectSelection } from "../../domain/selection";
import { addRoof } from "../../domain/mutations";
import type { HouseProject } from "../../domain/types";
import { canBuildRoof } from "../../domain/views";
import { SURFACE_HEIGHT, SURFACE_PADDING, SURFACE_WIDTH } from "./renderUtils";

export function renderRoofView(
  project: HouseProject,
  onSelect: (sel: ObjectSelection | undefined) => void,
  onProjectChange: (project: HouseProject) => void,
) {
  if (!canBuildRoof(project)) {
    return (
      <g className="surface-placeholder">
        <text x={SURFACE_WIDTH / 2} y={SURFACE_HEIGHT / 2} textAnchor="middle">
          屋顶建模需要顶层为 4 面轴对齐外墙
        </text>
      </g>
    );
  }

  const top = [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
  const walls = project.walls.filter((w) => w.storeyId === top.id && w.exterior);

  const xs = walls.flatMap((w) => [w.start.x, w.end.x]);
  const ys = walls.flatMap((w) => [w.start.y, w.end.y]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const height = maxY - minY;
  const scale = Math.min(
    (SURFACE_WIDTH - SURFACE_PADDING * 2) / Math.max(width, 0.001),
    (SURFACE_HEIGHT - SURFACE_PADDING * 2) / Math.max(height, 0.001),
  );
  const offsetX = (SURFACE_WIDTH - width * scale) / 2 - minX * scale;
  const offsetY = (SURFACE_HEIGHT - height * scale) / 2 - minY * scale;
  const project2D = (p: { x: number; y: number }) => ({
    x: p.x * scale + offsetX,
    y: p.y * scale + offsetY,
  });

  if (!project.roof) {
    return (
      <g className="roof-add-prompt">
        {walls.map((w) => {
          const a = project2D(w.start);
          const b = project2D(w.end);
          return (
            <line
              key={w.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="roof-edge roof-edge--gable"
            />
          );
        })}
        <foreignObject
          x={SURFACE_WIDTH / 2 - 70}
          y={SURFACE_HEIGHT / 2 - 18}
          width={140}
          height={36}
        >
          <button
            type="button"
            onClick={() => onProjectChange(addRoof(project))}
          >
            + 添加屋顶
          </button>
        </foreignObject>
      </g>
    );
  }

  const roof = project.roof;

  return (
    <g>
      <rect
        x={SURFACE_PADDING}
        y={SURFACE_PADDING}
        width={SURFACE_WIDTH - SURFACE_PADDING * 2}
        height={SURFACE_HEIGHT - SURFACE_PADDING * 2}
        fill="transparent"
        data-testid="roof-body"
        onClick={() => onSelect({ kind: "roof" })}
      />
      {walls.map((w) => {
        const a = project2D(w.start);
        const b = project2D(w.end);
        const kind = roof.edges[w.id] === "eave" ? "eave" : "gable";
        const isSelected =
          project.selection?.kind === "roof-edge" && project.selection.wallId === w.id;
        return (
          <line
            key={w.id}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className={`roof-edge roof-edge--${kind}${isSelected ? " is-selected" : ""}`}
            data-testid={`roof-edge-${w.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect({ kind: "roof-edge", wallId: w.id });
            }}
          />
        );
      })}
    </g>
  );
}
