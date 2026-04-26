import { useEffect, useId, useState, type KeyboardEvent } from "react";

type NumberFieldProps = {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  onCommit: (next: number) => string | undefined;
};

export function NumberField({
  label,
  value,
  step = 0.05,
  min,
  max,
  unit = "m",
  onCommit,
}: NumberFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [text, setText] = useState(() => String(value));
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setText(String(value));
    setError(undefined);
  }, [value]);

  const commit = () => {
    const trimmed = text.trim();
    const parsed = Number(trimmed);

    if (trimmed === "" || !Number.isFinite(parsed)) {
      setError(`${label} 必须是数字`);
      return;
    }
    if (min !== undefined && parsed < min) {
      setError(`${label} 不能小于 ${min}`);
      return;
    }
    if (max !== undefined && parsed > max) {
      setError(`${label} 不能大于 ${max}`);
      return;
    }

    const remoteError = onCommit(parsed);
    if (remoteError) {
      setError(remoteError);
      return;
    }
    setError(undefined);
    setText(String(parsed));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <div className="number-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="number-field-row">
        <input
          id={inputId}
          type="number"
          step={step}
          min={min}
          max={max}
          value={text}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
        <span className="number-field-unit">{unit}</span>
      </div>
      {error ? (
        <p className="number-field-error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
