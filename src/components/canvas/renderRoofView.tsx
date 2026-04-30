import type {
  RoofViewEdgeStroke,
  RoofViewPolygon,
  RoofViewProjectionV2,
} from "../../projection/v2/types";
import type { Point2D, PointMapping } from "./types";

type RenderRoofViewProps = {
  projection: RoofViewProjectionV2;
  mapping: PointMapping;
  selectedRoofId?: string;
  onSelectRoof?: (roofId: string) => void;
};

function strokeStyleForEdgeKind(kind: RoofViewEdgeStroke["kind"]): {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
} {
  if (kind === "eave") return { stroke: "#222", strokeWidth: 2 };
  if (kind === "gable") return { stroke: "#888", strokeWidth: 1 };
  // hip
  return { stroke: "#3b82f6", strokeWidth: 1, strokeDasharray: "6 4" };
}

function pathD(points: Point2D[]): string {
  if (points.length === 0) return "";
  const head = `M ${points[0].x} ${points[0].y}`;
  const tail = points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ");
  return `${head} ${tail} Z`;
}

export function renderRoofView({
  projection,
  mapping,
  selectedRoofId,
  onSelectRoof,
}: RenderRoofViewProps) {
  return (
    <g className="roof-view-layer">
      {projection.polygons.map((poly: RoofViewPolygon) => {
        const projected = poly.vertices.map(mapping.project);
        const isSelected = poly.roofId === selectedRoofId;
        return (
          <g key={`roof-${poly.roofId}`} className="roof-view-polygon">
            <path
              d={pathD(projected)}
              fill={isSelected ? "rgba(96, 165, 250, 0.25)" : "rgba(220, 220, 220, 0.4)"}
              stroke="none"
              onClick={() => onSelectRoof?.(poly.roofId)}
              style={{ cursor: onSelectRoof ? "pointer" : "default" }}
            />
            {poly.edges.map((edge, i) => {
              const a = mapping.project(edge.from);
              const b = mapping.project(edge.to);
              const style = strokeStyleForEdgeKind(edge.kind);
              return (
                <line
                  key={`edge-${i}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.strokeDasharray}
                  pointerEvents="none"
                />
              );
            })}
            {poly.ridgeLines.map((ridge, i) => {
              const a = mapping.project(ridge.from);
              const b = mapping.project(ridge.to);
              return (
                <line
                  key={`ridge-${i}`}
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke="#666"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  pointerEvents="none"
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
