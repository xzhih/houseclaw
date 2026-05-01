import { describe, expect, it } from "vitest";
import { findAxisAlignedGuides, type Anchor } from "../geometry/v2/smartGuides";

const TOL = 0.2;

describe("findAxisAlignedGuides", () => {
  it("空锚点返回空数组", () => {
    expect(findAxisAlignedGuides({ x: 1, y: 1 }, [], TOL)).toEqual([]);
  });

  it("单 X 轴命中", () => {
    const anchors: Anchor[] = [{ x: 2, y: 5, sourceId: "a" }];
    const result = findAxisAlignedGuides({ x: 2.05, y: 0 }, anchors, TOL);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ axis: "x", pos: 2 });
    expect(result[0].anchor.sourceId).toBe("a");
  });

  it("单 Y 轴命中", () => {
    const anchors: Anchor[] = [{ x: 99, y: 3, sourceId: "b" }];
    const result = findAxisAlignedGuides({ x: 0, y: 3.1 }, anchors, TOL);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ axis: "y", pos: 3 });
  });

  it("X+Y 同时命中两条 guide", () => {
    const anchors: Anchor[] = [
      { x: 2, y: 5, sourceId: "a" },
      { x: 99, y: 3, sourceId: "b" },
    ];
    const result = findAxisAlignedGuides({ x: 2.05, y: 3.1 }, anchors, TOL);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.axis).sort()).toEqual(["x", "y"]);
  });

  it("同轴多个候选 → 取最近的", () => {
    const anchors: Anchor[] = [
      { x: 2.0, y: 0, sourceId: "far" },
      { x: 2.18, y: 0, sourceId: "close" },
    ];
    const result = findAxisAlignedGuides({ x: 2.15, y: 100 }, anchors, TOL);
    expect(result).toHaveLength(1);
    expect(result[0].anchor.sourceId).toBe("close");
  });

  it("阈值边界：0.19 命中、0.21 不命中", () => {
    const anchors: Anchor[] = [{ x: 0, y: 0, sourceId: "z" }];
    expect(findAxisAlignedGuides({ x: 0.19, y: 100 }, anchors, TOL)).toHaveLength(1);
    expect(findAxisAlignedGuides({ x: 0.21, y: 100 }, anchors, TOL)).toHaveLength(0);
  });
});
