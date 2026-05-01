type SliderRowProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
};

export function SliderRow({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
}: SliderRowProps) {
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <div className="chrome-slider-row">
      <span className="chrome-slider-row-label">{label}</span>
      <div className="chrome-slider-row-control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={label}
        />
        <span className="chrome-slider-row-value">{value.toFixed(decimals)}</span>
      </div>
    </div>
  );
}
