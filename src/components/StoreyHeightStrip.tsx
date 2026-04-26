import type { ObjectSelection } from "../domain/selection";
import { isSelected } from "../domain/selection";
import type { Storey } from "../domain/types";

type StoreyHeightStripProps = {
  storeys: Storey[];
  selection: ObjectSelection | undefined;
  onSelectStorey: (storeyId: string) => void;
};

export function StoreyHeightStrip({ storeys, selection, onSelectStorey }: StoreyHeightStripProps) {
  return (
    <div className="storey-strip" role="group" aria-label="楼层高度">
      {storeys.map((storey) => {
        const selected = isSelected(selection, "storey", storey.id);
        return (
          <button
            key={storey.id}
            type="button"
            className="storey-pill"
            aria-pressed={selected}
            onClick={() => onSelectStorey(storey.id)}
          >
            {storey.label} · {Math.round(storey.height * 1000)} mm
          </button>
        );
      })}
    </div>
  );
}
