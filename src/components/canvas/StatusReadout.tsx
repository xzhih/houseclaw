import type { DragReadout, Point2D } from "./types";

type Props = {
  cursorWorld: Point2D | null;
  dragReadout: DragReadout | null;
};

function fmt(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function formatDragReadout(d: DragReadout): string {
  switch (d.kind) {
    case "wall-translate":
      return `Δ: (${fmt(d.dx)}, ${fmt(d.dy)}) m`;
    case "wall-endpoint":
      return `L: ${fmt(d.length)} m`;
    case "opening":
    case "balcony":
    case "elev-balcony-move":
      return `offset: ${fmt(d.offset)} m`;
    case "plan-opening-resize":
    case "plan-balcony-resize":
    case "elev-balcony-resize":
      return `width: ${fmt(d.width)} m`;
    case "elev-opening-move":
      return `offset: ${fmt(d.offset)} m   sill: ${fmt(d.sill)} m`;
    case "elev-opening-resize":
      return `W×H: ${fmt(d.width)} × ${fmt(d.height)} m`;
    case "stair-resize":
      return `W×D: ${fmt(d.width)} × ${fmt(d.depth)} m`;
    case "stair-rotate":
      return `α: ${fmt(d.angleDeg, 1)}°`;
    case "elev-storey-translate":
      return `Δ: ${fmt(d.dy)} m`;
  }
}

export function StatusReadout({ cursorWorld, dragReadout }: Props) {
  if (!cursorWorld && !dragReadout) return null;
  return (
    <div className="status-readout" aria-live="polite">
      {cursorWorld ? (
        <div className="status-readout-line">
          X: {fmt(cursorWorld.x)} m   Y: {fmt(cursorWorld.y)} m
        </div>
      ) : null}
      {dragReadout ? (
        <div className="status-readout-line">{formatDragReadout(dragReadout)}</div>
      ) : null}
    </div>
  );
}
