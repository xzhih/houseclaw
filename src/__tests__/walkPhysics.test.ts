import { describe, expect, it } from "vitest";
import {
  resolveHorizontalCollision,
  resolveVerticalState,
  type HorizontalProbe,
  type VerticalProbe,
} from "../rendering/walkPhysics";

describe("resolveHorizontalCollision", () => {
  const radius = 0.3;

  it("passes desired move through unchanged when no walls block", () => {
    const probe: HorizontalProbe = () => null;
    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: 0 },
      radius,
      probe,
    );
    expect(out).toEqual({ x: 0.5, z: 0 });
  });

  it("clamps motion along the +x axis when a wall is in the way", () => {
    // Wall hit at distance 0.4 along +x; allowed move = 0.4 - radius = 0.1.
    const probe: HorizontalProbe = (origin, dir) =>
      dir.x > 0.5 ? 0.4 : null;

    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: 0 },
      radius,
      probe,
    );
    expect(out.x).toBeCloseTo(0.1, 4);
    expect(out.z).toBe(0);
  });

  it("slides along walls: +x blocked still allows -z motion", () => {
    const probe: HorizontalProbe = (origin, dir) =>
      dir.x > 0.5 ? 0.4 : null;

    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: -0.6 },
      radius,
      probe,
    );
    expect(out.x).toBeCloseTo(0.1, 4);
    expect(out.z).toBeCloseTo(-0.6, 4);
  });

  it("never lets motion go below zero distance from a wall", () => {
    // Wall already inside the radius (e.g. starting position is touching).
    const probe: HorizontalProbe = (origin, dir) =>
      dir.x > 0.5 ? 0.1 : null;

    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0.5, z: 0 },
      radius,
      probe,
    );
    expect(out.x).toBeCloseTo(0, 4);
  });

  it("returns zero motion when desired is zero", () => {
    const probe: HorizontalProbe = () => null;
    const out = resolveHorizontalCollision(
      { x: 0, y: 0, z: 0 },
      { x: 0, z: 0 },
      radius,
      probe,
    );
    expect(out).toEqual({ x: 0, z: 0 });
  });
});

describe("resolveVerticalState", () => {
  const config = {
    eyeHeight: 1.6,
    snapThreshold: 0.2,
    gravity: -9.8,
    maxRayLength: 5,
  } as const;

  it("snaps the camera to the surface when the player is grounded", () => {
    const probe: VerticalProbe = () => 0; // surface at y=0

    const next = resolveVerticalState(
      { cameraY: 1.6 + 0.05, vy: 0 },
      { x: 0, z: 0 },
      0.016,
      config,
      probe,
    );

    expect(next).not.toBe("respawn");
    if (next === "respawn") return;
    expect(next.cameraY).toBeCloseTo(1.6, 4);
    expect(next.vy).toBe(0);
  });

  it("snaps up small steps within the snap threshold", () => {
    const probe: VerticalProbe = () => 0.15; // tread 15cm above last footing

    const next = resolveVerticalState(
      { cameraY: 1.6, vy: 0 },
      { x: 0, z: 0 },
      0.016,
      config,
      probe,
    );

    if (next === "respawn") throw new Error("expected snap");
    expect(next.cameraY).toBeCloseTo(0.15 + 1.6, 4);
    expect(next.vy).toBe(0);
  });

  it("falls under gravity when the surface is far below", () => {
    const probe: VerticalProbe = () => -3.0; // 3m drop

    const next = resolveVerticalState(
      { cameraY: 1.6, vy: 0 },
      { x: 0, z: 0 },
      0.1,
      config,
      probe,
    );

    if (next === "respawn") throw new Error("expected falling");
    // After 0.1s of -9.8 m/s² gravity, vy = -0.98 and cameraY ≈ 1.6 + (-0.98)*0.1 = 1.502
    expect(next.vy).toBeCloseTo(-0.98, 3);
    expect(next.cameraY).toBeCloseTo(1.502, 3);
  });

  it("returns 'respawn' when the probe finds no surface within range", () => {
    const probe: VerticalProbe = () => null;

    const next = resolveVerticalState(
      { cameraY: 1.6, vy: 0 },
      { x: 0, z: 0 },
      0.016,
      config,
      probe,
    );
    expect(next).toBe("respawn");
  });
});
