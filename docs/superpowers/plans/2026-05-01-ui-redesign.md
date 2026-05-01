# UI 全面重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 v1 残留 + v2 hotfix 拼凑的 UI 替换为 make3d 风格的暗 chrome + 浅画布工作台（暗顶栏 + 左 icon rail + 右 Accordion 多展开面板 + 画布上的反馈 chip）。

**Architecture:** 新增 `src/components/chrome/` 目录承载所有原子（Accordion / SliderRow / ToggleRow / SelectRow / IconRailButton / ContextChip / DragReadoutChip / 自绘 icon / 全局快捷键 hook）。AppShell / ToolPalette / PropertyPanel / ViewTabs / 6 个 entity editor 全部重写。CSS 拆出 token 文件 + 重写 v2-相关规则；旧 v1 规则在所有组件迁移后统一删除。dragMachineV2 / useCreateHandlers / projection / 几何 / reducer 完全不动。

**Tech Stack:** React 19 · TypeScript · Vite · plain CSS（CSS variables，不引入 Tailwind） · `lucide-react` 图标库 · JetBrains Mono Google Font

**Spec:** `docs/superpowers/specs/2026-05-01-ui-redesign-design.md`

---

## File Structure

### New files
- `src/styles/tokens.css` — color + typography CSS variables
- `src/styles/chrome.css` — accordion / icon-rail / chip / panel section / form atoms 样式
- `src/components/chrome/Accordion.tsx` — section 容器（header + animated body）
- `src/components/chrome/SliderRow.tsx` — slider 输入原子
- `src/components/chrome/ToggleRow.tsx` — toggle 输入原子
- `src/components/chrome/SelectRow.tsx` — pill-button 选择原子
- `src/components/chrome/IconRailButton.tsx` — 工具按钮（icon + tooltip + active 状态）
- `src/components/chrome/ContextChip.tsx` — 画布底部居中浮 chip
- `src/components/chrome/DragReadoutChip.tsx` — 画布右下拖拽数值 chip
- `src/components/chrome/icons.tsx` — 自绘 wall / window / opening / stair icon + lucide re-exports
- `src/components/chrome/useGlobalShortcuts.ts` — 全局键盘快捷键 hook
- `src/components/PropertyPanel/StoreysSection.tsx` — 楼层 section
- `src/components/PropertyPanel/SelectionSection.tsx` — 选中对象 section
- `src/components/PropertyPanel/MaterialsSection.tsx` — 材质库 section（占位）
- `src/components/PropertyPanel/ExportSection.tsx` — 导出 section（占位）
- `src/components/PropertyPanel/ProjectSection.tsx` — 项目元数据 section
- `src/__tests__/components/chrome/Accordion.test.tsx`
- `src/__tests__/components/chrome/IconRailButton.test.tsx`
- `src/__tests__/components/chrome/useGlobalShortcuts.test.tsx`

### Modified files
- `index.html` — 引入 JetBrains Mono web font
- `package.json` — 加 `lucide-react` 依赖
- `src/styles.css` — 引入 tokens + chrome 文件，重写 v2 相关规则；旧 v1 规则在最后一个 task 删除
- `src/components/AppShell.tsx` — 重写：顶栏 + 视图条 + 左 rail + main + Accordion
- `src/components/ToolPalette.tsx` — 重写为 IconRailButton 列
- `src/components/PropertyPanel.tsx` — 重写为 Accordion 容器，组合 5 个 Section
- `src/components/ViewTabs.tsx` — 新视觉 + 加 3D tab
- `src/components/ElevationSideTabs.tsx` — 新视觉
- `src/components/StoreysEditor.tsx` — 紧凑 list（移入 StoreysSection）
- `src/components/editors/WallEditor.tsx` — 内部控件换 SliderRow / ToggleRow / SelectRow
- `src/components/editors/OpeningEditor.tsx` — 同上
- `src/components/editors/BalconyEditor.tsx` — 同上
- `src/components/editors/SlabEditor.tsx` — 同上
- `src/components/editors/RoofEditor.tsx` — 同上
- `src/components/editors/StairEditor.tsx` — 同上
- `src/components/editors/AnchorPicker.tsx` — 改皮肤
- `src/components/editors/MaterialPicker.tsx` — 改皮肤
- `src/components/NumberField.tsx` — 改皮肤
- `src/components/DrawingSurface2D.tsx` — 接 DragReadoutChip + ContextChip
- `src/components/canvas/renderPlan.tsx` — 选中/hover 改"亮底反向"样式（CSS class 切换，不动逻辑）
- `src/components/canvas/renderElevation.tsx` — 同上
- `src/__tests__/ui.test.tsx` — selector 跟新文案
- `src/__tests__/propertyEditing.test.tsx` — selector 跟新文案

---

## Task 1: Foundation — 字体 + 依赖 + token CSS

**Files:**
- Modify: `package.json`
- Modify: `src/main.tsx`
- Create: `src/styles/tokens.css`
- Modify: `src/styles.css`

- [ ] **Step 1: 安装 lucide-react + 本地字体包**

```bash
bun add lucide-react @fontsource/inter @fontsource/jetbrains-mono
```

Expected: `package.json` 出现三个新依赖；`bun.lockb` 更新。`@fontsource/*` 把 woff2 字体文件打到 `node_modules/`，import 时被 vite 编译进 bundle，无外部 CDN 请求。

- [ ] **Step 2: 在 main.tsx 顶部 import 字体 css**

打开 `src/main.tsx`，在最上方（其它 import 之前）加：

```ts
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
```

不修改 `index.html`（不再走 CDN）。

- [ ] **Step 3: 创建 tokens.css**

```css
/* src/styles/tokens.css */
:root {
  --bg-canvas: #fafafa;
  --bg-chrome: #000000;
  --bg-chrome-2: rgba(255, 255, 255, 0.04);

  --border-soft: rgba(255, 255, 255, 0.07);
  --border-mid: rgba(255, 255, 255, 0.12);
  --border-strong: rgba(255, 255, 255, 0.22);

  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.65);
  --text-muted: rgba(255, 255, 255, 0.45);
  --text-disabled: rgba(255, 255, 255, 0.25);

  --canvas-stroke-default: #1f1f1f;
  --canvas-stroke-hover: #000000;
  --canvas-stroke-selected: #000000;
  --canvas-ghost-shadow: rgba(0, 0, 0, 0.08);

  --glow-active: 0 0 12px rgba(255, 255, 255, 0.25);
  --glow-strong: 0 0 8px rgba(255, 255, 255, 0.6),
                 0 0 16px rgba(255, 255, 255, 0.2);

  --header-h: 40px;
  --viewbar-h: 36px;
  --rail-w: 48px;
  --panel-w: 320px;

  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
}

.mono-label {
  font-family: var(--font-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.mono-num {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
}
```

- [ ] **Step 4: 在 styles.css 顶部 import tokens**

修改 `src/styles.css` 第 1 行（在现有 `:root {` 之前插入）：

```css
@import "./styles/tokens.css";
```

不要删除现有的 v1 `:root` 规则（在 Task 14 整体清理）。

- [ ] **Step 5: 验证字体 + token 加载**

```bash
bun run build 2>&1 | tail -5
```

Expected: build 成功（不应出现 token import 失败）。

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lockb src/main.tsx src/styles/tokens.css src/styles.css
git commit -m "feat(chrome): 引入 lucide-react + 本地字体包 (@fontsource) + design tokens"
```

---

## Task 2: chrome 原子样式 + Accordion 组件

**Files:**
- Create: `src/styles/chrome.css`
- Create: `src/components/chrome/Accordion.tsx`
- Create: `src/__tests__/components/chrome/Accordion.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: 创建 chrome.css 骨架**

```css
/* src/styles/chrome.css */

/* === Accordion === */
.chrome-accordion-section {
  border-bottom: 1px solid var(--border-soft);
}
.chrome-accordion-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 12px 16px;
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 200ms, color 200ms;
}
.chrome-accordion-header:hover {
  background: var(--bg-chrome-2);
  color: var(--text-primary);
}
.chrome-accordion-header[aria-expanded="true"] {
  color: var(--text-primary);
}
.chrome-accordion-chevron {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  transition: transform 300ms;
}
.chrome-accordion-header[aria-expanded="true"] .chrome-accordion-chevron {
  transform: rotate(180deg);
  color: var(--text-secondary);
}
.chrome-accordion-body {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 300ms ease-out;
}
.chrome-accordion-body[data-open="true"] {
  grid-template-rows: 1fr;
}
.chrome-accordion-body-inner {
  overflow: hidden;
}
.chrome-accordion-body-content {
  padding: 4px 16px 12px;
}
```

- [ ] **Step 2: 在 styles.css 末尾 import chrome.css**

```css
@import "./styles/chrome.css";
```

- [ ] **Step 3: 写失败测试 Accordion**

`src/__tests__/components/chrome/Accordion.test.tsx`：

