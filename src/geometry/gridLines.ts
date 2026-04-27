import type { Bounds } from "../components/canvas/types";

export type GridLine = { axis: "x" | "y"; pos: number; major: boolean };

const EPS = 1e-6;

function snap(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function isOnMajorGrid(pos: number, majorSpacing: number): boolean {
  const ratio = pos / majorSpacing;
  return Math.abs(ratio - Math.round(ratio)) < EPS;
}

export function buildGridLines(
  visibleBounds: Bounds,
  minorSpacing: number,
  majorSpacing: number,
  showMinor: boolean,
): GridLine[] {
  const lines: GridLine[] = [];

  const addAxis = (axis: "x" | "y", min: number, max: number) => {
    const startMajor = Math.floor(min / majorSpacing) * majorSpacing;
    const endMajor = Math.ceil(max / majorSpacing) * majorSpacing;

    if (showMinor) {
      const startMinor = Math.floor(min / minorSpacing) * minorSpacing;
      const endMinor = Math.ceil(max / minorSpacing) * minorSpacing;
      for (let p = startMinor; p <= endMinor + EPS; p += minorSpacing) {
        const snapped = snap(p, minorSpacing);
        if (!isOnMajorGrid(snapped, majorSpacing)) {
          lines.push({ axis, pos: snapped, major: false });
        }
      }
    }
    for (let p = startMajor; p <= endMajor + EPS; p += majorSpacing) {
      lines.push({ axis, pos: snap(p, majorSpacing), major: true });
    }
  };

  addAxis("x", visibleBounds.minX, visibleBounds.maxX);
  addAxis("y", visibleBounds.minY, visibleBounds.maxY);
  return lines;
}
