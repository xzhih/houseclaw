import type { Storey, ViewId } from "../domain/types";

type StoreyHeightStripProps = {
  storeys: Storey[];
  activeView: ViewId;
  onSelectStorey: (storeyId: string) => void;
};

export function StoreyHeightStrip({ storeys, activeView, onSelectStorey }: StoreyHeightStripProps) {
  return (
    <div className="storey-strip" role="group" aria-label="楼层">
      {storeys.map((storey) => (
        <button
          key={storey.id}
          type="button"
          className="storey-pill"
          aria-pressed={activeView === `plan-${storey.id}`}
          onClick={() => onSelectStorey(storey.id)}
        >
          {storey.label}
        </button>
      ))}
    </div>
  );
}