```tsx
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
```

- [ ] **Step 4: 运行测试验证失败**

```bash
bun run vitest run src/__tests__/components/chrome/Accordion.test.tsx
```

Expected: 测试失败（Accordion 模块不存在）。

- [ ] **Step 5: 实现 Accordion**

`src/components/chrome/Accordion.tsx`：

```tsx
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type AccordionProps = {
  title: string;
  defaultOpen?: boolean;
  headerExtra?: ReactNode;
  children: ReactNode;
};

export function Accordion({ title, defaultOpen = false, headerExtra, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="chrome-accordion-section">
      <button
        type="button"
        className="chrome-accordion-header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {title}
          {headerExtra}
        </span>
        <ChevronDown className="chrome-accordion-chevron" aria-hidden />
      </button>
      <div className="chrome-accordion-body" data-open={open}>
        <div className="chrome-accordion-body-inner">
          <div className="chrome-accordion-body-content">{children}</div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: 运行测试验证通过**

```bash
bun run vitest run src/__tests__/components/chrome/Accordion.test.tsx
```

Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add src/styles/chrome.css src/styles.css src/components/chrome/Accordion.tsx src/__tests__/components/chrome/Accordion.test.tsx
git commit -m "feat(chrome): Accordion 组件 + chrome.css 骨架"
```

---

## Task 3: 表单原子 — SliderRow / ToggleRow / SelectRow

**Files:**
- Create: `src/components/chrome/SliderRow.tsx`
- Create: `src/components/chrome/ToggleRow.tsx`
- Create: `src/components/chrome/SelectRow.tsx`
- Modify: `src/styles/chrome.css`

- [ ] **Step 1: 在 chrome.css 追加表单原子样式**

```css
/* === SliderRow === */
.chrome-slider-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}
.chrome-slider-row-label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.chrome-slider-row-control {
  display: flex;
  align-items: center;
  gap: 12px;
}
.chrome-slider-row input[type="range"] {
  -webkit-appearance: none;
  appearance: none;
  width: 112px;
  height: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  cursor: pointer;
}
.chrome-slider-row input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.6), 0 0 16px rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: box-shadow 200ms;
}
.chrome-slider-row input[type="range"]::-webkit-slider-thumb:hover {
  box-shadow: 0 0 12px rgba(255, 255, 255, 0.9), 0 0 24px rgba(255, 255, 255, 0.35);
}
.chrome-slider-row input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: 0;
  border-radius: 50%;
  background: #fff;
}
.chrome-slider-row-value {
  width: 48px;
  text-align: right;
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-size: 12px;
  color: var(--text-secondary);
}

/* === ToggleRow === */
.chrome-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}
.chrome-toggle-row-label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.chrome-toggle {
  position: relative;
  width: 36px;
  height: 20px;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.15);
  cursor: pointer;
  transition: background 300ms, box-shadow 300ms;
}
.chrome-toggle[aria-pressed="true"] {
  background: #fff;
  box-shadow: 0 0 14px rgba(255, 255, 255, 0.45),
              0 0 4px rgba(255, 255, 255, 0.7);
}
.chrome-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.4);
  transition: left 300ms, background 300ms;
}
.chrome-toggle[aria-pressed="true"] .chrome-toggle-thumb {
  left: 19px;
  background: #000;
}

/* === SelectRow === */
.chrome-select-row {
  padding: 8px 0;
}
.chrome-select-row-label {
  display: block;
  margin-bottom: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.chrome-select-row-options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chrome-select-pill {
  padding: 6px 10px;
  border: 1px solid var(--border-mid);
  border-radius: 3px;
  background: var(--bg-chrome-2);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color 200ms, background 200ms, color 200ms, box-shadow 200ms;
}
.chrome-select-pill:hover {
  border-color: var(--border-strong);
  background: rgba(255, 255, 255, 0.09);
  color: rgba(255, 255, 255, 0.8);
}
.chrome-select-pill[aria-pressed="true"] {
  background: #fff;
  color: #000;
  box-shadow: var(--glow-active);
  border-color: transparent;
}
```

- [ ] **Step 2: 实现 SliderRow**

`src/components/chrome/SliderRow.tsx`：

```tsx
type SliderRowProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
};

export function SliderRow({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
}: SliderRowProps) {
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return (
    <div className="chrome-slider-row">
      <span className="chrome-slider-row-label">{label}</span>
      <div className="chrome-slider-row-control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={label}
        />
        <span className="chrome-slider-row-value">{value.toFixed(decimals)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 实现 ToggleRow**

`src/components/chrome/ToggleRow.tsx`：

```tsx
type ToggleRowProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
};

export function ToggleRow({ label, value, onChange }: ToggleRowProps) {
  return (
    <div className="chrome-toggle-row">
      <span className="chrome-toggle-row-label">{label}</span>
      <button
        type="button"
        className="chrome-toggle"
        aria-pressed={value}
        aria-label={label}
        onClick={() => onChange(!value)}
      >
        <span className="chrome-toggle-thumb" aria-hidden />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 实现 SelectRow**

`src/components/chrome/SelectRow.tsx`：

```tsx
type Option<T extends string> = { value: T; label: string };

type SelectRowProps<T extends string> = {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
};

export function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectRowProps<T>) {
  return (
    <div className="chrome-select-row">
      <span className="chrome-select-row-label">{label}</span>
      <div className="chrome-select-row-options" role="radiogroup" aria-label={label}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className="chrome-select-pill"
            aria-pressed={value === opt.value}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 验证 typecheck 过**

```bash
bun run tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/styles/chrome.css src/components/chrome/SliderRow.tsx src/components/chrome/ToggleRow.tsx src/components/chrome/SelectRow.tsx
git commit -m "feat(chrome): SliderRow + ToggleRow + SelectRow 表单原子"
```

---

## Task 4: 自绘 icon + IconRailButton

**Files:**
- Create: `src/components/chrome/icons.tsx`
- Create: `src/components/chrome/IconRailButton.tsx`
- Create: `src/__tests__/components/chrome/IconRailButton.test.tsx`
- Modify: `src/styles/chrome.css`

- [ ] **Step 1: 实现自绘 icon + 集中导出 lucide icon**

`src/components/chrome/icons.tsx`：

```tsx
import {
  MousePointer2,
  DoorOpen,
  RectangleHorizontal,
  Layers,
  Triangle,
  Palette,
} from "lucide-react";
import type { SVGProps } from "react";

export const SelectIcon = MousePointer2;
export const DoorIcon = DoorOpen;
export const BalconyIcon = RectangleHorizontal;
export const SlabIcon = Layers;
export const RoofIcon = Triangle;
export const MaterialIcon = Palette;

export function WallIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round" strokeWidth={3} />
    </svg>
  );
}

export function WindowIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
      <line x1="12" y1="4" x2="12" y2="20" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

export function OpeningIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeDasharray="3 3" {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1" />
    </svg>
  );
}

export function StairIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" {...props}>
      <polyline points="4 20 4 16 9 16 9 12 14 12 14 8 19 8 19 4" />
    </svg>
  );
}
```

- [ ] **Step 2: 在 chrome.css 追加 IconRail 样式**

```css
/* === IconRail === */
.chrome-icon-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: var(--rail-w);
  background: var(--bg-chrome);
  border-right: 1px solid var(--border-soft);
  padding: 8px 0;
  gap: 4px;
}
.chrome-icon-rail-divider {
  width: 24px;
  height: 1px;
  margin: 4px 0;
  background: var(--border-soft);
}
.chrome-icon-rail-button {
  position: relative;
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 200ms, color 200ms, box-shadow 200ms;
}
.chrome-icon-rail-button svg {
  width: 18px;
  height: 18px;
}
.chrome-icon-rail-button:hover {
  background: var(--bg-chrome-2);
  color: rgba(255, 255, 255, 0.8);
}
.chrome-icon-rail-button[aria-pressed="true"] {
  background: #fff;
  color: #000;
  box-shadow: var(--glow-active);
}
.chrome-icon-rail-tooltip {
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  padding: 4px 8px;
  background: #0a0a0c;
  border: 1px solid var(--border-mid);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-secondary);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 200ms 800ms;
  z-index: 50;
}
.chrome-icon-rail-button:hover .chrome-icon-rail-tooltip {
  opacity: 1;
}
```

- [ ] **Step 3: 写 IconRailButton 测试**

`src/__tests__/components/chrome/IconRailButton.test.tsx`：

```tsx
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
```

- [ ] **Step 4: 运行测试验证失败**

```bash
bun run vitest run src/__tests__/components/chrome/IconRailButton.test.tsx
```

Expected: failed (IconRailButton 不存在).

- [ ] **Step 5: 实现 IconRailButton**

`src/components/chrome/IconRailButton.tsx`：

```tsx
import type { ReactNode } from "react";

type IconRailButtonProps = {
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
};

