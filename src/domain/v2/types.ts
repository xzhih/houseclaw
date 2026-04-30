export type Anchor =
  | { kind: "storey"; storeyId: string; offset: number }
  | { kind: "absolute"; z: number };

export type Storey = {
  id: string;
  label: string;
  elevation: number;
};
