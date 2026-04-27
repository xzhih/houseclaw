import type { PointMapping, Viewport } from "./types";
import type { GuideMatch } from "../../geometry/smartGuides";

const EXTEND_M = 0.5;

type Props = {
  matches: GuideMatch[];
  cursorWorld: { x: number; y: number } | null;
  mapping: PointMapping;
  viewport: Viewport;
};

export function SmartGuides({ matches, cursorWorld, mapping, viewport }: Props) {
  if (matches.length === 0 || !cursorWorld) return null;
  const stroke = 1 / viewport.zoom;
  return (
    <g className="smart-guides" pointerEvents="none">
      {matches.map((m, i) => {
        if (m.axis === "x") {
          const minY = Math.min(cursorWorld.y, m.anchor.y) - EXTEND_M;
          const maxY = Math.max(cursorWorld.y, m.anchor.y) + EXTEND_M;
          const px = mapping.project({ x: m.pos, y: 0 }).x;
          const a = mapping.project({ x: m.pos, y: minY });
          const b = mapping.project({ x: m.pos, y: maxY });
          return (
            <line
              key={i}
              className="smart-guide-line"
              x1={px}
              x2={px}
              y1={a.y}
              y2={b.y}
              strokeWidth={stroke}
            />
          );
        }
        const minX = Math.min(cursorWorld.x, m.anchor.x) - EXTEND_M;
        const maxX = Math.max(cursorWorld.x, m.anchor.x) + EXTEND_M;
        const a = mapping.project({ x: minX, y: m.pos });
        const b = mapping.project({ x: maxX, y: m.pos });
        return (
          <line
            key={i}
            className="smart-guide-line"
            x1={a.x}
            x2={b.x}
            y1={a.y}
            y2={a.y}
            strokeWidth={stroke}
          />
        );
      })}
    </g>
  );
}
