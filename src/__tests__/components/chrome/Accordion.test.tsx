import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Accordion } from "../../../components/chrome/Accordion";

describe("Accordion", () => {
  it("renders title in header", () => {
    render(
      <Accordion title="STOREYS" defaultOpen={false}>
        <div>body content</div>
      </Accordion>,
    );
    expect(screen.getByRole("button", { name: /STOREYS/ })).toBeInTheDocument();
  });

  it("toggles open on header click", async () => {
    const user = userEvent.setup();
    render(
      <Accordion title="STOREYS" defaultOpen={false}>
        <div>body content</div>
      </Accordion>,
    );
    const header = screen.getByRole("button", { name: /STOREYS/ });
    expect(header).toHaveAttribute("aria-expanded", "false");
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
  });

  it("respects defaultOpen", () => {
    render(
      <Accordion title="STOREYS" defaultOpen>
        <div>body content</div>
      </Accordion>,
    );
    expect(screen.getByRole("button", { name: /STOREYS/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("renders extra header info via headerExtra", () => {
    render(
      <Accordion title="SELECTION" headerExtra={<span>· WALL · w-1</span>}>
        <div>body</div>
      </Accordion>,
    );
    expect(screen.getByText(/· WALL · w-1/)).toBeInTheDocument();
  });
});
