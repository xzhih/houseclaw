import type { ReactNode } from "react";

type ContextChipProps = {
  /** Chip body — typically the prompt + an inline action button. */
  children: ReactNode;
};

export function ContextChip({ children }: ContextChipProps) {
  return <div className="chrome-context-chip">{children}</div>;
}

type ContextChipActionProps = {
  onClick: () => void;
  children: ReactNode;
};

export function ContextChipAction({ onClick, children }: ContextChipActionProps) {
  return (
    <button type="button" className="chrome-context-chip-action" onClick={onClick}>
      {children}
    </button>
  );
}
