import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("PropertyPanel editing", () => {
  it("commits an opening width edit and updates the elevation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));
    const opening = screen.getByRole("button", { name: "选择开孔 window-front-1f" });
    opening.focus();
    await user.keyboard("{Enter}");

    const widthField = screen.getByLabelText("窗宽") as HTMLInputElement;
    await user.clear(widthField);
    await user.type(widthField, "2000");
    await user.tab();

    expect(widthField.value).toBe("2000");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects an opening width that exceeds the wall and surfaces the error", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));
    const opening = screen.getByRole("button", { name: "选择开孔 window-front-1f" });
    opening.focus();
    await user.keyboard("{Enter}");

    const widthField = screen.getByLabelText("窗宽") as HTMLInputElement;
    await user.clear(widthField);
    await user.type(widthField, "999000");
    await user.tab();

    expect(screen.getByRole("alert")).toHaveTextContent(/exceeds wall/);
  });

  it("edits a wall's thickness from a plan selection", async () => {
    const user = userEvent.setup();
    render(<App />);

    const wall = screen.getByRole("button", { name: "选择墙 wall-front-1f" });
    wall.focus();
    await user.keyboard("{Enter}");

    const thickness = screen.getByLabelText("墙厚") as HTMLInputElement;
    await user.clear(thickness);
    await user.type(thickness, "300");
    await user.tab();

    expect(thickness.value).toBe("300");
  });

  it("applies a material to the selected wall, not always to walls[0]", async () => {
    const user = userEvent.setup();
    render(<App />);

    const wall = screen.getByRole("button", { name: "选择墙 wall-right-1f" });
    wall.focus();
    await user.keyboard("{Enter}");

    const grayStone = screen.getByRole("button", { name: "中性混凝土" });
    await user.click(grayStone);

    expect(grayStone).toHaveAttribute("aria-pressed", "true");
  });

  it("edits a balcony depth from the front elevation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));
    const balcony = screen.getByRole("button", { name: "选择阳台 balcony-front-2f" });
    balcony.focus();
    await user.keyboard("{Enter}");

    const depth = screen.getByLabelText("进深") as HTMLInputElement;
    await user.clear(depth);
    await user.type(depth, "1500");
    await user.tab();

    expect(depth.value).toBe("1500");
  });
});
