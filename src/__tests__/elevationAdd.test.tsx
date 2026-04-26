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

    await user.click(screen.getByRole("button", { name: "正视" }));
    await clickAddMenu("添加门", user);

    expect(
      screen.getByRole("button", { name: /^选择开孔 door-wall-front-1f-/ }),
    ).toBeInTheDocument();
  });

  it("adds a window from 背面 view to that elevation's wall", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "背视" }));
    await clickAddMenu("添加窗", user);

    expect(
      screen.getByRole("button", { name: /^选择开孔 window-wall-back-1f-/ }),
    ).toBeInTheDocument();
  });

  it("adds a balcony attached to the side wall when in 左侧 view", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "左视" }));
    await clickAddMenu("添加阳台", user);

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

  it("attaches the added opening to the selected element's storey, not the first storey", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));

    const balcony = screen.getByRole("button", { name: "选择阳台 balcony-front-2f" });
    balcony.focus();
    await user.keyboard("{Enter}");

    await clickAddMenu("添加门", user);

    expect(
      screen.getByRole("button", { name: /^选择开孔 door-wall-front-2f-/ }),
    ).toBeInTheDocument();
  });

  it("keeps the storey rail visible in elevation views alongside the 俯视 tab", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));

    expect(screen.getByRole("group", { name: "楼层" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "俯视" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "正视" })).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking 俯视 returns to the plan view of the last visited storey", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "2F" }));
    await user.click(screen.getByRole("button", { name: "正视" }));
    await user.click(screen.getByRole("button", { name: "俯视" }));

    expect(screen.getByRole("button", { name: "2F" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses the last visited plan storey as the default add-target in elevation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "2F" }));
    await user.click(screen.getByRole("button", { name: "正视" }));
    await clickAddMenu("添加门", user);

    expect(
      screen.getByRole("button", { name: /^选择开孔 door-wall-front-2f-/ }),
    ).toBeInTheDocument();
  });
});
