import { wallLength } from "../domain/measurements";
import type { Opening, Wall } from "../domain/types";
import type { WallPanel, WallPanelRole } from "./types";

function positivePanel(panel: WallPanel): WallPanel | undefined {
  if (![panel.x, panel.y, panel.width, panel.height].every(Number.isFinite)) {
    return undefined;
  }

  const roundedPanel = {
    ...panel,
    x: Number(panel.x.toFixed(4)),
    y: Number(panel.y.toFixed(4)),
    width: Number(panel.width.toFixed(4)),
    height: Number(panel.height.toFixed(4)),
  };

  if (roundedPanel.width <= 0 || roundedPanel.height <= 0) return undefined;

  return roundedPanel;
}

function gapRole(index: number, total: number): WallPanelRole {
  if (index === 0) return "left";
  if (index === total) return "right";
  return "between";
}

export function buildWallPanels(wall: Wall, openings: Opening[]): WallPanel[] {
  const wallWidth = wallLength(wall);

  if (openings.length === 0) {
    const panel = positivePanel({
      role: "full",
      x: 0,
      y: 0,
      width: wallWidth,
      height: wall.height,
    });

    return panel ? [panel] : [];
  }

  const sorted = [...openings].sort((a, b) => a.offset - b.offset);
  const gaps: WallPanel[] = [];
  let cursor = 0;

  sorted.forEach((opening, index) => {
    const gap = positivePanel({
      role: gapRole(index, sorted.length),
      x: cursor,
      y: 0,
      width: opening.offset - cursor,
      height: wall.height,
    });
    if (gap) gaps.push(gap);
    cursor = opening.offset + opening.width;
  });

  const tail = positivePanel({
    role: gapRole(sorted.length, sorted.length),
    x: cursor,
    y: 0,
    width: wallWidth - cursor,
    height: wall.height,
  });
  if (tail) gaps.push(tail);

  const stripes: WallPanel[] = sorted.flatMap((opening) => {
    const below = positivePanel({
      role: "below",
      x: opening.offset,
      y: 0,
      width: opening.width,
      height: opening.sillHeight,
    });
    const above = positivePanel({
      role: "above",
      x: opening.offset,
      y: opening.sillHeight + opening.height,
      width: opening.width,
      height: wall.height - (opening.sillHeight + opening.height),
    });

    return [below, above].filter((panel): panel is WallPanel => panel !== undefined);
  });

  return [...gaps, ...stripes];
}
