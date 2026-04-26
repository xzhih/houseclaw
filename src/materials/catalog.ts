import type { Material } from "../domain/types";

export const materialCatalog: readonly Material[] = [
  {
    id: "mat-white-render",
    name: "外墙涂料",
    kind: "wall",
    // Eggshell white with a faint cool tint — fresh, not yellow.
    color: "#dedbd2",
    repeat: { x: 2, y: 2 },
  },
  {
    id: "mat-gray-stone",
    name: "中性混凝土",
    kind: "wall",
    // Cooler neutral gray for slabs / roof / balcony.
    color: "#6e7173",
    repeat: { x: 1.5, y: 1.5 },
  },
  {
    id: "mat-dark-frame",
    name: "深灰窗框",
    kind: "frame",
    color: "#263238",
  },
];
