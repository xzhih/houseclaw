import { useId } from "react";
import type { Material, MaterialKind } from "../../domain/v2/types";

type MaterialPickerProps = {
  materials: Material[];
  value: string;
  /** Optional: filter the dropdown to materials matching one or more kinds. */
  kinds?: MaterialKind[];
  label: string;
  onChange: (materialId: string) => void;
};

export function MaterialPicker({ materials, value, kinds, label, onChange }: MaterialPickerProps) {
  const id = useId();
  const filtered = kinds ? materials.filter((m) => kinds.includes(m.kind)) : materials;
  return (
    <div className="material-picker">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      >
        {filtered.map((m) => (
          <option key={m.id} value={m.id}>{m.name}</option>
        ))}
      </select>
    </div>
  );
}
