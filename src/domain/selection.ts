export type ObjectSelection =
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "balcony"; id: string }
  | { kind: "storey"; id: string }
  | { kind: "stair"; id: string };  // id = storeyId

export type ObjectSelectionKind = ObjectSelection["kind"];

export function isSelected(
  selection: ObjectSelection | undefined,
  kind: ObjectSelectionKind,
  id: string,
): boolean {
  return selection?.kind === kind && selection.id === id;
}
