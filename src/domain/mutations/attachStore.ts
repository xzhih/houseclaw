import type { HouseProject, Storey } from "../types";
import { EntityNotFoundError } from "./errors";

export type AttachStoreConfig<T, P> = {
  hostArrayKey: "storeys";
  field: keyof Storey;
  applyPatch?(current: T, patch: P): T;
  validate?(merged: T, host: Storey, project: HouseProject): void;
};

export type AttachStore<T, P> = {
  attach(project: HouseProject, hostId: string, value: T): HouseProject;
  update(project: HouseProject, hostId: string, patch: P): HouseProject;
  detach(project: HouseProject, hostId: string): HouseProject;
};

export function createAttachStore<T, P>(cfg: AttachStoreConfig<T, P>): AttachStore<T, P> {
  const applyPatch = cfg.applyPatch ?? ((current: T, patch: P) => ({ ...current, ...patch }));

  return {
    attach(project, hostId, value) {
      const idx = project.storeys.findIndex((s) => s.id === hostId);
      if (idx === -1) throw new EntityNotFoundError("storey", hostId);
      const host: Storey = { ...project.storeys[idx], [cfg.field]: value };
      cfg.validate?.(value, host, project);
      const storeys = [...project.storeys];
      storeys[idx] = host;
      return { ...project, storeys };
    },

    update(project, hostId, patch) {
      const idx = project.storeys.findIndex((s) => s.id === hostId);
      if (idx === -1) return project;
      const current = project.storeys[idx][cfg.field] as T | undefined;
      if (current === undefined) return project;
      const merged = applyPatch(current, patch);
      const host: Storey = { ...project.storeys[idx], [cfg.field]: merged };
      cfg.validate?.(merged, host, project);
      const storeys = [...project.storeys];
      storeys[idx] = host;
      return { ...project, storeys };
    },

    detach(project, hostId) {
      const idx = project.storeys.findIndex((s) => s.id === hostId);
      if (idx === -1) return project;
      const current = project.storeys[idx][cfg.field];
      if (current === undefined) return project;
      const { [cfg.field]: _removed, ...rest } = project.storeys[idx];
      const storeys = [...project.storeys];
      storeys[idx] = rest as Storey;
      return { ...project, storeys };
    },
  };
}
