import type { KeyboardEvent, PointerEvent } from "react";
import type { SelectionV2 } from "../../app/v2/projectReducer";
import { rotatePoint } from "../../domain/v2/stairs";
import { slicePanelFootprint, type WallFootprint } from "../../geometry/v2/wallNetwork";
import type {
  PlanBalconyGlyphV2,
  PlanOpeningGlyphV2,
  PlanProjectionV2,
  PlanStairSymbolV2,
  PlanWallSegmentV2,
} from "../../projection/v2/types";
import type { PlanDragHandlersV2 as PlanDragHandlers } from "./dragStateV2";
import {
  balconyPolygon,
  buildStairSymbolGeometry,
  computeSolidPanels,
  openingLine,
  polyPoints,
} from "./renderUtils";
import type { Point2D, PointMapping } from "./types";

const ENDPOINT_HANDLE_RADIUS = 7;

type OnSelect = (selection: SelectionV2) => void;

function isWallSelected(selection: SelectionV2, wallId: string): boolean {
  return selection?.kind === "wall" && selection.wallId === wallId;
}

function isOpeningSelected(selection: SelectionV2, openingId: string): boolean {
  return selection?.kind === "opening" && selection.openingId === openingId;
}

function isBalconySelected(selection: SelectionV2, balconyId: string): boolean {
  return selection?.kind === "balcony" && selection.balconyId === balconyId;
}

function isStairSelected(selection: SelectionV2, stairId: string): boolean {
  return selection?.kind === "stair" && selection.stairId === stairId;
}

export function renderSelectableBalcony(
  balconyId: string,
  selected: boolean,
  onSelect: OnSelect,
  _activeTool: string | undefined,
  props: { className: string; points?: string; x?: number; y?: number; width?: number; height?: number },
  onPointerDown?: (event: PointerEvent<SVGElement>) => void,
) {
  const commonProps = {
    role: "button",
    tabIndex: 0,
    "aria-label": `选择阳台 ${balconyId}`,
    "aria-pressed": selected,
    className: selected ? `${props.className} is-selected` : props.className,
    onPointerDown,
    onClick: () => {
      onSelect({ kind: "balcony", balconyId });
    },
    onKeyDown: (event: KeyboardEvent<SVGElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect({ kind: "balcony", balconyId });
      }
    },
  };

  if (props.points) {
    return <polygon {...commonProps} points={props.points} />;
  }

  return <rect {...commonProps} x={props.x} y={props.y} width={props.width} height={props.height} />;
}

type RenderPlanProps = {
  projection: PlanProjectionV2;
  mapping: PointMapping;
  selection: SelectionV2;
  onSelect: OnSelect;
  activeTool?: string;
  footprints?: Map<string, WallFootprint>;
  snapHit?: Point2D | null;
  handlers?: PlanDragHandlers;
  ghost?: PlanProjectionV2;
};

