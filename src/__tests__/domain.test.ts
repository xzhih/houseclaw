import { describe, expect, it } from "vitest";
import { wallLength } from "../domain/measurements";
import { createSampleProject } from "../domain/sampleProject";

describe("house domain model", () => {
  it("creates a three-storey sample project with deterministic elevations", () => {
    const project = createSampleProject();

    expect(project.id).toBe("sample-house");
    expect(project.name).toBe("三层别墅草案");
    expect(project.storeys.map((storey) => storey.id)).toEqual(["1f", "2f", "3f"]);
    expect(project.storeys.map((storey) => storey.elevation)).toEqual([0, 3.2, 6.4]);
    expect(project.storeys.every((storey) => storey.height === 3.2)).toBe(true);
  });

  it("keeps walls as structured objects with measurable length", () => {
    const project = createSampleProject();
    const frontWall = project.walls.find((wall) => wall.id === "wall-front-1f");

    expect(project.storeys.map((storey) => project.walls.filter((wall) => wall.storeyId === storey.id).length)).toEqual([
      4, 4, 4,
    ]);
    expect(frontWall).toBeDefined();
    expect(wallLength(frontWall!)).toBe(10);
    expect(frontWall!.thickness).toBe(0.24);
    expect(frontWall!.storeyId).toBe("1f");
  });

  it("includes a simple balcony attached to an upper exterior wall", () => {
    const project = createSampleProject();

    expect(project.balconies).toEqual([
      expect.objectContaining({
        id: "balcony-front-2f",
        storeyId: "2f",
        attachedWallId: "wall-front-2f",
        materialId: "mat-gray-stone",
        railingMaterialId: "mat-dark-frame",
      }),
    ]);
  });

  it("uses the planned sample material definitions", () => {
    const project = createSampleProject();
    const wallMaterial = project.materials.find((material) => material.id === "mat-white-render");
    const frameMaterial = project.materials.find((material) => material.id === "mat-dark-frame");

    expect(wallMaterial).toMatchObject({
      name: "白色外墙涂料",
      kind: "wall",
      color: "#f2eee6",
      repeat: { x: 2, y: 2 },
    });
    expect(frameMaterial).toMatchObject({
      name: "深灰窗框",
      kind: "frame",
      color: "#263238",
    });
  });
});
