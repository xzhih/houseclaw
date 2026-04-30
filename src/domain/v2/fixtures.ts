import type { HouseProject } from "./types";

/**
 * Smallest valid v2 project: one storey + four walls forming a 6x4 rectangle
 * + one floor slab + one rectangular gable roof + one window + one wall material.
 * Used as a reusable starting point for validation tests.
 */
export function createValidV2Project(): HouseProject {
  return {
    schemaVersion: 2,
    id: "test-project",
    name: "Test Project",
    storeys: [
      { id: "1f", label: "1F", elevation: 0 },
      { id: "2f", label: "2F", elevation: 3.2 },
    ],
    materials: [
      { id: "mat-wall", name: "白漆", kind: "wall", color: "#f0f0f0" },
      { id: "mat-roof", name: "深灰瓦", kind: "roof", color: "#3a3a3a" },
      { id: "mat-frame", name: "深灰窗框", kind: "frame", color: "#2a2a2a" },
      { id: "mat-slab", name: "楼板", kind: "decor", color: "#cccccc" },
    ],
    walls: [
      {
        id: "w-front",
        start: { x: 0, y: 0 },
        end: { x: 6, y: 0 },
        thickness: 0.2,
        bottom: { kind: "storey", storeyId: "1f", offset: 0 },
        top: { kind: "storey", storeyId: "2f", offset: 0 },
        exterior: true,
        materialId: "mat-wall",
      },
      {
        id: "w-right",
        start: { x: 6, y: 0 },
        end: { x: 6, y: 4 },
        thickness: 0.2,
        bottom: { kind: "storey", storeyId: "1f", offset: 0 },
        top: { kind: "storey", storeyId: "2f", offset: 0 },
        exterior: true,
        materialId: "mat-wall",
      },
      {
        id: "w-back",
        start: { x: 6, y: 4 },
        end: { x: 0, y: 4 },
        thickness: 0.2,
        bottom: { kind: "storey", storeyId: "1f", offset: 0 },
        top: { kind: "storey", storeyId: "2f", offset: 0 },
        exterior: true,
        materialId: "mat-wall",
      },
      {
        id: "w-left",
        start: { x: 0, y: 4 },
        end: { x: 0, y: 0 },
        thickness: 0.2,
        bottom: { kind: "storey", storeyId: "1f", offset: 0 },
        top: { kind: "storey", storeyId: "2f", offset: 0 },
        exterior: true,
        materialId: "mat-wall",
      },
    ],
    slabs: [
      {
        id: "slab-1f",
        polygon: [
          { x: 0, y: 0 },
          { x: 6, y: 0 },
          { x: 6, y: 4 },
          { x: 0, y: 4 },
        ],
        top: { kind: "storey", storeyId: "1f", offset: 0 },
        thickness: 0.15,
        materialId: "mat-slab",
      },
    ],
    roofs: [
      {
        id: "roof-main",
        polygon: [
          { x: -0.5, y: -0.5 },
          { x: 6.5, y: -0.5 },
          { x: 6.5, y: 4.5 },
          { x: -0.5, y: 4.5 },
        ],
        base: { kind: "storey", storeyId: "2f", offset: 0 },
        edges: ["eave", "gable", "eave", "gable"],
        pitch: Math.PI / 6,
        overhang: 0.5,
        materialId: "mat-roof",
      },
    ],
    openings: [
      {
        id: "opening-front-window",
        wallId: "w-front",
        type: "window",
        offset: 1.5,
        sillHeight: 0.9,
        width: 1.5,
        height: 1.2,
        frameMaterialId: "mat-frame",
      },
    ],
    balconies: [],
    stairs: [],
  };
}
