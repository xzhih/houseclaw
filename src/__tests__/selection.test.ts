import { describe, expect, it } from "vitest";
import { isSelected } from "../domain/selection";

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
