import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { exportProjectJson } from "../app/persistence";
import App from "../App";
import { createSampleProject } from "../domain/sampleProject";

function restoreUrlProperty(name: "createObjectURL" | "revokeObjectURL", descriptor?: PropertyDescriptor): void {
  if (descriptor) {
    Object.defineProperty(URL, name, descriptor);
    return;
  }

  delete (URL as unknown as Record<string, unknown>)[name];
}

describe("HouseClaw UI", () => {
  it("shows 2d plan tools by default", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "添加组件" })).toBeInTheDocument();
    expect(screen.getByLabelText("2D drawing surface")).toBeInTheDocument();
  });

  it("shows project JSON export controls", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "导出 JSON" })).toBeInTheDocument();
    expect(screen.getByLabelText("导入 JSON")).toBeInTheDocument();
  });

  it("downloads project JSON when export is clicked", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => "blob:houseclaw-project");
    const revokeObjectURL = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const revokeObjectURLDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });

    try {
      render(<App />);

      await user.click(screen.getByRole("button", { name: "导出 JSON" }));

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(anchorClick).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:houseclaw-project");
    } finally {
      restoreUrlProperty("createObjectURL", createObjectURLDescriptor);
      restoreUrlProperty("revokeObjectURL", revokeObjectURLDescriptor);
      anchorClick.mockRestore();
    }
  });

  it("imports valid project JSON from a file", async () => {
    const user = userEvent.setup();
    const importedProject = { ...createSampleProject(), name: "导入后的项目" };
    const file = new File([exportProjectJson(importedProject)], "project.json", { type: "application/json" });

    render(<App />);

    await user.upload(screen.getByLabelText("导入 JSON"), file);
    await user.click(screen.getByRole("button", { name: "3D" }));

    expect(await screen.findByText("导入后的项目")).toBeInTheDocument();
  });

  it("shows a validation alert for invalid project JSON", async () => {
    const user = userEvent.setup();
    const file = new File([JSON.stringify({ mode: "bad" })], "bad-project.json", { type: "application/json" });

    render(<App />);

    await user.upload(screen.getByLabelText("导入 JSON"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid project JSON");
  });

  it("clears an import alert when a later valid import loads", async () => {
    const user = userEvent.setup();
    const invalidFile = new File([JSON.stringify({ mode: "bad" })], "bad-project.json", {
      type: "application/json",
    });
    const validProject = { ...createSampleProject(), name: "恢复后的项目" };
    const validFile = new File([exportProjectJson(validProject)], "project.json", {
      type: "application/json",
    });

    render(<App />);

    const input = screen.getByLabelText("导入 JSON");
    await user.upload(input, invalidFile);
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid project JSON");

    await user.upload(input, validFile);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "3D" }));

    expect(await screen.findByText("恢复后的项目")).toBeInTheDocument();
  });

  it("switches to 3d preview", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "3D" }));

    expect(screen.getByLabelText("Three.js house preview")).toBeInTheDocument();
  });

  it("selects an elevation opening from the drawing surface", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));

    expect(screen.getByRole("group", { name: "当前 2D 结构视图" })).toBeInTheDocument();
    const opening = screen.getByRole("button", { name: "选择开孔 window-front-1f" });
    expect(opening).toHaveAttribute("aria-pressed", "false");

    opening.focus();
    await user.keyboard("{Enter}");

    expect(opening).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("窗宽")).toBeInTheDocument();
    expect(screen.getByText("离地高度")).toBeInTheDocument();
  });

  it("clears selection when pressing Escape on the drawing surface", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正视" }));
    const opening = screen.getByRole("button", { name: "选择开孔 window-front-1f" });
    opening.focus();
    await user.keyboard("{Enter}");

    expect(opening).toHaveAttribute("aria-pressed", "true");

    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "选择开孔 window-front-1f" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows balcony geometry in the second-floor plan and front elevation", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "2F" }));
    expect(screen.getByRole("button", { name: "选择阳台 balcony-front-2f" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "正视" }));
    expect(screen.getByRole("button", { name: "选择阳台 balcony-front-2f" })).toBeInTheDocument();
  });

  it("shows the material catalog only after a wall is selected", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText("外墙涂料")).not.toBeInTheDocument();
    expect(screen.queryByText("中性混凝土")).not.toBeInTheDocument();

    const wall = screen.getByRole("button", { name: "选择墙 wall-front-1f" });
    wall.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByText("外墙涂料")).toBeInTheDocument();
    expect(screen.getByText("中性混凝土")).toBeInTheDocument();
  });

  it("applies a wall material from the catalog after selecting a wall", async () => {
    const user = userEvent.setup();
    render(<App />);

    const wall = screen.getByRole("button", { name: "选择墙 wall-front-1f" });
    wall.focus();
    await user.keyboard("{Enter}");

    const whiteRender = screen.getByRole("button", { name: "外墙涂料" });
    const grayStone = screen.getByRole("button", { name: "中性混凝土" });

    expect(whiteRender).toHaveAttribute("aria-pressed", "true");
    expect(grayStone).toHaveAttribute("aria-pressed", "false");

    await user.click(grayStone);

    expect(grayStone).toHaveAttribute("aria-pressed", "true");
    expect(whiteRender).toHaveAttribute("aria-pressed", "false");
  });

  it("shows the storey strip in 2D mode with 1F selected by default", () => {
    render(<App />);

    expect(screen.getByRole("group", { name: "楼层" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1F" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2F" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "3F" })).toHaveAttribute("aria-pressed", "false");
  });

  it("selects a storey from the strip and surfaces the editor", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "2F" }));

    expect(screen.getByRole("button", { name: "2F" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("层高")).toBeInTheDocument();
  });

  it("commits a storey height change", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "1F" }));

    const heightField = screen.getByLabelText("层高") as HTMLInputElement;
    await user.clear(heightField);
    await user.type(heightField, "3500");
    await user.tab();

    expect(heightField.value).toBe("3500");
  });

  it("hides the storey strip in 3D mode", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "3D" }));

    expect(screen.queryByRole("group", { name: "楼层" })).not.toBeInTheDocument();
  });

});
