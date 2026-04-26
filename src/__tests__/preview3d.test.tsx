import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const setCameraMode = vi.fn();
const setActiveStorey = vi.fn();
const setLighting = vi.fn();
const dispose = vi.fn();

vi.mock("../rendering/threeScene", () => ({
  DEFAULT_LIGHTING: {
    exposure: 1.0,
    hemiIntensity: 0.7,
    keyIntensity: 1.5,
    fillIntensity: 1.3,
    sunAzimuthDeg: 200,
    sunAltitudeDeg: 36,
  },
  mountHouseScene: vi.fn(() => ({
    setCameraMode,
    setActiveStorey,
    setLighting,
    dispose,
  })),
}));

import { Preview3D } from "../components/Preview3D";
import { createSampleProject } from "../domain/sampleProject";

describe("Preview3D camera-mode wiring", () => {
  it("renders the mode toggle and forwards clicks to the scene", async () => {
    setCameraMode.mockReset();
    const user = userEvent.setup();
    render(<Preview3D project={createSampleProject()} />);

    const walkButton = screen.getByRole("button", { name: "漫游" });
    await user.click(walkButton);

    expect(setCameraMode).toHaveBeenCalledWith("walk");
  });

  it("forwards floor-button clicks to setActiveStorey while in walk mode", async () => {
    setActiveStorey.mockReset();
    const user = userEvent.setup();
    render(<Preview3D project={createSampleProject()} />);

    await user.click(screen.getByRole("button", { name: "漫游" }));
    await user.click(screen.getByRole("button", { name: "2F" }));

    expect(setActiveStorey).toHaveBeenCalledWith("2f");
  });

  it("hides floor buttons in orbit mode", () => {
    render(<Preview3D project={createSampleProject()} />);
    expect(screen.queryByRole("group", { name: "楼层切换" })).toBeNull();
  });
});
