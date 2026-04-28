import type { PointMapping, Viewport } from "./types";
import { pickRulerLength } from "../../geometry/scaleRulerBucket";

type Props = {
  mapping: PointMapping;
  viewport: Viewport;
};

function formatLength(meters: number): string {
  if (meters < 1) return `${meters * 100} cm`;
  return `${meters} m`;
}

export function ScaleRuler({ mapping, viewport }: Props) {
  const pixelsPerMeter = mapping.scale * viewport.zoom;
  const lengthM = pickRulerLength(pixelsPerMeter);
  const widthPx = lengthM * pixelsPerMeter;

  return (
    <div className="scale-ruler" aria-label={`比例尺 ${formatLength(lengthM)}`}>
      <svg width={widthPx + 2} height={12} className="scale-ruler-bar" aria-hidden>
        <line x1={1} x2={widthPx + 1} y1={6} y2={6} />
        <line x1={1} x2={1} y1={2} y2={10} />
        <line x1={widthPx + 1} x2={widthPx + 1} y1={2} y2={10} />
      </svg>
      <span className="scale-ruler-label">{formatLength(lengthM)}</span>
    </div>
  );
}
