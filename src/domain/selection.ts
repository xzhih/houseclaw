export type ObjectSelection =
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "balcony"; id: string }
  | { kind: "storey"; id: string }
  | { kind: "stair"; id: string }  // id = storeyId
  | { kind: "skirt"; id: string }
  | { kind: "roof" }
  | { kind: "roof-edge"; wallId: string };

export type ObjectSelectionKind = ObjectSelection["kind"];

export function isSelected(
  selection: ObjectSelection | undefined,
  kind: ObjectSelectionKind,
  id: string,
): boolean {
  if (!selection || selection.kind !== kind) return false;
  return "id" in selection ? selection.id === id : false;
}
