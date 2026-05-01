// HouseClaw UI smoke test — drives the live app in a real WebView, asserts
// invariants that vitest can't see (CSS load, layout, rendered DOM, real
// click/keyboard events). Run via `bun run e2e`.
//
// Catches:
//   - CSS @import position errors (chrome.css fails to load → header invisible)
//   - Header / view bar / tool rail / panel positioning + visibility per mode
//   - Selection click → SELECTION header updates
//   - Keyboard shortcut tool switching
//   - JavaScript runtime errors / uncaught exceptions

const PORT = 5179;
const SCREEN_DIR = "/tmp/e2e-screens";

// ──────────────────── Console noise filter ────────────────────
// Three.js + WebKit headless emit benign warnings during 3D mount that we
// don't fail on. Unrelated console.error / .warn IS a real signal.
const EXPECTED_NOISE = [
  "WebGLRenderer",
  "PCFSoftShadowMap has been deprecated",
  "WebGL context could not be created",
  "Could not create a WebGL context",
  "Error creating WebGL context",
];

const errors: Array<{ type: string; msg: string }> = [];
function unexpectedErrors(): Array<{ type: string; msg: string }> {
  return errors.filter((e) => !EXPECTED_NOISE.some((n) => e.msg.includes(n)));
}

// ──────────────────── Test runner (no framework) ────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

async function step(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ✗ ${name}\n    ${msg}`);
    failed++;
    failures.push(`${name}: ${msg}`);
  }
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ──────────────────── Boot vite on dedicated port ────────────────────
console.log(`▶ booting vite on :${PORT}`);
const dev = Bun.spawn({
  cmd: ["bun", "x", "vite", "--port", String(PORT), "--strictPort"],
  cwd: import.meta.dirname + "/..",
  stdout: "pipe",
  stderr: "pipe",
});

// wait for /
let ready = false;
for (let i = 0; i < 50; i++) {
  try {
    const res = await fetch(`http://localhost:${PORT}/`);
    if (res.ok) {
      ready = true;
      break;
    }
  } catch {
    /* not ready */
  }
  await Bun.sleep(200);
}
if (!ready) {
  console.error("✗ vite did not become ready within 10s");
  dev.kill();
  process.exit(1);
}
console.log("  vite ready");

// ──────────────────── Open WebView ────────────────────
const view = new Bun.WebView({
  width: 1440,
  height: 900,
  console: (type, ...args) => {
    if (type === "error" || type === "warn") {
      errors.push({ type, msg: args.map(String).join(" ") });
    }
  },
});

async function shoot(name: string): Promise<void> {
  const blob = await view.screenshot();
  await Bun.write(`${SCREEN_DIR}/${name}.png`, blob);
}

// ──────────────────── Cases ────────────────────
console.log("\n▶ running smoke");

