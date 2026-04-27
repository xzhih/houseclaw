import { describe, expect, it } from "vitest";
import {
  addStorey,
  duplicateStorey,
  resizeStoreyExtent,
  translateStorey,
} from "../domain/mutations";
import { createSampleProject } from "../domain/sampleProject";

describe("translateStorey", () => {
  it("shifts every wall on the target storey and leaves others alone", () => {
    const project = createSampleProject();
    const dx = 1.5;
    const dy = -0.25;

    const next = translateStorey(project, "2f", dx, dy);

    for (const original of project.walls) {
      const after = next.walls.find((wall) => wall.id === original.id);
      expect(after).toBeDefined();
      if (original.storeyId === "2f") {
        expect(after!.start).toEqual({ x: original.start.x + dx, y: original.start.y + dy });
        expect(after!.end).toEqual({ x: original.end.x + dx, y: original.end.y + dy });
      } else {
        expect(after!.start).toEqual(original.start);
        expect(after!.end).toEqual(original.end);
      }
    }
  });

  it("shifts the stair opening on the target storey along with its walls", () => {
    const project = createSampleProject();
    const original = project.storeys.find((storey) => storey.id === "2f")!;
    expect(original.stairOpening).toBeDefined();

    const next = translateStorey(project, "2f", 1.5, -0.25);
    const updated = next.storeys.find((storey) => storey.id === "2f")!;

    expect(updated.stairOpening).toEqual({
      ...original.stairOpening!,
      x: original.stairOpening!.x + 1.5,
      y: original.stairOpening!.y - 0.25,
    });
  });

  it("does not touch stair openings on other storeys", () => {
    const project = createSampleProject();
    const next = translateStorey(project, "2f", 5, 0);
    const other = next.storeys.find((storey) => storey.id === "3f")!;
    const original = project.storeys.find((storey) => storey.id === "3f")!;
    expect(other.stairOpening).toEqual(original.stairOpening);
  });

  it("returns the same project when delta is zero", () => {
    const project = createSampleProject();
    expect(translateStorey(project, "2f", 0, 0)).toBe(project);
  });
});

describe("resizeStoreyExtent", () => {
  it("scales walls along the X axis about the storey's left edge", () => {
    const project = createSampleProject();
    const storeyId = "1f";
    const before = project.walls.filter((wall) => wall.storeyId === storeyId);
    const xs = before.flatMap((wall) => [wall.start.x, wall.end.x]);
    const minX = Math.min(...xs);
    const oldWidth = Math.max(...xs) - minX;

    const next = resizeStoreyExtent(project, storeyId, "x", oldWidth * 2);
    const after = next.walls.filter((wall) => wall.storeyId === storeyId);

    for (let i = 0; i < before.length; i += 1) {
      const expectedStartX = minX + (before[i].start.x - minX) * 2;
      const expectedEndX = minX + (before[i].end.x - minX) * 2;
      expect(after[i].start.x).toBeCloseTo(expectedStartX);
      expect(after[i].end.x).toBeCloseTo(expectedEndX);
      expect(after[i].start.y).toBe(before[i].start.y);
      expect(after[i].end.y).toBe(before[i].end.y);
    }
  });

  it("does not scale Y when resizing X extent", () => {
    const project = createSampleProject();
    const next = resizeStoreyExtent(project, "1f", "x", 20);
    const before = project.walls.filter((wall) => wall.storeyId === "1f");
    const after = next.walls.filter((wall) => wall.storeyId === "1f");
    for (let i = 0; i < before.length; i += 1) {
      expect(after[i].start.y).toBe(before[i].start.y);
      expect(after[i].end.y).toBe(before[i].end.y);
    }
  });

  it("leaves walls on other storeys untouched", () => {
    const project = createSampleProject();
    const next = resizeStoreyExtent(project, "1f", "x", 20);
    for (const original of project.walls) {
      if (original.storeyId === "1f") continue;
      const after = next.walls.find((wall) => wall.id === original.id)!;
      expect(after.start).toEqual(original.start);
      expect(after.end).toEqual(original.end);
    }
  });

  it("scales the stair opening along the active axis", () => {
    const project = createSampleProject();
    const storey = project.storeys.find((s) => s.id === "2f")!;
    expect(storey.stairOpening).toBeDefined();
    const orig = storey.stairOpening!;

    const ys = project.walls
      .filter((wall) => wall.storeyId === "2f")
      .flatMap((wall) => [wall.start.y, wall.end.y]);
    const minY = Math.min(...ys);
    const oldDepth = Math.max(...ys) - minY;

    const next = resizeStoreyExtent(project, "2f", "y", oldDepth * 0.5);
    const updated = next.storeys.find((s) => s.id === "2f")!;
    expect(updated.stairOpening!.y).toBeCloseTo(minY + (orig.y - minY) * 0.5);
    expect(updated.stairOpening!.depth).toBeCloseTo(orig.depth * 0.5);
    expect(updated.stairOpening!.x).toBe(orig.x);
    expect(updated.stairOpening!.width).toBe(orig.width);
  });

  it("rejects non-positive sizes", () => {
    const project = createSampleProject();
    expect(() => resizeStoreyExtent(project, "1f", "x", 0)).toThrow();
    expect(() => resizeStoreyExtent(project, "1f", "x", -1)).toThrow();
  });
});