export function IconRailButton({ label, shortcut, active, onClick, children }: IconRailButtonProps) {
  return (
    <button
      type="button"
      className="chrome-icon-rail-button"
      aria-pressed={active}
      aria-label={`${label} · ${shortcut}`}
      onClick={onClick}
    >
      {children}
      <span className="chrome-icon-rail-tooltip" aria-hidden>
        {label} · {shortcut}
      </span>
    </button>
  );
}
```

- [ ] **Step 6: 验证测试通过**

```bash
bun run vitest run src/__tests__/components/chrome/IconRailButton.test.tsx
```

Expected: 3 passed.

- [ ] **Step 7: Commit**

```bash
git add src/components/chrome/icons.tsx src/components/chrome/IconRailButton.tsx src/__tests__/components/chrome/IconRailButton.test.tsx src/styles/chrome.css
git commit -m "feat(chrome): icons + IconRailButton（10 工具图标 + tooltip + active glow）"
```

---

## Task 5: ContextChip + DragReadoutChip

**Files:**
- Create: `src/components/chrome/ContextChip.tsx`
- Create: `src/components/chrome/DragReadoutChip.tsx`
- Modify: `src/styles/chrome.css`

- [ ] **Step 1: 在 chrome.css 追加 chip 样式**

```css
/* === Canvas chips (overlay on light canvas) === */
.chrome-context-chip {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 14px;
  background: var(--bg-chrome);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  box-shadow: var(--glow-active);
  pointer-events: auto;
  user-select: none;
  z-index: 30;
}
.chrome-context-chip-action {
  margin-left: 8px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid var(--border-mid);
  border-radius: 2px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
  transition: background 150ms;
}
.chrome-context-chip-action:hover {
  background: rgba(255, 255, 255, 0.2);
}

