import type { Anchor, Storey } from "./types";

export function resolveAnchor(anchor: Anchor, storeys: Storey[]): number {
  if (anchor.kind === "absolute") {
    return anchor.z;
  }
  const storey = storeys.find((s) => s.id === anchor.storeyId);
  if (!storey) {
    throw new Error(`resolveAnchor: missing storey: ${anchor.storeyId}`);
  }
  return storey.elevation + anchor.offset;
}
