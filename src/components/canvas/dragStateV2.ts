import type { PointerEvent } from "react";
import type { GuideMatch } from "../../geometry/v2/smartGuides";
import type { Point2D, PointMapping } from "./types";

export type { GuideMatch };

export type DragStateV2 =
  | {
      kind: "wall-translate";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      wallId: string;
      origStart: Point2D;
      origEnd: Point2D;
    }
  | {
      kind: "wall-endpoint";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      wallId: string;
      endpoint: "start" | "end";
      origPoint: Point2D;
      fixedPoint: Point2D;
    }
  | {
      kind: "opening";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      openingWidth: number;
    }
  | {
      kind: "plan-opening-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      edge: "l" | "r";
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      origWidth: number;
      wallLen: number;
    }
  | {
      kind: "balcony";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      balconyWidth: number;
    }
  | {
      kind: "plan-balcony-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      edge: "l" | "r";
      wallStart: Point2D;
      wallEnd: Point2D;
      origOffset: number;
      origWidth: number;
      wallLen: number;
    }
  | {
      kind: "elev-opening-move";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      origOffset: number;
      origSill: number;
      width: number;
      height: number;
      wallLen: number;
      storeyHeight: number;
      projSign: 1 | -1;
    }
  | {
      kind: "elev-opening-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      openingId: string;
      corner: "tl" | "tr" | "bl" | "br";
      origOffset: number;
      origSill: number;
      origWidth: number;
      origHeight: number;
      wallLen: number;
      storeyHeight: number;
      projSign: 1 | -1;
    }
  | {
      kind: "elev-balcony-move";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      origOffset: number;
      width: number;
      wallLen: number;
      projSign: 1 | -1;
    }
  | {
      kind: "elev-balcony-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      balconyId: string;
      edge: "l" | "r";
      origOffset: number;
      origWidth: number;
      wallLen: number;
      projSign: 1 | -1;
    }
  | {
      kind: "stair-translate";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      stairId: string;
      origX: number;
      origY: number;
    }
  | {
      kind: "stair-resize";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      stairId: string;
      corner: "bl" | "br" | "tr" | "tl";
      worldAnchor: Point2D;
      origRotation: number;
    }
  | {
      kind: "stair-rotate";
      pointerId: number;
      startWorld: Point2D;
      moved: boolean;
      mapping: PointMapping;
      stairId: string;
      center: Point2D;
      initialMouseAngle: number;
      origRotation: number;
    };

export type PlanDragHandlersV2 = {
  onWallPointerDown: (event: PointerEvent<SVGElement>, wallId: string) => void;
  onOpeningPointerDown: (event: PointerEvent<SVGElement>, openingId: string) => void;
  onBalconyPointerDown: (event: PointerEvent<SVGElement>, balconyId: string) => void;
  onWallEndpointPointerDown: (
    event: PointerEvent<SVGElement>,
    wallId: string,
    endpoint: "start" | "end",
  ) => void;
  onOpeningEdgePointerDown: (
    event: PointerEvent<SVGElement>,
    openingId: string,
    edge: "l" | "r",
  ) => void;
  onBalconyEdgePointerDown: (
    event: PointerEvent<SVGElement>,
    balconyId: string,
    edge: "l" | "r",
  ) => void;
  onStairBodyPointerDown: (
    event: PointerEvent<SVGElement>,
    stairId: string,
  ) => void;
  onStairCornerPointerDown: (
    event: PointerEvent<SVGElement>,
    stairId: string,
    corner: "bl" | "br" | "tr" | "tl",
  ) => void;
  onStairRotatePointerDown: (
    event: PointerEvent<SVGElement>,
    stairId: string,
  ) => void;
};

export type ElevationDragHandlersV2 = {
  onOpeningPointerDown: (event: PointerEvent<SVGElement>, openingId: string) => void;
  onOpeningCornerPointerDown: (
    event: PointerEvent<SVGElement>,
    openingId: string,
    corner: "tl" | "tr" | "bl" | "br",
  ) => void;
  onBalconyPointerDown: (event: PointerEvent<SVGElement>, balconyId: string) => void;
  onBalconyEdgePointerDown: (
    event: PointerEvent<SVGElement>,
    balconyId: string,
    edge: "l" | "r",
  ) => void;
};
