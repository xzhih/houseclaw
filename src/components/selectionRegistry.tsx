import type { ReactNode } from "react";
import type { ObjectSelection, ObjectSelectionKind } from "../domain/selection";
import type { HouseProject, ViewId } from "../domain/types";
import {
  removeBalcony,
  removeOpening,
  removeSkirt,
  removeStair,
  removeStorey,
  removeWall,
} from "../domain/mutations";
import {
  BalconyEditor,
  OpeningEditor,
  RoofEdgeEditor,
  RoofEditor,
  SkirtEditor,
  StairEditor,
  StoreyEditor,
  WallEditor,
  type EditorCtx,
} from "./PropertyPanel";

export type { EditorCtx };

export type SelectionDescriptor<S extends ObjectSelection> = {
  renderEditor(sel: S, ctx: EditorCtx): ReactNode;
  isDeletable?(sel: S, project: HouseProject): boolean;
  remove?(project: HouseProject, sel: S): HouseProject;
  afterRemove?(project: HouseProject, sel: S): HouseProject;
  deleteLabel?: string;
};

export type SelectionDescriptorMap = {
  [K in ObjectSelectionKind]: SelectionDescriptor<Extract<ObjectSelection, { kind: K }>>;
};

export const selectionRegistry: SelectionDescriptorMap = {
  wall: {
    renderEditor: (sel, ctx) => <WallEditor sel={sel} ctx={ctx} />,
    remove: (project, sel) => removeWall(project, sel.id),
  },
  opening: {
    renderEditor: (sel, ctx) => <OpeningEditor sel={sel} ctx={ctx} />,
    remove: (project, sel) => removeOpening(project, sel.id),
  },
  balcony: {
    renderEditor: (sel, ctx) => <BalconyEditor sel={sel} ctx={ctx} />,
    remove: (project, sel) => removeBalcony(project, sel.id),
  },
  stair: {
    renderEditor: (sel, ctx) => <StairEditor sel={sel} ctx={ctx} />,
    remove: (project, sel) => removeStair(project, sel.id),
  },
  skirt: {
    renderEditor: (sel, ctx) => <SkirtEditor sel={sel} ctx={ctx} />,
    remove: (project, sel) => removeSkirt(project, sel.id),
  },
  storey: {
    renderEditor: (sel, ctx) => <StoreyEditor sel={sel} ctx={ctx} />,
    isDeletable: (_sel, project) => project.storeys.length > 1,
    remove: (project, sel) => removeStorey(project, sel.id),
    afterRemove: (project, sel) => {
      if (project.activeView !== `plan-${sel.id}`) return project;
      const fallback = project.storeys[0]?.id;
      if (!fallback) return project;
      return { ...project, activeView: `plan-${fallback}` as ViewId };
    },
    deleteLabel: "删除楼层",
  },
  roof: {
    renderEditor: (sel, ctx) => <RoofEditor sel={sel} ctx={ctx} />,
  },
  "roof-edge": {
    renderEditor: (sel, ctx) => <RoofEdgeEditor sel={sel} ctx={ctx} />,
  },
};

export function getDescriptor<S extends ObjectSelection>(
  sel: S,
): SelectionDescriptor<S> {
  return selectionRegistry[sel.kind] as unknown as SelectionDescriptor<S>;
}

export function isSelectionDeletable(
  sel: ObjectSelection | undefined,
  project: HouseProject,
): boolean {
  if (!sel) return false;
  const d = getDescriptor(sel);
  if (!d.remove) return false;
  return d.isDeletable?.(sel, project) ?? true;
}

export function deleteSelection(
  project: HouseProject,
  sel: ObjectSelection,
): HouseProject {
  const d = getDescriptor(sel);
  if (!d.remove) {
    throw new Error(`selection kind "${sel.kind}" is not deletable`);
  }
  const next = d.remove(project, sel);
  return d.afterRemove ? d.afterRemove(next, sel) : next;
}
