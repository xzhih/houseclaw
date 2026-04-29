import { wallLength } from "../domain/measurements";
import type { Opening, Wall } from "../domain/types";

/** A single rectangular frame strip ready for three.js BoxGeometry. */
export type FrameStrip = {
  role: "top" | "bottom" | "left" | "right";
  /** Center point. center.x and center.y are plan-space coordinates;
   *  center.z is world height. Renderer converts plan-y → scene-z. */
  center: { x: number; y: number; z: number };
  /** Box dimensions in three local axes after rotation:
   *  alongWall = box width along wall direction;
   *  height = box height along world-Y;
   *  depth = box thickness in wall-normal direction. */
  size: { alongWall: number; height: number; depth: number };
  /** Rotation around scene Y axis to align the box with the wall. */
  rotationY: number;
  materialId: string;
};

/** Frame strip thickness on the facade (visible bar width). */
const FRAME_BAR = 0.06;
/** How far the frame protrudes outward from the wall outer face (m). */
const FRAME_DEPTH = 0.04;

/**
 * Build 4 frame strips around a single opening.
 *
 * The strips form a rectangular ring on the wall's OUTER face, slightly proud
 * of the wall surface so they catch light. Returns plan-space center coords;
 * caller (threeScene) converts plan-y → scene-z when positioning the mesh.
 */
export function buildOpeningFrameStrips(opening: Opening, wall: Wall): FrameStrip[] {
  const len = wallLength(wall);
  if (len === 0) return [];

  const ux = (wall.end.x - wall.start.x) / len;
  const uy = (wall.end.y - wall.start.y) / len;
  // Outward normal: +90° CW of û (matches balcony/skirt convention).
  const nx = uy;
  const ny = -ux;

  // Wall outer face shift: half thickness outward + half frame depth so the
  // frame's outer edge protrudes by FRAME_DEPTH past the wall surface.
  const outerShift = wall.thickness / 2 + FRAME_DEPTH / 2;

  // Match three.js scene rotation: rotationY around scene-Y axis.
  // For wall direction û in plan, scene rotation = -atan2(-uy, ux).
  const rotationY = -Math.atan2(-uy, ux);

  const make = (
    role: FrameStrip["role"],
    alongStart: number,
    alongLen: number,
    zCenter: number,
    zHeight: number,
  ): FrameStrip => {
    const along = alongStart + alongLen / 2;
    const cx = wall.start.x + ux * along + nx * outerShift;
    const cy = wall.start.y + uy * along + ny * outerShift;
    return {
      role,
      center: { x: cx, y: cy, z: zCenter },
      size: { alongWall: alongLen, height: zHeight, depth: FRAME_DEPTH },
      rotationY,
      materialId: opening.frameMaterialId,
    };
  };

  const sill = opening.sillHeight;
  const top = sill + opening.height;

  // bottom/top strips span full opening width.
  // left/right strips span full opening height (overlap at corners is fine visually).
  return [
    make("bottom", opening.offset,                              opening.width, sill + FRAME_BAR / 2,         FRAME_BAR),
    make("top",    opening.offset,                              opening.width, top  - FRAME_BAR / 2,         FRAME_BAR),
    make("left",   opening.offset,                              FRAME_BAR,     sill + opening.height / 2,    opening.height),
    make("right",  opening.offset + opening.width - FRAME_BAR,  FRAME_BAR,     sill + opening.height / 2,    opening.height),
  ];
}
