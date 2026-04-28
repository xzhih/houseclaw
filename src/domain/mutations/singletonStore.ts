import { assertValidProject } from "../constraints";
import type { ObjectSelectionKind } from "../selection";
import type { HouseProject } from "../types";
import { EntityStateError } from "./errors";

export type SingletonStoreConfig<T, P> = {
  field: keyof HouseProject;
  entityKind: ObjectSelectionKind;
  applyPatch(current: T, patch: P): T;
  validate?(merged: T, project: HouseProject): void;
};

export type SingletonStore<T, P> = {
  update(project: HouseProject, patch: P): HouseProject;
  clear(project: HouseProject): HouseProject;
};

export function createSingletonStore<T, P>(
  cfg: SingletonStoreConfig<T, P>,
): SingletonStore<T, P> {
  return {
    update(project, patch) {
      const current = project[cfg.field] as unknown as T | undefined;
      if (current === undefined) {
        throw new EntityStateError(`No ${cfg.entityKind} to update.`);
      }
      const merged = cfg.applyPatch(current, patch);
      cfg.validate?.(merged, project);
      return assertValidProject({ ...project, [cfg.field]: merged });
    },

    clear(project) {
      if (project[cfg.field] === undefined) return project;
      return assertValidProject({ ...project, [cfg.field]: undefined });
    },
  };
}
