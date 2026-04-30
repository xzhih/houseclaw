import type { ProjectActionV2, ProjectStateV2, SelectionV2 } from "../app/v2/projectReducer";
import { StoreysEditor } from "./StoreysEditor";
import { BalconyEditor } from "./editors/BalconyEditor";
import { OpeningEditor } from "./editors/OpeningEditor";
import { RoofEditor } from "./editors/RoofEditor";
import { SlabEditor } from "./editors/SlabEditor";
import { StairEditor } from "./editors/StairEditor";
import { WallEditor } from "./editors/WallEditor";

type PropertyPanelProps = {
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function SelectionBody({
  project,
  selection,
  dispatch,
}: {
  project: ProjectStateV2;
  selection: NonNullable<SelectionV2>;
  dispatch: (action: ProjectActionV2) => void;
}) {
  if (selection.kind === "wall") {
    const wall = project.walls.find((w) => w.id === selection.wallId);
    return wall ? <WallEditor wall={wall} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">墙 {selection.wallId} 已被删除</p>;
  }
  if (selection.kind === "opening") {
    const opening = project.openings.find((o) => o.id === selection.openingId);
    return opening ? <OpeningEditor opening={opening} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">开洞 {selection.openingId} 已被删除</p>;
  }
  if (selection.kind === "slab") {
    const slab = project.slabs.find((s) => s.id === selection.slabId);
    return slab ? <SlabEditor slab={slab} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">楼板 {selection.slabId} 已被删除</p>;
  }
  if (selection.kind === "roof") {
    const roof = project.roofs.find((r) => r.id === selection.roofId);
    return roof ? <RoofEditor roof={roof} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">屋顶 {selection.roofId} 已被删除</p>;
  }
  if (selection.kind === "balcony") {
    const balcony = project.balconies.find((b) => b.id === selection.balconyId);
    return balcony ? <BalconyEditor balcony={balcony} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">阳台 {selection.balconyId} 已被删除</p>;
  }
  if (selection.kind === "stair") {
    const stair = project.stairs.find((s) => s.id === selection.stairId);
    return stair ? <StairEditor stair={stair} project={project} dispatch={dispatch} /> : <p className="property-panel-missing">楼梯 {selection.stairId} 已被删除</p>;
  }
  if (selection.kind === "storey") {
    return <p className="property-panel-hint">楼层属性请在顶部楼层编辑器中修改</p>;
  }
  return null;
}

export function PropertyPanel({ project, dispatch }: PropertyPanelProps) {
  const { selection } = project;
  return (
    <aside className="property-panel" aria-label="属性面板">
      <section className="property-panel-section">
        <h3 className="property-panel-section-title">楼层</h3>
        <StoreysEditor project={project} dispatch={dispatch} />
      </section>
      <section className="property-panel-section">
        <h3 className="property-panel-section-title">选中对象</h3>
        {selection ? (
          <SelectionBody project={project} selection={selection} dispatch={dispatch} />
        ) : (
          <p className="property-panel-hint">在 2D 视图中点击对象以编辑属性</p>
        )}
      </section>
    </aside>
  );
}
