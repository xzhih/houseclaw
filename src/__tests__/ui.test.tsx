import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AppShell } from "../components/AppShell";

describe("AppShell — v2 layout smoke", () => {
  it("renders header + mode toggle, defaults to 3D", () => {
    render(<AppShell />);
    expect(screen.getByText("HouseClaw")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3D" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to 2D and exposes drawing surface + view tabs + property panel", async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.click(screen.getByRole("button", { name: "2D" }));

    expect(screen.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("2D drawing surface")).toBeInTheDocument();
    expect(screen.getByLabelText("属性面板")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "一层" })).toHaveAttribute("aria-selected", "true");
  });

  it("switches plan views via storey tabs", async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.click(screen.getByRole("button", { name: "2D" }));
    await user.click(screen.getByRole("tab", { name: "二层" }));

    expect(screen.getByRole("tab", { name: "二层" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "一层" })).toHaveAttribute("aria-selected", "false");
  });

  it("mounts in 3D mode without throwing", () => {
    // Default mode is 3D — render must complete without import/runtime errors.
    // Catches things like a broken Preview3D import, a missing chrome atom, etc.
    expect(() => render(<AppShell />)).not.toThrow();
  });

  it("mounts in 2D mode (plan view) without throwing", async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    // Switch to 2D — exercises DrawingSurface2D, ToolPalette, ViewTabs, PropertyPanel mount paths
    await user.click(screen.getByRole("button", { name: "2D" }));
    // If we reach here without throw, the entire 2D mount path is sound.
    expect(screen.getByLabelText("2D drawing surface")).toBeInTheDocument();
  });

  it("mounts in 2D elevation view without throwing", async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.click(screen.getByRole("button", { name: "2D" }));
    // Click 立面 tab — exercises renderElevation + ElevationSideTabs
    await user.click(screen.getByRole("tab", { name: "立面" }));
    expect(screen.getByRole("tab", { name: "FRONT" })).toBeInTheDocument();
  });

  it("renders SELECT tool active by default with shortcut hint", () => {
    render(<AppShell />);
    // SELECT button should be aria-pressed=true (default activeTool is "select")
    // The button's aria-label is "SELECT · V" per IconRailButton design.
    expect(screen.getByRole("button", { name: "SELECT · V" })).toHaveAttribute("aria-pressed", "true");
  });

  it("switches tool to WALL via keyboard shortcut", async () => {
    const user = userEvent.setup();
    render(<AppShell />);
    await user.keyboard("w");
    expect(screen.getByRole("button", { name: "WALL · W" })).toHaveAttribute("aria-pressed", "true");
  });
});
