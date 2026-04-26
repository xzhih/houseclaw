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

export type StoreyOption = { id: string; label: string };

type ToolPaletteProps = {
  activeTool: ToolId;
  storeys: StoreyOption[];
  defaultStoreyId?: string;
  onSelectMode: () => void;
  onAddComponent: (toolId: ToolId, storeyId: string) => void;
  allowWallAdd: boolean;
};

export function ToolPalette({
  activeTool,
  storeys,
  defaultStoreyId,
  onSelectMode,
  onAddComponent,
  allowWallAdd,
}: ToolPaletteProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingType, setPendingType] = useState<ToolId | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const closeMenu = () => {
    setMenuOpen(false);
    setPendingType(null);
  };

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDocPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current && !menuRef.current.contains(target)) {
        closeMenu();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const visibleAddOptions = allowWallAdd
    ? ADD_OPTIONS
    : ADD_OPTIONS.filter((option) => option.id !== "wall");
  const pendingLabel = pendingType
    ? ADD_OPTIONS.find((option) => option.id === pendingType)?.label
    : "";

  return (
    <aside className="tool-palette" aria-label="2D tools">
      <button
        type="button"
        className="tool-button"
        aria-label="选择"
        aria-pressed={activeTool === "select"}
        title="选择"
        onClick={onSelectMode}
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
          onClick={() => {
            setMenuOpen((open) => !open);
            setPendingType(null);
          }}
        >
          {PLUS_ICON}
          <span className="tool-button-label">添加</span>
        </button>

        {menuOpen ? (
          pendingType === null ? (
            <div className="add-menu" role="menu" aria-label="添加组件">
              {visibleAddOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="menuitem"
                  className="add-menu-item"
                  onClick={() => {
                    if (defaultStoreyId) {
                      onAddComponent(option.id, defaultStoreyId);
                      closeMenu();
                    } else {
                      setPendingType(option.id);
                    }
                  }}
                >
                  添加{option.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="add-menu" role="menu" aria-label="选择楼层">
              <button
                type="button"
                className="add-menu-back"
                onClick={() => setPendingType(null)}
              >
                ← 返回
              </button>
              <p className="add-menu-header">添加{pendingLabel}到</p>
              {storeys.map((storey) => (
                <button
                  key={storey.id}
                  type="button"
                  role="menuitem"
                  className="add-menu-item"
                  onClick={() => {
                    onAddComponent(pendingType, storey.id);
                    closeMenu();
                  }}
                >
                  {storey.label}
                </button>
              ))}
            </div>
          )
        ) : null}
      </div>
    </aside>
  );
}
