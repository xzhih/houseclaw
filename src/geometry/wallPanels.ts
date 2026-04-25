import { wallLength } from "../domain/measurements";
import type { Opening, Wall } from "../domain/types";
import type { WallPanel } from "./types";

function positivePanel(panel: WallPanel): WallPanel | undefined {
  if (panel.width <= 0 || panel.height <= 0) return undefined;

  return {
    ...panel,
    x: Number(panel.x.toFixed(4)),
    y: Number(panel.y.toFixed(4)),
    width: Number(panel.width.toFixed(4)),
    height: Number(panel.height.toFixed(4)),
  };
}

export function buildWallPanels(wall: Wall, openings: Opening[]): WallPanel[] {
  if (openings.length === 0) {
    const panel = positivePanel({
      role: "full",
      x: 0,
      y: 0,
      width: wallLength(wall),
      height: wall.height,
    });

    return panel ? [panel] : [];
  }

  const opening = openings[0];
  const wallWidth = wallLength(wall);
  const openingRight = opening.offset + opening.width;
  const openingTop = opening.sillHeight + opening.height;

  return [
    positivePanel({ role: "left", x: 0, y: 0, width: opening.offset, height: wall.height }),
    positivePanel({
      role: "right",
      x: openingRight,
      y: 0,
      width: wallWidth - openingRight,
      height: wall.height,
    }),
    positivePanel({
      role: "below",
      x: opening.offset,
      y: 0,
      width: opening.width,
      height: opening.sillHeight,
    }),
    positivePanel({
      role: "above",
      x: opening.offset,
      y: openingTop,
      width: opening.width,
      height: wall.height - openingTop,
    }),
  ].filter((panel): panel is WallPanel => panel !== undefined);
}
