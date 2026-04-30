import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AnchorPicker } from "../../../components/editors/AnchorPicker";
import type { Anchor, Storey } from "../../../domain/v2/types";

const STOREYS: Storey[] = [
  { id: "1f", label: "1F", elevation: 0 },
  { id: "2f", label: "2F", elevation: 3.2 },
];

describe("AnchorPicker", () => {
  it("renders the storey label and offset value for storey-anchored", () => {
    const onChange = vi.fn();
    render(
      <AnchorPicker
        anchor={{ kind: "storey", storeyId: "1f", offset: 0.5 }}
        storeys={STOREYS}
        label="底"
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("底 锚点")).toHaveValue("1f");
    expect(screen.getByLabelText("底 偏移")).toHaveValue(0.5);
  });

  it("renders the absolute z value when anchor kind is absolute", () => {
    const onChange = vi.fn();
    render(
      <AnchorPicker
        anchor={{ kind: "absolute", z: 2.4 }}
        storeys={STOREYS}
        label="底"
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText("底 锚点")).toHaveValue("__absolute__");
    expect(screen.getByLabelText("底 z")).toHaveValue(2.4);
  });

  it("dispatches onChange when storey changes (preserves offset)", () => {
    const onChange = vi.fn();
    render(
      <AnchorPicker
        anchor={{ kind: "storey", storeyId: "1f", offset: 0.3 }}
        storeys={STOREYS}
        label="底"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("底 锚点"), { target: { value: "2f" } });
    expect(onChange).toHaveBeenCalledWith({
      kind: "storey",
      storeyId: "2f",
      offset: 0.3,
    });
  });

  it("switches to absolute mode preserving the resolved z", () => {
    const onChange = vi.fn();
    render(
      <AnchorPicker
        anchor={{ kind: "storey", storeyId: "2f", offset: 0.5 }}
        storeys={STOREYS}
        label="底"
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("底 锚点"), { target: { value: "__absolute__" } });
    // 2F (3.2) + 0.5 = 3.7
    expect(onChange).toHaveBeenCalledWith({
      kind: "absolute",
      z: 3.7,
    });
  });
});
