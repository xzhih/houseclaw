import { NumberField } from "./NumberField";
import type { ObjectSelection } from "../domain/selection";

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
  removeRoof,
  removeSkirt,
  resizeStoreyExtent,
  toggleRoofEdge,
  updateBalcony,
  updateOpening,
  updateRoof,
  updateSkirt,
  updateStair,
  updateStorey,
  updateWall,
  type BalconyPatch,
  type OpeningPatch,
  type SkirtPatch,
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

type EditorCtx = {
  project: HouseProject;
  onProjectChange: (p: HouseProject) => void;
  onApplyWallMaterial: (wallId: string, materialId: string) => void;
  onDuplicateStorey?: (storeyId: string) => void;
};

type Sel<K extends ObjectSelection["kind"]> = Extract<ObjectSelection, { kind: K }>;

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
  const ctx: EditorCtx = { project, onProjectChange, onApplyWallMaterial, onDuplicateStorey };

  const isDeletable =
    selection?.kind === "wall" ||
    selection?.kind === "opening" ||
    selection?.kind === "balcony" ||
    selection?.kind === "stair" ||
    selection?.kind === "skirt" ||
    (selection?.kind === "storey" && project.storeys.length > 1);

  const deleteLabel = selection?.kind === "storey" ? "删除楼层" : "删除";

  return (
    <aside className="property-panel" aria-label="Properties">
      <h2>属性</h2>
      {!selection ? <p className="panel-placeholder">选择墙、门、窗、开孔、阳台、楼梯或楼层查看属性。</p> : null}

      {selection?.kind === "opening" ? <OpeningEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "wall" ? <WallEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "balcony" ? <BalconyEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "storey" ? <StoreyEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "stair" ? <StairEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "roof" ? <RoofEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "roof-edge" ? <RoofEdgeEditor sel={selection} ctx={ctx} /> : null}
      {selection?.kind === "skirt" ? <SkirtEditor sel={selection} ctx={ctx} /> : null}

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

function OpeningEditor({ sel, ctx }: { sel: Sel<"opening">; ctx: EditorCtx }) {
  const opening = ctx.project.openings.find((candidate) => candidate.id === sel.id);
  if (!opening) return null;

  const widthLabel = opening.type === "window" ? "窗宽" : "宽度";
  const apply = (patch: OpeningPatch) =>
    commit(ctx.onProjectChange, patch, (final) => updateOpening(ctx.project, sel.id, final));

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

function WallEditor({ sel, ctx }: { sel: Sel<"wall">; ctx: EditorCtx }) {
  const wall = ctx.project.walls.find((candidate) => candidate.id === sel.id);
  if (!wall) return null;

  const length = wallLength(wall);
  const apply = (patch: WallPatch) =>
    commit(ctx.onProjectChange, patch, (final) => updateWall(ctx.project, sel.id, final));

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
      ctx.onProjectChange(moveWall(ctx.project, sel.id, wall.start, newEnd));
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
              onClick={() => ctx.onApplyWallMaterial(wall.id, material.id)}
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

function BalconyEditor({ sel, ctx }: { sel: Sel<"balcony">; ctx: EditorCtx }) {
  const balcony = ctx.project.balconies.find((candidate) => candidate.id === sel.id);
  if (!balcony) return null;

  const apply = (patch: BalconyPatch) =>
    commit(ctx.onProjectChange, patch, (final) => updateBalcony(ctx.project, sel.id, final));

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

function StoreyEditor({ sel, ctx }: { sel: Sel<"storey">; ctx: EditorCtx }) {
  const storey = ctx.project.storeys.find((candidate) => candidate.id === sel.id);
  if (!storey) return null;

  const apply = (patch: StoreyPatch) =>
    commit(ctx.onProjectChange, patch, (final) => updateStorey(ctx.project, sel.id, final));

  const storeyWalls = ctx.project.walls.filter((wall) => wall.storeyId === sel.id);
  const xs = storeyWalls.flatMap((wall) => [wall.start.x, wall.end.x]);
  const ys = storeyWalls.flatMap((wall) => [wall.start.y, wall.end.y]);
  const widthExtent = xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 0;
  const depthExtent = ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 0;

  const applyExtent = (axis: "x" | "y", newSize: number) =>
    commit(ctx.onProjectChange, newSize, (final) => resizeStoreyExtent(ctx.project, sel.id, axis, final));

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

function RoofEditor({ sel: _sel, ctx }: { sel: Sel<"roof">; ctx: EditorCtx }) {
  const roof = ctx.project.roof;
  if (!roof) return null;

  const roofMaterials = ctx.project.materials.filter((m) => m.kind === "roof");
  const pitchDeg = Math.round((roof.pitch * 180) / Math.PI);

  const apply = <K extends "pitch" | "overhang" | "materialId">(
    key: K,
    value: K extends "materialId" ? string : number,
  ): string | undefined =>
    commit(ctx.onProjectChange, { [key]: value }, (patch) =>
      updateRoof(ctx.project, patch as Partial<Pick<typeof roof, "pitch" | "overhang" | "materialId">>),
    );

  return (
    <>
      <section className="property-section" aria-labelledby="roof-heading">
        <h3 id="roof-heading">屋顶</h3>
        <NumberField
          label="坡度"
          value={pitchDeg}
          step={1}
          min={5}
          max={60}
          unit="°"
          onCommit={(deg) => apply("pitch", (deg * Math.PI) / 180)}
        />
        <MmField
          label="出檐"
          value={roof.overhang}
          step={50}
          min={0}
          max={2}
          onCommit={(meters) => apply("overhang", meters)}
        />
        <button
          type="button"
          className="property-secondary property-danger"
          onClick={() => ctx.onProjectChange(removeRoof(ctx.project))}
        >
          移除屋顶
        </button>
      </section>
      <section className="material-catalog" aria-labelledby="roof-material-heading">
        <h3 id="roof-material-heading">材质</h3>
        <div className="material-list">
          {roofMaterials.map((material) => (
            <button
              aria-pressed={roof.materialId === material.id}
              className="material-swatch"
              key={material.id}
              onClick={() => apply("materialId", material.id)}
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

function RoofEdgeEditor({ sel, ctx }: { sel: Sel<"roof-edge">; ctx: EditorCtx }) {
  const roof = ctx.project.roof;
  if (!roof) return null;

  const top = [...ctx.project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
  const topWalls = ctx.project.walls.filter((w) => w.storeyId === top.id && w.exterior);
  const current = roof.edges[sel.wallId] === "eave" ? "eave" : "gable";
  const eaveCount = topWalls.filter((w) => roof.edges[w.id] === "eave").length;
  const isOnlyEave = current === "eave" && eaveCount === 1;
  const targetLabel = current === "eave" ? "山墙" : "檐";

  return (
    <section className="property-section" aria-labelledby="roof-edge-heading">
      <h3 id="roof-edge-heading">屋顶边缘</h3>
      <p>当前：<strong>{current === "eave" ? "檐 (eave)" : "山墙 (gable)"}</strong></p>
      <button
        type="button"
        disabled={isOnlyEave}
        title={isOnlyEave ? "至少需要一条檐边" : undefined}
        onClick={() => commit(ctx.onProjectChange, sel.wallId, (id) => toggleRoofEdge(ctx.project, id))}
      >
        切换为 {targetLabel}
      </button>
    </section>
  );
}

function SkirtEditor({ sel, ctx }: { sel: Sel<"skirt">; ctx: EditorCtx }) {
  const skirt = ctx.project.skirts.find((s) => s.id === sel.id);
  if (!skirt) return null;
  const roofMaterials = ctx.project.materials.filter((m) => m.kind === "roof");
  const pitchDeg = Math.round((skirt.pitch * 180) / Math.PI);

  const apply = (patch: SkirtPatch): string | undefined =>
    commit(ctx.onProjectChange, patch, (final) => updateSkirt(ctx.project, sel.id, final));

  return (
    <>
      <section className="property-section" aria-labelledby="skirt-heading">
        <h3 id="skirt-heading">披檐 · {skirt.id}</h3>
        <MmField label="起点偏移" value={skirt.offset} min={0} onCommit={(offset) => apply({ offset })} />
        <MmField label="宽度" value={skirt.width} min={0.3} onCommit={(width) => apply({ width })} />
        <MmField label="外伸深度" value={skirt.depth} min={0.3} max={4} onCommit={(depth) => apply({ depth })} />
        <MmField label="挂接高度" value={skirt.elevation} onCommit={(elevation) => apply({ elevation })} />
        <NumberField
          label="坡度"
          value={pitchDeg}
          step={1}
          min={5}
          max={60}
          unit="°"
          onCommit={(deg) => apply({ pitch: (deg * Math.PI) / 180 })}
        />
        <MmField label="出檐" value={skirt.overhang} step={50} min={0.05} max={1.5} onCommit={(overhang) => apply({ overhang })} />
      </section>
      <section className="material-catalog" aria-labelledby="skirt-material-heading">
        <h3 id="skirt-material-heading">材质</h3>
        <div className="material-list">
          {roofMaterials.map((material) => (
            <button
              aria-pressed={skirt.materialId === material.id}
              className="material-swatch"
              key={material.id}
              onClick={() => apply({ materialId: material.id })}
              type="button"
            >
              <span aria-hidden="true" className="material-swatch-color" style={{ backgroundColor: material.color }} />
              <span>{material.name}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

function StairEditor({ sel, ctx }: { sel: Sel<"stair">; ctx: EditorCtx }) {
  const sortedStoreys = [...ctx.project.storeys].sort((a, b) => a.elevation - b.elevation);
  const idx = sortedStoreys.findIndex((s) => s.id === sel.id);
  const storey = idx >= 0 ? sortedStoreys[idx] : undefined;
  const upperStorey = idx >= 0 && idx + 1 < sortedStoreys.length ? sortedStoreys[idx + 1] : undefined;
  const stair = storey?.stair;
  if (!storey || !stair || !upperStorey) return null;

  const apply = (patch: StairPatch) =>
    commit(ctx.onProjectChange, patch, (final) => updateStair(ctx.project, storey.id, final));

  const climb = upperStorey.elevation - storey.elevation;
  const cfg = computeStairConfig(climb, upperStorey.slabThickness, stair.treadDepth);

  const shapes: { id: StairShape; label: string }[] = [
    { id: "straight", label: "一字" },
    { id: "l", label: "L" },
    { id: "u", label: "U" },
  ];
  const edges: StairEdge[] = ["+x", "-x", "+y", "-y"];
  // 楼梯候选材质：装饰类（木）、框类（深色）、墙类（混凝土）都可选
  const stairMaterials = ctx.project.materials.filter(
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
