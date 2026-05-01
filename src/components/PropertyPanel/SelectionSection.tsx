import type { ProjectActionV2, ProjectStateV2, SelectionV2 } from "../../app/v2/projectReducer";
import { Accordion } from "../chrome/Accordion";
import { WallEditor } from "../editors/WallEditor";
import { OpeningEditor } from "../editors/OpeningEditor";
import { BalconyEditor } from "../editors/BalconyEditor";
import { SlabEditor } from "../editors/SlabEditor";
import { RoofEditor } from "../editors/RoofEditor";
import { StairEditor } from "../editors/StairEditor";

type SelectionSectionProps = {
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function describeSelection(_project: ProjectStateV2, sel: NonNullable<SelectionV2>): string {
  switch (sel.kind) {
    case "wall":
      return `WALL · ${sel.wallId}`;
    case "opening":
      return `OPENING · ${sel.openingId}`;
    case "balcony":
      return `BALCONY · ${sel.balconyId}`;
    case "slab":
      return `SLAB · ${sel.slabId}`;
    case "roof":
      return `ROOF · ${sel.roofId}`;
    case "stair":
      return `STAIR · ${sel.stairId}`;
    case "storey":
      return `STOREY · ${sel.storeyId}`;
  }
}

function Body({ project, dispatch }: SelectionSectionProps) {
  const sel = project.selection;
  if (!sel) {
    return <p className="chrome-panel-empty-hint">在 2D 视图中点击对象以编辑属性</p>;
  }
  if (sel.kind === "wall") {
    const wall = project.walls.find((w) => w.id === sel.wallId);
    return wall
      ? <WallEditor wall={wall} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">墙 {sel.wallId} 已被删除</p>;
  }
  if (sel.kind === "opening") {
    const opening = project.openings.find((o) => o.id === sel.openingId);
    return opening
      ? <OpeningEditor opening={opening} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">开洞 {sel.openingId} 已被删除</p>;
  }
  if (sel.kind === "balcony") {
    const balcony = project.balconies.find((b) => b.id === sel.balconyId);
    return balcony
      ? <BalconyEditor balcony={balcony} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">阳台 {sel.balconyId} 已被删除</p>;
  }
  if (sel.kind === "slab") {
    const slab = project.slabs.find((s) => s.id === sel.slabId);
    return slab
      ? <SlabEditor slab={slab} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">楼板 {sel.slabId} 已被删除</p>;
  }
  if (sel.kind === "roof") {
    const roof = project.roofs.find((r) => r.id === sel.roofId);
    return roof
      ? <RoofEditor roof={roof} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">屋顶 {sel.roofId} 已被删除</p>;
  }
  if (sel.kind === "stair") {
    const stair = project.stairs.find((s) => s.id === sel.stairId);
    return stair
      ? <StairEditor stair={stair} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">楼梯 {sel.stairId} 已被删除</p>;
  }
  if (sel.kind === "storey") {
    return <p className="chrome-panel-empty-hint">楼层属性请在上方 STOREYS 中修改</p>;
  }
  return null;
}

export function SelectionSection({ project, dispatch }: SelectionSectionProps) {
  const sel = project.selection;
  const headerExtra = sel ? (
    <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>
      {`· ${describeSelection(project, sel)}`}
    </span>
  ) : (
    <span style={{ marginLeft: 8, color: "var(--text-disabled)" }}>· NONE</span>
  );

  return (
    <Accordion title="SELECTION" defaultOpen headerExtra={headerExtra}>
      <Body project={project} dispatch={dispatch} />
    </Accordion>
  );
}
