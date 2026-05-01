import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCreateHandlers } from "../../../components/canvas/useCreateHandlers";
import { createSampleProject } from "../../../domain/sampleProject";
import { withSessionDefaults } from "../../../app/projectReducer";

describe("useCreateHandlers — wall tool", () => {
  it("first click in wall tool records the start point (idle → wall-pending)", () => {
    const project = withSessionDefaults({ ...createSampleProject() });
    project.activeTool = "wall";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 1, y: 1 }, undefined));
    expect(result.current.state.kind).toBe("wall-pending");
    if (result.current.state.kind === "wall-pending") {
      expect(result.current.state.firstPoint).toEqual({ x: 1, y: 1 });
    }
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("second click dispatches add-wall and resets to idle", () => {
    const project = withSessionDefaults({ ...createSampleProject() });
    project.activeTool = "wall";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 1, y: 1 }, undefined));
    act(() => result.current.handleCanvasClick({ x: 5, y: 1 }, undefined));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "add-wall",
        wall: expect.objectContaining({
          start: { x: 1, y: 1 },
          end: { x: 5, y: 1 },
        }),
      }),
    );
    expect(result.current.state.kind).toBe("idle");
  });

  it("Escape during wall-pending cancels back to idle", () => {
    const project = withSessionDefaults({ ...createSampleProject() });
    project.activeTool = "wall";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 1, y: 1 }, undefined));
    act(() => result.current.handleKeyDown("Escape"));
    expect(result.current.state.kind).toBe("idle");
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("useCreateHandlers — opening tools", () => {
  it("clicking on a wall in door mode dispatches add-opening with door type", () => {
    const project = withSessionDefaults({ ...createSampleProject() });
    project.activeTool = "door";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 3, y: 0 }, { kind: "wall", wallId: "w-front" }));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "add-opening",
        opening: expect.objectContaining({
          wallId: "w-front",
          type: "door",
          offset: expect.any(Number),
        }),
      }),
    );
  });

  it("clicking on empty space in door mode is a no-op", () => {
    const project = withSessionDefaults({ ...createSampleProject() });
    project.activeTool = "door";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 100, y: 100 }, undefined));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("useCreateHandlers — slab tool", () => {
  it("accumulates polygon vertices and Enter dispatches add-slab", () => {
    const project = withSessionDefaults({ ...createSampleProject() });
    project.activeTool = "slab";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 0, y: 0 }, undefined));
    act(() => result.current.handleCanvasClick({ x: 4, y: 0 }, undefined));
    act(() => result.current.handleCanvasClick({ x: 4, y: 4 }, undefined));
    act(() => result.current.handleCanvasClick({ x: 0, y: 4 }, undefined));
    expect(result.current.state.kind).toBe("slab-pending");
    act(() => result.current.handleKeyDown("Enter"));
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "add-slab",
        slab: expect.objectContaining({
          polygon: [
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            { x: 4, y: 4 },
            { x: 0, y: 4 },
          ],
        }),
      }),
    );
    expect(result.current.state.kind).toBe("idle");
  });

  it("Enter with fewer than 3 vertices is a no-op", () => {
    const project = withSessionDefaults({ ...createSampleProject() });
    project.activeTool = "slab";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    act(() => result.current.handleCanvasClick({ x: 0, y: 0 }, undefined));
    act(() => result.current.handleCanvasClick({ x: 4, y: 0 }, undefined));
    act(() => result.current.handleKeyDown("Enter"));
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe("useCreateHandlers — select tool (no-op)", () => {
  it("does not intercept clicks in select mode", () => {
    const project = withSessionDefaults({ ...createSampleProject() });
    project.activeTool = "select";
    const dispatch = vi.fn();
    const { result } = renderHook(() => useCreateHandlers({ project, storeyId: "1f", dispatch }));
    expect(result.current.handleCanvasClick({ x: 1, y: 1 }, undefined)).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
