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

  it("bottomEdge='-x': climb in +x direction (first tread at low-x edge)", () => {
    const stair: Stair = { ...BASE_STAIR, bottomEdge: "-x", width: 5.0, depth: 1.2 };
    const geom = buildStairGeometry(stair, STOREY, 0);
    const first = geom.treads[0];
    expect(first.cx).toBeCloseTo(0.27 / 2, 4);
    expect(first.sx).toBeCloseTo(0.27, 4);
    expect(first.cz).toBeCloseTo(stair.depth / 2, 4);
    expect(first.sz).toBeCloseTo(stair.depth, 4);
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

describe("buildStairGeometry — L", () => {
  const STAIR: Stair = {
    x: 0, y: 0, width: 5.0, depth: 5.0,
    shape: "l", treadDepth: 0.27,
    bottomEdge: "+y", turn: "right",
    materialId: "mat-dark-frame",
  };

  it("emits nLow + nUp tread boxes + 1 landing", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    // riserCount=19, treadCount=18, nLow=9, nUp=8
    expect(geom.treads).toHaveLength(9 + 8);
    expect(geom.landings).toHaveLength(1);
  });

  it("landing is square LW = 2.5, top at (nLow+1)*riserHeight", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const lw = 2.5;
    const r = 3.2 / 19;
    const landing = geom.landings[0];
    expect(landing.sx).toBeCloseTo(lw, 4);
    expect(landing.sz).toBeCloseTo(lw, 4);
    expect(landing.cy + landing.sy / 2).toBeCloseTo(10 * r, 4);
  });

  it("turn='right' puts the lower flight on the -x (cross-low) half", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const lw = 2.5;
    const lower0 = geom.treads[0];
    expect(lower0.cx).toBeCloseTo(STAIR.x + lw / 2, 4);
    expect(lower0.sx).toBeCloseTo(lw, 4);
    expect(lower0.sz).toBeCloseTo(0.27, 4);
  });

  it("turn='left' mirrors the lower flight to the +x (cross-high) half", () => {
    const geom = buildStairGeometry({ ...STAIR, turn: "left" }, STOREY, 0);
    const lw = 2.5;
    const lower0 = geom.treads[0];
    expect(lower0.cx).toBeCloseTo(STAIR.x + STAIR.width - lw / 2, 4);
  });

  it("upper flight (turn='right') runs in +x from cross=LW", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const lw = 2.5;
    const td = 0.27;
    const upper0 = geom.treads[9];  // first upper-flight tread (after 9 lower)
    expect(upper0.cx).toBeCloseTo(STAIR.x + lw + 0.5 * td, 4);
    expect(upper0.sx).toBeCloseTo(td, 4);   // upper flight's "run" along cross axis = treadDepth wide
    expect(upper0.sz).toBeCloseTo(lw, 4);   // upper flight's "width" perpendicular = LW
  });

  it("upper flight last tread top y = treadCount * riserHeight (one riser below upper floor)", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const r = 3.2 / 19;
    const top = geom.treads[geom.treads.length - 1];
    expect(top.cy + top.sy / 2).toBeCloseTo(18 * r, 4);
  });

  it("turn='left' upper flight runs in -x direction", () => {
    const geom = buildStairGeometry({ ...STAIR, turn: "left" }, STOREY, 0);
    const lw = 2.5;
    const td = 0.27;
    const upper0 = geom.treads[9];
    // For turn=left, upper starts at cross=crossLength-LW=2.5, climbs in -x
    expect(upper0.cx).toBeCloseTo(STAIR.x + (STAIR.width - lw) - 0.5 * td, 4);
  });
});

