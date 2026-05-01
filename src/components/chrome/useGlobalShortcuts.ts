import { useEffect, useRef } from "react";

type ShortcutMap = Record<string, () => void>;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Bind a map of keyboard shortcuts to global keydown.
 *
 * Matching rules:
 * - Literal `event.key` first — use this for named keys ("Escape", "Tab", "?", "Enter").
 * - Lowercased fallback for single letters — `map["w"]` fires on both "w" and "W".
 *
 * Skips when Cmd/Ctrl/Alt is held (so browser/OS shortcuts like Cmd+W stay intact;
 * Shift is intentionally NOT gated — reserved for in-tool constraint behavior).
 *
 * Skips when an editable element (INPUT/TEXTAREA/SELECT/contenteditable) is focused.
 *
 * The listener is registered once on mount; the map is read from a ref each keypress,
 * so callers can pass an inline-built map without paying for re-registration.
 */
export function useGlobalShortcuts(map: ShortcutMap): void {
  const mapRef = useRef(map);
  mapRef.current = map;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      const current = mapRef.current;
      const key = event.key;
      if (current[key]) {
        event.preventDefault();
        current[key]();
        return;
      }
      const lower = key.toLowerCase();
      if (lower !== key && current[lower]) {
        event.preventDefault();
        current[lower]();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
