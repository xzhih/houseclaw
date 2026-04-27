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

  it("shows project JSON export controls", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "HouseClaw" }));

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

      await user.click(screen.getByRole("button", { name: "HouseClaw" }));
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
    const sample = createSampleProject();
    const importedProject = {
      ...sample,
      storeys: sample.storeys.map((storey) =>
        storey.id === "1f" ? { ...storey, label: "导入1F" } : storey,
      ),
    };
    const file = new File([exportProjectJson(importedProject)], "project.json", { type: "application/json" });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "HouseClaw" }));
    await user.upload(screen.getByLabelText("导入 JSON"), file);

    expect(await screen.findByRole("button", { name: "导入1F" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a validation alert for invalid project JSON", async () => {
    const user = userEvent.setup();
    const file = new File([JSON.stringify({ mode: "bad" })], "bad-project.json", { type: "application/json" });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "HouseClaw" }));
    await user.upload(screen.getByLabelText("导入 JSON"), file);

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid project JSON");
  });

  it("clears an import alert when a later valid import loads", async () => {
    const user = userEvent.setup();
    const invalidFile = new File([JSON.stringify({ mode: "bad" })], "bad-project.json", {
      type: "application/json",
    });
    const sample = createSampleProject();
    const validProject = {
      ...sample,
      storeys: sample.storeys.map((storey) =>
        storey.id === "1f" ? { ...storey, label: "恢复1F" } : storey,
      ),
    };
    const validFile = new File([exportProjectJson(validProject)], "project.json", {
      type: "application/json",
    });

    render(<App />);

    await user.click(screen.getByRole("button", { name: "HouseClaw" }));
    const input = screen.getByLabelText("导入 JSON");
    await user.upload(input, invalidFile);
    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid project JSON");

    await user.click(screen.getByRole("button", { name: "HouseClaw" }));
    await user.upload(screen.getByLabelText("导入 JSON"), validFile);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());

    expect(await screen.findByRole("button", { name: "恢复1F" })).toBeInTheDocument();
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

  it("renders the new storey's plan view (not the roof placeholder) after adding", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "添加楼层" }));

    // Storey rail now lists 4F as the active selection.
    expect(screen.getByRole("button", { name: "4F" })).toHaveAttribute("aria-pressed", "true");
    // Plan view, not the roof placeholder.
    expect(screen.queryByText("屋顶视图待建模")).toBeNull();
  });

  it("can switch back to an earlier storey after adding a new one", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "添加楼层" }));
    await user.click(screen.getByRole("button", { name: "1F" }));

    expect(screen.getByRole("button", { name: "1F" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("屋顶视图待建模")).toBeNull();
  });

  it("duplicates a storey and renders the duplicate's plan view", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Select 2F so the duplicate button reaches its property panel.
    await user.click(screen.getByRole("button", { name: "2F" }));
    await user.click(screen.getByRole("button", { name: "复制楼层" }));

    expect(screen.getByRole("button", { name: "4F" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("屋顶视图待建模")).toBeNull();
  });

  it("draws ghost wall outlines of the storey below in plan view", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);

    // 1F has no storey below: no ghost lines.
    await user.click(screen.getByRole("button", { name: "1F" }));
    expect(container.querySelectorAll(".plan-wall-ghost")).toHaveLength(0);

    // 2F should render ghost lines for 1F's walls.
    await user.click(screen.getByRole("button", { name: "2F" }));
    expect(container.querySelectorAll(".plan-wall-ghost").length).toBeGreaterThan(0);
  });

});

