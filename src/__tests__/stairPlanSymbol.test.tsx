import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("stair plan symbol", () => {
  it("renders UP label on 1F plan (lower half of 2F stair)", () => {
    // sampleProject starts on plan-1f; 2F has a stair so it shows UP on 1F
    render(<App />);
    expect(screen.getByText("UP")).toBeInTheDocument();
  });

  it("renders DN label on 3F plan (upper half of 3F stair)", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "3F" }));

    expect(screen.getByText("DN")).toBeInTheDocument();
  });

  it("clicking the stair symbol selects the stair", async () => {
    const user = userEvent.setup();
    render(<App />);

    // 1F plan shows 2F's stair as lower half
    const stairBtn = screen.getByRole("button", { name: "选择楼梯 2f" });
    await user.click(stairBtn);

    expect(stairBtn).toHaveAttribute("aria-pressed", "true");
  });
});
