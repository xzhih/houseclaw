import type { HouseProject, OpeningType } from "../domain/types";
import { materialCatalog } from "../materials/catalog";

const OPENING_LABELS: Record<OpeningType, string> = {
  door: "门",
  window: "窗",
  void: "开孔",
};

type PropertyPanelProps = {
  project: HouseProject;
  onApplyWallMaterial: (wallId: string, materialId: string) => void;
};

const wallMaterials = materialCatalog.filter((material) => material.kind === "wall");

export function PropertyPanel({ project, onApplyWallMaterial }: PropertyPanelProps) {
  const selectedOpening = project.openings.find((opening) => opening.id === project.selectedObjectId);
  const firstWall = project.walls[0];

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
            <dt>{selectedOpening.type === "window" ? "窗宽" : "宽度"}</dt>
            <dd>{selectedOpening.width.toFixed(2)} m</dd>
          </div>
          <div>
            <dt>高度</dt>
            <dd>{selectedOpening.height.toFixed(2)} m</dd>
          </div>
          <div>
            <dt>离地高度</dt>
            <dd>{selectedOpening.sillHeight.toFixed(2)} m</dd>
          </div>
        </dl>
      ) : (
        <p className="panel-placeholder">选择门、窗或开孔查看属性。</p>
      )}
      <section className="material-catalog" aria-labelledby="material-catalog-heading">
        <h3 id="material-catalog-heading">材质库</h3>
        <div className="material-list">
          {wallMaterials.map((material) => (
            <button
              aria-pressed={firstWall?.materialId === material.id}
              className="material-swatch"
              disabled={!firstWall}
              key={material.id}
              onClick={() => firstWall && onApplyWallMaterial(firstWall.id, material.id)}
              type="button"
            >
              <span aria-hidden="true" className="material-swatch-color" style={{ backgroundColor: material.color }} />
              <span>{material.name}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}
