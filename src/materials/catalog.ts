import type { Material } from "../domain/types";

export const materialCatalog: readonly Material[] = [
  {
    id: "mat-white-render",
    name: "暖白外墙涂料",
    kind: "wall",
    // Warm linen — leaves room above for sun highlights without bleaching.
    color: "#e6ddc6",
    repeat: { x: 2, y: 2 },
  },
  {
    id: "mat-gray-stone",
    name: "深灰混凝土",
    kind: "wall",
    // Warmer dark gray for slabs / roof / balcony — anchors the value scale.
    color: "#6f6a63",
    repeat: { x: 1.5, y: 1.5 },
  },
  {
    id: "mat-dark-frame",
    name: "深灰窗框",
    kind: "frame",
    color: "#263238",
  },
];
