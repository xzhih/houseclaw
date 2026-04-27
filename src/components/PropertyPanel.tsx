import { NumberField } from "./NumberField";

const MM_PER_M = 1000;

function mmToM(mm: number): number {
  return Math.round(mm) / MM_PER_M;
}

type MmFieldProps = {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  onCommit: (next: number) => string | undefined;
};

function MmField({ label, value, step = 10, min, max, onCommit }: MmFieldProps) {
  return (
    <NumberField
      label={label}
      value={Math.round(value * MM_PER_M)}
      step={step}
      min={min !== undefined ? Math.round(min * MM_PER_M) : undefined}
      max={max !== undefined ? Math.round(max * MM_PER_M) : undefined}
      unit="mm"
      onCommit={(mm) => onCommit(mmToM(mm))}
    />
  );
}
import {
  moveWall,
  resizeStoreyExtent,
  updateBalcony,
  updateOpening,
  updateStair,
  updateStorey,
  updateWall,
  type BalconyPatch,
  type OpeningPatch,
  type StairPatch,
  type StoreyPatch,
  type WallPatch,
} from "../domain/mutations";
import { wallLength } from "../domain/measurements";
import { computeStairConfig } from "../domain/stairs";
import type { HouseProject, OpeningType, StairEdge, StairShape, StairTurn } from "../domain/types";
import { materialCatalog } from "../materials/catalog";

const OPENING_LABELS: Record<OpeningType, string> = {
  door: "门",
  window: "窗",
  void: "开孔",
};

const wallMaterials = materialCatalog.filter((material) => material.kind === "wall");

type EditorProps = {
  project: HouseProject;
  id: string;
  onProjectChange: (project: HouseProject) => void;
};

type PropertyPanelProps = {
  project: HouseProject;
  onApplyWallMaterial: (wallId: string, materialId: string) => void;
  onProjectChange: (project: HouseProject) => void;
  onDeleteSelection: () => void;
  onDuplicateStorey?: (storeyId: string) => void;
};

