import { assertValidProject } from "../validate";
import type { HouseProject } from "../types";
import { EntityNotFoundError, type EntityKind } from "./errors";

type HasId = { id: string };

export type CrudStoreConfig<T extends HasId, P> = {
  arrayKey: keyof HouseProject;
  entityKind: EntityKind;
  applyPatch?(current: T, patch: P): T;
  validate?(merged: T, project: HouseProject): void;
  cascade?(project: HouseProject, removed: T): Partial<HouseProject>;
};

export type CrudStore<T extends HasId, P> = {
  add(project: HouseProject, draft: T): HouseProject;
  update(project: HouseProject, id: string, patch: P): HouseProject;
  remove(project: HouseProject, id: string): HouseProject;
};

export function createCrudStore<T extends HasId, P>(
  cfg: CrudStoreConfig<T, P>,
): CrudStore<T, P> {
  const applyPatch = cfg.applyPatch ?? ((current: T, patch: P) => ({ ...current, ...patch }));

  function getArray(project: HouseProject): T[] {
    return project[cfg.arrayKey] as unknown as T[];
  }

  function withArray(project: HouseProject, next: T[]): HouseProject {
    return { ...project, [cfg.arrayKey]: next };
  }

  return {
    add(project, draft) {
      cfg.validate?.(draft, project);
      const next = withArray(project, [...getArray(project), draft]);
      return assertValidProject(next);
    },

    update(project, id, patch) {
      const arr = getArray(project);
      const idx = arr.findIndex((e) => e.id === id);
      if (idx === -1) throw new EntityNotFoundError(cfg.entityKind, id);
      const merged = applyPatch(arr[idx], patch);
      cfg.validate?.(merged, project);
      const nextArr = [...arr];
      nextArr[idx] = merged;
      return assertValidProject(withArray(project, nextArr));
    },

    remove(project, id) {
      const arr = getArray(project);
      const removed = arr.find((e) => e.id === id);
      if (!removed) return project;
      const filtered = arr.filter((e) => e.id !== id);
      const cascadePatch = cfg.cascade?.(project, removed) ?? {};
      const next = {
        ...project,
        ...cascadePatch,
        [cfg.arrayKey]: filtered,
      };
      return assertValidProject(next);
    },
  };
}
