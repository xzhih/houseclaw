import { describe, expect, it } from "vitest";
import { pickRulerLength } from "../geometry/scaleRulerBucket";

describe("pickRulerLength", () => {
  it("100 px/m → 1 m（100px 在 [60,150] 范围内最大）", () => {
    expect(pickRulerLength(100)).toBe(1);
  });

  it("10 px/m → 10 m（100px）", () => {
    expect(pickRulerLength(10)).toBe(10);
  });

  it("1000 px/m → 0.1 m（100px）", () => {
    expect(pickRulerLength(1000)).toBe(0.1);
  });

  it("50 px/m → 2 m（100px，因为 1m=50px 不在 [60,150] 但 2m=100px 在范围内）", () => {
    expect(pickRulerLength(50)).toBe(2);
  });

  it("75 px/m → 1m（75px 在范围）vs 2m（150px 在范围）→ 取 2m（最大）", () => {
    expect(pickRulerLength(75)).toBe(2);
  });

  it("极端小 px/m=0.5 → 没有候选落在范围，取最接近 105px 的（10m=5px 仍最大但远）", () => {
    // 10m * 0.5 = 5px, 距 105 = 100；最接近也是 10m
    expect(pickRulerLength(0.5)).toBe(10);
  });

  it("极端大 px/m=10000 → 0.1m=1000px 最接近", () => {
    expect(pickRulerLength(10000)).toBe(0.1);
  });

  it("非法输入返回 1m fallback", () => {
    expect(pickRulerLength(0)).toBe(1);
    expect(pickRulerLength(-5)).toBe(1);
    expect(pickRulerLength(NaN)).toBe(1);
  });
});
