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
    expect(screen.getByRole("button", { name: "1F" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("墙")).toBeInTheDocument();
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