function tryMutate(fn: () => HouseProject): HouseProject | string {
  try {
    return fn();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function commit<T>(
  onProjectChange: (project: HouseProject) => void,
  patch: T,
  build: (patch: T) => HouseProject,
): string | undefined {
  const result = tryMutate(() => build(patch));
  if (typeof result === "string") return result;
  onProjectChange(result);
  return undefined;
}

export function PropertyPanel({
  project,
  onApplyWallMaterial,
  onProjectChange,
  onDeleteSelection,
  onDuplicateStorey,
}: PropertyPanelProps) {
  const selection = project.selection;

  const isDeletable =
    selection?.kind === "wall" ||
    selection?.kind === "opening" ||
    selection?.kind === "balcony" ||
    selection?.kind === "stair" ||
    (selection?.kind === "storey" && project.storeys.length > 1);

  const deleteLabel = selection?.kind === "storey" ? "删除楼层" : "删除";

  return (
    <aside className="property-panel" aria-label="Properties">
      <h2>属性</h2>
      {!selection ? <p className="panel-placeholder">选择墙、门、窗、开孔、阳台、楼梯或楼层查看属性。</p> : null}

      {selection?.kind === "opening" ? (
        <OpeningEditor project={project} id={selection.id} onProjectChange={onProjectChange} />
      ) : null}
      {selection?.kind === "wall" ? (
        <WallEditor
          project={project}
          id={selection.id}
          onProjectChange={onProjectChange}
          onApplyWallMaterial={onApplyWallMaterial}
        />
      ) : null}
      {selection?.kind === "balcony" ? (
        <BalconyEditor project={project} id={selection.id} onProjectChange={onProjectChange} />
      ) : null}
      {selection?.kind === "storey" ? (
        <StoreyEditor project={project} id={selection.id} onProjectChange={onProjectChange} />
      ) : null}
      {selection?.kind === "stair" ? (
        <StairEditor project={project} id={selection.id} onProjectChange={onProjectChange} />
      ) : null}

      {selection?.kind === "storey" && onDuplicateStorey ? (
        <button
          type="button"
          className="property-secondary"
          onClick={() => onDuplicateStorey(selection.id)}
        >
          复制楼层
        </button>
      ) : null}

      {isDeletable ? (
        <button type="button" className="property-delete" onClick={onDeleteSelection}>
          {deleteLabel}
        </button>
      ) : null}
    </aside>
  );
}

function OpeningEditor({ project, id, onProjectChange }: EditorProps) {
  const opening = project.openings.find((candidate) => candidate.id === id);
  if (!opening) return null;

  const widthLabel = opening.type === "window" ? "窗宽" : "宽度";
  const apply = (patch: OpeningPatch) =>
    commit(onProjectChange, patch, (final) => updateOpening(project, id, final));

  return (
    <section className="property-section" aria-labelledby="opening-heading">
      <h3 id="opening-heading">{OPENING_LABELS[opening.type]} · {opening.id}</h3>
      <MmField label={widthLabel} value={opening.width} min={0.01} onCommit={(width) => apply({ width })} />
      <MmField label="高度" value={opening.height} min={0.01} onCommit={(height) => apply({ height })} />
      <MmField label="离地高度" value={opening.sillHeight} min={0} onCommit={(sillHeight) => apply({ sillHeight })} />
      <MmField label="距墙起点" value={opening.offset} min={0} onCommit={(offset) => apply({ offset })} />
    </section>
  );
}

type WallEditorProps = EditorProps & {
  onApplyWallMaterial: (wallId: string, materialId: string) => void;
};

function WallEditor({ project, id, onProjectChange, onApplyWallMaterial }: WallEditorProps) {
  const wall = project.walls.find((candidate) => candidate.id === id);
  if (!wall) return null;

  const length = wallLength(wall);
  const apply = (patch: WallPatch) =>
    commit(onProjectChange, patch, (final) => updateWall(project, id, final));

  const applyLength = (newLength: number): string | undefined => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return "墙起止点重合,无法调整长度。";
    const ux = dx / len;
    const uy = dy / len;
    const newEnd = {
      x: Math.round((wall.start.x + ux * newLength) * MM_PER_M) / MM_PER_M,
      y: Math.round((wall.start.y + uy * newLength) * MM_PER_M) / MM_PER_M,
    };
    try {
      onProjectChange(moveWall(project, id, wall.start, newEnd));
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  return (
    <>
      <section className="property-section" aria-labelledby="wall-heading">
        <h3 id="wall-heading">墙 · {wall.id}</h3>
        <MmField label="墙长" value={length} min={0.1} onCommit={applyLength} />
        <MmField label="墙厚" value={wall.thickness} min={0.05} onCommit={(thickness) => apply({ thickness })} />
        <MmField label="墙高" value={wall.height} min={0.5} onCommit={(height) => apply({ height })} />
      </section>
      <section className="material-catalog" aria-labelledby="material-catalog-heading">
        <h3 id="material-catalog-heading">材质</h3>
        <div className="material-list">
          {wallMaterials.map((material) => (
            <button
              aria-pressed={wall.materialId === material.id}
              className="material-swatch"
              key={material.id}
              onClick={() => onApplyWallMaterial(wall.id, material.id)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="material-swatch-color"
                style={{ backgroundColor: material.color }}
              />
              <span>{material.name}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function BalconyEditor({ project, id, onProjectChange }: EditorProps) {
  const balcony = project.balconies.find((candidate) => candidate.id === id);
  if (!balcony) return null;

  const apply = (patch: BalconyPatch) =>
    commit(onProjectChange, patch, (final) => updateBalcony(project, id, final));

  return (
    <section className="property-section" aria-labelledby="balcony-heading">
      <h3 id="balcony-heading">阳台 · {balcony.id}</h3>
      <MmField label="宽度" value={balcony.width} min={0.3} onCommit={(width) => apply({ width })} />
      <MmField label="进深" value={balcony.depth} min={0.3} onCommit={(depth) => apply({ depth })} />
      <MmField label="距墙起点" value={balcony.offset} min={0} onCommit={(offset) => apply({ offset })} />
      <MmField label="栏杆高度" value={balcony.railingHeight} min={0.3} onCommit={(railingHeight) => apply({ railingHeight })} />
      <MmField label="楼板厚度" value={balcony.slabThickness} min={0.05} onCommit={(slabThickness) => apply({ slabThickness })} />
    </section>
  );
}

function StoreyEditor({ project, id, onProjectChange }: EditorProps) {
  const storey = project.storeys.find((candidate) => candidate.id === id);
  if (!storey) return null;

  const apply = (patch: StoreyPatch) =>
    commit(onProjectChange, patch, (final) => updateStorey(project, id, final));

  const storeyWalls = project.walls.filter((wall) => wall.storeyId === id);
  const xs = storeyWalls.flatMap((wall) => [wall.start.x, wall.end.x]);
  const ys = storeyWalls.flatMap((wall) => [wall.start.y, wall.end.y]);
  const widthExtent = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0;
  const depthExtent = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0;

  const applyExtent = (axis: "x" | "y", newSize: number) =>
    commit(onProjectChange, newSize, (final) => resizeStoreyExtent(project, id, axis, final));

  return (
    <section className="property-section" aria-labelledby="storey-heading">
      <h3 id="storey-heading">楼层 · {storey.label}</h3>
      <MmField label="层高" value={storey.height} min={2} onCommit={(height) => apply({ height })} />
      <MmField label="楼板厚度" value={storey.slabThickness} min={0.05} onCommit={(slabThickness) => apply({ slabThickness })} />
      {widthExtent > 0 ? (
        <MmField label="面宽" value={widthExtent} min={0.5} onCommit={(width) => applyExtent("x", width)} />
      ) : null}
      {depthExtent > 0 ? (
        <MmField label="进深" value={depthExtent} min={0.5} onCommit={(depth) => applyExtent("y", depth)} />
      ) : null}
    </section>
  );
}

function StairEditor({ project, id, onProjectChange }: EditorProps) {
  const storey = project.storeys.find((s) => s.id === id);
  const stair = storey?.stair;
  if (!storey || !stair) return null;

  const apply = (patch: StairPatch) =>
    commit(onProjectChange, patch, (final) => updateStair(project, storey.id, final));

  const cfg = computeStairConfig(storey.height, stair.treadDepth);

  const shapes: { id: StairShape; label: string }[] = [
    { id: "straight", label: "一字" },
    { id: "l", label: "L" },
    { id: "u", label: "U" },
  ];
  const edges: StairEdge[] = ["+x", "-x", "+y", "-y"];
  // 楼梯候选材质：装饰类（木）、框类（深色）、墙类（混凝土）都可选
  const stairMaterials = project.materials.filter(
    (m) => m.kind === "decor" || m.kind === "frame" || m.kind === "wall",
  );

  return (
    <>
      <section className="property-section" aria-labelledby="stair-heading">
        <h3 id="stair-heading">楼梯 · {storey.label}</h3>

        <div className="property-toggle-row">
          <label>形状</label>
          <div className="property-toggle-pills" role="group" aria-label="楼梯形状">
            {shapes.map((s) => (
              <button
                key={s.id}
                type="button"
                className="tab-button"
                aria-pressed={stair.shape === s.id}
                onClick={() =>
                  apply({
                    shape: s.id,
                    turn: s.id === "l" ? (stair.turn ?? "right") : undefined,
                  })
                }
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="property-toggle-row">
          <label>入口边</label>
          <div className="property-toggle-pills" role="group" aria-label="楼梯入口边">
            {edges.map((edge) => (
              <button
                key={edge}
                type="button"
                className="tab-button"
                aria-pressed={stair.bottomEdge === edge}
                onClick={() => apply({ bottomEdge: edge })}
              >
                {edge}
              </button>
            ))}
          </div>
        </div>

        {stair.shape === "l" ? (
          <div className="property-toggle-row">
            <label>转向</label>
            <div className="property-toggle-pills" role="group" aria-label="楼梯转向">
              {(["left", "right"] as StairTurn[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="tab-button"
                  aria-pressed={(stair.turn ?? "right") === t}
                  onClick={() => apply({ turn: t })}
                >
                  {t === "left" ? "左转" : "右转"}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <MmField label="宽度" value={stair.width} min={0.6} onCommit={(width) => apply({ width })} />
        <MmField label="进深" value={stair.depth} min={0.6} onCommit={(depth) => apply({ depth })} />
        <MmField label="位置 X" value={stair.x} min={0} onCommit={(x) => apply({ x })} />
        <MmField label="位置 Y" value={stair.y} min={0} onCommit={(y) => apply({ y })} />
        <NumberField
          label="旋转角度"
          value={Math.round((stair.rotation ?? 0) * (180 / Math.PI))}
          step={1}
          min={-180}
          max={180}
          unit="°"
          onCommit={(deg) => apply({ rotation: deg * (Math.PI / 180) })}
        />
        <MmField
          label="踏步深度"
          value={stair.treadDepth}
          min={0.2}
          max={0.4}
          onCommit={(treadDepth) => apply({ treadDepth })}
        />

        <p className="property-derived">
          踢踏数 {cfg.riserCount} · 踢踏高度 {Math.round(cfg.riserHeight * 1000)}mm
        </p>
      </section>

      <section className="material-catalog" aria-labelledby="stair-material-heading">
        <h3 id="stair-material-heading">材质</h3>
        <div className="material-list">
          {stairMaterials.map((material) => (
            <button
              aria-pressed={stair.materialId === material.id}
              className="material-swatch"
              key={material.id}
              onClick={() => apply({ materialId: material.id })}
              type="button"
            >
              <span
                aria-hidden="true"
                className="material-swatch-color"
                style={{ backgroundColor: material.color }}
              />
              <span>{material.name}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
