type Option<T extends string> = { value: T; label: string };

type SelectRowProps<T extends string> = {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
};

export function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectRowProps<T>) {
  return (
    <div className="chrome-select-row">
      <span className="chrome-select-row-label">{label}</span>
      <div className="chrome-select-row-options" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className="chrome-select-pill"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
