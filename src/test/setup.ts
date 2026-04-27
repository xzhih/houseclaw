import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// jsdom doesn't implement pointer-capture APIs; stub them so drag handlers
// that route through setPointerCapture/releasePointerCapture don't blow up.
type PointerCapableElement = Element & {
  setPointerCapture: (id: number) => void;
  releasePointerCapture: (id: number) => void;
  hasPointerCapture: (id: number) => boolean;
};
const elementProto = (globalThis as unknown as { Element?: typeof Element }).Element?.prototype as
  | PointerCapableElement
  | undefined;
if (elementProto) {
  if (typeof elementProto.setPointerCapture !== "function") {
    elementProto.setPointerCapture = () => {};
  }
  if (typeof elementProto.releasePointerCapture !== "function") {
    elementProto.releasePointerCapture = () => {};
  }
  if (typeof elementProto.hasPointerCapture !== "function") {
    elementProto.hasPointerCapture = () => false;
  }
}

// AppShell auto-loads/saves to localStorage. Clear between tests so each render
// starts from the sample project, not state leaked from a previous test.
beforeEach(() => {
  try {
    globalThis.localStorage?.clear?.();
  } catch {
    // jsdom may not expose localStorage in every test config — ignore.
  }
});
