import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "../App";

const SURFACE_WIDTH = 720;
const SURFACE_HEIGHT = 520;

function stubSvgGeometry() {
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;
  const originalGetScreenCTM = (SVGGraphicsElement.prototype as { getScreenCTM?: unknown }).getScreenCTM;

  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: SURFACE_WIDTH,
      bottom: SURFACE_HEIGHT,
      width: SURFACE_WIDTH,
      height: SURFACE_HEIGHT,
      toJSON() {
        return {};
      },
    } as DOMRect;
  };

  (SVGGraphicsElement.prototype as { getScreenCTM?: unknown }).getScreenCTM = function getScreenCTM() {
    return null;
  };

  return () => {
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    if (originalGetScreenCTM === undefined) {
      delete (SVGGraphicsElement.prototype as { getScreenCTM?: unknown }).getScreenCTM;
    } else {
      (SVGGraphicsElement.prototype as { getScreenCTM?: unknown }).getScreenCTM = originalGetScreenCTM;
    }
  };
}

describe("Wall drawing tool", () => {
  let restoreGeometry: () => void;

  beforeEach(() => {
    restoreGeometry = stubSvgGeometry();
  });

  afterEach(() => {
    restoreGeometry();
  });

  it("adds a new wall after two clicks while the wall tool is active", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "墙" }));

    const surface = screen.getByRole("group", { name: "当前 2D 结构视图" });
    fireEvent.pointerDown(surface, { clientX: 120, clientY: 460 });
    fireEvent.pointerDown(surface, { clientX: 280, clientY: 460 });

    expect(screen.getByRole("button", { name: "选择墙 wall-1f-1" })).toBeInTheDocument();
  });

  it("cancels the pending wall when the user presses Escape", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "墙" }));

    const surface = screen.getByRole("group", { name: "当前 2D 结构视图" });
    fireEvent.pointerDown(surface, { clientX: 120, clientY: 460 });

    surface.focus();
    await user.keyboard("{Escape}");

    fireEvent.pointerDown(surface, { clientX: 280, clientY: 460 });

    expect(screen.queryByRole("button", { name: "选择墙 wall-1f-1" })).not.toBeInTheDocument();
  });

  it("ignores wall-tool clicks in elevation views", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "墙" }));
    await user.click(screen.getByRole("button", { name: "正面" }));

    const surface = screen.getByRole("group", { name: "当前 2D 结构视图" });
    fireEvent.pointerDown(surface, { clientX: 120, clientY: 260 });
    fireEvent.pointerDown(surface, { clientX: 280, clientY: 260 });

    expect(screen.queryByRole("button", { name: /选择墙 wall-1f-1/ })).not.toBeInTheDocument();
  });

  it("does not select existing walls when wall tool is active", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "墙" }));

    const existing = screen.getByRole("button", { name: "选择墙 wall-front-1f" });
    await user.click(existing);

    expect(existing).toHaveAttribute("aria-pressed", "false");
  });
});
