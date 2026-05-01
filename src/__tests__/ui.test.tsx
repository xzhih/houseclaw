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
});
