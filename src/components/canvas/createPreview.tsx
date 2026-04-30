import type { CreateState } from "./useCreateHandlers";
import type { Point2D, PointMapping } from "./types";

type CreatePreviewProps = {
  state: CreateState;
  mapping: PointMapping;
  cursorWorld?: Point2D;
};

export function CreatePreview({ state, mapping, cursorWorld }: CreatePreviewProps) {
  if (state.kind === "wall-pending" && cursorWorld) {
    const a = mapping.project(state.firstPoint);
    const b = mapping.project(cursorWorld);
    return (
      <line
        x1={a.x} y1={a.y} x2={b.x} y2={b.y}
        stroke="#3b82f6"
        strokeWidth={2}
        strokeDasharray="4 4"
        pointerEvents="none"
      />
    );
  }

  if (state.kind === "slab-pending") {
    const points = state.vertices.map(mapping.project);
    if (points.length < 1) return null;
    const lineSegments = points.slice(1).map((p, i) => {
      const prev = points[i];
      return <line key={i} x1={prev.x} y1={prev.y} x2={p.x} y2={p.y} stroke="#3b82f6" strokeWidth={1.5} pointerEvents="none" />;
    });
    const dots = points.map((p, i) => (
      <circle key={`v-${i}`} cx={p.x} cy={p.y} r={3} fill="#3b82f6" pointerEvents="none" />
    ));
    return (
      <g>
        {lineSegments}
        {dots}
      </g>
    );
  }

  return null;
}
