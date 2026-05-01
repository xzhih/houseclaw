import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { useGlobalShortcuts } from "../../../components/chrome/useGlobalShortcuts";

function Harness({ map }: { map: Record<string, () => void> }) {
  useGlobalShortcuts(map);
  return <input aria-label="text-input" />;
}

describe("useGlobalShortcuts", () => {
  it("fires handler on lowercase key match", async () => {
    const user = userEvent.setup();
    const onW = vi.fn();
    render(<Harness map={{ w: onW }} />);
    await user.keyboard("w");
    expect(onW).toHaveBeenCalledTimes(1);
  });

  it("fires on uppercase too (case-insensitive)", async () => {
    const user = userEvent.setup();
    const onW = vi.fn();
    render(<Harness map={{ w: onW }} />);
    await user.keyboard("W");
    expect(onW).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire when input is focused", async () => {
    const user = userEvent.setup();
    const onW = vi.fn();
    const { getByLabelText } = render(<Harness map={{ w: onW }} />);
    const input = getByLabelText("text-input") as HTMLInputElement;
    input.focus();
    await user.keyboard("w");
    expect(onW).not.toHaveBeenCalled();
  });

  it("supports Escape", async () => {
    const user = userEvent.setup();
    const onEsc = vi.fn();
    render(<Harness map={{ Escape: onEsc }} />);
    await user.keyboard("{Escape}");
    expect(onEsc).toHaveBeenCalledTimes(1);
  });
});