describe("addStorey", () => {
  it("appends an empty storey on top with auto-numbered id and label", () => {
    const project = createSampleProject();
    const before = project.storeys.length;

    const next = addStorey(project);

    expect(next.storeys.length).toBe(before + 1);
    const added = next.storeys[next.storeys.length - 1];
    expect(added.id).toBe("4f");
    expect(added.label).toBe("4F");
    expect(added.elevation).toBeCloseTo(9.6); // 0 + 3.2 + 3.2 + 3.2
    expect(next.walls.filter((wall) => wall.storeyId === added.id)).toHaveLength(0);
  });

  it("inherits height and slabThickness from the previous topmost storey", () => {
    const project = createSampleProject();
    const top = project.storeys[project.storeys.length - 1];

    const next = addStorey(project);
    const added = next.storeys[next.storeys.length - 1];

    expect(added.height).toBeCloseTo(top.height);
    expect(added.slabThickness).toBeCloseTo(top.slabThickness);
  });
});

describe("duplicateStorey", () => {
  it("clones the source storey's walls, openings, and balconies under fresh ids", () => {
    const project = createSampleProject();
    const sourceWalls = project.walls.filter((wall) => wall.storeyId === "2f");
    const sourceOpenings = project.openings.filter((opening) =>
      sourceWalls.some((wall) => wall.id === opening.wallId),
    );
    const sourceBalconies = project.balconies.filter((balcony) => balcony.storeyId === "2f");

    const next = duplicateStorey(project, "2f");
    const clone = next.storeys[next.storeys.length - 1];

    expect(clone.id).toBe("4f");
    expect(clone.label).toBe("4F");

    const cloneWalls = next.walls.filter((wall) => wall.storeyId === clone.id);
    expect(cloneWalls).toHaveLength(sourceWalls.length);
    // No id collisions with original walls.
    for (const wall of cloneWalls) {
      expect(sourceWalls.some((src) => src.id === wall.id)).toBe(false);
    }

    const cloneOpenings = next.openings.filter((opening) =>
      cloneWalls.some((wall) => wall.id === opening.wallId),
    );
    expect(cloneOpenings).toHaveLength(sourceOpenings.length);

    const cloneBalconies = next.balconies.filter((balcony) => balcony.storeyId === clone.id);
    expect(cloneBalconies).toHaveLength(sourceBalconies.length);
  });

  it("copies stair opening when the source has one", () => {
    const project = createSampleProject();
    const next = duplicateStorey(project, "2f");
    const clone = next.storeys[next.storeys.length - 1];

    expect(clone.stairOpening).toBeDefined();
    expect(clone.stairOpening?.x).toBeCloseTo(0.6);
    expect(clone.stairOpening?.depth).toBeCloseTo(2.5);
  });

  it("preserves wall geometry (start/end points) from the source", () => {
    const project = createSampleProject();
    const sourceWall = project.walls.find(
      (wall) => wall.storeyId === "2f" && wall.id === "wall-front-2f",
    );
    expect(sourceWall).toBeDefined();

    const next = duplicateStorey(project, "2f");
    const clone = next.storeys[next.storeys.length - 1];
    const cloneFront = next.walls.find(
      (wall) => wall.storeyId === clone.id && wall.id.includes("front"),
    );
    expect(cloneFront).toBeDefined();
    expect(cloneFront!.start).toEqual(sourceWall!.start);
    expect(cloneFront!.end).toEqual(sourceWall!.end);
  });

  it("throws when the source storey does not exist", () => {
    const project = createSampleProject();
    expect(() => duplicateStorey(project, "missing")).toThrow();
  });
});