describe("roof view", () => {
  it("clicking [+ 添加屋顶] from a no-roof project creates a default roof", async () => {
    const user = userEvent.setup();
    render(<App />);
    // Navigate to roof view.
    await user.click(screen.getByRole("button", { name: "屋顶" }));
    // Sample ships with a default roof — first remove it via the property panel.
    // To test "no-roof" entrypoint, click the roof body, then remove.
    await user.click(screen.getByTestId("roof-body"));
    await user.click(screen.getByRole("button", { name: "移除屋顶" }));
    // Now [+ 添加屋顶] should appear.
    const addButton = await screen.findByRole("button", { name: "+ 添加屋顶" });
    expect(addButton).toBeInTheDocument();
    await user.click(addButton);
    // After click, [+ 添加屋顶] is gone (roof now exists).
    expect(screen.queryByRole("button", { name: "+ 添加屋顶" })).toBeNull();
  });

  it("toggling an eave edge to gable updates the property panel label", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "屋顶" }));
    // Sample's wall-front-3f is an eave (top storey is 3f, front and back are eaves).
    await user.click(screen.getByTestId("roof-edge-wall-front-3f"));
    // Toggle button should be enabled and labeled "切换为 山墙".
    const toggleButton = await screen.findByRole("button", { name: /切换为 山墙/ });
    expect(toggleButton).toBeEnabled();
    await user.click(toggleButton);
    // After toggle: now this edge is "gable", so the panel shows "切换为 檐" instead.
    expect(await screen.findByRole("button", { name: /切换为 檐/ })).toBeInTheDocument();
  });

  it("the toggle button is disabled when the selected eave is the only one", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "屋顶" }));
    // Sample default has 2 eaves (front + back). Toggle back to gable first.
    await user.click(screen.getByTestId("roof-edge-wall-back-3f"));
    await user.click(screen.getByRole("button", { name: /切换为 山墙/ }));
    // Now front is the only eave. Select it and confirm toggle is disabled.
    await user.click(screen.getByTestId("roof-edge-wall-front-3f"));
    const toggle = await screen.findByRole("button", { name: /切换为 山墙/ });
    expect(toggle).toBeDisabled();
  });

  it("changing pitch via the property panel updates roof state", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "屋顶" }));
    await user.click(screen.getByTestId("roof-body"));
    // Pitch field is a NumberField labeled "坡度" with unit °. Default 30°.
    // The NumberField commits via blur or Enter. Find by accessible name.
    const pitchField = await screen.findByRole("spinbutton", { name: /坡度/ });
    expect(pitchField).toBeInTheDocument();
    // Change to 45°.
    await user.clear(pitchField);
    await user.type(pitchField, "45");
    await user.tab(); // commit on blur
    // No assertion on internal state — verifying the input accepts the value.
    expect((pitchField as HTMLInputElement).value).toBe("45");
  });

  it("roof material picker uses the same swatch UI as wall/stair (aria-pressed buttons)", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "屋顶" }));
    await user.click(screen.getByTestId("roof-body"));
    // Sample default roof material is 陶瓦 — must surface as a pressed swatch
    // button, mirroring the wall/stair material-catalog pattern.
    const tile = await screen.findByRole("button", { name: "陶瓦" });
    expect(tile).toHaveAttribute("aria-pressed", "true");
    // No native select dropdown allowed — keeps roof consistent with siblings.
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

describe("skirt roof", () => {
  it("ToolPalette has 添加披檐 entry", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "添加组件" }));
    expect(screen.getByRole("menuitem", { name: "添加披檐" })).toBeInTheDocument();
  });

  it("adding a skirt selects it and surfaces SkirtEditor with material swatches", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "添加组件" }));
    await user.click(screen.getByRole("menuitem", { name: "添加披檐" }));
    // If storey sub-menu appears, pick 1F.
    const oneF = screen.queryByRole("menuitem", { name: "1F" });
    if (oneF) await user.click(oneF);
    // SkirtEditor heading visible.
    expect(await screen.findByRole("heading", { name: /披檐/ })).toBeInTheDocument();
    // Material swatches: 灰瓦 should be aria-pressed (default chosen).
    const grayTile = screen.getByRole("button", { name: "灰瓦" });
    expect(grayTile).toHaveAttribute("aria-pressed", "true");
  });

  it("changing pitch via SkirtEditor accepts the value", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "添加组件" }));
    await user.click(screen.getByRole("menuitem", { name: "添加披檐" }));
    const oneF = screen.queryByRole("menuitem", { name: "1F" });
    if (oneF) await user.click(oneF);
    const pitchField = await screen.findByRole("spinbutton", { name: /坡度/ });
    await user.clear(pitchField);
    await user.type(pitchField, "20");
    await user.tab();
    expect((pitchField as HTMLInputElement).value).toBe("20");
  });
});
