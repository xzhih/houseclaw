export type Selection =
  | { kind: "wall"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "balcony"; id: string }
  | { kind: "storey"; id: string };

export type SelectionKind = Selection["kind"];

export function isSelected(
  selection: Selection | undefined,
  kind: SelectionKind,
  id: string,
): boolean {
  return selection?.kind === kind && selection.id === id;
}