.chrome-readout-chip {
  position: absolute;
  bottom: 24px;
  right: 24px;
  min-width: 180px;
  padding: 10px 14px;
  background: var(--bg-chrome);
  border: 1px solid var(--border-mid);
  border-radius: 4px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  pointer-events: none;
  opacity: 0;
  transition: opacity 400ms;
  z-index: 30;
}
.chrome-readout-chip[data-visible="true"] {
  opacity: 1;
  transition: opacity 0ms;
}
.chrome-readout-chip-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}
.chrome-readout-chip-key {
  color: var(--text-muted);
}
.chrome-readout-chip-value {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.chrome-readout-chip-divider {
  height: 1px;
  margin: 6px 0;
  background: var(--border-soft);
}
```

- [ ] **Step 2: 实现 ContextChip**

`src/components/chrome/ContextChip.tsx`：

```tsx
import type { ReactNode } from "react";

type ContextChipProps = {
  /** Chip body — typically the prompt + an inline action button. */
  children: ReactNode;
};

export function ContextChip({ children }: ContextChipProps) {
  return <div className="chrome-context-chip">{children}</div>;
}

type ContextChipActionProps = {
  onClick: () => void;
  children: ReactNode;
};

export function ContextChipAction({ onClick, children }: ContextChipActionProps) {
  return (
    <button type="button" className="chrome-context-chip-action" onClick={onClick}>
      {children}
    </button>
  );
}
```

- [ ] **Step 3: 实现 DragReadoutChip**

`src/components/chrome/DragReadoutChip.tsx`：

```tsx
import type { DragReadout } from "../canvas/types";

type DragReadoutChipProps = {
  readout: DragReadout | null;
  /** When true the chip stays visible; when false fades out (parent owns timer). */
  visible: boolean;
};

function fmt(value: number): string {
  return value.toFixed(2);
}

function rowsFor(readout: DragReadout): Array<[string, string]> {
  switch (readout.kind) {
    case "wall-translate":
      return [["Δx", `${fmt(readout.dx)}m`], ["Δy", `${fmt(readout.dy)}m`]];
    case "wall-endpoint":
      return [["LENGTH", `${fmt(readout.length)}m`]];
    case "opening":
      return [["OFFSET", `${fmt(readout.offset)}m`]];
    case "balcony":
      return [["OFFSET", `${fmt(readout.offset)}m`]];
    case "plan-opening-resize":
      return [["WIDTH", `${fmt(readout.width)}m`]];
    case "plan-balcony-resize":
      return [["WIDTH", `${fmt(readout.width)}m`]];
    case "elev-opening-move":
      return [["OFFSET", `${fmt(readout.offset)}m`], ["SILL", `${fmt(readout.sill)}m`]];
    case "elev-opening-resize":
      return [["WIDTH", `${fmt(readout.width)}m`], ["HEIGHT", `${fmt(readout.height)}m`]];
    case "elev-balcony-move":
      return [["OFFSET", `${fmt(readout.offset)}m`]];
    case "elev-balcony-resize":
      return [["WIDTH", `${fmt(readout.width)}m`]];
    case "stair-resize":
      return [["WIDTH", `${fmt(readout.width)}m`], ["DEPTH", `${fmt(readout.depth)}m`]];
    case "stair-rotate":
      return [["ROTATION", `${readout.angleDeg.toFixed(1)}°`]];
    case "elev-storey-translate":
      return [["Δy", `${fmt(readout.dy)}m`]];
  }
}

export function DragReadoutChip({ readout, visible }: DragReadoutChipProps) {
  if (!readout) return null;
  const rows = rowsFor(readout);
  return (
    <div className="chrome-readout-chip" data-visible={visible}>
      {rows.map(([k, v], i) => (
        <div key={k} className="chrome-readout-chip-row">
          <span className="chrome-readout-chip-key">{k}</span>
          <span className="chrome-readout-chip-value">{v}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 验证 typecheck**

```bash
bun run tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/styles/chrome.css src/components/chrome/ContextChip.tsx src/components/chrome/DragReadoutChip.tsx
git commit -m "feat(chrome): ContextChip + DragReadoutChip（画布浮层）"
```

---

## Task 6: 全局快捷键 hook

**Files:**
- Create: `src/components/chrome/useGlobalShortcuts.ts`
- Create: `src/__tests__/components/chrome/useGlobalShortcuts.test.tsx`

- [ ] **Step 1: 写测试**

`src/__tests__/components/chrome/useGlobalShortcuts.test.tsx`：

```tsx
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
```

- [ ] **Step 2: 运行测试验证失败**

```bash
bun run vitest run src/__tests__/components/chrome/useGlobalShortcuts.test.tsx
```

Expected: failed (module not found).

- [ ] **Step 3: 实现 hook**

`src/components/chrome/useGlobalShortcuts.ts`：

```ts
import { useEffect } from "react";

type ShortcutMap = Record<string, () => void>;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useGlobalShortcuts(map: ShortcutMap): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      const key = event.key;
      // Try the literal key first (handles Escape, ?, etc.)
      if (map[key]) {
        event.preventDefault();
        map[key]();
        return;
      }
      // Then case-insensitive single-letter
      const lower = key.toLowerCase();
      if (lower !== key && map[lower]) {
        event.preventDefault();
        map[lower]();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map]);
}
```

- [ ] **Step 4: 验证测试通过**

```bash
bun run vitest run src/__tests__/components/chrome/useGlobalShortcuts.test.tsx
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/chrome/useGlobalShortcuts.ts src/__tests__/components/chrome/useGlobalShortcuts.test.tsx
git commit -m "feat(chrome): useGlobalShortcuts hook（input focus 时跳过）"
```

---

## Task 7: 重写 ToolPalette 用 IconRailButton

**Files:**
- Modify: `src/components/ToolPalette.tsx`

- [ ] **Step 1: 用新原子重写 ToolPalette**

完整覆盖 `src/components/ToolPalette.tsx`：

```tsx
import type { ProjectActionV2, ProjectStateV2 } from "../app/v2/projectReducer";
import { IconRailButton } from "./chrome/IconRailButton";
import { useGlobalShortcuts } from "./chrome/useGlobalShortcuts";
import {
  SelectIcon,
  WallIcon,
  DoorIcon,
  WindowIcon,
  OpeningIcon,
  BalconyIcon,
  StairIcon,
  SlabIcon,
  RoofIcon,
  MaterialIcon,
} from "./chrome/icons";

type ToolDef = {
  id: string;
  label: string;
  shortcut: string;
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement;
};

const SELECT_TOOLS: ToolDef[] = [
  { id: "select", label: "SELECT", shortcut: "V", Icon: SelectIcon },
];
const DRAW_TOOLS: ToolDef[] = [
  { id: "wall", label: "WALL", shortcut: "W", Icon: WallIcon },
  { id: "door", label: "DOOR", shortcut: "D", Icon: DoorIcon },
  { id: "window", label: "WINDOW", shortcut: "N", Icon: WindowIcon },
  { id: "opening", label: "OPENING", shortcut: "O", Icon: OpeningIcon },
  { id: "balcony", label: "BALCONY", shortcut: "B", Icon: BalconyIcon },
  { id: "stair", label: "STAIR", shortcut: "S", Icon: StairIcon },
];
const STRUCT_TOOLS: ToolDef[] = [
  { id: "slab", label: "SLAB", shortcut: "F", Icon: SlabIcon },
  { id: "roof", label: "ROOF", shortcut: "R", Icon: RoofIcon },
  { id: "material", label: "MATERIAL", shortcut: "M", Icon: MaterialIcon },
];

type ToolPaletteProps = {
  project: ProjectStateV2;
  activeTool: string;
  onChange: (toolId: string) => void;
  dispatch: (action: ProjectActionV2) => void;
};

export function ToolPalette({ activeTool, onChange }: ToolPaletteProps) {
  const allTools = [...SELECT_TOOLS, ...DRAW_TOOLS, ...STRUCT_TOOLS];

  const shortcutMap: Record<string, () => void> = {
    Escape: () => onChange("select"),
  };
  for (const tool of allTools) {
    shortcutMap[tool.shortcut.toLowerCase()] = () => onChange(tool.id);
  }
  useGlobalShortcuts(shortcutMap);

  const renderGroup = (group: ToolDef[]) =>
    group.map((tool) => (
      <IconRailButton
        key={tool.id}
        label={tool.label}
        shortcut={tool.shortcut}
        active={activeTool === tool.id}
        onClick={() => onChange(tool.id)}
      >
        <tool.Icon />
      </IconRailButton>
    ));

  return (
    <div className="chrome-icon-rail" role="toolbar" aria-label="工具">
      {renderGroup(SELECT_TOOLS)}
      <div className="chrome-icon-rail-divider" aria-hidden />
      {renderGroup(DRAW_TOOLS)}
      <div className="chrome-icon-rail-divider" aria-hidden />
      {renderGroup(STRUCT_TOOLS)}
    </div>
  );
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
bun run tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: 跑全部 test，确认 useCreateHandlers / dragMachineV2 / propertyEditing 等不受影响**

```bash
bun run vitest run
```

Expected: 仍然 557 passed.（ui.test 此时 selector 可能错；如果 ui.test 失败 → Task 13 修复，本任务先继续）。

- [ ] **Step 4: Commit**

```bash
git add src/components/ToolPalette.tsx
git commit -m "feat(toolpalette): 重写为 IconRail（10 icon + 快捷键 + Esc 退选择）"
```

---

## Task 8: AppShell 重写（顶栏 + 视图条 + 主体网格）

**Files:**
- Modify: `src/components/AppShell.tsx`
- Modify: `src/styles/chrome.css`

- [ ] **Step 1: 在 chrome.css 追加 AppShell 样式**

```css
/* === AppShell layout === */
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: var(--bg-chrome);
  color: var(--text-primary);
  font-family: var(--font-sans);
}
.chrome-header {
  display: flex;
  align-items: center;
  height: var(--header-h);
  padding: 0 16px;
  background: var(--bg-chrome);
  border-bottom: 1px solid var(--border-soft);
  gap: 16px;
}
.chrome-header-logo {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-primary);
}
.chrome-header-divider {
  width: 1px;
  height: 16px;
  background: var(--border-mid);
}
.chrome-header-project {
  font-family: var(--font-sans);
  font-size: 13px;
  color: var(--text-secondary);
}
.chrome-header-spacer {
  flex: 1;
}
.chrome-header-mode {
  display: flex;
  gap: 4px;
}
.chrome-header-mode-pill {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border-mid);
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  cursor: pointer;
  transition: background 200ms, color 200ms, box-shadow 200ms;
}
.chrome-header-mode-pill:hover {
  color: var(--text-primary);
  background: var(--bg-chrome-2);
}
.chrome-header-mode-pill[aria-pressed="true"] {
  background: #fff;
  color: #000;
  border-color: transparent;
  box-shadow: var(--glow-active);
}

/* === ViewBar === */
.chrome-viewbar {
  display: flex;
  align-items: center;
  height: var(--viewbar-h);
  padding: 0 12px;
  background: var(--bg-chrome);
  border-bottom: 1px solid var(--border-soft);
  gap: 4px;
}
.chrome-viewbar-tab {
  position: relative;
  height: 100%;
  padding: 0 12px;
  background: transparent;
  border: 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 200ms;
}
.chrome-viewbar-tab:hover {
  color: rgba(255, 255, 255, 0.8);
}
.chrome-viewbar-tab[aria-selected="true"] {
  color: var(--text-primary);
}
.chrome-viewbar-tab[aria-selected="true"]::after {
  content: "";
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 0;
  height: 1px;
  background: #fff;
}

/* === Main body === */
.chrome-main {
  flex: 1;
  display: flex;
  min-height: 0;
}
.chrome-main-canvas-wrap {
  flex: 1;
  position: relative;
  background: var(--bg-canvas);
  min-width: 0;
}
.chrome-main-panel {
  width: var(--panel-w);
  background: var(--bg-chrome);
  border-left: 1px solid var(--border-soft);
  overflow-y: auto;
  overflow-x: hidden;
}
```

- [ ] **Step 2: 重写 AppShell**

完整覆盖 `src/components/AppShell.tsx`：

```tsx
import { useReducer } from "react";
import { withSessionDefaults, projectReducerV2, type ProjectStateV2 } from "../app/v2/projectReducer";
import { createV2SampleProject } from "../domain/v2/sampleProject";
import { Preview3D } from "./Preview3D";
import { DrawingSurface2D } from "./DrawingSurface2D";
import { ToolPalette } from "./ToolPalette";
import { ViewTabs } from "./ViewTabs";
import { ElevationSideTabs } from "./ElevationSideTabs";
import { PropertyPanel } from "./PropertyPanel";

function init(): ProjectStateV2 {
  return withSessionDefaults(createV2SampleProject());
}

export function AppShell() {
  const [project, dispatch] = useReducer(projectReducerV2, undefined, init);
  const isElevation = project.activeView.startsWith("elevation-");
  const is3D = project.mode === "3d";

  return (
    <div className="app-root">
      <header className="chrome-header">
        <span className="chrome-header-logo">HouseClaw</span>
        <span className="chrome-header-divider" aria-hidden />
        <span className="chrome-header-project">{project.name || "未命名项目"}</span>
        <span className="chrome-header-spacer" />
        <div className="chrome-header-mode" role="group" aria-label="模式">
          <button
            type="button"
            className="chrome-header-mode-pill"
            aria-pressed={!is3D}
            onClick={() => dispatch({ type: "set-mode", mode: "2d" })}
          >
            2D
          </button>
          <button
            type="button"
            className="chrome-header-mode-pill"
            aria-pressed={is3D}
            onClick={() => dispatch({ type: "set-mode", mode: "3d" })}
          >
            3D
          </button>
        </div>
      </header>

      <ViewTabs
        project={project}
        onChange={(viewId) => dispatch({ type: "set-view", viewId })}
      />
      {isElevation ? (
        <ElevationSideTabs
          activeView={project.activeView}
          onChange={(viewId) => dispatch({ type: "set-view", viewId })}
        />
      ) : null}

      <main className="chrome-main">
        <ToolPalette
          project={project}
          activeTool={project.activeTool}
          onChange={(toolId) => dispatch({ type: "set-tool", toolId })}
          dispatch={dispatch}
        />
        <div className="chrome-main-canvas-wrap" aria-label="canvas">
          {is3D ? (
            <Preview3D project={project} />
          ) : (
            <DrawingSurface2D
              project={project}
              onSelect={(selection) => dispatch({ type: "select", selection })}
              dispatch={dispatch}
            />
          )}
        </div>
        <div className="chrome-main-panel">
          <PropertyPanel project={project} dispatch={dispatch} />
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: 验证 typecheck + build**

```bash
bun run tsc --noEmit && bun run build 2>&1 | tail -3
```

Expected: exit 0; build 成功。

- [ ] **Step 4: Commit**

```bash
git add src/components/AppShell.tsx src/styles/chrome.css
git commit -m "feat(appshell): 新布局（暗顶栏 + 视图条 + 左 rail + 主画布 + 右 panel）"
```

---

## Task 9: ViewTabs + ElevationSideTabs 新视觉

**Files:**
- Modify: `src/components/ViewTabs.tsx`
- Modify: `src/components/ElevationSideTabs.tsx`
- Modify: `src/styles/chrome.css`

- [ ] **Step 1: 在 chrome.css 追加立面子 tab 样式**

```css
.chrome-elevation-side-tabs {
  display: flex;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-chrome);
  border-bottom: 1px solid var(--border-soft);
}
```

- [ ] **Step 2: 重写 ViewTabs（加 3D tab + 新视觉）**

完整覆盖 `src/components/ViewTabs.tsx`：

```tsx
import type { ProjectStateV2 } from "../app/v2/projectReducer";

type ViewTabsProps = {
  project: ProjectStateV2;
  onChange: (viewId: string) => void;
};

export function ViewTabs({ project, onChange }: ViewTabsProps) {
  const planTabs = project.storeys.map((s) => ({
    id: `plan-${s.id}`,
    label: s.label,
  }));
  const isElevation = project.activeView.startsWith("elevation-");
  const isRoof = project.activeView === "roof";
  const is3D = project.mode === "3d";

  return (
    <div className="chrome-viewbar" role="tablist">
      {planTabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          className="chrome-viewbar-tab"
          aria-selected={!is3D && project.activeView === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      <button
        role="tab"
        className="chrome-viewbar-tab"
        aria-selected={!is3D && isElevation}
        onClick={() => onChange("elevation-front")}
      >
        立面
      </button>
      <button
        role="tab"
        className="chrome-viewbar-tab"
        aria-selected={!is3D && isRoof}
        onClick={() => onChange("roof")}
      >
        屋顶
      </button>
      <span style={{ flex: 1 }} aria-hidden />
      <button
        role="tab"
        className="chrome-viewbar-tab"
        aria-selected={is3D}
        onClick={() => onChange("3d")}
      >
        3D
      </button>
    </div>
  );
}
```

- [ ] **Step 3: 处理 3D tab 的 dispatch 语义**

ViewTabs.onChange 现在收到 `"3d"` 字符串。AppShell 当前直接 dispatch `set-view`，但 3D 不是真正的 view（它是 mode）。修改 AppShell 第 50 行附近 ViewTabs 的 onChange 逻辑：

修改 `src/components/AppShell.tsx`，把：

```tsx
<ViewTabs
  project={project}
  onChange={(viewId) => dispatch({ type: "set-view", viewId })}
/>
```

改为：

```tsx
<ViewTabs
  project={project}
  onChange={(viewId) => {
    if (viewId === "3d") {
      dispatch({ type: "set-mode", mode: "3d" });
    } else {
      dispatch({ type: "set-mode", mode: "2d" });
      dispatch({ type: "set-view", viewId });
    }
  }}
/>
```

- [ ] **Step 4: 重写 ElevationSideTabs**

完整覆盖 `src/components/ElevationSideTabs.tsx`：

```tsx
type ElevationSideTabsProps = {
  activeView: string;
  onChange: (viewId: string) => void;
};

const SIDES: Array<{ id: string; label: string }> = [
  { id: "elevation-front", label: "FRONT" },
  { id: "elevation-back", label: "BACK" },
  { id: "elevation-left", label: "LEFT" },
  { id: "elevation-right", label: "RIGHT" },
];

export function ElevationSideTabs({ activeView, onChange }: ElevationSideTabsProps) {
  return (
    <div className="chrome-elevation-side-tabs" role="tablist">
      {SIDES.map((side) => (
        <button
          key={side.id}
          role="tab"
          className="chrome-select-pill"
          aria-pressed={activeView === side.id}
          aria-selected={activeView === side.id}
          onClick={() => onChange(side.id)}
        >
          {side.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: 验证 typecheck**

```bash
bun run tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/ViewTabs.tsx src/components/ElevationSideTabs.tsx src/components/AppShell.tsx src/styles/chrome.css
git commit -m "feat(viewtabs): 新视觉 + 3D tab 合并 mode + 立面子 tab pill"
```

---

## Task 10: PropertyPanel — Accordion 容器 + 5 个 section（StoreysSection / SelectionSection 占位 / Materials / Export / Project）

**Files:**
- Modify: `src/components/PropertyPanel.tsx`
- Create: `src/components/PropertyPanel/StoreysSection.tsx`
- Create: `src/components/PropertyPanel/SelectionSection.tsx`
- Create: `src/components/PropertyPanel/MaterialsSection.tsx`
- Create: `src/components/PropertyPanel/ExportSection.tsx`
- Create: `src/components/PropertyPanel/ProjectSection.tsx`
- Modify: `src/styles/chrome.css`

- [ ] **Step 1: 在 chrome.css 追加 panel section 样式**

```css
/* === PropertyPanel === */
.chrome-panel-empty-hint {
  padding: 4px 0;
  font-family: var(--font-sans);
  font-size: 12px;
  color: var(--text-muted);
}
.chrome-panel-missing {
  padding: 4px 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-disabled);
}
.chrome-panel-entity-title {
  margin-bottom: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
```

- [ ] **Step 2: 实现 SelectionSection 占位（先返回 placeholder body，下个 task 接 entity editors）**

`src/components/PropertyPanel/SelectionSection.tsx`：

```tsx
import type { ProjectActionV2, ProjectStateV2, SelectionV2 } from "../../app/v2/projectReducer";
import { Accordion } from "../chrome/Accordion";
import { WallEditor } from "../editors/WallEditor";
import { OpeningEditor } from "../editors/OpeningEditor";
import { BalconyEditor } from "../editors/BalconyEditor";
import { SlabEditor } from "../editors/SlabEditor";
import { RoofEditor } from "../editors/RoofEditor";
import { StairEditor } from "../editors/StairEditor";

type SelectionSectionProps = {
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function describeSelection(project: ProjectStateV2, sel: NonNullable<SelectionV2>): string {
  switch (sel.kind) {
    case "wall":
      return `WALL · ${sel.wallId}`;
    case "opening":
      return `OPENING · ${sel.openingId}`;
    case "balcony":
      return `BALCONY · ${sel.balconyId}`;
    case "slab":
      return `SLAB · ${sel.slabId}`;
    case "roof":
      return `ROOF · ${sel.roofId}`;
    case "stair":
      return `STAIR · ${sel.stairId}`;
    case "storey":
      return `STOREY · ${sel.storeyId}`;
  }
}

function Body({ project, dispatch }: SelectionSectionProps) {
  const sel = project.selection;
  if (!sel) {
    return <p className="chrome-panel-empty-hint">在 2D 视图中点击对象以编辑属性</p>;
  }
  if (sel.kind === "wall") {
    const wall = project.walls.find((w) => w.id === sel.wallId);
    return wall
      ? <WallEditor wall={wall} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">墙 {sel.wallId} 已被删除</p>;
  }
  if (sel.kind === "opening") {
    const opening = project.openings.find((o) => o.id === sel.openingId);
    return opening
      ? <OpeningEditor opening={opening} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">开洞 {sel.openingId} 已被删除</p>;
  }
  if (sel.kind === "balcony") {
    const balcony = project.balconies.find((b) => b.id === sel.balconyId);
    return balcony
      ? <BalconyEditor balcony={balcony} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">阳台 {sel.balconyId} 已被删除</p>;
  }
  if (sel.kind === "slab") {
    const slab = project.slabs.find((s) => s.id === sel.slabId);
    return slab
      ? <SlabEditor slab={slab} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">楼板 {sel.slabId} 已被删除</p>;
  }
  if (sel.kind === "roof") {
    const roof = project.roofs.find((r) => r.id === sel.roofId);
    return roof
      ? <RoofEditor roof={roof} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">屋顶 {sel.roofId} 已被删除</p>;
  }
  if (sel.kind === "stair") {
    const stair = project.stairs.find((s) => s.id === sel.stairId);
    return stair
      ? <StairEditor stair={stair} project={project} dispatch={dispatch} />
      : <p className="chrome-panel-missing">楼梯 {sel.stairId} 已被删除</p>;
  }
  if (sel.kind === "storey") {
    return <p className="chrome-panel-empty-hint">楼层属性请在上方 STOREYS 中修改</p>;
  }
  return null;
}

export function SelectionSection({ project, dispatch }: SelectionSectionProps) {
  const sel = project.selection;
  const headerExtra = sel ? (
    <span style={{ marginLeft: 8, color: "var(--text-muted)" }}>
      {`· ${describeSelection(project, sel)}`}
    </span>
  ) : (
    <span style={{ marginLeft: 8, color: "var(--text-disabled)" }}>· NONE</span>
  );

  return (
    <Accordion title="SELECTION" defaultOpen headerExtra={headerExtra}>
      <Body project={project} dispatch={dispatch} />
    </Accordion>
  );
}
```

- [ ] **Step 3: 实现 StoreysSection（先 wrap 现有 StoreysEditor）**

`src/components/PropertyPanel/StoreysSection.tsx`：

```tsx
import type { ProjectActionV2, ProjectStateV2 } from "../../app/v2/projectReducer";
import { Accordion } from "../chrome/Accordion";
import { StoreysEditor } from "../StoreysEditor";

type StoreysSectionProps = {
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

export function StoreysSection({ project, dispatch }: StoreysSectionProps) {
  return (
    <Accordion title="STOREYS" defaultOpen>
      <StoreysEditor project={project} dispatch={dispatch} />
    </Accordion>
  );
}
```

- [ ] **Step 4: 实现 MaterialsSection 占位**

`src/components/PropertyPanel/MaterialsSection.tsx`：

```tsx
import type { ProjectStateV2 } from "../../app/v2/projectReducer";
import { Accordion } from "../chrome/Accordion";

type MaterialsSectionProps = {
  project: ProjectStateV2;
};

export function MaterialsSection({ project }: MaterialsSectionProps) {
  return (
    <Accordion title="MATERIALS">
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {project.materials.map((m) => (
          <li
            key={m.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "4px 0",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--text-secondary)",
            }}
          >
            <span
              aria-hidden
              style={{
                width: 14,
                height: 14,
                borderRadius: 2,
                background: m.color,
                border: "1px solid var(--border-mid)",
              }}
            />
            {m.name}
          </li>
        ))}
      </ul>
    </Accordion>
  );
}
```

- [ ] **Step 5: 实现 ExportSection 占位**

`src/components/PropertyPanel/ExportSection.tsx`：

```tsx
import { Accordion } from "../chrome/Accordion";

export function ExportSection() {
  return (
    <Accordion title="EXPORT">
      <p className="chrome-panel-empty-hint">导出功能尚未实现</p>
    </Accordion>
  );
}
```

- [ ] **Step 6: 实现 ProjectSection 占位（项目元数据）**

`src/components/PropertyPanel/ProjectSection.tsx`：

```tsx
import type { ProjectStateV2 } from "../../app/v2/projectReducer";
import { Accordion } from "../chrome/Accordion";

type ProjectSectionProps = {
  project: ProjectStateV2;
};

export function ProjectSection({ project }: ProjectSectionProps) {
  return (
    <Accordion title="PROJECT">
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
        }}
      >
        ID · {project.id}
      </p>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
        }}
      >
        STOREYS · {project.storeys.length}
      </p>
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: "0.06em",
          color: "var(--text-muted)",
        }}
      >
        WALLS · {project.walls.length}
      </p>
      <p className="chrome-panel-empty-hint">导入 / 导出 / 重置功能尚未接通</p>
    </Accordion>
  );
}
```

- [ ] **Step 7: 重写 PropertyPanel 容器**

完整覆盖 `src/components/PropertyPanel.tsx`：

```tsx
import type { ProjectActionV2, ProjectStateV2 } from "../app/v2/projectReducer";
import { StoreysSection } from "./PropertyPanel/StoreysSection";
import { SelectionSection } from "./PropertyPanel/SelectionSection";
import { MaterialsSection } from "./PropertyPanel/MaterialsSection";
import { ExportSection } from "./PropertyPanel/ExportSection";
import { ProjectSection } from "./PropertyPanel/ProjectSection";

