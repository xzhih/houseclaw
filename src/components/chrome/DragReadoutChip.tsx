import type { DragReadout } from "../canvas/types";

type DragReadoutChipProps = {
  readout: DragReadout | null;
  /** When true the chip stays visible; when false fades out (parent owns timer). */
  visible: boolean;
};

function fmt(value: number): string {
  return value.toFixed(2);
}

function rowsFor(readout: DragReadout): Array<[string, string]> {
  switch (readout.kind) {
    case "wall-translate":
      return [["Δx", `${fmt(readout.dx)}m`], ["Δy", `${fmt(readout.dy)}m`]];
    case "wall-endpoint":
      return [["LENGTH", `${fmt(readout.length)}m`]];
    case "opening":
      return [["OFFSET", `${fmt(readout.offset)}m`]];
    case "balcony":
      return [["OFFSET", `${fmt(readout.offset)}m`]];
    case "plan-opening-resize":
      return [["WIDTH", `${fmt(readout.width)}m`]];
    case "plan-balcony-resize":
      return [["WIDTH", `${fmt(readout.width)}m`]];
    case "elev-opening-move":
      return [["OFFSET", `${fmt(readout.offset)}m`], ["SILL", `${fmt(readout.sill)}m`]];
    case "elev-opening-resize":
      return [["WIDTH", `${fmt(readout.width)}m`], ["HEIGHT", `${fmt(readout.height)}m`]];
    case "elev-balcony-move":
      return [["OFFSET", `${fmt(readout.offset)}m`]];
    case "elev-balcony-resize":
      return [["WIDTH", `${fmt(readout.width)}m`]];
    case "stair-resize":
      return [["WIDTH", `${fmt(readout.width)}m`], ["DEPTH", `${fmt(readout.depth)}m`]];
    case "stair-rotate":
      return [["ROTATION", `${readout.angleDeg.toFixed(1)}°`]];
    case "elev-storey-translate":
      return [["Δy", `${fmt(readout.dy)}m`]];
  }
}

export function DragReadoutChip({ readout, visible }: DragReadoutChipProps) {
  if (!readout) return null;
  const rows = rowsFor(readout);
  return (
    <div className="chrome-readout-chip" data-visible={visible}>
      {rows.map(([k, v]) => (
        <div key={k} className="chrome-readout-chip-row">
          <span className="chrome-readout-chip-key">{k}</span>
          <span className="chrome-readout-chip-value">{v}</span>
        </div>
      ))}
    </div>
  );
}
