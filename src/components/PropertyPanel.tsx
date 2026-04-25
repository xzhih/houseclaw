import type { HouseProject, OpeningType } from "../domain/types";

const OPENING_LABELS: Record<OpeningType, string> = {
  door: "门",
  window: "窗",
  void: "开孔",
};

type PropertyPanelProps = {
  project: HouseProject;
};

export function PropertyPanel({ project }: PropertyPanelProps) {
  const selectedOpening = project.openings.find((opening) => opening.id === project.selectedObjectId);

  return (
    <aside className="property-panel" aria-label="Properties">
      <h2>属性</h2>
      {selectedOpening ? (
        <dl className="property-list">
          <div>
            <dt>类型</dt>
            <dd>{OPENING_LABELS[selectedOpening.type]}</dd>
          </div>
          <div>
            <dt>宽度</dt>
            <dd>{selectedOpening.width.toFixed(2)} m</dd>
          </div>
          <div>
            <dt>高度</dt>
            <dd>{selectedOpening.height.toFixed(2)} m</dd>
          </div>
          <div>
            <dt>窗台</dt>
            <dd>{selectedOpening.sillHeight.toFixed(2)} m</dd>
          </div>
        </dl>
      ) : (
        <p className="panel-placeholder">选择门、窗或开孔查看属性。</p>
      )}
    </aside>
  );
}