try {
  await view.navigate(`http://localhost:${PORT}/`);
  // Settle React mount + initial Three.js boot.
  await Bun.sleep(800);
  await shoot("01-default-3d");

  await step("loads with no unexpected console errors", async () => {
    const real = unexpectedErrors();
    assert(
      real.length === 0,
      `${real.length} unexpected error(s):\n    ${real
        .slice(0, 3)
        .map((e) => `[${e.type}] ${e.msg.slice(0, 200)}`)
        .join("\n    ")}`,
    );
  });

  await step("default mode is 3D (3D pill aria-pressed=true, 2D=false)", async () => {
    const result = (await view.evaluate(`(() => {
      const pills = Array.from(document.querySelectorAll('button.chrome-header-mode-pill'));
      const two = pills.find(b => b.textContent.trim() === '2D');
      const three = pills.find(b => b.textContent.trim() === '3D');
      return {
        twoD: two?.getAttribute('aria-pressed'),
        threeD: three?.getAttribute('aria-pressed'),
        pillCount: pills.length,
      };
    })()`)) as { twoD: string; threeD: string; pillCount: number };
    assert(result.pillCount === 2, `expected 2 mode pills, got ${result.pillCount} (header chrome may not be rendering)`);
    assert(result.threeD === "true", `3D pill aria-pressed=${result.threeD}, expected "true"`);
    assert(result.twoD === "false", `2D pill aria-pressed=${result.twoD}, expected "false"`);
  });

  await step("3D mode hides the tool rail", async () => {
    const railCount = await view.evaluate(
      `document.querySelectorAll('.chrome-icon-rail-button').length`,
    );
    assert(
      railCount === 0,
      `tool rail rendered ${railCount} buttons in 3D mode (should be 0)`,
    );
  });

  await step("clicking 2D pill switches mode + mounts tool rail + drawing surface", async () => {
    await view.evaluate(`(() => {
      const pills = Array.from(document.querySelectorAll('button.chrome-header-mode-pill'));
      pills.find(b => b.textContent.trim() === '2D')?.click();
    })()`);
    await Bun.sleep(400);
    const state = (await view.evaluate(`(() => ({
      drawingSurface: !!document.querySelector('[aria-label="2D drawing surface"]'),
      railButtons: document.querySelectorAll('.chrome-icon-rail-button').length,
      twoPressed: document.querySelector('button.chrome-header-mode-pill[aria-pressed="true"]')?.textContent.trim(),
    }))()`)) as { drawingSurface: boolean; railButtons: number; twoPressed: string };
    assert(state.drawingSurface, "DrawingSurface2D not in DOM after switching to 2D");
    assert(state.railButtons === 10, `tool rail has ${state.railButtons} buttons, expected 10`);
    assert(state.twoPressed === "2D", `active mode pill is "${state.twoPressed}", expected "2D"`);
  });

  await shoot("02-2d-plan");

  await step("一层 plan tab is active by default in 2D", async () => {
    const activeTab = await view.evaluate(
      `document.querySelector('button.chrome-viewbar-tab[aria-selected="true"]')?.textContent.trim()`,
    );
    assert(activeTab === "一层", `active view tab is "${activeTab}", expected "一层"`);
  });

  await step("clicking a wall in plan view updates SELECTION header", async () => {
    // Click first wall in the default 一层 plan view.
    const wallId = await view.evaluate(`(() => {
      const wall = document.querySelector('[data-kind="wall"]');
      if (!wall) return null;
      wall.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return wall.getAttribute('data-id');
    })()`);
    assert(wallId, "no [data-kind=wall] element in plan view");
    await Bun.sleep(300);
    const headerText = await view.evaluate(`(() => {
      const headers = Array.from(document.querySelectorAll('.chrome-accordion-header'));
      const sel = headers.find(h => h.textContent.includes('SELECTION'));
      return sel?.textContent?.trim() ?? null;
    })()`);
    assert(
      typeof headerText === "string" && headerText.includes(`WALL · ${wallId}`),
      `SELECTION header is "${headerText}", expected to include "WALL · ${wallId}"`,
    );
  });

  await shoot("04-2d-wall-selected");

  await step("立面 tab opens ElevationSideTabs with FRONT/BACK/LEFT/RIGHT", async () => {
    await view.evaluate(`(() => {
      const tabs = Array.from(document.querySelectorAll('button.chrome-viewbar-tab'));
      tabs.find(b => b.textContent.trim() === '立面')?.click();
    })()`);
    await Bun.sleep(400);
    const sideTabs = (await view.evaluate(
      `Array.from(document.querySelectorAll('.chrome-elevation-side-tabs button')).map(b => b.textContent.trim())`,
    )) as string[];
    assert(
      JSON.stringify(sideTabs) === '["FRONT","BACK","LEFT","RIGHT"]',
      `elevation side tabs: ${JSON.stringify(sideTabs)}`,
    );
  });

  await shoot("03-2d-elevation");

  // Return to plan view for remaining tests.
  await view.evaluate(`(() => {
    const tabs = Array.from(document.querySelectorAll('button.chrome-viewbar-tab'));
    tabs.find(b => b.textContent.trim() === '一层')?.click();
  })()`);
  await Bun.sleep(400);
  // Re-select the wall (selection cleared on view switch via SVG re-render).
  await view.evaluate(`(() => {
    const wall = document.querySelector('[data-kind="wall"]');
    wall?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  })()`);
  await Bun.sleep(300);

  await step("WallEditor 厚度 NumberField commits new value via blur", async () => {
    // Focus input + clear via selection so view.type() replaces it cleanly.
    // (Setting input.value directly bypasses React's value tracker — must use
    //  real native events.)
    const focused = await view.evaluate(`(() => {
      const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.trim() === '厚度');
      const input = label?.parentElement?.querySelector('input');
      if (!input) return false;
      input.focus();
      input.select();
      return true;
    })()`);
    assert(focused, "no 厚度 input");
    await view.type("0.30");
    await view.press("Tab"); // blur commits
    await Bun.sleep(300);
    const value = await view.evaluate(`(() => {
      const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.trim() === '厚度');
      return label?.parentElement?.querySelector('input')?.value;
    })()`);
    // "0.30" and "0.3" are the same number — string format depends on toFixed/toString round-trip.
    assert(
      typeof value === "string" && parseFloat(value) === 0.3,
      `厚度 input value is "${value}" after blur, expected numerically 0.3`,
    );
  });

  await step("keyboard shortcut W activates WALL tool", async () => {
    // Move focus off any text input — useGlobalShortcuts intentionally skips
    // when an INPUT/TEXTAREA/SELECT is focused. Click an empty viewport area.
    await view.evaluate(`(() => {
      if (document.activeElement && 'blur' in document.activeElement) {
        document.activeElement.blur();
      }
    })()`);
    await Bun.sleep(50);
    await view.press("w");
    await Bun.sleep(200);
    const activeTool = await view.evaluate(`(() => {
      const btn = document.querySelector('.chrome-icon-rail-button[aria-pressed="true"]');
      return btn?.getAttribute('aria-label');
    })()`);
    assert(
      activeTool === "WALL · W",
      `active tool is "${activeTool}" after pressing W, expected "WALL · W"`,
    );
  });

  await step("Esc returns active tool to SELECT", async () => {
    await view.press("Escape");
    await Bun.sleep(200);
    const activeTool = await view.evaluate(`(() => {
      const btn = document.querySelector('.chrome-icon-rail-button[aria-pressed="true"]');
      return btn?.getAttribute('aria-label');
    })()`);
    assert(
      activeTool === "SELECT · V",
      `active tool is "${activeTool}" after Escape, expected "SELECT · V"`,
    );
  });
} finally {
  view.close();
  dev.kill();
}

// ──────────────────── Report ────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
console.log(`screenshots: ${SCREEN_DIR}/{01-default-3d,02-2d-plan,03-2d-elevation,04-2d-wall-selected}.png`);
if (failed > 0) {
  console.log(`\nfailures:`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
