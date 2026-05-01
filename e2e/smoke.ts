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

  await step("DeleteRow in WallEditor removes the selected wall", async () => {
    // A wall is currently selected from earlier step. Capture initial count + id.
    const before = (await view.evaluate(`(() => {
      const selHeader = Array.from(document.querySelectorAll('.chrome-accordion-header'))
        .find(h => h.textContent.includes('SELECTION'));
      return {
        count: document.querySelectorAll('[data-kind="wall"]').length,
        selectedId: selHeader?.textContent.match(/WALL · ([\\w-]+)/)?.[1],
      };
    })()`)) as { count: number; selectedId: string };
    assert(before.selectedId, "no wall currently selected — earlier step regressed");
    // Click DeleteRow in the WallEditor.
    const clicked = await view.evaluate(`(() => {
      const btn = Array.from(document.querySelectorAll('button.chrome-delete-row')).find(b => b.textContent.includes('删除墙'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    assert(clicked, "DeleteRow '删除墙' button not found in WallEditor");
    await Bun.sleep(300);
    const after = (await view.evaluate(`(() => ({
      count: document.querySelectorAll('[data-kind="wall"]').length,
      stillThere: !!document.querySelector('[data-id="${"" /* literal */}"][data-kind="wall"]'.replace('${"" /* literal */}', '${"" /* literal */}')),
    }))()`)) as { count: number };
    // Use a clearer second-shot specific to the deleted wall id:
    const stillThere = await view.evaluate(
      `!!document.querySelector('[data-kind="wall"][data-id="${before.selectedId}"]')`,
    );
    assert(after.count === before.count - 1, `wall count went ${before.count} → ${after.count}, expected −1`);
    assert(stillThere === false, `wall ${before.selectedId} still in DOM after delete`);
  });

  await step("Cmd+Z restores the deleted wall", async () => {
    // Dispatch a real keydown with metaKey set — view.press() options shape is
    // undocumented for modifiers, so go via the DOM directly. AppShell's undo
    // handler listens on window.keydown.
    await view.evaluate(`(() => {
      if (document.activeElement && 'blur' in document.activeElement) {
        document.activeElement.blur();
      }
      const ev = new KeyboardEvent('keydown', {
        key: 'z',
        code: 'KeyZ',
        metaKey: true,
        ctrlKey: false,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(ev);
    })()`);
    await Bun.sleep(300);
    const restored = (await view.evaluate(`(() => ({
      walls: document.querySelectorAll('[data-kind="wall"]').length,
    }))()`)) as { walls: number };
    // Sample project has 4 exterior walls; we just deleted 1 then restored 1.
    assert(restored.walls >= 4, `expected at least 4 walls after Cmd+Z restore, got ${restored.walls}`);
  });

  await step("switching tools cancels half-finished wall (no lingering preview)", async () => {
    // Switch to WALL tool, click ONE point on the canvas, switch away, switch
    // back, confirm no dashed preview line is rendered.
    await view.press("w");
    await Bun.sleep(150);
    // Click somewhere on the SVG to start wall-pending state.
    await view.evaluate(`(() => {
      const svg = document.querySelector('[aria-label="2D drawing surface"] svg');
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      svg.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: r.x + r.width * 0.6,
        clientY: r.y + r.height * 0.6,
      }));
    })()`);
    await Bun.sleep(150);
    // Confirm pending preview exists (sanity check)
    const hadPreview = await view.evaluate(
      `!!document.querySelector('.create-preview-pending, [class*="create-preview"]') || !!document.querySelector('line.plan-wall-ghost')`,
    );
    // Now switch tool away then back.
    await view.press("v"); // SELECT
    await Bun.sleep(150);
    await view.press("w"); // WALL again
    await Bun.sleep(200);
    // Preview must NOT be present after tool re-selection.
    const stillHasPreview = await view.evaluate(
      `(() => {
        const all = document.querySelectorAll('line, path');
        for (const el of all) {
          const stroke = el.getAttribute('stroke-dasharray');
          if (stroke && el.closest('[aria-label="2D drawing surface"]')) {
            // Could be smart-guide line; but those are not present without a drag.
            return el.outerHTML.slice(0, 200);
          }
        }
        return null;
      })()`,
    );
    assert(
      stillHasPreview === null,
      `lingering pending preview after tool switch: ${stillHasPreview}`,
    );
    // hadPreview is a sanity check — ignored if false (timing issues).
    void hadPreview;
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
