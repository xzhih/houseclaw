import type { ObjectSelection } from "../../domain/selection";
import { isSelected } from "../../domain/selection";
import type { ToolId } from "../../domain/types";
import type {
  ElevationBalconyRect,
  ElevationProjection,
} from "../../projection/types";
import type { ElevationDragHandlers } from "./dragState";
import { renderSelectableBalcony } from "./renderPlan";
import { createPointMapping, elevationBounds } from "./renderUtils";

const ENDPOINT_HANDLE_RADIUS = 7;

export function renderElevation(
  projection: ElevationProjection,
  selection: ObjectSelection | undefined,
  onSelect: (selection: ObjectSelection | undefined) => void,
  activeTool: ToolId,
  handlers?: ElevationDragHandlers,
) {
  const { project: projectPoint } = createPointMapping(elevationBounds(projection));
  const selectedOpening =
    selection?.kind === "opening"
      ? projection.openings.find((opening) => opening.openingId === selection.id)
      : undefined;
  const selectedBalcony =
    selection?.kind === "balcony"
      ? projection.balconies.find((balcony) => balcony.balconyId === selection.id)
      : undefined;

  return (
    <>
      {projection.wallBands.map((band) => {
        const topLeft = projectPoint({ x: band.x, y: band.y + band.height });
        const bottomRight = projectPoint({ x: band.x + band.width, y: band.y });
        const selected = isSelected(selection, "storey", band.storeyId);

        return (
          <rect
            key={`${band.storeyId}-${band.wallId}`}
            className={selected ? "elevation-wall is-selected" : "elevation-wall"}
            x={topLeft.x}
            y={topLeft.y}
            width={bottomRight.x - topLeft.x}
            height={bottomRight.y - topLeft.y}
            onPointerDown={(event) => handlers?.onStoreyPointerDown(event, band.storeyId)}
            onClick={() => onSelect({ kind: "storey", id: band.storeyId })}
          />
        );
      })}
      {projection.roof?.map((poly, index) => {
        const points = poly.vertices
          .map((v) => {
            const p = projectPoint(v);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={`roof-${poly.kind}-${index}`}
            className={`elevation-roof elevation-roof--${poly.kind}`}
            points={points}
          />
        );
      })}
      {projection.skirts?.map((poly, index) => {
        const points = poly.vertices
          .map((v) => {
            const p = projectPoint(v);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={`skirt-${poly.kind}-${index}`}
            className={`elevation-roof elevation-roof--${poly.kind === "panel" ? "panel" : "gable"}`}
            points={points}
          />
        );
      })}
      {projection.openings.map((opening) => {
        const topLeft = projectPoint({ x: opening.x, y: opening.y + opening.height });
        const bottomRight = projectPoint({ x: opening.x + opening.width, y: opening.y });
        const selected = isSelected(selection, "opening", opening.openingId);
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
            onClick={() => onSelect({ kind: "opening", id: opening.openingId })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect({ kind: "opening", id: opening.openingId });
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
              isSelected(selection, "balcony", balcony.balconyId),
              onSelect,
              activeTool,
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