type PropertyPanelProps = {
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

export function PropertyPanel({ project, dispatch }: PropertyPanelProps) {
  return (
    <aside aria-label="属性面板">
      <StoreysSection project={project} dispatch={dispatch} />
      <SelectionSection project={project} dispatch={dispatch} />
      <MaterialsSection project={project} />
      <ExportSection />
      <ProjectSection project={project} />
    </aside>
  );
}
```

- [ ] **Step 8: 验证 typecheck + 跑 propertyEditing test**

```bash
bun run tsc --noEmit && bun run vitest run src/__tests__/propertyEditing.test.tsx
```

Expected: typecheck exit 0；propertyEditing 1 个测试可能挂（"在 2D 视图中点击对象以编辑属性" 还在，hint 文案不变；missing-entity 文案不变；其余可能因 PropertyPanel 不再有 `.property-panel` className 失效 → Task 13 修测试 selector）。先继续。

- [ ] **Step 9: Commit**

```bash
git add src/components/PropertyPanel.tsx src/components/PropertyPanel/ src/styles/chrome.css
git commit -m "feat(panel): Accordion 容器 + 5 section（STOREYS/SELECTION/MATERIALS/EXPORT/PROJECT）"
```

---

## Task 11: 把 6 个 entity editor 内部控件换成 SliderRow / ToggleRow / SelectRow

**Files:**
- Modify: `src/components/editors/WallEditor.tsx`
- Modify: `src/components/editors/OpeningEditor.tsx`
- Modify: `src/components/editors/BalconyEditor.tsx`
- Modify: `src/components/editors/SlabEditor.tsx`
- Modify: `src/components/editors/RoofEditor.tsx`
- Modify: `src/components/editors/StairEditor.tsx`
- Modify: `src/components/editors/AnchorPicker.tsx`
- Modify: `src/components/editors/MaterialPicker.tsx`
- Modify: `src/components/NumberField.tsx`
- Modify: `src/styles/chrome.css`

> **范围说明**：每个 editor 内部把 `<NumberField>` 替换为 `<SliderRow>`（数值范围 + step 已在原 `<NumberField>` 入参中），布尔字段（exterior 等）替换为 `<ToggleRow>`，类型/枚举字段（OpeningType door/window/void、StairShape straight/l/u 等）替换为 `<SelectRow>`。AnchorPicker / MaterialPicker 沿用 `<select>` 但改皮肤。`<NumberField>` 改皮肤但**保留**（一些字段需要直接键入而非滑动，比如 wall 端点坐标）。

- [ ] **Step 1: 在 chrome.css 加 NumberField 暗主题样式**

```css
/* === NumberField === */
.number-field {
  padding: 6px 0;
}
.number-field label {
  display: block;
  margin-bottom: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.number-field-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.number-field-row input {
  flex: 1;
  height: 26px;
  padding: 0 8px;
  background: var(--bg-chrome-2);
  border: 1px solid var(--border-mid);
  border-radius: 3px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  outline: none;
  transition: border-color 200ms;
}
.number-field-row input:focus {
  border-color: var(--border-strong);
}
.number-field-unit {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.number-field-error {
  margin-top: 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: #ff7575;
}
.entity-editor-title {
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-soft);
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-primary);
}
.entity-editor-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
}
.entity-editor-row label {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.entity-editor-row select {
  height: 26px;
  padding: 0 8px;
  background: var(--bg-chrome-2);
  border: 1px solid var(--border-mid);
  border-radius: 3px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 12px;
  outline: none;
}
```

> 现有 `NumberField.tsx` 不需修改 TSX 结构，CSS 接管视觉。

- [ ] **Step 2: 重写 WallEditor**

完整覆盖 `src/components/editors/WallEditor.tsx`：

```tsx
import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Wall } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { ToggleRow } from "../chrome/ToggleRow";
import { AnchorPicker } from "./AnchorPicker";
import { MaterialPicker } from "./MaterialPicker";

