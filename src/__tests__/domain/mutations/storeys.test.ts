import { describe, expect, it } from "vitest";
import { createSampleProject } from "../../../domain/sampleProject";
import {
  addStorey,
  removeStorey,
  setStoreyElevation,
  setStoreyHeight,
  setStoreyLabel,
  swapStoreyElevations,
} from "../../../domain/mutations/storeys";

describe("setStoreyLabel", () => {
  it("renames a storey", () => {
    const project = createSampleProject();
    const next = setStoreyLabel(project, "1f", "Ground");
    expect(next.storeys.find((s) => s.id === "1f")?.label).toBe("Ground");
  });
});

describe("setStoreyElevation", () => {
  it("changes a single storey's elevation without cascading", () => {
    const project = createSampleProject();
    const next = setStoreyElevation(project, "2f", 4.0);
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBe(4.0);
    expect(next.storeys.find((s) => s.id === "1f")?.elevation).toBe(0);
    expect(next.storeys.find((s) => s.id === "roof")?.elevation).toBe(6.4);
  });
});

describe("setStoreyHeight (cascade)", () => {
  it("editing 1F height shifts all storeys above by delta", () => {
    const project = createSampleProject();
    const next = setStoreyHeight(project, "1f", 3.5);
    expect(next.storeys.find((s) => s.id === "1f")?.elevation).toBe(0);
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBeCloseTo(3.5);
    expect(next.storeys.find((s) => s.id === "roof")?.elevation).toBeCloseTo(6.7);
  });

  it("editing 2F height shifts only roof, not 1F", () => {
    const project = createSampleProject();
    const next = setStoreyHeight(project, "2f", 3.0);
    expect(next.storeys.find((s) => s.id === "1f")?.elevation).toBe(0);
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBe(3.2);
    expect(next.storeys.find((s) => s.id === "roof")?.elevation).toBeCloseTo(6.2);
  });

  it("throws when storey is the topmost (no next to compute height from)", () => {
    const project = createSampleProject();
    expect(() => setStoreyHeight(project, "roof", 3.0)).toThrow(/topmost/i);
  });
});

describe("addStorey", () => {
  it("appends a new storey above the current top with default height 3.2m", () => {
    const project = createSampleProject();
    const next = addStorey(project);
    expect(next.storeys.length).toBe(project.storeys.length + 1);
    const newStorey = next.storeys[next.storeys.length - 1];
    expect(newStorey.elevation).toBeCloseTo(9.6);
  });
});

describe("swapStoreyElevations", () => {
  it("swaps elevations between two empty storeys (no anchors broken)", () => {
    // Add two empty storeys above ROOF so no walls are anchored to them.
    const base = addStorey(addStorey(createSampleProject()));
    const sorted = [...base.storeys].sort((a, b) => a.elevation - b.elevation);
    const a = sorted[sorted.length - 2];
    const b = sorted[sorted.length - 1];
    const aElev = a.elevation;
    const bElev = b.elevation;
    const next = swapStoreyElevations(base, a.id, b.id);
    expect(next.storeys.find((s) => s.id === a.id)?.elevation).toBe(bElev);
    expect(next.storeys.find((s) => s.id === b.id)?.elevation).toBe(aElev);
  });

  it("throws when swap would invert a wall whose top/bottom span both storeys", () => {
    // sampleProject has walls anchored bottom=1f, top=2f. Swapping 1f↔2f
    // makes top=3.2→0 and bottom=0→3.2 — wall top below bottom, invalid.
    const project = createSampleProject();
    expect(() => swapStoreyElevations(project, "1f", "2f")).toThrow();
  });

  it("is a no-op when aId === bId", () => {
    const project = createSampleProject();
    const next = swapStoreyElevations(project, "1f", "1f");
    expect(next).toEqual(project);
  });
});

describe("removeStorey", () => {
  it("removes a storey when nothing references it", () => {
    const project = createSampleProject();
    const newProject = addStorey(project);
    const idToRemove = newProject.storeys[newProject.storeys.length - 1].id;
    const next = removeStorey(newProject, idToRemove);
    expect(next.storeys.find((s) => s.id === idToRemove)).toBeUndefined();
  });

  it("throws with details when an object still references the storey", () => {
    const project = createSampleProject();
    expect(() => removeStorey(project, "1f")).toThrow(/墙/);
  });
});
