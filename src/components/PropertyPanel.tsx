import { NumberField } from "./NumberField";
import {
  updateBalcony,
  updateOpening,
  updateStorey,
  updateWall,
  type BalconyPatch,
  type OpeningPatch,
  type StoreyPatch,
  type WallPatch,
} from "../domain/mutations";
import { wallLength } from "../domain/measurements";
import type { HouseProject, OpeningType } from "../domain/types";
import { materialCatalog } from "../materials/catalog";

const OPENING_LABELS: Record<OpeningType, string> = {
  door: "门",
  window: "窗",
  void: "开孔",
};

const wallMaterials = materialCatalog.filter((material) => material.kind === "wall");

type PropertyPanelProps = {
  project: HouseProject;
  onApplyWallMaterial: (wallId: string, materialId: string) => void;
  onProjectChange: (project: HouseProject) => void;
};

function tryMutate(fn: () => HouseProject): HouseProject | string {
  try {
    return fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function commit<T>(
  current: HouseProject,
  mutate: (next: HouseProject) => HouseProject,
  onProjectChange: (project: HouseProject) => void,
  patch: T,
  build: (patch: T) => HouseProject,
): string | undefined {
  const result = tryMutate(() => build(patch));
  if (typeof result === "string") return result;
  onProjectChange(result);
  return undefined;
}

export function PropertyPanel({ project, onApplyWallMaterial, onProjectChange }: PropertyPanelProps) {
  const selection = project.selection;
  const targetWall =
    selection?.kind === "wall"
      ? project.walls.find((wall) => wall.id === selection.id)
      : undefined;

  return (
    <aside className="property-panel" aria-label="Properties">
      <h2>属性</h2>
      {!selection ? <p className="panel-placeholder">选择墙、门、窗、开孔、阳台或楼层查看属性。</p> : null}

      {selection?.kind === "opening" ? renderOpeningEditor(project, selection.id, onProjectChange) : null}
      {selection?.kind === "wall" ? renderWallEditor(project, selection.id, onProjectChange) : null}
      {selection?.kind === "balcony" ? renderBalconyEditor(project, selection.id, onProjectChange) : null}
      {selection?.kind === "storey" ? renderStoreyEditor(project, selection.id, onProjectChange) : null}

      <section className="material-catalog" aria-labelledby="material-catalog-heading">
        <h3 id="material-catalog-heading">材质库</h3>
        <p className="material-target">
          {targetWall ? `应用到：${targetWall.id}` : "选择一面墙后应用材质。"}
        </p>
        <div className="material-list">
          {wallMaterials.map((material) => (
            <button
              aria-pressed={targetWall?.materialId === material.id}
              className="material-swatch"
              disabled={!targetWall}
              key={material.id}
              onClick={() => targetWall && onApplyWallMaterial(targetWall.id, material.id)}
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

function renderOpeningEditor(
  project: HouseProject,
  openingId: string,
  onProjectChange: (project: HouseProject) => void,
) {
  const opening = project.openings.find((candidate) => candidate.id === openingId);
  if (!opening) return null;

  const widthLabel = opening.type === "window" ? "窗宽" : "宽度";
  const apply = (patch: OpeningPatch) =>
    commit(project, (next) => next, onProjectChange, patch, (final) => updateOpening(project, openingId, final));

  return (
    <section className="property-section" aria-labelledby="opening-heading">
      <h3 id="opening-heading">{OPENING_LABELS[opening.type]} · {opening.id}</h3>
      <NumberField label={widthLabel} value={opening.width} min={0.01} onCommit={(width) => apply({ width })} />
      <NumberField label="高度" value={opening.height} min={0.01} onCommit={(height) => apply({ height })} />
      <NumberField label="离地高度" value={opening.sillHeight} min={0} onCommit={(sillHeight) => apply({ sillHeight })} />
      <NumberField label="距墙起点" value={opening.offset} min={0} onCommit={(offset) => apply({ offset })} />
    </section>
  );
}

function renderWallEditor(
  project: HouseProject,
  wallId: string,
  onProjectChange: (project: HouseProject) => void,
) {
  const wall = project.walls.find((candidate) => candidate.id === wallId);
  if (!wall) return null;

  const apply = (patch: WallPatch) =>
    commit(project, (next) => next, onProjectChange, patch, (final) => updateWall(project, wallId, final));

  return (
    <section className="property-section" aria-labelledby="wall-heading">
      <h3 id="wall-heading">墙 · {wall.id}</h3>
      <dl className="property-list">
        <div>
          <dt>墙长</dt>
          <dd>{wallLength(wall).toFixed(2)} m</dd>
        </div>
      </dl>
      <NumberField label="墙厚" value={wall.thickness} min={0.05} onCommit={(thickness) => apply({ thickness })} />
      <NumberField label="墙高" value={wall.height} min={0.5} onCommit={(height) => apply({ height })} />
    </section>
  );
}

function renderBalconyEditor(
  project: HouseProject,
  balconyId: string,
  onProjectChange: (project: HouseProject) => void,
) {
  const balcony = project.balconies.find((candidate) => candidate.id === balconyId);
  if (!balcony) return null;

  const apply = (patch: BalconyPatch) =>
    commit(project, (next) => next, onProjectChange, patch, (final) => updateBalcony(project, balconyId, final));

  return (
    <section className="property-section" aria-labelledby="balcony-heading">
      <h3 id="balcony-heading">阳台 · {balcony.id}</h3>
      <NumberField label="宽度" value={balcony.width} min={0.3} onCommit={(width) => apply({ width })} />
      <NumberField label="进深" value={balcony.depth} min={0.3} onCommit={(depth) => apply({ depth })} />
      <NumberField label="距墙起点" value={balcony.offset} min={0} onCommit={(offset) => apply({ offset })} />
      <NumberField label="栏杆高度" value={balcony.railingHeight} min={0.3} onCommit={(railingHeight) => apply({ railingHeight })} />
      <NumberField label="楼板厚度" value={balcony.slabThickness} min={0.05} onCommit={(slabThickness) => apply({ slabThickness })} />
    </section>
  );
}

function renderStoreyEditor(
  project: HouseProject,
  storeyId: string,
  onProjectChange: (project: HouseProject) => void,
) {
  const storey = project.storeys.find((candidate) => candidate.id === storeyId);
  if (!storey) return null;

  const apply = (patch: StoreyPatch) =>
    commit(project, (next) => next, onProjectChange, patch, (final) => updateStorey(project, storeyId, final));

  return (
    <section className="property-section" aria-labelledby="storey-heading">
      <h3 id="storey-heading">楼层 · {storey.label}</h3>
      <NumberField label="层高" value={storey.height} min={2} onCommit={(height) => apply({ height })} />
      <NumberField label="楼板厚度" value={storey.slabThickness} min={0.05} onCommit={(slabThickness) => apply({ slabThickness })} />
    </section>
  );
}
