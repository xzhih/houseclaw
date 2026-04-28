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
    id: "mat-clay-tile",
    name: "陶瓦",
    kind: "roof",
    color: "#8a4f3a",
  },
  {
    id: "mat-gray-tile",
    name: "灰瓦",
    kind: "roof",
    // 深灰小青瓦，中式坡屋顶常见
    color: "#3a3f43",
  },
  {
    id: "mat-dark-frame",
    name: "深灰窗框",
    kind: "frame",
    color: "#263238",
  },
  {
    id: "mat-warm-wood",
    name: "暖色木饰",
    kind: "decor",
    // 浅暖木色——楼梯/木装饰用，避开窗框深色
    color: "#b58a64",
  },
];
