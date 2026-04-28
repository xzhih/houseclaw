import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

async function addInPlan(typeLabel: string, user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "添加组件" }));
  await user.click(screen.getByRole("menuitem", { name: typeLabel }));
}

describe("Wall add tool", () => {
  it("adds a new wall on the active plan storey without a storey prompt", async () => {
    const user = userEvent.setup();
    render(<App />);

    await addInPlan("添加墙", user);

    expect(screen.getByRole("button", { name: "选择墙 wall-1f-1" })).toBeInTheDocument();
    expect(screen.queryByRole("menu", { name: "选择楼层" })).not.toBeInTheDocument();
  });

  it("auto-selects the new wall and exposes it in the property panel", async () => {
    const user = userEvent.setup();
    render(<App />);

    await addInPlan("添加墙", user);

    expect(screen.getByRole("button", { name: "选择墙 wall-1f-1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("墙厚")).toBeInTheDocument();
  });

  it("places walls on the storey whose plan is currently active", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "2F" }));
    await addInPlan("添加墙", user);

    expect(screen.getByRole("button", { name: "选择墙 wall-2f-1" })).toBeInTheDocument();
  });

  it("creates a fresh wall id on each click", async () => {
    const user = userEvent.setup();
    render(<App />);

    await addInPlan("添加墙", user);
    await addInPlan("添加墙", user);

    expect(screen.getByRole("button", { name: "选择墙 wall-1f-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择墙 wall-1f-2" })).toBeInTheDocument();
  });
});
