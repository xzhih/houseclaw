import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IconRailButton } from "../../../components/chrome/IconRailButton";
import { SelectIcon } from "../../../components/chrome/icons";

describe("IconRailButton", () => {
  it("renders icon and tooltip text with shortcut", () => {
    render(
      <IconRailButton label="SELECT" shortcut="V" active={false} onClick={() => {}}>
        <SelectIcon />
      </IconRailButton>,
    );
    expect(screen.getByRole("button", { name: /SELECT.*V/ })).toBeInTheDocument();
  });

  it("reflects active state via aria-pressed", () => {
    render(
      <IconRailButton label="WALL" shortcut="W" active onClick={() => {}}>
        <SelectIcon />
      </IconRailButton>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("fires onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <IconRailButton label="WALL" shortcut="W" active={false} onClick={onClick}>
        <SelectIcon />
      </IconRailButton>,
    );
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
