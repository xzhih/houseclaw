import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PropertyPanel } from "../components/PropertyPanel";
import { withSessionDefaults } from "../app/projectReducer";
import { createSampleProject } from "../domain/sampleProject";

function workspaceProps(activeId: string) {
  return {
    catalog: { activeId, projects: [{ id: activeId, name: "test" }] },
    onSwitchProject: vi.fn(),
    onAddProject: vi.fn(),
    onRemoveProject: vi.fn(),
    showStoreyDatums: true,
    onSetShowStoreyDatums: vi.fn(),
  };
}

describe("PropertyPanel — v2 entity editing", () => {
  it("shows hint when no selection", () => {
    const project = withSessionDefaults(createSampleProject());
    const dispatch = vi.fn();
    render(<PropertyPanel project={project} dispatch={dispatch} {...workspaceProps(project.id)} />);
    expect(screen.getByText("在 2D 视图中点击对象以编辑属性")).toBeInTheDocument();
  });

  it("renders WallEditor when a wall is selected", () => {
    const project = withSessionDefaults(createSampleProject());
    const wallId = project.walls[0].id;
    const selected = { ...project, selection: { kind: "wall" as const, wallId } };
    const dispatch = vi.fn();
    render(<PropertyPanel project={selected} dispatch={dispatch} {...workspaceProps(project.id)} />);
    expect(screen.getByText(`墙 ${wallId}`)).toBeInTheDocument();
    expect(screen.getByLabelText("厚度")).toBeInTheDocument();
  });

  it("dispatches update-wall when thickness is edited", async () => {
    const user = userEvent.setup();
    const project = withSessionDefaults(createSampleProject());
    const wallId = project.walls[0].id;
    const selected = { ...project, selection: { kind: "wall" as const, wallId } };
    const dispatch = vi.fn();
    render(<PropertyPanel project={selected} dispatch={dispatch} {...workspaceProps(project.id)} />);

    const input = screen.getByLabelText("厚度") as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "0.25");
    await user.tab(); // blur to commit

    expect(dispatch).toHaveBeenCalledWith({
      type: "update-wall",
      wallId,
      patch: { thickness: 0.25 },
    });
  });

  it("renders OpeningEditor when an opening is selected", () => {
    const project = withSessionDefaults(createSampleProject());
    const opening = project.openings[0];
    const selected = {
      ...project,
      selection: { kind: "opening" as const, openingId: opening.id },
    };
    const dispatch = vi.fn();
    render(<PropertyPanel project={selected} dispatch={dispatch} {...workspaceProps(project.id)} />);
    expect(screen.getByText(new RegExp(`开洞 ${opening.id}`))).toBeInTheDocument();
  });

  it("shows missing-entity message when selection points at deleted entity", () => {
    const project = withSessionDefaults(createSampleProject());
    const ghost = { ...project, selection: { kind: "wall" as const, wallId: "no-such-wall" } };
    render(<PropertyPanel project={ghost} dispatch={vi.fn()} {...workspaceProps(project.id)} />);
    expect(screen.getByText(/已被删除/)).toBeInTheDocument();
  });
});
