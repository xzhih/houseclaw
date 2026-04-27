import type { Storey } from "./types";

/**
 * Returns the storey id encoded in a `plan-<id>` view, or undefined if the
 * view is not a plan view or the encoded id does not match a known storey.
 */
export function planStoreyIdFromView(
  activeView: string,
  storeys: readonly Pick<Storey, "id">[],
): string | undefined {
  const match = /^plan-(.+)$/.exec(activeView);
  if (!match) return undefined;
  const candidate = match[1];
  return storeys.some((storey) => storey.id === candidate) ? candidate : undefined;
}
