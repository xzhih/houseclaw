import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

async function addToStorey(
  typeLabel: string,
  storeyLabel: string,
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(screen.getByRole("button", { name: "添加组件" }));
  await user.click(screen.getByRole("menuitem", { name: typeLabel }));
  await user.click(screen.getByRole("menuitem", { name: storeyLabel }));
}

describe("Wall add tool", () => {
  it("adds a new wall on the storey picked in the menu", async () => {
    const user = userEvent.setup();
    render(<App />);

    await addToStorey("添加墙", "1F", user);

    expect(screen.getByRole("button", { name: "选择墙 wall-1f-1" })).toBeInTheDocument();
  });

  it("auto-selects the new wall and exposes it in the property panel", async () => {
    const user = userEvent.setup();
    render(<App />);

    await addToStorey("添加墙", "1F", user);

    expect(screen.getByRole("button", { name: "选择墙 wall-1f-1" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByLabelText("墙厚")).toBeInTheDocument();
  });

  it("places walls on the chosen storey, even when it differs from the active view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await addToStorey("添加墙", "2F", user);

    expect(screen.getByRole("button", { name: "选择墙 wall-2f-1" })).toBeInTheDocument();
  });

  it("creates a fresh wall id on each click", async () => {
    const user = userEvent.setup();
    render(<App />);

    await addToStorey("添加墙", "1F", user);
    await addToStorey("添加墙", "1F", user);

    expect(screen.getByRole("button", { name: "选择墙 wall-1f-1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择墙 wall-1f-2" })).toBeInTheDocument();
  });
});