type WallEditorProps = {
  wall: Wall;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function tryDispatch(
  fn: () => ProjectActionV2,
  dispatch: (action: ProjectActionV2) => void,
): string | undefined {
  try {
    dispatch(fn());
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export function WallEditor({ wall, project, dispatch }: WallEditorProps) {
  return (
    <div className="entity-editor wall-editor">
      <div className="entity-editor-title">墙 {wall.id}</div>
      <AnchorPicker
        label="底"
        anchor={wall.bottom}
        storeys={project.storeys}
        onChange={(bottom) => dispatch({ type: "update-wall", wallId: wall.id, patch: { bottom } })}
      />
      <AnchorPicker
        label="顶"
        anchor={wall.top}
        storeys={project.storeys}
        onChange={(top) => dispatch({ type: "update-wall", wallId: wall.id, patch: { top } })}
      />
      <NumberField
        label="厚度"
        value={wall.thickness}
        step={0.01}
        min={0.05}
        unit="m"
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-wall", wallId: wall.id, patch: { thickness: v } }),
          dispatch,
        )}
      />
      <ToggleRow
        label="EXTERIOR"
        value={wall.exterior}
        onChange={(exterior) => dispatch({ type: "update-wall", wallId: wall.id, patch: { exterior } })}
      />
      <MaterialPicker
        label="材质"
        value={wall.materialId}
        materials={project.materials}
        kind="wall"
        onChange={(materialId) => dispatch({ type: "update-wall", wallId: wall.id, patch: { materialId } })}
      />
    </div>
  );
}
```

- [ ] **Step 3: 重写 OpeningEditor 用 SelectRow 切类型**

完整覆盖 `src/components/editors/OpeningEditor.tsx`：

```tsx
import type { ProjectStateV2, ProjectActionV2 } from "../../app/v2/projectReducer";
import type { Opening, OpeningType } from "../../domain/v2/types";
import { NumberField } from "../NumberField";
import { SelectRow } from "../chrome/SelectRow";
import { MaterialPicker } from "./MaterialPicker";

type OpeningEditorProps = {
  opening: Opening;
  project: ProjectStateV2;
  dispatch: (action: ProjectActionV2) => void;
};

function tryDispatch(
  fn: () => ProjectActionV2,
  dispatch: (action: ProjectActionV2) => void,
): string | undefined {
  try {
    dispatch(fn());
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const TYPE_OPTIONS = [
  { value: "door" as OpeningType, label: "DOOR" },
  { value: "window" as OpeningType, label: "WINDOW" },
  { value: "void" as OpeningType, label: "VOID" },
];

export function OpeningEditor({ opening, project, dispatch }: OpeningEditorProps) {
  return (
    <div className="entity-editor opening-editor">
      <div className="entity-editor-title">开洞 {opening.id} (墙 {opening.wallId})</div>
      <SelectRow
        label="TYPE"
        value={opening.type}
        options={TYPE_OPTIONS}
        onChange={(type) => dispatch({
          type: "update-opening",
          openingId: opening.id,
          patch: { type },
        })}
      />
      <NumberField
        label="距墙起点"
        value={opening.offset}
        step={0.05}
        min={0}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { offset: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="窗台高"
        value={opening.sillHeight}
        step={0.05}
        min={0}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { sillHeight: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="宽"
        value={opening.width}
        step={0.05}
        min={0.05}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { width: v } }),
          dispatch,
        )}
      />
      <NumberField
        label="高"
        value={opening.height}
        step={0.05}
        min={0.05}
        onCommit={(v) => tryDispatch(
          () => ({ type: "update-opening", openingId: opening.id, patch: { height: v } }),
          dispatch,
        )}
      />
      <MaterialPicker
        label="框材质"
        value={opening.frameMaterialId}
        materials={project.materials}
        kind="frame"
        onChange={(frameMaterialId) => dispatch({
          type: "update-opening",
          openingId: opening.id,
          patch: { frameMaterialId },
        })}
      />
    </div>
  );
}
```

- [ ] **Step 4: 其余 4 个 editor（Balcony / Slab / Roof / Stair）— 不改 TSX 结构,只改外层 className 让 CSS 接管**

> 这 4 个文件已经用 `className="entity-editor xxx-editor"` 和 `entity-editor-row`,Step 1 加的 css 自动覆盖。检查每个文件确保有 `entity-editor-title` div 包裹标题；如果还在用 `<h3>` 或 `<strong>`,改成 `<div className="entity-editor-title">`。

打开 `src/components/editors/BalconyEditor.tsx` / `SlabEditor.tsx` / `RoofEditor.tsx` / `StairEditor.tsx`，把每个文件最外层 jsx 的标题部分（通常是第二行,形如 `<h3>...</h3>` 或 `<div>...</div>`）替换成 `<div className="entity-editor-title">...</div>`。

具体定位：
- `BalconyEditor.tsx`: 找标题行（含中文 "阳台" / `balcony.id`） → 包成 `<div className="entity-editor-title">`
- `SlabEditor.tsx`: 找标题行（含 "楼板") → 同
- `RoofEditor.tsx`: 找标题行（含 "屋顶") → 同
- `StairEditor.tsx`: 找标题行（含 "楼梯") → 同

如果已经是 `entity-editor-title`,跳过此 editor。

- [ ] **Step 5: 验证 typecheck + 全测**

```bash
bun run tsc --noEmit && bun run vitest run
```

Expected: typecheck exit 0；测试可能 propertyEditing 仍挂（Task 13 修）；其他全部 passed。

- [ ] **Step 6: Commit**

```bash
git add src/components/editors/ src/components/NumberField.tsx src/styles/chrome.css
git commit -m "feat(editors): NumberField/AnchorPicker/MaterialPicker 暗主题 + WallEditor ToggleRow + OpeningEditor SelectRow"
```

---

## Task 12: DrawingSurface2D 接 ContextChip + DragReadoutChip + 画布对象状态切到"亮底反向"

**Files:**
- Create: `src/components/chrome/buildDefaultRoof.ts`
- Modify: `src/components/DrawingSurface2D.tsx`
- Modify: `src/styles.css`（在原有 plan-wall / plan-opening 等 selector 上）
- Modify: `src/components/ToolPalette.tsx`（确认 Task 7 重写后已无 "+ 创建屋顶" 内联按钮）

- [ ] **Step 1: 抽出 buildDefaultRoof 到独立模块**

`src/components/chrome/buildDefaultRoof.ts`：

```ts
import type { ProjectStateV2 } from "../../app/v2/projectReducer";
import type { Roof, RoofEdgeKind } from "../../domain/v2/types";

export function buildDefaultRoof(project: ProjectStateV2): Roof | undefined {
  const exterior = project.walls.filter((w) => w.exterior);
  if (exterior.length === 0) return undefined;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const w of exterior) {
    for (const p of [w.start, w.end]) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  const overhang = 0.5;
  const polygon = [
    { x: minX - overhang, y: minY - overhang },
    { x: maxX + overhang, y: minY - overhang },
    { x: maxX + overhang, y: maxY + overhang },
    { x: minX - overhang, y: maxY + overhang },
  ];
  const topStorey = [...project.storeys].sort((a, b) => b.elevation - a.elevation)[0];
  if (!topStorey) return undefined;
  const roofMaterial = project.materials.find((m) => m.kind === "roof") ?? project.materials[0];
  if (!roofMaterial) return undefined;
  const edges: RoofEdgeKind[] = ["eave", "gable", "eave", "gable"];
  return {
    id: `roof-${Date.now().toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`,
    polygon,
    base: { kind: "storey", storeyId: topStorey.id, offset: 0 },
    edges,
    pitch: Math.PI / 6,
    overhang,
    materialId: roofMaterial.id,
  };
}
```

- [ ] **Step 2: 在 DrawingSurface2D 接 ContextChip + DragReadoutChip**

打开 `src/components/DrawingSurface2D.tsx`，做以下修改：

1. 顶部 import 加：
```tsx
import { ContextChip, ContextChipAction } from "./chrome/ContextChip";
import { DragReadoutChip } from "./chrome/DragReadoutChip";
import { buildDefaultRoof } from "./chrome/buildDefaultRoof";
import type { DragReadout } from "./canvas/types";
```

（确认 React 顶部 import 已经包含 `useState`，无需重复 import；如果没有则加。）

2. 在 `useState<DragStateV2 | null>(null)` 下加：
```tsx
const [readout, setReadout] = useState<DragReadout | null>(null);
const [readoutVisible, setReadoutVisible] = useState(false);
```

3. 在 `applyDragV2` 调用成功后（找到 `for (const action of outcome.actions) { dispatch(action); }`），紧跟其后加：
```tsx
                if (outcome.dragReadout) {
                  setReadout(outcome.dragReadout);
                  setReadoutVisible(true);
                }
```

4. 在 `onPointerUp` 的 `setDragState(null)` 之前加：
```tsx
            setReadoutVisible(false);
            setTimeout(() => setReadout(null), 400);
```

5. 在 JSX 末尾的 `<ZoomControls ... />` 之前加：
```tsx
      <DragReadoutChip readout={readout} visible={readoutVisible} />
      {project.activeTool === "roof" && planStoreyId ? (
        <ContextChip>
          PRESS ENTER · CREATE ROOF
          <ContextChipAction
            onClick={() => {
              const roof = buildDefaultRoof(project);
              if (!roof) return;
              try {
                dispatch({ type: "add-roof", roof });
              } catch (e) {
                console.warn("Failed to add roof:", e);
              }
            }}
          >
            CREATE
          </ContextChipAction>
        </ContextChip>
      ) : null}
```

- [ ] **Step 3: 在 styles.css 找到 plan-wall / plan-opening / wall-endpoint-handle 等 selector，覆盖颜色为"亮底反向版"**

打开 `src/styles.css`，找到形如 `.plan-wall {` 的 selector（grep 一下）：

```bash
grep -n "^\.plan-wall\|^\.plan-opening\|^\.plan-balcony\|^\.plan-stair\|^\.wall-endpoint-handle\|^\.resize-handle\|^\.snap-indicator" /Users/zero/code/houseclaw/src/styles.css
```

对每条规则，确保 stroke 颜色是亮底友好的：
- `.plan-wall` 默认 `stroke: var(--canvas-stroke-default); stroke-width: 0.6;`
- `.plan-wall:hover` `stroke: var(--canvas-stroke-hover); filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.15));`
- `.plan-wall.is-selected` `stroke: var(--canvas-stroke-selected); stroke-width: 1;`
- `.wall-endpoint-handle` `fill: #000; stroke: #fff; stroke-width: 1;`
- `.snap-indicator` `fill: none; stroke: #000; stroke-width: 1.5; animation: pulse 1.4s infinite;`

