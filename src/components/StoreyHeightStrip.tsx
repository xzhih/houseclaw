import type { Storey, ViewId } from "../domain/types";

type StoreyHeightStripProps = {
  storeys: Storey[];
  activeView: ViewId;
  currentStoreyId: string | undefined;
  onSelectStorey: (storeyId: string) => void;
};

export function StoreyHeightStrip({
  storeys,
  activeView,
  currentStoreyId,
  onSelectStorey,
}: StoreyHeightStripProps) {
  return (
    <div className="storey-strip" role="group" aria-label="楼层">
      {storeys.map((storey) => {
        const isActivePlan = activeView === `plan-${storey.id}`;
        const isCurrentTarget = currentStoreyId === storey.id;
        return (
          <button
            key={storey.id}
            type="button"
            className="storey-pill"
            aria-pressed={isActivePlan || isCurrentTarget}
            onClick={() => onSelectStorey(storey.id)}
          >
            {storey.label}
          </button>
        );
      })}
    </div>
  );
}
