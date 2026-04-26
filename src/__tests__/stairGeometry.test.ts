import { describe, expect, it } from "vitest";
import type { Stair, Storey } from "../domain/types";
import { buildStairGeometry } from "../geometry/stairGeometry";

const STOREY: Storey = {
  id: "2f",
  label: "2F",
  elevation: 3.2,
  height: 3.2,
  slabThickness: 0.18,
};

const BASE_STAIR: Stair = {
  x: 0, y: 0, width: 1.2, depth: 5.0,
  shape: "straight",
  treadDepth: 0.27,
  bottomEdge: "+y",
  materialId: "mat-dark-frame",
};

describe("buildStairGeometry — straight", () => {
  it("emits treadCount tread boxes (riserCount - 1)", () => {
    const geom = buildStairGeometry(BASE_STAIR, STOREY, 0); // lowerStoreyTopY = 0
    // computeStairConfig(3.2, 0.27): riserCount = round(3.2/0.165) = 19, treadCount = 18
    expect(geom.treads).toHaveLength(18);
    expect(geom.landings).toHaveLength(0);
  });

  it("first tread top y = riserHeight, climbs in -y direction (bottomEdge='+y' starts at high y)", () => {
    const geom = buildStairGeometry(BASE_STAIR, STOREY, 0);
    const riserHeight = 3.2 / 19;
    const first = geom.treads[0];

    // 第 0 级踏步顶面 y = riserHeight
    expect(first.cy + first.sy / 2).toBeCloseTo(riserHeight, 4);
    expect(first.sy).toBeCloseTo(riserHeight, 4);
    // 第 0 级沿 Z 占据 (depth - 0.27, depth) 区间（贴 +y 边的第一格）
    expect(first.cz).toBeCloseTo(BASE_STAIR.depth - 0.27 / 2, 4);
    expect(first.sz).toBeCloseTo(0.27, 4);
    // 沿 X 占满洞口宽
    expect(first.cx).toBeCloseTo(BASE_STAIR.width / 2, 4);
    expect(first.sx).toBeCloseTo(BASE_STAIR.width, 4);
  });

  it("top tread top y = treadCount * riserHeight (one riser below upper floor)", () => {
    const geom = buildStairGeometry(BASE_STAIR, STOREY, 0);
    const riserHeight = 3.2 / 19;
    const top = geom.treads[geom.treads.length - 1];
    expect(top.cy + top.sy / 2).toBeCloseTo(18 * riserHeight, 4);
  });

  it("treads are placed in opening-local coords (offset by stair.x, stair.y)", () => {
    const offset: Stair = { ...BASE_STAIR, x: 2.0, y: 1.5 };
    const geom = buildStairGeometry(offset, STOREY, 0);
    const first = geom.treads[0];
    expect(first.cx).toBeCloseTo(offset.x + offset.width / 2, 4);
    expect(first.cz).toBeCloseTo(offset.y + offset.depth - 0.27 / 2, 4);
  });

  it("bottomEdge='-y' reverses climb direction (first tread at y=0 side)", () => {
    const reversed: Stair = { ...BASE_STAIR, bottomEdge: "-y" };
    const geom = buildStairGeometry(reversed, STOREY, 0);
    const first = geom.treads[0];
    expect(first.cz).toBeCloseTo(0.27 / 2, 4);
  });

  it("bottomEdge='+x' rotates: width axis becomes climb axis", () => {
    const rot: Stair = { ...BASE_STAIR, bottomEdge: "+x", width: 5.0, depth: 1.2 };
    const geom = buildStairGeometry(rot, STOREY, 0);
    const first = geom.treads[0];
    // 沿 X 起跑（高 X 端是 bottomEdge），第一级在 (width - treadDepth, width)
    expect(first.cx).toBeCloseTo(rot.width - 0.27 / 2, 4);
    expect(first.sx).toBeCloseTo(0.27, 4);
    // Z 上占满 depth
    expect(first.cz).toBeCloseTo(rot.depth / 2, 4);
    expect(first.sz).toBeCloseTo(rot.depth, 4);
  });

  it("uses lowerStoreyTopY for vertical offset", () => {
    // 拿 lowerStoreyTopY=1.0 的非零起点；climb = 3.2 - 1.0 = 2.2
    const geom = buildStairGeometry(BASE_STAIR, STOREY, 1.0);
    const climb = 2.2;
    const riserCount = Math.round(climb / 0.165); // 13
    const riserHeight = climb / riserCount;
    const first = geom.treads[0];
    // 第 0 级踏步顶面 y = lowerStoreyTopY + riserHeight
    expect(first.cy + first.sy / 2).toBeCloseTo(1.0 + riserHeight, 4);
    // 顶级踏步顶面 y = lowerStoreyTopY + treadCount * riserHeight
    const top = geom.treads[geom.treads.length - 1];
    expect(top.cy + top.sy / 2).toBeCloseTo(1.0 + (riserCount - 1) * riserHeight, 4);
  });
});

describe("buildStairGeometry — L (placeholder for T7)", () => {
  it("returns empty arrays for L until T7 implements it", () => {
    const stair: Stair = { ...BASE_STAIR, shape: "l", turn: "right" };
    const geom = buildStairGeometry(stair, STOREY, 0);
    expect(geom.treads).toEqual([]);
    expect(geom.landings).toEqual([]);
  });
});

describe("buildStairGeometry — U (placeholder for T8)", () => {
  it("returns empty arrays for U until T8 implements it", () => {
    const stair: Stair = { ...BASE_STAIR, shape: "u" };
    const geom = buildStairGeometry(stair, STOREY, 0);
    expect(geom.treads).toEqual([]);
    expect(geom.landings).toEqual([]);
  });
});
