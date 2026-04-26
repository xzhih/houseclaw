import { describe, expect, it } from "vitest";
import { computeStairConfig, TARGET_RISER } from "../domain/stairs";

describe("computeStairConfig", () => {
  it("rounds risers to nearest integer using TARGET_RISER", () => {
    // 3.2 / 0.165 = 19.39 → round to 19
    const cfg = computeStairConfig(3.2, 0.27);
    expect(cfg.riserCount).toBe(19);
    expect(cfg.riserHeight).toBeCloseTo(3.2 / 19, 6);
    expect(cfg.treadCount).toBe(18);
  });

  it("uses minimum 2 risers even for very short storeys", () => {
    const cfg = computeStairConfig(0.1, 0.27);
    expect(cfg.riserCount).toBe(2);
    expect(cfg.treadCount).toBe(1);
    expect(cfg.riserHeight).toBeCloseTo(0.05, 6);
  });

  it("scales for taller storeys", () => {
    // 4.0 / 0.165 = 24.24 → round 24
    const cfg = computeStairConfig(4.0, 0.27);
    expect(cfg.riserCount).toBe(24);
    expect(cfg.riserHeight).toBeCloseTo(4.0 / 24, 6);
    expect(cfg.treadCount).toBe(23);
  });

  it("ignores treadDepth (does not affect riser math)", () => {
    expect(computeStairConfig(3.2, 0.20)).toEqual(computeStairConfig(3.2, 0.30));
  });

  it("exports TARGET_RISER constant", () => {
    expect(TARGET_RISER).toBe(0.165);
  });
});
