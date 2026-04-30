import { describe, expect, it } from "vitest";
import { createV2SampleProject } from "../../../domain/v2/sampleProject";
import {
  addStorey,
  removeStorey,
  setStoreyElevation,
  setStoreyHeight,
  setStoreyLabel,
} from "../../../domain/v2/mutations/storeys";

describe("setStoreyLabel", () => {
  it("renames a storey", () => {
    const project = createV2SampleProject();
    const next = setStoreyLabel(project, "1f", "Ground");
    expect(next.storeys.find((s) => s.id === "1f")?.label).toBe("Ground");
  });
});

describe("setStoreyElevation", () => {
  it("changes a single storey's elevation without cascading", () => {
    const project = createV2SampleProject();
    const next = setStoreyElevation(project, "2f", 4.0);
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBe(4.0);
    expect(next.storeys.find((s) => s.id === "1f")?.elevation).toBe(0);
    expect(next.storeys.find((s) => s.id === "roof")?.elevation).toBe(6.4);
  });
});

describe("setStoreyHeight (cascade)", () => {
  it("editing 1F height shifts all storeys above by delta", () => {
    const project = createV2SampleProject();
    const next = setStoreyHeight(project, "1f", 3.5);
    expect(next.storeys.find((s) => s.id === "1f")?.elevation).toBe(0);
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBeCloseTo(3.5);
    expect(next.storeys.find((s) => s.id === "roof")?.elevation).toBeCloseTo(6.7);
  });

  it("editing 2F height shifts only roof, not 1F", () => {
    const project = createV2SampleProject();
    const next = setStoreyHeight(project, "2f", 3.0);
    expect(next.storeys.find((s) => s.id === "1f")?.elevation).toBe(0);
    expect(next.storeys.find((s) => s.id === "2f")?.elevation).toBe(3.2);
    expect(next.storeys.find((s) => s.id === "roof")?.elevation).toBeCloseTo(6.2);
  });

  it("throws when storey is the topmost (no next to compute height from)", () => {
    const project = createV2SampleProject();
    expect(() => setStoreyHeight(project, "roof", 3.0)).toThrow(/topmost/i);
  });
});

describe("addStorey", () => {
  it("appends a new storey above the current top with default height 3.2m", () => {
    const project = createV2SampleProject();
    const next = addStorey(project);
    expect(next.storeys.length).toBe(project.storeys.length + 1);
    const newStorey = next.storeys[next.storeys.length - 1];
    expect(newStorey.elevation).toBeCloseTo(9.6);
  });
});

describe("removeStorey", () => {
  it("removes a storey when nothing references it", () => {
    const project = createV2SampleProject();
    const newProject = addStorey(project);
    const idToRemove = newProject.storeys[newProject.storeys.length - 1].id;
    const next = removeStorey(newProject, idToRemove);
    expect(next.storeys.find((s) => s.id === idToRemove)).toBeUndefined();
  });

  it("throws when an object still references the storey", () => {
    const project = createV2SampleProject();
    expect(() => removeStorey(project, "1f")).toThrow(/in use/i);
  });
});
