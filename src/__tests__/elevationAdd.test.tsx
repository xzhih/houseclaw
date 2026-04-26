import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

async function clickAddMenu(label: string, user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "添加组件" }));
  await user.click(screen.getByRole("menuitem", { name: label }));
}

describe("Add components from elevation views", () => {
  it("adds a door on the front wall of the active storey from 正面 view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正面" }));
    await clickAddMenu("添加门", user);

    expect(
      screen.getByRole("button", { name: /^选择开孔 door-wall-front-1f-/ }),
    ).toBeInTheDocument();
  });

  it("adds a window from 背面 view to that elevation's wall", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "背面" }));
    await clickAddMenu("添加窗", user);

    expect(
      screen.getByRole("button", { name: /^选择开孔 window-wall-back-1f-/ }),
    ).toBeInTheDocument();
  });

  it("adds a balcony attached to the side wall when in 左侧 view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "左侧" }));
    await clickAddMenu("添加阳台", user);

    expect(
      screen.getByRole("button", { name: /^选择阳台 balcony-1f-/ }),
    ).toBeInTheDocument();
  });

  it("hides 添加墙 from the menu while inside an elevation view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正面" }));
    await user.click(screen.getByRole("button", { name: "添加组件" }));

    expect(screen.queryByRole("menuitem", { name: "添加墙" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "添加门" })).toBeInTheDocument();
  });

  it("attaches the added opening to the selected element's storey, not the first storey", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正面" }));

    const balcony = screen.getByRole("button", { name: "选择阳台 balcony-front-2f" });
    balcony.focus();
    await user.keyboard("{Enter}");

    await clickAddMenu("添加门", user);

    expect(
      screen.getByRole("button", { name: /^选择开孔 door-wall-front-2f-/ }),
    ).toBeInTheDocument();
  });

  it("clicking a storey pill in elevation switches the target storey without leaving the view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正面" }));
    await user.click(screen.getByRole("button", { name: "2F" }));

    expect(screen.getByRole("button", { name: "正面" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2F" })).toHaveAttribute("aria-pressed", "true");

    await clickAddMenu("添加门", user);

    expect(
      screen.getByRole("button", { name: /^选择开孔 door-wall-front-2f-/ }),
    ).toBeInTheDocument();
  });
});