> 老规则可能用了"白底紫线"或类似 v1 配色,改成"白底黑线"。具体操作：grep 找到行号，用 Edit 工具替换每条规则。

如果原文件这些规则用 SVG 内联属性而非 CSS,renderPlan/renderElevation 已经用 className 控制了；看 renderPlan.tsx Line 196 等处的 polygon className 来确认走 CSS。

- [ ] **Step 4: 添加 pulse keyframes（如果尚无)**

在 `src/styles/chrome.css` 末尾追加：

```css
@keyframes pulse {
  0%, 100% { opacity: 0.6; transform-origin: center; }
  50% { opacity: 1; }
}
```

- [ ] **Step 5: 验证 typecheck + 跑全部 test**

```bash
bun run tsc --noEmit && bun run vitest run
```

Expected: typecheck exit 0；UI test selector 可能挂（Task 13 修）；其他全 passed。

- [ ] **Step 6: Commit**

```bash
git add src/components/DrawingSurface2D.tsx src/components/ToolPalette.tsx src/styles.css src/styles/chrome.css
git commit -m "feat(canvas): DragReadoutChip + ContextChip(roof) + 亮底反向画布配色"
```

---

## Task 13: 修测试 selector

**Files:**
- Modify: `src/__tests__/ui.test.tsx`
- Modify: `src/__tests__/propertyEditing.test.tsx`

