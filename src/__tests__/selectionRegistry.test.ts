import { describe, expect, it } from "vitest";
import {
  deleteSelection,
  isSelectionDeletable,
  selectionRegistry,
} from "../components/selectionRegistry";
import { createSampleProject } from "../domain/sampleProject";
import type { ObjectSelection, ObjectSelectionKind } from "../domain/selection";
import type { HouseProject, ViewId } from "../domain/types";

const ALL_KINDS: ObjectSelectionKind[] = [
  "wall",
  "opening",
  "balcony",
  "storey",
  "stair",
  "skirt",
  "roof",
  "roof-edge",
];

function withSingleStorey(project: HouseProject): HouseProject {
  const top = project.storeys[0];
  const topWallIds = new Set(
    project.walls.filter((w) => w.storeyId === top.id).map((w) => w.id),
  );
  return {
    ...project,
    storeys: [top],
    walls: project.walls.filter((w) => w.storeyId === top.id),
    openings: project.openings.filter((o) => topWallIds.has(o.wallId)),
    balconies: project.balconies.filter((b) => topWallIds.has(b.attachedWallId)),
    skirts: project.skirts.filter((s) => topWallIds.has(s.hostWallId)),
    activeView: `plan-${top.id}` as ViewId,
  };
}

describe("selectionRegistry", () => {
  it("covers every ObjectSelectionKind", () => {
    for (const kind of ALL_KINDS) {
      expect(selectionRegistry[kind]).toBeDefined();
      expect(typeof selectionRegistry[kind].renderEditor).toBe("function");
    }
  });

  it("only storey carries a custom deleteLabel", () => {
    expect(selectionRegistry.storey.deleteLabel).toBe("删除楼层");
    for (const kind of ALL_KINDS) {
      if (kind === "storey") continue;
      expect(selectionRegistry[kind].deleteLabel).toBeUndefined();
    }
  });

  describe("isSelectionDeletable", () => {
    const project = createSampleProject();
    const wallId = project.walls[0].id;
    const openingId = project.openings[0]?.id;
    const balconyId = project.balconies[0]?.id;
    const skirtId = project.skirts[0]?.id;
    const stairStoreyId = project.storeys.find((s) => s.stair)?.id;
    const storeyId = project.storeys[0].id;

    it("returns false for undefined selection", () => {
      expect(isSelectionDeletable(undefined, project)).toBe(false);
    });

    it("returns true for wall / opening / balcony / skirt / stair", () => {
      const cases: ObjectSelection[] = [
        { kind: "wall", id: wallId },
        ...(openingId ? [{ kind: "opening", id: openingId } as const] : []),
        ...(balconyId ? [{ kind: "balcony", id: balconyId } as const] : []),
        ...(skirtId ? [{ kind: "skirt", id: skirtId } as const] : []),
        ...(stairStoreyId ? [{ kind: "stair", id: stairStoreyId } as const] : []),
      ];
      for (const sel of cases) {
        expect(isSelectionDeletable(sel, project)).toBe(true);
      }
    });

    it("returns true for storey when storeys.length > 1", () => {
      expect(project.storeys.length).toBeGreaterThan(1);
      expect(isSelectionDeletable({ kind: "storey", id: storeyId }, project)).toBe(true);
    });

    it("returns false for storey when storeys.length === 1", () => {
      const single = withSingleStorey(project);
      expect(isSelectionDeletable({ kind: "storey", id: single.storeys[0].id }, single)).toBe(false);
    });

    it("returns false for roof and roof-edge", () => {
      expect(isSelectionDeletable({ kind: "roof" }, project)).toBe(false);
      expect(
        isSelectionDeletable({ kind: "roof-edge", wallId }, project),
      ).toBe(false);
    });
  });

  describe("deleteSelection", () => {
    it("removeStorey resets activeView when deleting current view's storey", () => {
      const project = createSampleProject();
      const targetId = project.storeys[1].id;
      const remainingFirst = project.storeys.find((s) => s.id !== targetId)!.id;
      const start: HouseProject = { ...project, activeView: `plan-${targetId}` as ViewId };

      const next = deleteSelection(start, { kind: "storey", id: targetId });

      expect(next.storeys.find((s) => s.id === targetId)).toBeUndefined();
      expect(next.activeView).toBe(`plan-${remainingFirst}`);
    });

    it("removeStorey preserves activeView when deleting other storey", () => {
      const project = createSampleProject();
      const keepId = project.storeys[0].id;
      const removeId = project.storeys[1].id;
      const start: HouseProject = { ...project, activeView: `plan-${keepId}` as ViewId };

      const next = deleteSelection(start, { kind: "storey", id: removeId });

      expect(next.activeView).toBe(`plan-${keepId}`);
    });

    it("removeWall does not touch activeView", () => {
      const project = createSampleProject();
      const wallId = project.walls[0].id;

      const next = deleteSelection(project, { kind: "wall", id: wallId });

      expect(next.activeView).toBe(project.activeView);
      expect(next.walls.find((w) => w.id === wallId)).toBeUndefined();
    });

    it("throws for non-deletable kinds", () => {
      const project = createSampleProject();
      expect(() => deleteSelection(project, { kind: "roof" })).toThrow();
    });
  });
});