export function renderPlan({
  projection,
  mapping,
  selection,
  onSelect,
  footprints = new Map(),
  snapHit = null,
  handlers,
  ghost,
}: RenderPlanProps) {
  const { project: projectPoint } = mapping;
  const wallsById = new Map(projection.wallSegments.map((wall) => [wall.wallId, wall]));
  const selectedWall =
    selection?.kind === "wall"
      ? projection.wallSegments.find((wall) => wall.wallId === selection.wallId)
      : undefined;
  const selectedOpening =
    selection?.kind === "opening"
      ? projection.openings.find((opening) => opening.openingId === selection.openingId)
      : undefined;
  const selectedBalcony =
    selection?.kind === "balcony"
      ? projection.balconies.find((balcony) => balcony.balconyId === selection.balconyId)
      : undefined;
  const selectedStairSymbol =
    selection?.kind === "stair"
      ? projection.stairs.find((s) => s.stairId === selection.stairId)
      : undefined;

  return (
    <>
      {ghost
        ? ghost.wallSegments.map((wall) => {
            const start = projectPoint(wall.start);
            const end = projectPoint(wall.end);
            return (
              <line
                key={`ghost-${wall.wallId}`}
                className="plan-wall-ghost"
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                aria-hidden="true"
              />
            );
          })
        : null}
      {projection.slabOutlines.map((slab) => {
        const projected = slab.outline.map(projectPoint);
        if (projected.length === 0) return null;
        let d = `M ${projected[0].x} ${projected[0].y}`;
        for (const p of projected.slice(1)) {
          d += ` L ${p.x} ${p.y}`;
        }
        d += " Z";
        // Holes (CW direction reversed in SVG even-odd to act as cutouts).
        for (const hole of slab.holes) {
          const holeProjected = hole.map(projectPoint);
          if (holeProjected.length === 0) continue;
          d += ` M ${holeProjected[0].x} ${holeProjected[0].y}`;
          for (const p of holeProjected.slice(1)) {
            d += ` L ${p.x} ${p.y}`;
          }
          d += " Z";
        }
        return (
          <path
            key={`slab-${slab.slabId}`}
            d={d}
            fillRule="evenodd"
            fill={slab.role === "floor" ? "rgba(189, 189, 189, 0.15)" : "transparent"}
            stroke="rgba(0, 0, 0, 0.3)"
            strokeWidth={1}
            strokeDasharray={slab.role === "intermediate" ? "4 4" : undefined}
            pointerEvents="none"
          />
        );
      })}
      {projection.wallSegments.map((wall) => {
        const footprint = footprints.get(wall.wallId);
        if (!footprint) return null;
        const selected = isWallSelected(selection, wall.wallId);
        const className = selected ? "plan-wall is-selected" : "plan-wall";
        const wallLen = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
        const wallOpenings = projection.openings.filter((opening) => opening.wallId === wall.wallId);
        const segment = { start: wall.start, end: wall.end, thickness: wall.thickness };
        const solidPanels = computeSolidPanels(wallLen, wallOpenings);

        return (
          <g
            key={wall.wallId}
            data-kind="wall"
            data-id={wall.wallId}
            role="button"
            tabIndex={0}
            aria-label={`选择墙 ${wall.wallId}`}
            aria-pressed={selected}
            className={className}
            onPointerDown={(event) => handlers?.onWallPointerDown(event, wall.wallId)}
            onClick={() => onSelect({ kind: "wall", wallId: wall.wallId })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect({ kind: "wall", wallId: wall.wallId });
              }
            }}
          >
            {solidPanels.map((panel, index) => {
              const sliced = slicePanelFootprint(footprint, segment, panel);
              const corners = [
                projectPoint(sliced.rightStart),
                projectPoint(sliced.leftStart),
                projectPoint(sliced.leftEnd),
                projectPoint(sliced.rightEnd),
              ];
              const points = corners.map((c) => `${c.x},${c.y}`).join(" ");
              return <polygon key={index} className="plan-wall-panel" points={points} />;
            })}
          </g>
        );
      })}
      {projection.openings.map((opening) => {
        const wall = wallsById.get(opening.wallId);
        if (!wall) return null;

        const line = openingLine(opening, wall);
        if (!line) return null;

        const start = projectPoint(line.start);
        const end = projectPoint(line.end);
        const selected = isOpeningSelected(selection, opening.openingId);
        const typeClass = `plan-opening--${opening.type}`;

        return (
          <g key={opening.openingId} className="opening-glyph">
            <line
              role="button"
              tabIndex={0}
              aria-label={`选择开孔 ${opening.openingId}`}
              aria-pressed={selected}
              className={`plan-opening ${typeClass}${selected ? " is-selected" : ""}`}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              onPointerDown={(event) => handlers?.onOpeningPointerDown(event, opening.openingId)}
              onClick={() => onSelect({ kind: "opening", openingId: opening.openingId })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect({ kind: "opening", openingId: opening.openingId });
                }
              }}
            />
          </g>
        );
      })}
      {projection.balconies.map((balcony) => {
        const wall = wallsById.get(balcony.wallId);
        if (!wall) return null;

        const points = balconyPolygon(balcony, wall).map(projectPoint);
        if (points.length === 0) return null;

        return (
          <g key={balcony.balconyId}>
            {renderSelectableBalcony(
              balcony.balconyId,
              isBalconySelected(selection, balcony.balconyId),
              onSelect,
              undefined,
              {
                className: "plan-balcony",
                points: points.map((point) => `${point.x},${point.y}`).join(" "),
              },
              (event) => handlers?.onBalconyPointerDown(event, balcony.balconyId),
            )}
          </g>
        );
      })}
      {projection.stairs.map((stair) => {
        const selected = isStairSelected(selection, stair.stairId);
        const symbol = buildStairSymbolGeometry(stair, projectPoint);

        return (
          <g
            key={stair.stairId}
            role="button"
            tabIndex={0}
            aria-label={`选择楼梯 ${stair.stairId}`}
            aria-pressed={selected}
            className={selected ? "plan-stair is-selected" : "plan-stair"}
            onPointerDown={(event) => handlers?.onStairBodyPointerDown(event, stair.stairId)}
            onClick={() => onSelect({ kind: "stair", stairId: stair.stairId })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect({ kind: "stair", stairId: stair.stairId });
              }
            }}
          >
            <polygon className="plan-stair-outline" points={polyPoints(symbol.outline)} />
            {symbol.flights.map((flight, i) => (
              <polygon key={`f${i}`} className="plan-stair-flight" points={polyPoints(flight)} />
            ))}
            {symbol.landings.map((landing, i) => (
              <polygon key={`l${i}`} className="plan-stair-landing" points={polyPoints(landing)} />
            ))}
            {symbol.treadLines.map((line, i) => (
              <line
                key={`t${i}`}
                className="plan-stair-tread"
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
              />
            ))}
            {symbol.cutLine.length > 0 ? (
              <polyline
                className="plan-stair-cut"
                points={polyPoints(symbol.cutLine)}
                fill="none"
              />
            ) : null}
            <text
              x={symbol.labelPos.x}
              y={symbol.labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="plan-stair-label"
            >
              UP
            </text>
          </g>
        );
      })}
      {selectedWall && handlers ? (
        <>
          <circle
            className="wall-endpoint-handle"
            cx={projectPoint(selectedWall.start).x}
            cy={projectPoint(selectedWall.start).y}
            r={ENDPOINT_HANDLE_RADIUS}
            aria-label={`拉伸墙 ${selectedWall.wallId} 起点`}
            onPointerDown={(event) =>
              handlers.onWallEndpointPointerDown(event, selectedWall.wallId, "start")
            }
          />
          <circle
            className="wall-endpoint-handle"
            cx={projectPoint(selectedWall.end).x}
            cy={projectPoint(selectedWall.end).y}
            r={ENDPOINT_HANDLE_RADIUS}
            aria-label={`拉伸墙 ${selectedWall.wallId} 终点`}
            onPointerDown={(event) =>
              handlers.onWallEndpointPointerDown(event, selectedWall.wallId, "end")
            }
          />
        </>
      ) : null}
      {selectedOpening && handlers
        ? (() => {
            const wall = wallsById.get(selectedOpening.wallId);
            if (!wall) return null;
            const line = openingLine(selectedOpening, wall);
            if (!line) return null;
            const start = projectPoint(line.start);
            const end = projectPoint(line.end);
            return (
              <>
                <circle
                  className="resize-handle"
                  cx={start.x}
                  cy={start.y}
                  r={ENDPOINT_HANDLE_RADIUS}
                  aria-label={`调整开孔 ${selectedOpening.openingId} 起点`}
                  onPointerDown={(event) =>
                    handlers.onOpeningEdgePointerDown(event, selectedOpening.openingId, "l")
                  }
                />
                <circle
                  className="resize-handle"
                  cx={end.x}
                  cy={end.y}
                  r={ENDPOINT_HANDLE_RADIUS}
                  aria-label={`调整开孔 ${selectedOpening.openingId} 终点`}
                  onPointerDown={(event) =>
                    handlers.onOpeningEdgePointerDown(event, selectedOpening.openingId, "r")
                  }
                />
              </>
            );
          })()
        : null}
      {selectedBalcony && handlers
        ? (() => {
            const wall = wallsById.get(selectedBalcony.wallId);
            if (!wall) return null;
            const dx = wall.end.x - wall.start.x;
            const dy = wall.end.y - wall.start.y;
            const len = Math.hypot(dx, dy);
            if (len === 0) return null;
            const ux = dx / len;
            const uy = dy / len;
            const innerStart = {
              x: wall.start.x + ux * selectedBalcony.offset,
              y: wall.start.y + uy * selectedBalcony.offset,
            };
            const innerEnd = {
              x: wall.start.x + ux * (selectedBalcony.offset + selectedBalcony.width),
              y: wall.start.y + uy * (selectedBalcony.offset + selectedBalcony.width),
            };
            const start = projectPoint(innerStart);
            const end = projectPoint(innerEnd);
            return (
              <>
                <circle
                  className="resize-handle"
                  cx={start.x}
                  cy={start.y}
                  r={ENDPOINT_HANDLE_RADIUS}
                  aria-label={`调整阳台 ${selectedBalcony.balconyId} 起点`}
                  onPointerDown={(event) =>
                    handlers.onBalconyEdgePointerDown(event, selectedBalcony.balconyId, "l")
                  }
                />
                <circle
                  className="resize-handle"
                  cx={end.x}
                  cy={end.y}
                  r={ENDPOINT_HANDLE_RADIUS}
                  aria-label={`调整阳台 ${selectedBalcony.balconyId} 终点`}
                  onPointerDown={(event) =>
                    handlers.onBalconyEdgePointerDown(event, selectedBalcony.balconyId, "r")
                  }
                />
              </>
            );
          })()
        : null}
      {selectedStairSymbol && handlers
        ? (() => {
            const stair = selectedStairSymbol;
            const rotation = stair.rotation;
            const center = stair.center;
            const { rect } = stair;
            const cornersLocal: Array<{ name: "bl" | "br" | "tr" | "tl"; local: Point2D }> = [
              { name: "bl", local: { x: rect.x, y: rect.y } },
              { name: "br", local: { x: rect.x + rect.width, y: rect.y } },
              { name: "tr", local: { x: rect.x + rect.width, y: rect.y + rect.depth } },
              { name: "tl", local: { x: rect.x, y: rect.y + rect.depth } },
            ];
            const cornersWorld = cornersLocal.map((c) => ({
              name: c.name,
              pos: projectPoint(rotatePoint(c.local, center, rotation)),
            }));
            const HANDLE_OFFSET = 0.5;
            const topMidLocal: Point2D = { x: center.x, y: rect.y + rect.depth };
            const handleLocal: Point2D = { x: center.x, y: rect.y + rect.depth + HANDLE_OFFSET };
            const topMidWorld = projectPoint(rotatePoint(topMidLocal, center, rotation));
            const handleWorld = projectPoint(rotatePoint(handleLocal, center, rotation));
            return (
              <>
                <line
                  className="stair-rotate-stem"
                  x1={topMidWorld.x}
                  y1={topMidWorld.y}
                  x2={handleWorld.x}
                  y2={handleWorld.y}
                />
                <circle
                  className="stair-rotate-handle"
                  cx={handleWorld.x}
                  cy={handleWorld.y}
                  r={ENDPOINT_HANDLE_RADIUS}
                  aria-label={`旋转楼梯 ${stair.stairId}`}
                  onPointerDown={(event) =>
                    handlers.onStairRotatePointerDown(event, stair.stairId)
                  }
                />
                {cornersWorld.map((c) => (
                  <circle
                    key={c.name}
                    className="resize-handle"
                    cx={c.pos.x}
                    cy={c.pos.y}
                    r={ENDPOINT_HANDLE_RADIUS}
                    aria-label={`楼梯 ${c.name} 角点`}
                    onPointerDown={(event) =>
                      handlers.onStairCornerPointerDown(event, stair.stairId, c.name)
                    }
                  />
                ))}
              </>
            );
          })()
        : null}
      {snapHit ? (
        <circle
          className="snap-indicator"
          cx={projectPoint(snapHit).x}
          cy={projectPoint(snapHit).y}
          r={9}
          aria-hidden="true"
        />
      ) : null}
    </>
  );
}
