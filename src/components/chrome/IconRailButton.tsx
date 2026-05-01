import type { ReactNode } from "react";

type IconRailButtonProps = {
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
};

export function IconRailButton({ label, shortcut, active, onClick, children }: IconRailButtonProps) {
  return (
    <button
      type="button"
      className="chrome-icon-rail-button"
      aria-pressed={active}
      aria-label={`${label} · ${shortcut}`}
      onClick={onClick}
    >
      {children}
      <span className="chrome-icon-rail-tooltip" aria-hidden>
        {label} · {shortcut}
      </span>
    </button>
  );
}
