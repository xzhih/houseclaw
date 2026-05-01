import {
  MousePointer2,
  DoorOpen,
  RectangleHorizontal,
  Layers,
  Triangle,
  Palette,
} from "lucide-react";
import type { SVGProps } from "react";

export const SelectIcon = MousePointer2;
export const DoorIcon = DoorOpen;
export const BalconyIcon = RectangleHorizontal;
export const SlabIcon = Layers;
export const RoofIcon = Triangle;
export const MaterialIcon = Palette;

export function WallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round" strokeWidth={3} />
    </svg>
  );
}

export function WindowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

export function OpeningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 3" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
    </svg>
  );
}

export function StairIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" {...props}>
      <polyline points="4 20 4 16 9 16 9 12 14 12 14 8 19 8 19 4" />
    </svg>
  );
}
