import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ToolId } from "../domain/types";

type AddOption = { id: ToolId; label: string };

const ADD_OPTIONS: AddOption[] = [
  { id: "wall", label: "墙" },
  { id: "door", label: "门" },
  { id: "window", label: "窗" },
  { id: "opening", label: "开孔" },
  { id: "balcony", label: "阳台" },
];

const SELECT_ICON: ReactNode = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 3l5 16 2.2-6.8L19 10z" />
  </svg>
);

const PLUS_ICON: ReactNode = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

type ToolPaletteProps = {
  activeTool: ToolId;
  onToolButtonClick: (toolId: ToolId) => void;
};

export function ToolPalette({ activeTool, onToolButtonClick }: ToolPaletteProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <aside className="tool-palette" aria-label="2D tools">
      <button
        type="button"
        className="tool-button"
        aria-label="选择"
        aria-pressed={activeTool === "select"}
        title="选择"
        onClick={() => onToolButtonClick("select")}
      >
        {SELECT_ICON}
        <span className="tool-button-label">选择</span>
      </button>

      <div className="add-menu-anchor" ref={menuRef}>
        <button
          type="button"
          className="tool-button tool-button-add"
          aria-label="添加组件"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-pressed={menuOpen ? true : undefined}
          title="添加组件"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {PLUS_ICON}
          <span className="tool-button-label">添加</span>
        </button>

        {menuOpen ? (
          <div className="add-menu" role="menu" aria-label="添加组件">
            {ADD_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                className="add-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onToolButtonClick(option.id);
                }}
              >
                添加{option.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
