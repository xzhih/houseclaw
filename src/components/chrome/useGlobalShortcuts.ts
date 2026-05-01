import { useEffect } from "react";

type ShortcutMap = Record<string, () => void>;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useGlobalShortcuts(map: ShortcutMap): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      const key = event.key;
      // Try the literal key first (handles Escape, ?, etc.)
      if (map[key]) {
        event.preventDefault();
        map[key]();
        return;
      }
      // Then case-insensitive single-letter
      const lower = key.toLowerCase();
      if (lower !== key && map[lower]) {
        event.preventDefault();
        map[lower]();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map]);
}
