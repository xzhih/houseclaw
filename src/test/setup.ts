import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// AppShell auto-loads/saves to localStorage. Clear between tests so each render
// starts from the sample project, not state leaked from a previous test.
beforeEach(() => {
  try {
    globalThis.localStorage?.clear?.();
  } catch {
    // jsdom may not expose localStorage in every test config — ignore.
  }
});
