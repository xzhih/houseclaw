import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("Wall add tool", () => {
  it("adds a new wall to the active storey when the 添加墙 button is clicked", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "添加墙" }));

    expect(screen.getByRole("button", { name: "选择墙 wall-1f-1" })).toBeInTheDocument();
  });

  it("auto-selects the new wall and exposes it in the property panel", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "添加墙" }));

    expect(screen.getByRole("button", { name: "选择墙 wall-1f-1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("墙厚")).toBeInTheDocument();
  });

  it("creates a fresh wall id on each click", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "添加墙" }));
    await user.click(screen.getByRole("button", { name: "添加墙" }));

    expect(screen.getByRole("button", { name: "选择墙 wall-1f-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择墙 wall-1f-2" })).toBeInTheDocument();
  });
});
