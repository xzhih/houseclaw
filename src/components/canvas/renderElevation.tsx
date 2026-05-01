import type { Selection } from "../../app/projectReducer";

import type {
  ElevationBalconyRect,
  ElevationProjection,
} from "../../projection/types";
import type { ElevationDragHandlers as ElevationDragHandlers } from "./dragState";
import { renderSelectableBalcony } from "./renderPlan";
import type { PointMapping } from "./types";

const ENDPOINT_HANDLE_RADIUS = 7;

type RenderElevationProps = {
  projection: ElevationProjection;
  mapping: PointMapping;
  selection: Selection | undefined;
  onSelect: (selection: Selection) => void;
  activeTool?: string;
  handlers?: ElevationDragHandlers;
  showStoreyDatums?: boolean;
};

export function renderElevation({
  projection,
  mapping,
  selection,
  onSelect,
  handlers,
  showStoreyDatums = true,
}: RenderElevationProps) {
  const { project: projectPoint } = mapping;

  const selectedOpening =
    selection?.kind === "opening"
      ? projection.openings.find((opening) => opening.openingId === selection.openingId)
      : undefined;
  const selectedBalcony =
    selection?.kind === "balcony"
      ? projection.balconies.find((balcony) => balcony.balconyId === selection.balconyId)
      : undefined;

  const sortedBands = [...projection.wallBands].sort((a, b) => b.depth - a.depth);

  // Compute the elevation view's X span so storey datum lines stretch
  // BEYOND the wall geometry on either side — embedded-in-wall datums
  // look like a glitch, the convention is for them to overhang.
  const DATUM_MARGIN = 1.4;
  const xs: number[] = [];
  for (const band of projection.wallBands) xs.push(band.x, band.x + band.width);
  for (const line of projection.slabLines) xs.push(line.start.x, line.end.x);
  for (const op of projection.openings) xs.push(op.x, op.x + op.width);
  for (const b of projection.balconies) xs.push(b.x, b.x + b.width);
  for (const poly of projection.roofPolygons) for (const v of poly.vertices) xs.push(v.x);
  const datumMinX = (xs.length ? Math.min(...xs) : 0) - DATUM_MARGIN;
  const datumMaxX = (xs.length ? Math.max(...xs) : 8) + DATUM_MARGIN;

  return (
    <>
      {showStoreyDatums && projection.storeyLines.map((line) => {
        const left = projectPoint({ x: datumMinX, y: line.elevation });
        const right = projectPoint({ x: datumMaxX, y: line.elevation });
        return (
          <g key={`storey-${line.storeyId}`} className="elevation-storey-datum">
            <line
              x1={left.x}
              y1={left.y}
              x2={right.x}
              y2={right.y}
              stroke="rgba(127, 127, 127, 0.55)"
              strokeWidth={1}
              strokeDasharray="6 4"
              pointerEvents="none"
            />
            <text
              x={left.x - 6}
              y={left.y + 4}
              textAnchor="end"
              fontSize={11}
              fill="rgba(60, 60, 60, 0.75)"
              pointerEvents="none"
            >
              {line.label} {line.elevation >= 0 ? "+" : "−"}
              {Math.abs(line.elevation).toFixed(3)}
            </text>
          </g>
        );
      })}
      {sortedBands.map((band) => {
        const topLeft = projectPoint({ x: band.x, y: band.y + band.height });
        const bottomRight = projectPoint({ x: band.x + band.width, y: band.y });
        const selected = selection?.kind === "wall" && selection.wallId === band.wallId;

        return (
          <rect
            key={`${band.wallId}`}
            className={selected ? "elevation-wall is-selected" : "elevation-wall"}
            x={topLeft.x}
            y={topLeft.y}
            width={bottomRight.x - topLeft.x}
            height={bottomRight.y - topLeft.y}
            onClick={() => onSelect({ kind: "wall", wallId: band.wallId })}
          />
        );
      })}
      {projection.slabLines.map((line) => {
        const a = mapping.project({ x: line.start.x, y: line.start.y });
        const b = mapping.project({ x: line.end.x, y: line.end.y });
        return (
          <line
            key={`slab-${line.slabId}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="rgba(0, 0, 0, 0.4)"
            strokeWidth={1}
            pointerEvents="none"
          />
        );
      })}
      {projection.roofPolygons.map((poly, index) => {
        const points = poly.vertices
          .map((v) => {
            const p = projectPoint(v);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={`roof-${poly.roofId}-${index}`}
            className={`elevation-roof elevation-roof--${poly.kind}`}
            points={points}
          />
        );
      })}
      {projection.openings.map((opening) => {
        const topLeft = projectPoint({ x: opening.x, y: opening.y + opening.height });
        const bottomRight = projectPoint({ x: opening.x + opening.width, y: opening.y });
        const selected = selection?.kind === "opening" && selection.openingId === opening.openingId;
        const typeClass = `elevation-opening--${opening.type}`;

        return (
          <rect
            key={opening.openingId}
            role="button"
            tabIndex={0}
            aria-label={`选择开孔 ${opening.openingId}`}
            aria-pressed={selected}
            className={`elevation-opening ${typeClass}${selected ? " is-selected" : ""}`}
            x={topLeft.x}
            y={topLeft.y}
            width={bottomRight.x - topLeft.x}
            height={bottomRight.y - topLeft.y}
            onPointerDown={(event) => handlers?.onOpeningPointerDown(event, opening.openingId)}
            onClick={() => onSelect({ kind: "opening", openingId: opening.openingId })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect({ kind: "opening", openingId: opening.openingId });
              }
            }}
          />
        );
      })}
      {projection.balconies.map((balcony: ElevationBalconyRect) => {
        const topLeft = projectPoint({ x: balcony.x, y: balcony.y + balcony.height });
        const bottomRight = projectPoint({ x: balcony.x + balcony.width, y: balcony.y });

        return (
          <g key={balcony.balconyId}>
            {renderSelectableBalcony(
              balcony.balconyId,
              selection?.kind === "balcony" && selection.balconyId === balcony.balconyId,
              onSelect,
              undefined,
              {
                className: "elevation-balcony",
                x: topLeft.x,
                y: topLeft.y,
                width: bottomRight.x - topLeft.x,
                height: bottomRight.y - topLeft.y,
              },
              (event) => handlers?.onBalconyPointerDown(event, balcony.balconyId),
            )}
          </g>
        );
      })}
      {selectedOpening && handlers
        ? (["tl", "tr", "bl", "br"] as const).map((corner) => {
            const isLeft = corner === "tl" || corner === "bl";
            const isBottom = corner === "bl" || corner === "br";
            const wx = selectedOpening.x + (isLeft ? 0 : selectedOpening.width);
            const wy = selectedOpening.y + (isBottom ? 0 : selectedOpening.height);
            const p = projectPoint({ x: wx, y: wy });
            return (
              <circle
                key={corner}
                className="resize-handle"
                cx={p.x}
                cy={p.y}
                r={ENDPOINT_HANDLE_RADIUS}
                aria-label={`调整开孔 ${selectedOpening.openingId} ${corner}`}
                onPointerDown={(event) =>
                  handlers.onOpeningCornerPointerDown(event, selectedOpening.openingId, corner)
                }
              />
            );
          })
        : null}
      {selectedBalcony && handlers
        ? (["l", "r"] as const).map((edge) => {
            const wx = selectedBalcony.x + (edge === "l" ? 0 : selectedBalcony.width);
            const wy = selectedBalcony.y + selectedBalcony.height / 2;
            const p = projectPoint({ x: wx, y: wy });
            return (
              <circle
                key={edge}
                className="resize-handle"
                cx={p.x}
                cy={p.y}
                r={ENDPOINT_HANDLE_RADIUS}
                aria-label={`调整阳台 ${selectedBalcony.balconyId} ${edge}`}
                onPointerDown={(event) =>
                  handlers.onBalconyEdgePointerDown(event, selectedBalcony.balconyId, edge)
                }
              />
            );
          })
        : null}
    </>
  );
}
