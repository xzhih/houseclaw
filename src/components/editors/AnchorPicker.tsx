import { useId } from "react";
import type { Anchor, Storey } from "../../domain/v2/types";

type AnchorPickerProps = {
  anchor: Anchor;
  storeys: Storey[];
  label: string;
  onChange: (anchor: Anchor) => void;
};

const ABSOLUTE_KEY = "__absolute__";

function resolveZ(anchor: Anchor, storeys: Storey[]): number {
  if (anchor.kind === "absolute") return anchor.z;
  const storey = storeys.find((s) => s.id === anchor.storeyId);
  return (storey?.elevation ?? 0) + anchor.offset;
}

export function AnchorPicker({ anchor, storeys, label, onChange }: AnchorPickerProps) {
  const selectId = useId();
  const offsetId = useId();

  const selectValue = anchor.kind === "absolute" ? ABSOLUTE_KEY : anchor.storeyId;

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === ABSOLUTE_KEY) {
      onChange({ kind: "absolute", z: resolveZ(anchor, storeys) });
    } else {
      const offset = anchor.kind === "storey" ? anchor.offset : 0;
      onChange({ kind: "storey", storeyId: v, offset });
    }
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    if (!Number.isFinite(v)) return;
    if (anchor.kind === "absolute") {
      onChange({ kind: "absolute", z: v });
    } else {
      onChange({ kind: "storey", storeyId: anchor.storeyId, offset: v });
    }
  };

  return (
    <div className="anchor-picker">
      <label className="anchor-picker-label" htmlFor={selectId}>{label}</label>
      <div className="anchor-picker-row">
        <select
          id={selectId}
          aria-label={`${label} 锚点`}
          value={selectValue}
          onChange={handleSelectChange}
        >
          {storeys.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
          <option value={ABSOLUTE_KEY}>自定义</option>
        </select>
        <span className="anchor-picker-sep">+</span>
        <input
          id={offsetId}
          type="number"
          step="0.05"
          aria-label={`${label} ${anchor.kind === "absolute" ? "z" : "偏移"}`}
          value={anchor.kind === "absolute" ? anchor.z : anchor.offset}
          onChange={handleNumberChange}
        />
        <span className="anchor-picker-unit">m</span>
      </div>
    </div>
  );
}
