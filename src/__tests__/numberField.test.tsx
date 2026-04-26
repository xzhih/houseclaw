import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { NumberField } from "../components/NumberField";

describe("NumberField", () => {
  it("renders the label, current value, and unit", () => {
    render(<NumberField label="厚度" value={0.24} onCommit={() => undefined} />);

    const input = screen.getByLabelText<HTMLInputElement>("厚度");
    expect(input.value).toBe("0.24");
    expect(screen.getByText("m")).toBeInTheDocument();
  });

  it("commits on blur when the user types a valid value", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(() => undefined);

    render(<NumberField label="厚度" value={0.24} onCommit={onCommit} />);

    const input = screen.getByLabelText("厚度");
    await user.clear(input);
    await user.type(input, "0.3");
    await user.tab();

    expect(onCommit).toHaveBeenCalledWith(0.3);
  });

  it("commits on Enter without submitting an enclosing form", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(() => undefined);

    render(<NumberField label="厚度" value={0.24} onCommit={onCommit} />);

    const input = screen.getByLabelText("厚度");
    await user.clear(input);
    await user.type(input, "0.4{Enter}");

    expect(onCommit).toHaveBeenCalledWith(0.4);
  });

  it("shows the error returned by onCommit", async () => {
    const user = userEvent.setup();

    render(<NumberField label="厚度" value={0.24} onCommit={() => "厚度太薄"} />);

    const input = screen.getByLabelText("厚度");
    await user.clear(input);
    await user.type(input, "0.01");
    await user.tab();

    expect(screen.getByRole("alert")).toHaveTextContent("厚度太薄");
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects non-numeric input without calling onCommit", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();

    render(<NumberField label="厚度" value={0.24} onCommit={onCommit} />);

    const input = screen.getByLabelText("厚度");
    await user.clear(input);
    await user.type(input, "abc");
    await user.tab();

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("必须是数字");
  });

  it("resets the displayed text when the value prop changes after a successful commit", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<NumberField label="厚度" value={0.24} onCommit={() => undefined} />);

    const input = screen.getByLabelText<HTMLInputElement>("厚度");
    await user.clear(input);
    await user.type(input, "0.3");
    await user.tab();

    rerender(<NumberField label="厚度" value={0.3} onCommit={() => undefined} />);

    expect(input.value).toBe("0.3");
  });

  it("preserves in-flight text when the parent re-renders while the input is focused", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <NumberField label="厚度" value={0.24} onCommit={() => undefined} />,
    );

    const input = screen.getByLabelText<HTMLInputElement>("厚度");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "0.5");

    rerender(<NumberField label="厚度" value={0.4} onCommit={() => undefined} />);

    expect(input.value).toBe("0.5");
    expect(document.activeElement).toBe(input);
  });

  it("canonicalises text from the parent value after blur when the value matches the committed parsed number", async () => {
    const user = userEvent.setup();
    let stored = 0.24;
    const onCommit = (next: number) => {
      stored = next;
      return undefined;
    };
    const { rerender } = render(<NumberField label="厚度" value={stored} onCommit={onCommit} />);

    const input = screen.getByLabelText<HTMLInputElement>("厚度");
    await user.click(input);
    await user.clear(input);
    await user.type(input, "0.30");
    await user.tab();

    rerender(<NumberField label="厚度" value={stored} onCommit={onCommit} />);

    expect(input.value).toBe("0.3");
  });
});