- [ ] **Step 1: 跑两个测试看具体哪条挂**

```bash
bun run vitest run src/__tests__/ui.test.tsx src/__tests__/propertyEditing.test.tsx
```

记录失败的 expect 行号。

- [ ] **Step 2: 修 ui.test.tsx**

打开 `src/__tests__/ui.test.tsx`，做以下定向修改：

- 模式按钮的 name 不变（still "2D" / "3D"），sanity check
- "switches to 2D and exposes drawing surface + view tabs + property panel"：
  - `getByLabelText("2D drawing surface")` 应该仍然可用（DrawingSurface2D 内部 `aria-label` 不变）
  - `getByLabelText("属性面板")` 应该仍然可用（PropertyPanel 内部 `aria-label="属性面板"` 不变）
  - `getByRole("tab", { name: "一层" })` 应该仍然可用（ViewTabs 沿用 storey label）

如果默认 mode 仍然是 "3d"，第一个 test 也仍然可用。如果 default mode 变了（例如改成 "2d"），调整 test 默认 expectation。

- [ ] **Step 3: 修 propertyEditing.test.tsx**

打开 `src/__tests__/propertyEditing.test.tsx`，调整：

- "shows hint when no selection"：文案 "在 2D 视图中点击对象以编辑属性" 仍然存在
- "renders WallEditor when a wall is selected"：`getByText('墙 ${wallId}')` → 仍然存在（entity-editor-title 内文案不变）
- "dispatches update-wall when thickness is edited"：`getByLabelText("厚度")` → NumberField 仍然挂着 `<label>厚度</label>`，应继续可用
- "renders OpeningEditor when an opening is selected"：仍然可用
- "shows missing-entity message when selection points at deleted entity"：文案 `已被删除` 仍然存在（chrome-panel-missing 类内）

如发现具体 selector 不再可用,更新成新文案。原则：不要重写测试逻辑,只改 selector。

- [ ] **Step 4: 跑测试确认全过**

```bash
bun run vitest run
```

Expected: 557 passed（或微调过的数字 ±）。

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/ui.test.tsx src/__tests__/propertyEditing.test.tsx
git commit -m "test(ui): 跟随新 chrome selector 更新文案匹配"
```

---

## Task 14: 清理 v1 styles.css 残留

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: 列出 v2 实际使用的所有 className**

```bash
grep -rhEo "className=\"[^\"]*\"" /Users/zero/code/houseclaw/src/components | sed 's/className="//;s/"$//' | tr ' ' '\n' | sort -u > /tmp/used-classes.txt
wc -l /tmp/used-classes.txt
```

- [ ] **Step 2: 列出 styles.css 里所有定义的 selector**

```bash
grep -E "^\.[a-zA-Z]" /Users/zero/code/houseclaw/src/styles.css | awk '{print $1}' | sed 's/[,{].*//' | sed 's/^\.//' | sort -u > /tmp/defined-classes.txt
wc -l /tmp/defined-classes.txt
```

- [ ] **Step 3: 找出未被引用的 selector（候选删除）**

```bash
comm -23 /tmp/defined-classes.txt /tmp/used-classes.txt > /tmp/dead-classes.txt
cat /tmp/dead-classes.txt
```

- [ ] **Step 4: 逐条核查并从 styles.css 删除**

打开 `src/styles.css`，逐条核对 `/tmp/dead-classes.txt`。**注意**保留：
- `:root` 变量（v1 老变量，仍可能被其他 CSS 选择器引用）
- 伪类 / 伪元素 selector（`:hover`, `::after` 等可能被遗漏在 grep 中）
- SVG-内联属性可能不出现在 className 但仍然影响渲染（例如 `.plan-wall` 已在 Task 12 验证）

每删除一段,跑一次 `bun run dev` 看 hot-reload 是否破坏画面。如果破坏,回滚那段。

> 期望删除：`.brand-menu*`, `.left-actions`, `.mode-tabs`, `.action-button`, `.file-button`, `.app-canvas`, `.add-button`, `.add-component-bar`, `.brand-mark`, `.app-header`（旧版 v1）, 以及之前 hotfix 加的 `.editor-2d` 内嵌覆盖（因为新 chrome.css 已接管布局）。

> 期望保留：`.plan-wall*`, `.plan-opening*`, `.plan-balcony*`, `.plan-stair*`, `.elevation-*`, `.wall-endpoint-handle`, `.resize-handle`, `.snap-indicator`, `.opening-glyph`, `.stair-rotate-*`, `.scale-ruler*`, `.zoom-controls*`, `.grid-overlay*`, `.lighting-slider*`（Preview3D 用）。

- [ ] **Step 5: 验证 build + 测试 + 浏览器**

```bash
bun run build && bun run vitest run
```

Expected: build 通过；测试 557 passed；浏览器手动验证 — 顶栏 / 视图条 / 工具列 / 面板 / 画布全部正常。

- [ ] **Step 6: Commit**

```bash
git add src/styles.css
git commit -m "chore(styles): 删除 v1 残留 selector — chrome.css 接管所有 v2 布局"
```

---

## Task 15: 浏览器手验 + push

- [ ] **Step 1: 启动 dev server**

```bash
bun run dev
```

打开 `http://localhost:5173`。

- [ ] **Step 2: 验证清单**

- 顶栏：HouseClaw logo + 项目名 + 2D/3D pill toggle 全部可见、对齐正确
- 视图条：1F / 2F / 屋面 / 立面 / 屋顶 / 3D 6 个 tab，激活态有底部白下划线
- 切到立面：FRONT/BACK/LEFT/RIGHT 子 tab 一行 pill 出现
- 切到 3D：右侧仍是 PropertyPanel，画布是 Preview3D
- 左工具列：10 个 icon 垂直排列，hover 出 tooltip "WALL · W"，点击切换激活态有白底黑 icon + glow
- 快捷键：按 V/W/D/N/O/B/S/F/R/M 切工具；按 Esc 退回 SELECT；input focus 时不响应
- 右面板 Accordion：5 个 section，STOREYS + SELECTION 默认展开，点击 header 切换展开/折叠，多个可同时展开
- 选墙：SELECTION header 显示 `· WALL · w-front`；body 显示 WallEditor，可改厚度（blur 提交）、AnchorPicker 切楼层、ToggleRow 切 EXTERIOR、MaterialPicker 切材质
- 选门：OpeningEditor 显示，TYPE 是 SelectRow pill 三选一
- 拖拽墙：右下角出 DragReadoutChip 显示 Δx/Δy；松开淡出
- Roof 工具激活：画布底部居中浮 chip "PRESS ENTER · CREATE ROOF" + CREATE 按钮
- 选中对象描边：墙/开洞被选中时是黑色加粗 + 浅黑色 ghost
- 字体：所有 UI label/value 用 mono uppercase；项目名/storey label 用 sans

- [ ] **Step 3: 修缺陷（如有）**

任何视觉/交互不对的，inline 修。如果是大改，单独 commit。

- [ ] **Step 4: push**

```bash
git push origin main
```

---

## Self-Review Checklist

**Spec coverage 对照**：
- §1 配色 + 字体 + 量规 → Task 1（tokens.css）
- §2 Accordion + 5 section → Task 10
- §2 表单原子 SliderRow/ToggleRow/SelectRow → Task 3
- §3 左 icon rail + 10 工具 + 快捷键 → Task 4 + Task 6 + Task 7
- §3 ContextChip → Task 5 + Task 12
- §4 画布反馈（亮底反向）→ Task 12
- §4 Snap 指示 → Task 12（pulse keyframes + .snap-indicator）
- §4 DragReadoutChip → Task 5 + Task 12
- §4 视图条 → Task 9
- §4 顶栏 → Task 8
- 测试更新 → Task 13
- v1 styles 清理 → Task 14
- 浏览器手验 → Task 15

**Placeholder 扫描**：扫过,无 TBD/TODO 残留（Task 12 的 buildDefaultRoof 已抽到 `src/components/chrome/buildDefaultRoof.ts`）。

**Type consistency**：
- `DragStateV2` / `DragReadout` / `ProjectStateV2` / `ProjectActionV2` 全部沿用现有定义,未新增/重命名。
- 新组件全部 typed props,无 any。
- 全局 `--bg-canvas`, `--bg-chrome`, `--text-primary` 等 token 名在 tokens.css 定义,在 chrome.css 引用,一致。
