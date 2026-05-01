import { describe, expect, it } from "vitest";
import { resolveAnchor } from "../../domain/anchors";
import type { Anchor, Storey } from "../../domain/types";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
  { id: "roof", label: "屋顶", elevation: 6.4 },
];

describe("resolveAnchor", () => {
  it("resolves a storey anchor to elevation + offset", () => {
    const a: Anchor = { kind: "storey", storeyId: "2f", offset: 0.5 };
    expect(resolveAnchor(a, STOREYS)).toBeCloseTo(3.7);
  });

  it("resolves a storey anchor with negative offset", () => {
    const a: Anchor = { kind: "storey", storeyId: "1f", offset: -0.15 };
    expect(resolveAnchor(a, STOREYS)).toBeCloseTo(-0.15);
  });

  it("resolves an absolute anchor to its z value", () => {
    const a: Anchor = { kind: "absolute", z: 2.4 };
    expect(resolveAnchor(a, STOREYS)).toBe(2.4);
  });

  it("throws when a storey anchor references a missing storey", () => {
    const a: Anchor = { kind: "storey", storeyId: "ghost", offset: 0 };
    expect(() => resolveAnchor(a, STOREYS)).toThrow(/missing storey: ghost/i);
  });
});
