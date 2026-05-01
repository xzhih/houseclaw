import { Fragment } from "react";
import type { PointMapping, Viewport } from "./types";
import { buildGridLines } from "../../geometry/gridLines";

const SURFACE_WIDTH = 720;
const SURFACE_HEIGHT = 520;
const MINOR_SPACING = 0.1;
const MAJOR_SPACING = 1.0;
const MIN_MINOR_PX = 6;
const ORIGIN_LEN_M = 0.2;

type Props = {
  mapping: PointMapping;
  viewport: Viewport;
  visible: boolean;
};

export function GridOverlay({ mapping, viewport, visible }: Props) {
  if (!visible) return null;

  const vbMinX = viewport.panX;
  const vbMinY = viewport.panY;
  const vbMaxX = viewport.panX + SURFACE_WIDTH / viewport.zoom;
  const vbMaxY = viewport.panY + SURFACE_HEIGHT / viewport.zoom;

  const worldA = mapping.unproject({ x: vbMinX, y: vbMinY });
  const worldB = mapping.unproject({ x: vbMaxX, y: vbMaxY });
  const visibleBounds = {
    minX: Math.min(worldA.x, worldB.x),
    maxX: Math.max(worldA.x, worldB.x),
    minY: Math.min(worldA.y, worldB.y),
    maxY: Math.max(worldA.y, worldB.y),
  };

  const minorSpacingPx = MINOR_SPACING * mapping.scale * viewport.zoom;
  const showMinor = minorSpacingPx >= MIN_MINOR_PX;
  const lines = buildGridLines(visibleBounds, MINOR_SPACING, MAJOR_SPACING, showMinor);

  const stroke = 1 / viewport.zoom;
  const strokeOrigin = 1.5 / viewport.zoom;
  const originLenVb = ORIGIN_LEN_M * mapping.scale;
  const origin = mapping.project({ x: 0, y: 0 });

  return (
    <g className="grid-overlay" pointerEvents="none">
      {lines.map((line, i) => {
        const className = line.major ? "grid-line-major" : "grid-line-minor";
        if (line.axis === "x") {
          const px = mapping.project({ x: line.pos, y: 0 }).x;
          return (
            <line
              key={i}
              className={className}
              x1={px}
              x2={px}
              y1={vbMinY}
              y2={vbMaxY}
              strokeWidth={stroke}
            />
          );
        }
        const py = mapping.project({ x: 0, y: line.pos }).y;
        return (
          <line
            key={i}
            className={className}
            x1={vbMinX}
            x2={vbMaxX}
            y1={py}
            y2={py}
            strokeWidth={stroke}
          />
        );
      })}
      <Fragment>
        <line
          className="grid-origin"
          x1={origin.x - originLenVb / 2}
          x2={origin.x + originLenVb / 2}
          y1={origin.y}
          y2={origin.y}
          strokeWidth={strokeOrigin}
        />
        <line
          className="grid-origin"
          x1={origin.x}
          x2={origin.x}
          y1={origin.y - originLenVb / 2}
          y2={origin.y + originLenVb / 2}
          strokeWidth={strokeOrigin}
        />
      </Fragment>
    </g>
  );
}
