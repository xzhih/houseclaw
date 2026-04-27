import type { Viewport } from "./types";

const SURFACE_WIDTH = 720;
const SURFACE_HEIGHT = 520;
const ZOOM_STEP = 1.5;
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 8;

type Props = {
  viewport: Viewport;
  onViewportChange: (next: Viewport) => void;
  defaultViewport: Viewport;
  gridVisible: boolean;
  onGridToggle: () => void;
};

function zoomAtCenter(viewport: Viewport, factor: number): Viewport {
  const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, viewport.zoom * factor));
  if (newZoom === viewport.zoom) return viewport;
  const oldVbW = SURFACE_WIDTH / viewport.zoom;
  const oldVbH = SURFACE_HEIGHT / viewport.zoom;
  const centerX = viewport.panX + oldVbW / 2;
  const centerY = viewport.panY + oldVbH / 2;
  const newVbW = SURFACE_WIDTH / newZoom;
  const newVbH = SURFACE_HEIGHT / newZoom;
  return {
    zoom: newZoom,
    panX: centerX - newVbW / 2,
    panY: centerY - newVbH / 2,
  };
}

export function ZoomControls({
  viewport,
  onViewportChange,
  defaultViewport,
  gridVisible,
  onGridToggle,
}: Props) {
  return (
    <div className="zoom-controls" role="group" aria-label="视图控制">
      <button
        type="button"
        className="zoom-controls-btn"
        title="放大"
        aria-label="放大"
        onClick={() => onViewportChange(zoomAtCenter(viewport, ZOOM_STEP))}
      >
        +
      </button>
      <button
        type="button"
        className="zoom-controls-btn"
        title="缩小"
        aria-label="缩小"
        onClick={() => onViewportChange(zoomAtCenter(viewport, 1 / ZOOM_STEP))}
      >
        −
      </button>
      <button
        type="button"
        className="zoom-controls-btn"
        title={`重置视图 (${Math.round(viewport.zoom * 100)}%)`}
        aria-label="重置视图"
        onClick={() => onViewportChange(defaultViewport)}
      >
        ⌂
      </button>
      <button
        type="button"
        className={`zoom-controls-btn ${gridVisible ? "is-active" : ""}`}
        title={gridVisible ? "隐藏网格" : "显示网格"}
        aria-label="切换网格"
        aria-pressed={gridVisible}
        onClick={onGridToggle}
      >
        ⊞
      </button>
    </div>
  );
}
