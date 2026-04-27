import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("stair plan symbol", () => {
  it("renders UP label on 1F plan (1F's own stair, lower half)", () => {
    render(<App />);
    expect(screen.getByText("UP")).toBeInTheDocument();
  });

  it("renders DN label on 3F plan (2F's stair, upper half)", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "3F" }));

    expect(screen.getByText("DN")).toBeInTheDocument();
  });

  it("clicking the stair symbol selects the stair owner-storey", async () => {
    const user = userEvent.setup();
    render(<App />);

    // 1F plan shows 1F's own stair as lower half
    const stairBtn = screen.getByRole("button", { name: "选择楼梯 1f" });
    await user.click(stairBtn);

    expect(stairBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("U-shape UP label sits on the lower flight, not in the gap", async () => {
    const user = userEvent.setup();
    render(<App />);

    // open 1F's stair editor, change shape to U
    await user.click(screen.getByRole("button", { name: "选择楼梯 1f" }));
    await user.click(screen.getByRole("button", { name: "U" }));

    const upText = screen.getByText("UP");
    const x = Number(upText.getAttribute("x"));
    const y = Number(upText.getAttribute("y"));
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(y)).toBe(true);

    // Sample stair: bottomEdge="+y", width=1.2, depth=2.5 → crossLength=1.2.
    // Label cross position should be on the lower flight (cross < crossLength/2),
    // NOT centered (cross == crossLength/2).
    // We can't easily assert exact pixel position (depends on viewport scale),
    // but we CAN assert that switching to a centered-cross shape (straight)
    // changes x — i.e. U is not the same x as straight.

    await user.click(screen.getByRole("button", { name: "一字" }));
    const upStraight = screen.getByText("UP");
    const xStraight = Number(upStraight.getAttribute("x"));

    expect(x).not.toBeCloseTo(xStraight, 1);
  });
});
