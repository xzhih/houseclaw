import { useState, useCallback, useEffect } from "react";
import type { ProjectAction, ProjectState, Selection } from "../../app/projectReducer";
import type { Anchor, OpeningType, Point2 } from "../../domain/types";

export type CreateState =
  | { kind: "idle" }
  | { kind: "wall-pending"; firstPoint: Point2 }
  | { kind: "slab-pending"; vertices: Point2[] };

export type HitObject = Selection;

type UseCreateHandlersArgs = {
  project: ProjectState;
  storeyId: string | undefined;
  dispatch: (action: ProjectAction) => void;
};

export type UseCreateHandlersResult = {
  state: CreateState;
  /** Returns true if the hook handled the click (caller should not also dispatch select). */
  handleCanvasClick: (world: Point2, hit: HitObject | undefined) => boolean;
  handleKeyDown: (key: string) => void;
};

const DEFAULT_WALL_THICKNESS = 0.2;
const DEFAULT_OPENING_WIDTH = 1.0;
const DEFAULT_OPENING_HEIGHT = 1.4;
const DEFAULT_OPENING_SILL = 0.9;
const DEFAULT_DOOR_HEIGHT = 2.1;
const DEFAULT_DOOR_SILL = 0;
const DEFAULT_SLAB_THICKNESS = 0.18;

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
}

function nextStoreyAbove(project: ProjectState, storeyId: string): string | undefined {
  const sorted = [...project.storeys].sort((a, b) => a.elevation - b.elevation);
  const idx = sorted.findIndex((s) => s.id === storeyId);
  if (idx === -1 || idx === sorted.length - 1) return undefined;
  return sorted[idx + 1].id;
}

function defaultMaterialId(project: ProjectState, kind: "wall" | "frame" | "decor" | "roof"): string {
  const m = project.materials.find((mat) => mat.kind === kind);
  return m?.id ?? project.materials[0]?.id ?? "mat-fallback";
}

function projectPointOntoWall(
  project: ProjectState,
  wallId: string,
  point: Point2,
): { offset: number; wallLength: number } | undefined {
  const wall = project.walls.find((w) => w.id === wallId);
  if (!wall) return undefined;
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return undefined;
  const ux = dx / len;
  const uy = dy / len;
  const px = point.x - wall.start.x;
  const py = point.y - wall.start.y;
  const t = px * ux + py * uy;
  return { offset: Math.max(0, Math.min(len, t)), wallLength: len };
}

export function useCreateHandlers({
  project,
  storeyId,
  dispatch,
}: UseCreateHandlersArgs): UseCreateHandlersResult {
  const [state, setState] = useState<CreateState>({ kind: "idle" });

  const tool = project.activeTool;

  // Switching tools (or storeys) cancels any half-finished create flow —
  // otherwise a wall-pending dashed preview lingers when the user comes
  // back to the wall tool, and slab vertices accumulate across sessions.
  useEffect(() => {
    setState({ kind: "idle" });
  }, [tool, storeyId]);

  const handleCanvasClick = useCallback(
    (world: Point2, hit: HitObject | undefined): boolean => {
      if (tool === "select" || tool === "material") return false;

      // Tool routing
      if (tool === "wall") {
        if (state.kind === "idle") {
          setState({ kind: "wall-pending", firstPoint: world });
          return true;
        }
        if (state.kind === "wall-pending") {
          if (!storeyId) {
            setState({ kind: "idle" });
            return true;
          }
          const upperId = nextStoreyAbove(project, storeyId);
          const bottom: Anchor = { kind: "storey", storeyId, offset: 0 };
          const top: Anchor = upperId
            ? { kind: "storey", storeyId: upperId, offset: 0 }
            : { kind: "absolute", z: (project.storeys.find((s) => s.id === storeyId)?.elevation ?? 0) + 3 };
          dispatch({
            type: "add-wall",
            wall: {
              id: generateId("w"),
              start: state.firstPoint,
              end: world,
              thickness: DEFAULT_WALL_THICKNESS,
              bottom,
              top,
              exterior: true,
              materialId: defaultMaterialId(project, "wall"),
            },
          });
          setState({ kind: "idle" });
          return true;
        }
      }

      if (tool === "door" || tool === "window" || tool === "opening") {
        if (!hit || hit.kind !== "wall") return true;
        const proj = projectPointOntoWall(project, hit.wallId, world);
        if (!proj) return true;
        const type: OpeningType = tool === "door" ? "door" : tool === "window" ? "window" : "void";
        const width = Math.min(DEFAULT_OPENING_WIDTH, Math.max(0.4, proj.wallLength - 0.4));
        const height = type === "door" ? DEFAULT_DOOR_HEIGHT : DEFAULT_OPENING_HEIGHT;
        const sill = type === "door" ? DEFAULT_DOOR_SILL : DEFAULT_OPENING_SILL;
        const offset = Math.max(0.1, Math.min(proj.wallLength - width - 0.1, proj.offset - width / 2));
        dispatch({
          type: "add-opening",
          opening: {
            id: generateId(`o-${type}`),
            wallId: hit.wallId,
            type,
            offset,
            sillHeight: sill,
            width,
            height,
            frameMaterialId: defaultMaterialId(project, "frame"),
          },
        });
        return true;
      }

      if (tool === "slab") {
        if (!storeyId) return true;
        const vertices = state.kind === "slab-pending" ? [...state.vertices, world] : [world];
        setState({ kind: "slab-pending", vertices });
        return true;
      }

      // tool === "roof" / "balcony" / "stair" — not routed via canvas click
      return false;
    },
    [tool, state, storeyId, project, dispatch],
  );

  const handleKeyDown = useCallback(
    (key: string): void => {
      if (key === "Escape") {
        setState({ kind: "idle" });
        return;
      }
      if (key === "Enter") {
        if (state.kind === "slab-pending" && state.vertices.length >= 3 && storeyId) {
          dispatch({
            type: "add-slab",
            slab: {
              id: generateId("slab"),
              polygon: state.vertices,
              top: { kind: "storey", storeyId, offset: 0 },
              thickness: DEFAULT_SLAB_THICKNESS,
              materialId: defaultMaterialId(project, "decor"),
            },
          });
          setState({ kind: "idle" });
        }
        return;
      }
    },
    [state, storeyId, project, dispatch],
  );

  return { state, handleCanvasClick, handleKeyDown };
}
