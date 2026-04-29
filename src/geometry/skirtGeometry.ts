import type { Point3, SkirtRoof, Wall } from "../domain/types";

export type SkirtGeometry = {
  skirtId: string;
  panel: { vertices: Point3[] };  // 4 verts CCW from outside: A0, A1, E1, E0
  endCaps: { vertices: Point3[] }[];  // 2 triangles, each 3 verts
  materialId: string;
};

/**
 * Build lean-to skirt roof geometry for the given SkirtRoof on its host Wall.
 *
 * Convention:
 *  û = host wall unit direction (start → end)
 *  n̂ = host wall outward unit normal — +90° CW rotation of û, matching the balcony
 *      convention used elsewhere (renderUtils.balconyPolygon, threeScene balcony bounds).
 *      For a sample/showcase wall wound CCW around interior (interior on left of û),
 *      this correctly points AWAY from the building.
 *  Anchor line sits on wall at z=elevation, spanning [offset - overhang, offset + width + overhang]
 *  Eave line sits at distance (depth + overhang) outward, at z = elevation - (depth+overhang)*tan(pitch)
 *  Panel: 4-vertex trapezoid (here a parallelogram since both edges have equal extent)
 *  End caps: vertical triangles at each short end (gable-style flush cut)
 */
export function buildSkirtGeometry(skirt: SkirtRoof, hostWall: Wall): SkirtGeometry {
  const dx = hostWall.end.x - hostWall.start.x;
  const dy = hostWall.end.y - hostWall.start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    throw new Error(`Cannot build skirt on zero-length wall ${hostWall.id}`);
  }
  const ux = dx / len;
  const uy = dy / len;
  // Outward = +90° CW of û (right side of travel direction).
  // Matches balcony's (uy, -ux) so both project to the same side of an exterior wall.
  const nx = uy;
  const ny = -ux;

  const drop = (skirt.depth + skirt.overhang) * Math.tan(skirt.pitch);
  const a0Along = skirt.offset - skirt.overhang;
  const a1Along = skirt.offset + skirt.width + skirt.overhang;
  const eaveOut = skirt.depth + skirt.overhang;

  const A0: Point3 = {
    x: hostWall.start.x + ux * a0Along,
    y: hostWall.start.y + uy * a0Along,
    z: skirt.elevation,
  };
  const A1: Point3 = {
    x: hostWall.start.x + ux * a1Along,
    y: hostWall.start.y + uy * a1Along,
    z: skirt.elevation,
  };
  const E0: Point3 = {
    x: A0.x + nx * eaveOut,
    y: A0.y + ny * eaveOut,
    z: skirt.elevation - drop,
  };
  const E1: Point3 = {
    x: A1.x + nx * eaveOut,
    y: A1.y + ny * eaveOut,
    z: skirt.elevation - drop,
  };

  // Panel CCW from outside (looking down the slope from outside the building):
  // A0 → A1 along anchor, then A1 → E1 down to eave, E1 → E0 along eave, E0 → A0 back up.
  const panel = { vertices: [A0, A1, E1, E0] };

  // End caps: vertical triangles in the wall-perpendicular plane, closing the gap
  // between the slope and the lower elevation. W is on wall plane (no n̂ offset)
  // at z = E.z, directly "below" A in the slope sense.
  const W0: Point3 = { x: A0.x, y: A0.y, z: E0.z };
  const W1: Point3 = { x: A1.x, y: A1.y, z: E1.z };

  // CCW from outside the cap: at offset-side, looking from -û direction toward +û,
  // outward is +û direction. Triangle (W0, A0, E0) winds CCW as seen from -û.
  // At +width side, outward is -û direction; triangle (A1, W1, E1) winds CCW.
  const endCaps = [
    { vertices: [W0, A0, E0] },
    { vertices: [A1, W1, E1] },
  ];

  return { skirtId: skirt.id, panel, endCaps, materialId: skirt.materialId };
}
