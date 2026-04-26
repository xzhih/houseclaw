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

describe("Add components from elevation views", () => {
  it("adds a door on the front wall of the chosen storey from 正面 view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));
    await addToStorey("添加门", "1F", user);

    expect(
      screen.getByRole("button", { name: /^选择开孔 door-wall-front-1f-/ }),
    ).toBeInTheDocument();
  });

  it("adds a window from 背面 view to that elevation's wall", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));
    await user.click(screen.getByRole("button", { name: "背面" }));
    await addToStorey("添加窗", "1F", user);

    expect(
      screen.getByRole("button", { name: /^选择开孔 window-wall-back-1f-/ }),
    ).toBeInTheDocument();
  });

  it("adds a balcony attached to the side wall when in 左面 view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));
    await user.click(screen.getByRole("button", { name: "左面" }));
    await addToStorey("添加阳台", "1F", user);

    expect(
      screen.getByRole("button", { name: /^选择阳台 balcony-1f-/ }),
    ).toBeInTheDocument();
  });

  it("hides 添加墙 from the menu while inside an elevation view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));
    await user.click(screen.getByRole("button", { name: "添加组件" }));

    expect(screen.queryByRole("menuitem", { name: "添加墙" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "添加门" })).toBeInTheDocument();
  });

  it("places the opening on the storey picked in the menu, regardless of selection", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));

    const balcony = screen.getByRole("button", { name: "选择阳台 balcony-front-2f" });
    balcony.focus();
    await user.keyboard("{Enter}");

    // selection is on a 2F balcony, but we explicitly target 3F via the menu
    await addToStorey("添加门", "3F", user);

    expect(
      screen.getByRole("button", { name: /^选择开孔 door-wall-front-3f-/ }),
    ).toBeInTheDocument();
  });

  it("swaps the storey rail for elevation side tabs when 正视 is active", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));

    expect(screen.queryByRole("group", { name: "楼层" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正视" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "正面" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "背面" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "左面" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "右面" })).toBeInTheDocument();
  });

  it("clicking 俯视 returns to the plan view of the last visited storey", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "2F" }));
    await user.click(screen.getByRole("button", { name: "正视" }));
    await user.click(screen.getByRole("button", { name: "俯视" }));

    expect(screen.getByRole("button", { name: "2F" })).toHaveAttribute("aria-pressed", "true");
  });
});
