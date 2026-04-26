import { describe, expect, it } from "vitest";
import { isSelected, type ObjectSelection } from "../domain/selection";

describe("selection helpers", () => {
  it("matches a selection by kind and id", () => {
    expect(isSelected({ kind: "wall", id: "wall-front-1f" }, "wall", "wall-front-1f")).toBe(true);
  });

  it("does not match a different id", () => {
    expect(isSelected({ kind: "wall", id: "wall-front-1f" }, "wall", "wall-back-1f")).toBe(false);
  });

  it("does not match a different kind", () => {
    expect(isSelected({ kind: "wall", id: "wall-front-1f" }, "opening", "wall-front-1f")).toBe(false);
  });

  it("treats undefined selection as not selected", () => {
    expect(isSelected(undefined, "wall", "wall-front-1f")).toBe(false);
  });
});

describe("stair selection", () => {
  it("isSelected matches stair kind by storey id", () => {
    const sel: ObjectSelection = { kind: "stair", id: "2f" };
    expect(isSelected(sel, "stair", "2f")).toBe(true);
    expect(isSelected(sel, "stair", "3f")).toBe(false);
    expect(isSelected(sel, "wall", "2f")).toBe(false);
  });
});
