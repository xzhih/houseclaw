import type { Material } from "../domain/types";

export const materialCatalog: readonly Material[] = [
  {
    id: "mat-white-render",
    name: "暖白外墙涂料",
    kind: "wall",
    // Desaturated warm white — neutral cream, not yellow-cream.
    color: "#d8d2c4",
    repeat: { x: 2, y: 2 },
  },
  {
    id: "mat-gray-stone",
    name: "深灰混凝土",
    kind: "wall",
    // Slightly cooler dark gray, less brown saturation.
    color: "#6c6c69",
    repeat: { x: 1.5, y: 1.5 },
  },
  {
    id: "mat-dark-frame",
    name: "深灰窗框",
    kind: "frame",
    color: "#263238",
  },
];
