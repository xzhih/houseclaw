type ToggleRowProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

export function ToggleRow({ label, value, onChange }: ToggleRowProps) {
  return (
    <div className="chrome-toggle-row">
      <span className="chrome-toggle-row-label">{label}</span>
      <button
        type="button"
        className="chrome-toggle"
        aria-pressed={value}
        aria-label={label}
        onClick={() => onChange(!value)}
      >
        <span className="chrome-toggle-thumb" aria-hidden />
      </button>
    </div>
  );
}
