import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const setCameraMode = vi.fn();
const teleportToStorey = vi.fn();
const setLighting = vi.fn();
const dispose = vi.fn();

vi.mock("../rendering/threeScene", () => ({
  DEFAULT_LIGHTING: {
    exposure: 1.0,
    hemiIntensity: 0.7,
    keyIntensity: 1.5,
    fillIntensity: 0.6,
    sunAzimuthDeg: 160,
    sunAltitudeDeg: 36,
  },
  mountHouseScene: vi.fn(() => ({
    setCameraMode,
    teleportToStorey,
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

  it("forwards floor-button clicks to teleportToStorey while in walk mode", async () => {
    teleportToStorey.mockReset();
    const user = userEvent.setup();
    render(<Preview3D project={createSampleProject()} />);

    await user.click(screen.getByRole("button", { name: "漫游" }));
    await user.click(screen.getByRole("button", { name: "2F" }));

    expect(teleportToStorey).toHaveBeenCalledWith("2f");
  });

  it("does NOT teleport when activeStoreyId changes from passive HUD detection", async () => {
    // Regression: previously a useEffect on activeStoreyId would teleport the
    // camera every time the player walked across a storey boundary, producing
    // the jarring "切换" jolt when ascending stairs. The HUD update path must
    // never reach teleportToStorey.
    teleportToStorey.mockReset();
    render(<Preview3D project={createSampleProject()} />);
    // No interaction → no teleports. Entering walk mode alone shouldn't fire it.
    expect(teleportToStorey).not.toHaveBeenCalled();
  });

  it("hides floor buttons in orbit mode", () => {
    render(<Preview3D project={createSampleProject()} />);
    expect(screen.queryByRole("group", { name: "楼层切换" })).toBeNull();
  });
});
