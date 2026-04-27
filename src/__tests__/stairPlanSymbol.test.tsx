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
});
