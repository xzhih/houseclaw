import type { Material } from "../domain/types";

export const materialCatalog: Material[] = [
  {
    id: "mat-white-render",
    name: "白色外墙涂料",
    kind: "wall",
    color: "#f2eee6",
    repeat: { x: 2, y: 2 },
  },
  {
    id: "mat-gray-stone",
    name: "灰色石材",
    kind: "wall",
    color: "#8d9290",
    repeat: { x: 1.5, y: 1.5 },
  },
  {
    id: "mat-dark-frame",
    name: "深灰窗框",
    kind: "frame",
    color: "#263238",
  },
];
