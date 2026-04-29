import { useEffect, useRef, useState } from "react";
import type { PointerEvent, RefObject } from "react";
import { SURFACE_HEIGHT, SURFACE_WIDTH } from "./renderUtils";
import type { Viewport } from "./types";

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 8;
export const DEFAULT_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

export type ViewportPanHandlers = {
  onPointerDown: (event: PointerEvent<SVGSVGElement>) => boolean;
  onPointerMove: (event: PointerEvent<SVGSVGElement>) => void;
  onPointerUp: (event: PointerEvent<SVGSVGElement>) => void;
};

export function useViewport(
  svgRef: RefObject<SVGSVGElement | null>,
  resetKey: string,
): {
  viewport: Viewport;
  setViewport: React.Dispatch<React.SetStateAction<Viewport>>;
  isPanning: boolean;
  panHandlers: ViewportPanHandlers;
} {
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);
  const [isPanning, setIsPanning] = useState(false);
  const panLastPos = useRef({ x: 0, y: 0 });
  const panPointerId = useRef<number | null>(null);

  useEffect(() => {
    setViewport(DEFAULT_VIEWPORT);
  }, [resetKey]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const ratioX = (event.clientX - rect.left) / rect.width;
      const ratioY = (event.clientY - rect.top) / rect.height;

      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.005);
        setViewport((current) => {
          const newZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current.zoom * factor));
          const oldVbW = SURFACE_WIDTH / current.zoom;
          const oldVbH = SURFACE_HEIGHT / current.zoom;
          const cursorVbX = current.panX + ratioX * oldVbW;
          const cursorVbY = current.panY + ratioY * oldVbH;
          const newVbW = SURFACE_WIDTH / newZoom;
          const newVbH = SURFACE_HEIGHT / newZoom;
          return {
            zoom: newZoom,
            panX: cursorVbX - ratioX * newVbW,
            panY: cursorVbY - ratioY * newVbH,
          };
        });
        return;
      }

      setViewport((current) => ({
        zoom: current.zoom,
        panX: current.panX + event.deltaX / current.zoom,
        panY: current.panY + event.deltaY / current.zoom,
      }));
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [svgRef]);

  const panHandlers: ViewportPanHandlers = {
    onPointerDown: (event) => {
      if (event.button === 1 && svgRef.current) {
        event.preventDefault();
        event.stopPropagation();
        setIsPanning(true);
        panLastPos.current = { x: event.clientX, y: event.clientY };
        panPointerId.current = event.pointerId;
        svgRef.current.setPointerCapture(event.pointerId);
        return true;
      }
      return false;
    },
    onPointerMove: (event) => {
      if (!isPanning || event.pointerId !== panPointerId.current || !svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      setViewport((current) => {
        const dx = ((event.clientX - panLastPos.current.x) * SURFACE_WIDTH) / (rect.width * current.zoom);
        const dy = ((event.clientY - panLastPos.current.y) * SURFACE_HEIGHT) / (rect.height * current.zoom);
        return { ...current, panX: current.panX - dx, panY: current.panY - dy };
      });
      panLastPos.current = { x: event.clientX, y: event.clientY };
    },
    onPointerUp: (event) => {
      if (event.pointerId !== panPointerId.current) return;
      setIsPanning(false);
      panPointerId.current = null;
      if (svgRef.current?.hasPointerCapture(event.pointerId)) {
        svgRef.current.releasePointerCapture(event.pointerId);
      }
    },
  };

  return { viewport, setViewport, isPanning, panHandlers };
}
