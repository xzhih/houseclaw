import type { Mode } from "../domain/types";

const MODES: { id: Mode; label: string }[] = [
  { id: "2d", label: "2D" },
  { id: "3d", label: "3D" },
];

type ModeSwitchProps = {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
};

export function ModeSwitch({ mode, onModeChange }: ModeSwitchProps) {
  return (
    <div className="mode-switch" aria-label="View mode">
      {MODES.map((option) => (
        <button
          key={option.id}
          type="button"
          className="segmented-button"
          aria-pressed={mode === option.id}
          onClick={() => onModeChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
