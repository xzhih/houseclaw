import { describe, expect, it } from "vitest";
import { computeStairConfig, TARGET_RISER } from "../domain/stairs";

describe("computeStairConfig", () => {
  it("treadCount × riserHeight = storeyHeight - slabThickness", () => {
    // climb to slab BOTTOM = 3.2 - 0.18 = 3.02; 3.02/0.165 = 18.30 → 18 treads
    const cfg = computeStairConfig(3.2, 0.18, 0.27);
    expect(cfg.treadCount).toBe(18);
    expect(cfg.riserHeight).toBeCloseTo(3.02 / 18, 6);
    expect(cfg.riserCount).toBe(19); // 18 stair risers + 1 slab thickness
    // top tread top sits exactly at slab bottom
    expect(cfg.treadCount * cfg.riserHeight).toBeCloseTo(3.2 - 0.18, 6);
  });

  it("clamps to a minimum of 1 tread for very short stairs", () => {
    const cfg = computeStairConfig(0.1, 0.05, 0.27);
    expect(cfg.treadCount).toBeGreaterThanOrEqual(1);
    expect(cfg.riserCount).toBe(cfg.treadCount + 1);
  });

  it("scales for taller storeys", () => {
    // 4.0 - 0.18 = 3.82; 3.82/0.165 = 23.15 → 23 treads
    const cfg = computeStairConfig(4.0, 0.18, 0.27);
    expect(cfg.treadCount).toBe(23);
    expect(cfg.riserHeight).toBeCloseTo(3.82 / 23, 6);
    expect(cfg.treadCount * cfg.riserHeight).toBeCloseTo(4.0 - 0.18, 6);
  });

  it("ignores treadDepth (does not affect riser math)", () => {
    expect(computeStairConfig(3.2, 0.18, 0.20)).toEqual(
      computeStairConfig(3.2, 0.18, 0.30),
    );
  });

  it("exports TARGET_RISER constant", () => {
    expect(TARGET_RISER).toBe(0.165);
  });
});
