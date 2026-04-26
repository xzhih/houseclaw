import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("HouseClaw UI", () => {
  it("shows 2d plan tools by default", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1F" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("墙")).toBeInTheDocument();
    expect(screen.getByLabelText("2D drawing surface")).toBeInTheDocument();
  });

  it("switches to 3d preview", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "3D" }));

    expect(screen.getByText("3D 外观预览")).toBeInTheDocument();
    expect(screen.getByLabelText("Three.js house preview")).toBeInTheDocument();
  });

  it("selects an elevation opening from the drawing surface", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正面" }));

    expect(screen.getByRole("group", { name: "当前 2D 结构视图" })).toBeInTheDocument();
    const opening = screen.getByRole("button", { name: "选择开孔 window-front-1f" });
    expect(opening).toHaveAttribute("aria-pressed", "false");

    opening.focus();
    await user.keyboard("{Enter}");

    expect(opening).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("窗宽")).toBeInTheDocument();
    expect(screen.getByText("离地高度")).toBeInTheDocument();
  });

  it("shows a reusable material catalog", () => {
    render(<App />);

    expect(screen.getByText("白色外墙涂料")).toBeInTheDocument();
    expect(screen.getByText("灰色石材")).toBeInTheDocument();
  });

  it("applies a wall material from the catalog", async () => {
    const user = userEvent.setup();
    render(<App />);

    const whiteRender = screen.getByRole("button", { name: "白色外墙涂料" });
    const grayStone = screen.getByRole("button", { name: "灰色石材" });

    expect(whiteRender).toHaveAttribute("aria-pressed", "true");
    expect(grayStone).toHaveAttribute("aria-pressed", "false");

    await user.click(grayStone);

    expect(grayStone).toHaveAttribute("aria-pressed", "true");
    expect(whiteRender).toHaveAttribute("aria-pressed", "false");
  });
});
