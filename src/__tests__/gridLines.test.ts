import { describe, expect, it } from "vitest";
import { buildGridLines } from "../geometry/v2/gridLines";

describe("buildGridLines", () => {
  it("空 bounds 返回空数组", () => {
    const lines = buildGridLines(
      { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      0.1, 1.0, true,
    );
    // 仍包含通过 0 的轴线
    expect(lines.filter(l => l.axis === "x" && l.major)).toHaveLength(1);
    expect(lines.filter(l => l.axis === "y" && l.major)).toHaveLength(1);
  });

  it("0~2 范围 x 轴：21 条次线（含主线占位） + 主线分级", () => {
    const lines = buildGridLines(
      { minX: 0, minY: 0, maxX: 2, maxY: 1 },
      0.1, 1.0, true,
    );
    const xMinor = lines.filter(l => l.axis === "x" && !l.major);
    const xMajor = lines.filter(l => l.axis === "x" && l.major);
    // 主线: 0, 1, 2 → 3 条；次线: 0.1~0.9, 1.1~1.9 → 18 条
    expect(xMajor).toHaveLength(3);
    expect(xMinor).toHaveLength(18);
  });

  it("showMinor=false 时只返回主线", () => {
    const lines = buildGridLines(
      { minX: 0, minY: 0, maxX: 2, maxY: 1 },
      0.1, 1.0, false,
    );
    expect(lines.every(l => l.major)).toBe(true);
    expect(lines.filter(l => l.axis === "x")).toHaveLength(3);
    expect(lines.filter(l => l.axis === "y")).toHaveLength(2);
  });

  it("负值范围正确处理", () => {
    const lines = buildGridLines(
      { minX: -1, minY: -1, maxX: 1, maxY: 1 },
      0.1, 1.0, true,
    );
    const xMajor = lines.filter(l => l.axis === "x" && l.major).map(l => l.pos).sort((a,b)=>a-b);
    expect(xMajor).toEqual([-1, 0, 1]);
  });

  it("非整 bounds 取 floor/ceil", () => {
    const lines = buildGridLines(
      { minX: 0.05, minY: 0, maxX: 0.95, maxY: 0.5 },
      0.1, 1.0, true,
    );
    // x 主线：从 floor(0.05/1)*1=0 到 ceil(0.95/1)*1=1 → [0, 1]
    const xMajor = lines.filter(l => l.axis === "x" && l.major).map(l => l.pos).sort((a,b)=>a-b);
    expect(xMajor).toEqual([0, 1]);
    // x 次线：0.0 也是主线被排除；0.1, 0.2, ..., 0.9 → 9 条；1.0 也是主线被排除
    const xMinor = lines.filter(l => l.axis === "x" && !l.major);
    expect(xMinor).toHaveLength(9);
  });
});