describe("buildStairGeometry — rotation", () => {
  it("rotation=0 leaves box centers unchanged (regression guard)", () => {
    const stair: Stair = { ...BASE_STAIR, rotation: 0 };
    const geom = buildStairGeometry(stair, STOREY, 0);
    const first = geom.treads[0];
    expect(first.cx).toBeCloseTo(BASE_STAIR.width / 2, 4);
    expect(first.cz).toBeCloseTo(BASE_STAIR.depth - 0.27 / 2, 4);
    expect(first.rotationY).toBeUndefined(); // 0-rotation path doesn't set rotationY
  });

  it("rotation=π/2 (90° CCW) swings box centers 90° around the rect center", () => {
    // Stair at x=0, y=0, width=1.2, depth=5.0 — center at (0.6, 2.5).
    // First tread (rotation=0) at cx=0.6, cz=4.865 (depth - 0.27/2).
    // With rotation=π/2: rotatePoint({x:0.6, y:4.865}, {x:0.6, y:2.5}, π/2)
    //   dx=0, dy=2.365; rotated: cx=0.6+0*0-2.365*1=−1.765, cz=2.5+0*1+2.365*0=2.5
    // So cx ≈ 0.6 - 2.365, cz ≈ 2.5.
    const stair: Stair = { ...BASE_STAIR, rotation: Math.PI / 2 };
    const geom = buildStairGeometry(stair, STOREY, 0);
    const first = geom.treads[0];
    const center = { x: BASE_STAIR.width / 2, y: BASE_STAIR.depth / 2 };
    const dz = (BASE_STAIR.depth - 0.27 / 2) - center.y; // original cz minus center.y

    // After 90° CCW rotation: new_cx = center.x - dz, new_cz = center.y
    expect(first.cx).toBeCloseTo(center.x - dz, 4);
    expect(first.cz).toBeCloseTo(center.y, 4);
    expect(first.rotationY).toBeCloseTo(Math.PI / 2, 4);
  });

  it("rotation=π/2 rotates all treads and sets rotationY on each box", () => {
    const stair: Stair = { ...BASE_STAIR, rotation: Math.PI / 2 };
    const geom = buildStairGeometry(stair, STOREY, 0);
    for (const box of geom.treads) {
      expect(box.rotationY).toBeCloseTo(Math.PI / 2, 4);
    }
  });
});

describe("buildStairGeometry — U", () => {
  const STAIR: Stair = {
    x: 0, y: 0, width: 2.5, depth: 5.0,
    shape: "u", treadDepth: 0.27,
    bottomEdge: "+y",
    materialId: "mat-dark-frame",
  };

  it("emits nLow + nUp tread boxes + 1 landing", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    // riserCount=19, treadCount=18, nLow=9, nUp=8
    expect(geom.treads).toHaveLength(9 + 8);
    expect(geom.landings).toHaveLength(1);
  });

  it("flight widths are (crossLength - 0.05) / 2", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const flightWidth = (2.5 - 0.05) / 2;
    expect(geom.treads[0].sx).toBeCloseTo(flightWidth, 4);
  });

  it("lower flight on cross-low half, upper flight on cross-high half", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const fw = (2.5 - 0.05) / 2;
    const lower0 = geom.treads[0];
    const upper0 = geom.treads[9]; // first upper flight tread
    expect(lower0.cx).toBeCloseTo(fw / 2, 4);
    expect(upper0.cx).toBeCloseTo(2.5 - fw / 2, 4);
  });

  it("landing spans full crossLength, run-extent = treadDepth, top at (nLow+1)*riserHeight", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const r = 3.2 / 19;
    const td = 0.27;
    const landing = geom.landings[0];
    expect(landing.sx).toBeCloseTo(STAIR.width, 4);  // full crossLength
    expect(landing.sz).toBeCloseTo(td, 4);            // run extent = one tread depth
    expect(landing.cy + landing.sy / 2).toBeCloseTo(10 * r, 4);
    // landing's run center = runLength - nLow*td - td/2 = 5.0 - 9*0.27 - 0.135 = 2.435
    expect(landing.cz).toBeCloseTo(STAIR.depth - 9 * td - td / 2, 4);
  });

  it("upper flight tread j runCenter = landing's near edge - (j+0.5)*td", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const td = 0.27;
    const upper0 = geom.treads[9];
    // landing near edge (toward bottomEdge) at run = runLength - nLow*td - td = 5.0 - 9*0.27 - 0.27 = 2.30
    // upper flight tread 0 runCenter = 2.30 - 0.5*td = 2.165
    expect(upper0.cz).toBeCloseTo(STAIR.depth - 9 * td - td - 0.5 * td, 4);
  });

  it("top upper-flight tread top y = treadCount * riserHeight", () => {
    const geom = buildStairGeometry(STAIR, STOREY, 0);
    const r = 3.2 / 19;
    const top = geom.treads[geom.treads.length - 1];
    expect(top.cy + top.sy / 2).toBeCloseTo(18 * r, 4);
  });
});
