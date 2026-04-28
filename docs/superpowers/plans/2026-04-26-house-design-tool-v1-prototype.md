# House Design Tool V1 Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first verifiable web prototype for a lightweight three-storey house design tool: draw structured walls/openings, edit a window from an elevation, preview the result in Three.js, apply a material, and save/load JSON.

**Architecture:** Use one authoritative `HouseProject` domain model. 2D floor/elevation views and the Three.js preview are projections of that model, never separate sources of truth. Keep geometry generation separate from rendering so wall/opening behavior can be tested without WebGL.

**Tech Stack:** Bun, Vite, React, TypeScript, Vitest, React Testing Library, Three.js, SVG for 2D editing, local JSON persistence. Install frontend dependencies with `@latest` during Task 1 so the project uses the current stable package releases at implementation time.

---

## Scope Boundary

This plan implements the first closed loop from the approved feasibility spec:

1. Create a web app foundation.
2. Define the structured house model.
3. Enforce the first strong constraints.
4. Render plan/elevation projections from the same model.
5. Generate 3D wall/opening geometry descriptors and render them with Three.js.
6. Apply a reusable material.
7. Save/load project JSON.

This plan does not implement balconies, roof editing, image generation calls, full facade sprites, professional drawing export, or visual effect-image generation. Those are separate implementation plans after this prototype loop is stable.

## File Structure

Create this project structure:

```text
package.json
bun.lock
index.html
vite.config.ts
tsconfig.json
src/
  App.tsx
  main.tsx
  styles.css
  app/
    projectReducer.ts
    persistence.ts
  components/
    AppShell.tsx
    DrawingSurface2D.tsx
    ModeSwitch.tsx
    Preview3D.tsx
    PropertyPanel.tsx
    ToolPalette.tsx
    ViewTabs.tsx
  domain/
    constraints.ts
    measurements.ts
    mutations.ts
    sampleProject.ts
    types.ts
  export/
    exporters.ts
  geometry/
    houseGeometry.ts
    types.ts
    wallPanels.ts
  materials/
    catalog.ts
  projection/
    elevation.ts
    plan.ts
    types.ts
  rendering/
    threeScene.ts
  test/
    setup.ts
  __tests__/
    constraints.test.ts
    geometry.test.ts
    persistence.test.ts
    projection.test.ts
    reducer.test.ts
    ui.test.tsx
public/
  materials/
    README.md
```

Each file has one responsibility:

- `domain/*`: authoritative model, measurement helpers, constraints, and mutations.
- `projection/*`: deterministic 2D plan/elevation projections.
- `geometry/*`: WebGL-independent geometry descriptors derived from `HouseProject`.
- `rendering/*`: Three.js scene creation and update.
- `components/*`: React UI surfaces only.
- `app/*`: reducer and persistence glue.
- `materials/*`: reusable material catalog.
- `export/*`: JSON and screenshot helpers.

---

## Task 1: Scaffold the React TypeScript App

**Files:**
- Create: `package.json`
- Create: `bun.lock`
- Create: `index.html`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "houseclaw",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run --passWithNoTests",
    "test:watch": "vitest",
    "lint": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Install the latest Bun/Vite/React/TypeScript dependencies**

Run:

```bash
bun add react@latest react-dom@latest three@latest
bun add -d @vitejs/plugin-react@latest vite@latest typescript@latest vitest@latest jsdom@latest @testing-library/react@latest @testing-library/jest-dom@latest @testing-library/user-event@latest @types/react@latest @types/react-dom@latest @types/three@latest
```

Expected: `bun.lock` is created and `package.json` contains the current latest versions resolved by Bun.

- [ ] **Step 3: Create Vite and TypeScript config files**

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    globals: true
  }
});
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: Create the HTML and React entry files**

Create `index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HouseClaw</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Create `src/App.tsx`:

```tsx
export default function App() {
  return (
    <main className="app">
      <h1>HouseClaw</h1>
      <p>轻量住宅建模与外观沟通工具</p>
    </main>
  );
}
```

Create `src/styles.css`:

```css
:root {
  color: #1f2933;
  background: #f7f4ef;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
select {
  font: inherit;
}

.app {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}
```

Create `src/test/setup.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Verify the scaffold**

Run:

```bash
bun run build
bun run test
```

Expected: build succeeds. The first `bun run test` run exits successfully after Vitest initializes.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock index.html vite.config.ts tsconfig.json src/main.tsx src/App.tsx src/styles.css src/test/setup.ts
git commit -m "chore: scaffold house design app"
```

---

## Task 2: Define the Authoritative House Model

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/measurements.ts`
- Create: `src/domain/sampleProject.ts`
- Create: `src/__tests__/domain.test.ts`

- [ ] **Step 1: Write the failing domain tests**

Create `src/__tests__/domain.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { wallLength } from "../domain/measurements";
import { createSampleProject } from "../domain/sampleProject";

describe("house domain model", () => {
  it("creates a three-storey sample project with deterministic elevations", () => {
    const project = createSampleProject();

    expect(project.storeys.map((storey) => storey.id)).toEqual(["1f", "2f", "3f"]);
    expect(project.storeys.map((storey) => storey.elevation)).toEqual([0, 3.2, 6.4]);
    expect(project.storeys.every((storey) => storey.height === 3.2)).toBe(true);
  });

  it("keeps walls as structured objects with measurable length", () => {
    const project = createSampleProject();
    const frontWall = project.walls.find((wall) => wall.id === "wall-front-1f");

    expect(frontWall).toBeDefined();
    expect(wallLength(frontWall!)).toBe(10);
    expect(frontWall!.thickness).toBe(0.24);
    expect(frontWall!.storeyId).toBe("1f");
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
bun run test -- src/__tests__/domain.test.ts
```

Expected: fail with missing modules for `../domain/measurements` and `../domain/sampleProject`.

- [ ] **Step 3: Add domain types**

Create `src/domain/types.ts`:

```ts
export type UnitSystem = "metric";

export type Mode = "2d" | "3d";

export type ViewId =
  | "plan-1f"
  | "plan-2f"
  | "plan-3f"
  | "elevation-front"
  | "elevation-back"
  | "elevation-left"
  | "elevation-right"
  | "roof";

export type ToolId =
  | "select"
  | "wall"
  | "door"
  | "window"
  | "opening"
  | "material";

export type Point2 = {
  x: number;
  y: number;
};

export type Storey = {
  id: string;
  label: string;
  elevation: number;
  height: number;
  slabThickness: number;
};

export type MaterialKind = "wall" | "roof" | "frame" | "railing" | "decor";

export type Material = {
  id: string;
  name: string;
  kind: MaterialKind;
  color: string;
  textureUrl?: string;
  repeat?: { x: number; y: number };
};

export type Wall = {
  id: string;
  storeyId: string;
  start: Point2;
  end: Point2;
  thickness: number;
  height: number;
  exterior: boolean;
  materialId: string;
};

export type OpeningType = "door" | "window" | "void";

export type Opening = {
  id: string;
  wallId: string;
  type: OpeningType;
  offset: number;
  sillHeight: number;
  width: number;
  height: number;
  frameMaterialId: string;
};

export type HouseProject = {
  id: string;
  name: string;
  unitSystem: UnitSystem;
  defaultWallThickness: number;
  defaultStoreyHeight: number;
  mode: Mode;
  activeView: ViewId;
  activeTool: ToolId;
  selectedObjectId?: string;
  storeys: Storey[];
  materials: Material[];
  walls: Wall[];
  openings: Opening[];
};
```

- [ ] **Step 4: Add measurement helpers and sample project**

Create `src/domain/measurements.ts`:

```ts
import type { Point2, Wall } from "./types";

export function distance(a: Point2, b: Point2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function wallLength(wall: Wall): number {
  return Number(distance(wall.start, wall.end).toFixed(4));
}

export function storeyTop(elevation: number, height: number): number {
  return Number((elevation + height).toFixed(4));
}
```

Create `src/domain/sampleProject.ts`:

```ts
import type { HouseProject, Material, Storey, Wall } from "./types";

const materials: Material[] = [
  {
    id: "mat-white-render",
    name: "白色外墙涂料",
    kind: "wall",
    color: "#f2eee6",
    repeat: { x: 2, y: 2 }
  },
  {
    id: "mat-dark-frame",
    name: "深灰窗框",
    kind: "frame",
    color: "#263238"
  }
];

const storeys: Storey[] = [
  { id: "1f", label: "1F", elevation: 0, height: 3.2, slabThickness: 0.18 },
  { id: "2f", label: "2F", elevation: 3.2, height: 3.2, slabThickness: 0.18 },
  { id: "3f", label: "3F", elevation: 6.4, height: 3.2, slabThickness: 0.18 }
];

const walls: Wall[] = [
  {
    id: "wall-front-1f",
    storeyId: "1f",
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    thickness: 0.24,
    height: 3.2,
    exterior: true,
    materialId: "mat-white-render"
  },
  {
    id: "wall-right-1f",
    storeyId: "1f",
    start: { x: 10, y: 0 },
    end: { x: 10, y: 8 },
    thickness: 0.24,
    height: 3.2,
    exterior: true,
    materialId: "mat-white-render"
  },
  {
    id: "wall-back-1f",
    storeyId: "1f",
    start: { x: 10, y: 8 },
    end: { x: 0, y: 8 },
    thickness: 0.24,
    height: 3.2,
    exterior: true,
    materialId: "mat-white-render"
  },
  {
    id: "wall-left-1f",
    storeyId: "1f",
    start: { x: 0, y: 8 },
    end: { x: 0, y: 0 },
    thickness: 0.24,
    height: 3.2,
    exterior: true,
    materialId: "mat-white-render"
  }
];

export function createSampleProject(): HouseProject {
  return {
    id: "sample-house",
    name: "三层别墅草案",
    unitSystem: "metric",
    defaultWallThickness: 0.24,
    defaultStoreyHeight: 3.2,
    mode: "2d",
    activeView: "plan-1f",
    activeTool: "select",
    selectedObjectId: undefined,
    storeys,
    materials,
    walls,
    openings: [
      {
        id: "window-front-1f",
        wallId: "wall-front-1f",
        type: "window",
        offset: 3,
        sillHeight: 0.9,
        width: 1.6,
        height: 1.3,
        frameMaterialId: "mat-dark-frame"
      }
    ]
  };
}
```

- [ ] **Step 5: Verify domain tests pass**

Run:

```bash
bun run test -- src/__tests__/domain.test.ts
```

Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain src/__tests__/domain.test.ts
git commit -m "feat: add structured house domain model"
```

---

## Task 3: Add Constraints and Mutations

**Files:**
- Create: `src/domain/constraints.ts`
- Create: `src/domain/mutations.ts`
- Create: `src/__tests__/constraints.test.ts`

- [ ] **Step 1: Write failing constraint tests**

Create `src/__tests__/constraints.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateProject } from "../domain/constraints";
import { addOpening, setStoreyHeight } from "../domain/mutations";
import { createSampleProject } from "../domain/sampleProject";

describe("house constraints", () => {
  it("rejects an opening that is not attached to an existing wall", () => {
    const project = createSampleProject();
    const invalid = {
      ...project,
      openings: [
        ...project.openings,
        {
          id: "floating-window",
          wallId: "missing-wall",
          type: "window" as const,
          offset: 1,
          sillHeight: 0.8,
          width: 1.2,
          height: 1.2,
          frameMaterialId: "mat-dark-frame"
        }
      ]
    };

    expect(validateProject(invalid)).toContain("Opening floating-window references missing wall missing-wall.");
  });

  it("rejects an opening that exceeds wall length", () => {
    const project = createSampleProject();

    expect(() =>
      addOpening(project, {
        id: "too-wide-window",
        wallId: "wall-front-1f",
        type: "window",
        offset: 9.4,
        sillHeight: 0.8,
        width: 1,
        height: 1.2,
        frameMaterialId: "mat-dark-frame"
      })
    ).toThrow("Opening too-wide-window exceeds wall wall-front-1f length.");
  });

  it("keeps storey elevations normalized after changing a floor height", () => {
    const project = setStoreyHeight(createSampleProject(), "1f", 3.6);

    expect(project.storeys.map((storey) => storey.elevation)).toEqual([0, 3.6, 6.8]);
    expect(project.storeys[0].height).toBe(3.6);
    expect(project.walls.find((wall) => wall.id === "wall-front-1f")!.height).toBe(3.6);
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
bun run test -- src/__tests__/constraints.test.ts
```

Expected: fail with missing modules for `constraints` and `mutations`.

- [ ] **Step 3: Implement project validation**

Create `src/domain/constraints.ts`:

```ts
import { wallLength } from "./measurements";
import type { HouseProject, Opening, Wall } from "./types";

function findWall(project: HouseProject, wallId: string): Wall | undefined {
  return project.walls.find((wall) => wall.id === wallId);
}

function validateOpening(project: HouseProject, opening: Opening): string[] {
  const wall = findWall(project, opening.wallId);
  if (!wall) {
    return [`Opening ${opening.id} references missing wall ${opening.wallId}.`];
  }

  const errors: string[] = [];
  const length = wallLength(wall);

  if (opening.offset < 0) {
    errors.push(`Opening ${opening.id} offset cannot be negative.`);
  }

  if (opening.width <= 0 || opening.height <= 0) {
    errors.push(`Opening ${opening.id} width and height must be positive.`);
  }

  if (opening.offset + opening.width > length) {
    errors.push(`Opening ${opening.id} exceeds wall ${wall.id} length.`);
  }

  if (opening.sillHeight < 0) {
    errors.push(`Opening ${opening.id} sill height cannot be negative.`);
  }

  if (opening.sillHeight + opening.height > wall.height) {
    errors.push(`Opening ${opening.id} exceeds wall ${wall.id} height.`);
  }

  return errors;
}

export function validateProject(project: HouseProject): string[] {
  const errors: string[] = [];
  const storeyIds = new Set(project.storeys.map((storey) => storey.id));
  const materialIds = new Set(project.materials.map((material) => material.id));

  for (const wall of project.walls) {
    if (!storeyIds.has(wall.storeyId)) {
      errors.push(`Wall ${wall.id} references missing storey ${wall.storeyId}.`);
    }
    if (!materialIds.has(wall.materialId)) {
      errors.push(`Wall ${wall.id} references missing material ${wall.materialId}.`);
    }
    if (wall.thickness <= 0 || wall.height <= 0) {
      errors.push(`Wall ${wall.id} thickness and height must be positive.`);
    }
  }

  for (const opening of project.openings) {
    errors.push(...validateOpening(project, opening));
    if (!materialIds.has(opening.frameMaterialId)) {
      errors.push(`Opening ${opening.id} references missing frame material ${opening.frameMaterialId}.`);
    }
  }

  return errors;
}

export function assertValidProject(project: HouseProject): HouseProject {
  const errors = validateProject(project);
  if (errors.length > 0) {
    throw new Error(errors[0]);
  }
  return project;
}
```

- [ ] **Step 4: Implement constrained mutations**

Create `src/domain/mutations.ts`:

```ts
import { assertValidProject } from "./constraints";
import type { HouseProject, Opening, Wall } from "./types";

export function addWall(project: HouseProject, wall: Wall): HouseProject {
  return assertValidProject({
    ...project,
    walls: [...project.walls, wall]
  });
}

export function addOpening(project: HouseProject, opening: Opening): HouseProject {
  return assertValidProject({
    ...project,
    openings: [...project.openings, opening]
  });
}

export function updateOpening(
  project: HouseProject,
  openingId: string,
  patch: Partial<Omit<Opening, "id" | "wallId">>
): HouseProject {
  return assertValidProject({
    ...project,
    openings: project.openings.map((opening) =>
      opening.id === openingId ? { ...opening, ...patch } : opening
    )
  });
}

export function setStoreyHeight(project: HouseProject, storeyId: string, height: number): HouseProject {
  if (height <= 0) {
    throw new Error("Storey height must be positive.");
  }

  let elevation = 0;
  const storeys = project.storeys.map((storey) => {
    const next = {
      ...storey,
      elevation,
      height: storey.id === storeyId ? height : storey.height
    };
    elevation = Number((elevation + next.height).toFixed(4));
    return next;
  });

  const walls = project.walls.map((wall) =>
    wall.storeyId === storeyId ? { ...wall, height } : wall
  );

  return assertValidProject({ ...project, storeys, walls });
}

export function applyWallMaterial(
  project: HouseProject,
  wallId: string,
  materialId: string
): HouseProject {
  return assertValidProject({
    ...project,
    walls: project.walls.map((wall) =>
      wall.id === wallId ? { ...wall, materialId } : wall
    )
  });
}
```

- [ ] **Step 5: Verify constraint tests pass**

Run:

```bash
bun run test -- src/__tests__/constraints.test.ts
```

Expected: all constraint tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/domain/constraints.ts src/domain/mutations.ts src/__tests__/constraints.test.ts
git commit -m "feat: add house model constraints"
```

---

## Task 4: Implement 2D Plan and Elevation Projections

**Files:**
- Create: `src/projection/types.ts`
- Create: `src/projection/plan.ts`
- Create: `src/projection/elevation.ts`
- Create: `src/__tests__/projection.test.ts`

- [ ] **Step 1: Write failing projection tests**

Create `src/__tests__/projection.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { projectElevationView } from "../projection/elevation";
import { projectPlanView } from "../projection/plan";
import { createSampleProject } from "../domain/sampleProject";

describe("2D projections", () => {
  it("projects first-floor walls into plan space", () => {
    const projection = projectPlanView(createSampleProject(), "1f");

    expect(projection.viewId).toBe("plan-1f");
    expect(projection.wallSegments).toHaveLength(4);
    expect(projection.wallSegments[0]).toMatchObject({
      wallId: "wall-front-1f",
      start: { x: 0, y: 0 },
      end: { x: 10, y: 0 }
    });
  });

  it("projects front elevation openings from the same wall model", () => {
    const projection = projectElevationView(createSampleProject(), "front");

    expect(projection.viewId).toBe("elevation-front");
    expect(projection.wallBands).toHaveLength(1);
    expect(projection.openings[0]).toMatchObject({
      openingId: "window-front-1f",
      wallId: "wall-front-1f",
      x: 3,
      y: 0.9,
      width: 1.6,
      height: 1.3
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
bun run test -- src/__tests__/projection.test.ts
```

Expected: fail with missing projection modules.

- [ ] **Step 3: Define projection types**

Create `src/projection/types.ts`:

```ts
import type { Point2, ViewId } from "../domain/types";

export type PlanWallSegment = {
  wallId: string;
  start: Point2;
  end: Point2;
  thickness: number;
};

export type PlanOpeningGlyph = {
  openingId: string;
  wallId: string;
  offset: number;
  width: number;
};

export type PlanProjection = {
  viewId: ViewId;
  wallSegments: PlanWallSegment[];
  openings: PlanOpeningGlyph[];
};

export type ElevationSide = "front" | "back" | "left" | "right";

export type ElevationWallBand = {
  wallId: string;
  storeyId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ElevationOpeningRect = {
  openingId: string;
  wallId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ElevationProjection = {
  viewId: ViewId;
  side: ElevationSide;
  wallBands: ElevationWallBand[];
  openings: ElevationOpeningRect[];
};
```

- [ ] **Step 4: Implement plan projection**

Create `src/projection/plan.ts`:

```ts
import type { HouseProject } from "../domain/types";
import type { PlanProjection } from "./types";

export function projectPlanView(project: HouseProject, storeyId: string): PlanProjection {
  const walls = project.walls.filter((wall) => wall.storeyId === storeyId);
  const wallIds = new Set(walls.map((wall) => wall.id));

  return {
    viewId: `plan-${storeyId}` as PlanProjection["viewId"],
    wallSegments: walls.map((wall) => ({
      wallId: wall.id,
      start: wall.start,
      end: wall.end,
      thickness: wall.thickness
    })),
    openings: project.openings
      .filter((opening) => wallIds.has(opening.wallId))
      .map((opening) => ({
        openingId: opening.id,
        wallId: opening.wallId,
        offset: opening.offset,
        width: opening.width
      }))
  };
}
```

- [ ] **Step 5: Implement axis-aligned elevation projection**

Create `src/projection/elevation.ts`:

```ts
import { wallLength } from "../domain/measurements";
import type { HouseProject, Wall } from "../domain/types";
import type { ElevationProjection, ElevationSide } from "./types";

function sideWallPredicate(project: HouseProject, side: ElevationSide): (wall: Wall) => boolean {
  const allPoints = project.walls.flatMap((wall) => [wall.start, wall.end]);
  const minX = Math.min(...allPoints.map((point) => point.x));
  const maxX = Math.max(...allPoints.map((point) => point.x));
  const minY = Math.min(...allPoints.map((point) => point.y));
  const maxY = Math.max(...allPoints.map((point) => point.y));

  return (wall: Wall) => {
    const horizontal = wall.start.y === wall.end.y;
    const vertical = wall.start.x === wall.end.x;
    if (side === "front") return horizontal && wall.start.y === minY && wall.end.y === minY;
    if (side === "back") return horizontal && wall.start.y === maxY && wall.end.y === maxY;
    if (side === "left") return vertical && wall.start.x === minX && wall.end.x === minX;
    return vertical && wall.start.x === maxX && wall.end.x === maxX;
  };
}

export function projectElevationView(
  project: HouseProject,
  side: ElevationSide
): ElevationProjection {
  const isSideWall = sideWallPredicate(project, side);
  const walls = project.walls.filter(isSideWall);
  const wallIds = new Set(walls.map((wall) => wall.id));

  return {
    viewId: `elevation-${side}`,
    side,
    wallBands: walls.map((wall) => {
      const storey = project.storeys.find((candidate) => candidate.id === wall.storeyId);
      return {
        wallId: wall.id,
        storeyId: wall.storeyId,
        x: 0,
        y: storey?.elevation ?? 0,
        width: wallLength(wall),
        height: wall.height
      };
    }),
    openings: project.openings
      .filter((opening) => wallIds.has(opening.wallId))
      .map((opening) => ({
        openingId: opening.id,
        wallId: opening.wallId,
        x: opening.offset,
        y: opening.sillHeight,
        width: opening.width,
        height: opening.height
      }))
  };
}
```

- [ ] **Step 6: Verify projection tests pass**

Run:

```bash
bun run test -- src/__tests__/projection.test.ts
```

Expected: all projection tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/projection src/__tests__/projection.test.ts
git commit -m "feat: project house model into 2d views"
```

---

## Task 5: Build WebGL-Independent Geometry Descriptors

**Files:**
- Create: `src/geometry/types.ts`
- Create: `src/geometry/wallPanels.ts`
- Create: `src/geometry/houseGeometry.ts`
- Create: `src/__tests__/geometry.test.ts`

- [ ] **Step 1: Write failing geometry tests**

Create `src/__tests__/geometry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildHouseGeometry } from "../geometry/houseGeometry";
import { buildWallPanels } from "../geometry/wallPanels";
import { createSampleProject } from "../domain/sampleProject";

describe("house geometry descriptors", () => {
  it("splits a wall face around a single opening", () => {
    const project = createSampleProject();
    const wall = project.walls.find((candidate) => candidate.id === "wall-front-1f")!;
    const opening = project.openings.find((candidate) => candidate.id === "window-front-1f")!;

    const panels = buildWallPanels(wall, [opening]);

    expect(panels.map((panel) => panel.role)).toEqual(["left", "right", "below", "above"]);
    expect(panels.find((panel) => panel.role === "left")).toMatchObject({
      x: 0,
      y: 0,
      width: 3,
      height: 3.2
    });
    expect(panels.find((panel) => panel.role === "below")).toMatchObject({
      x: 3,
      y: 0,
      width: 1.6,
      height: 0.9
    });
  });

  it("builds house geometry from the authoritative project", () => {
    const geometry = buildHouseGeometry(createSampleProject());

    expect(geometry.walls).toHaveLength(4);
    expect(geometry.walls[0].panels.length).toBeGreaterThan(0);
    expect(geometry.walls[0].materialId).toBe("mat-white-render");
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run:

```bash
bun run test -- src/__tests__/geometry.test.ts
```

Expected: fail with missing geometry modules.

- [ ] **Step 3: Define geometry descriptor types**

Create `src/geometry/types.ts`:

```ts
import type { Point2 } from "../domain/types";

export type WallPanelRole = "full" | "left" | "right" | "below" | "above";

export type WallPanel = {
  role: WallPanelRole;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WallGeometry = {
  wallId: string;
  storeyId: string;
  start: Point2;
  end: Point2;
  thickness: number;
  height: number;
  materialId: string;
  panels: WallPanel[];
};

export type HouseGeometry = {
  walls: WallGeometry[];
};
```

- [ ] **Step 4: Implement wall panel splitting**

Create `src/geometry/wallPanels.ts`:

```ts
import { wallLength } from "../domain/measurements";
import type { Opening, Wall } from "../domain/types";
import type { WallPanel } from "./types";

function positivePanel(panel: WallPanel): WallPanel | undefined {
  if (panel.width <= 0 || panel.height <= 0) return undefined;
  return {
    ...panel,
    x: Number(panel.x.toFixed(4)),
    y: Number(panel.y.toFixed(4)),
    width: Number(panel.width.toFixed(4)),
    height: Number(panel.height.toFixed(4))
  };
}

export function buildWallPanels(wall: Wall, openings: Opening[]): WallPanel[] {
  if (openings.length === 0) {
    return [{ role: "full", x: 0, y: 0, width: wallLength(wall), height: wall.height }];
  }

  const opening = openings[0];
  const wallWidth = wallLength(wall);
  const openingRight = opening.offset + opening.width;
  const openingTop = opening.sillHeight + opening.height;

  return [
    positivePanel({ role: "left", x: 0, y: 0, width: opening.offset, height: wall.height }),
    positivePanel({
      role: "right",
      x: openingRight,
      y: 0,
      width: wallWidth - openingRight,
      height: wall.height
    }),
    positivePanel({
      role: "below",
      x: opening.offset,
      y: 0,
      width: opening.width,
      height: opening.sillHeight
    }),
    positivePanel({
      role: "above",
      x: opening.offset,
      y: openingTop,
      width: opening.width,
      height: wall.height - openingTop
    })
  ].filter((panel): panel is WallPanel => panel !== undefined);
}
```

- [ ] **Step 5: Implement project-level geometry builder**

Create `src/geometry/houseGeometry.ts`:

```ts
import type { HouseProject } from "../domain/types";
import type { HouseGeometry } from "./types";
import { buildWallPanels } from "./wallPanels";

export function buildHouseGeometry(project: HouseProject): HouseGeometry {
  return {
    walls: project.walls.map((wall) => ({
      wallId: wall.id,
      storeyId: wall.storeyId,
      start: wall.start,
      end: wall.end,
      thickness: wall.thickness,
      height: wall.height,
      materialId: wall.materialId,
      panels: buildWallPanels(
        wall,
        project.openings.filter((opening) => opening.wallId === wall.id)
      )
    }))
  };
}
```

- [ ] **Step 6: Verify geometry tests pass**

Run:

```bash
bun run test -- src/__tests__/geometry.test.ts
```

Expected: all geometry tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/geometry src/__tests__/geometry.test.ts
git commit -m "feat: derive testable wall geometry"
```

---

## Task 6: Add App Reducer and JSON Persistence

**Files:**
- Create: `src/app/projectReducer.ts`
- Create: `src/app/persistence.ts`
- Create: `src/__tests__/reducer.test.ts`
- Create: `src/__tests__/persistence.test.ts`

- [ ] **Step 1: Write failing reducer and persistence tests**

Create `src/__tests__/reducer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { projectReducer } from "../app/projectReducer";
import { createSampleProject } from "../domain/sampleProject";

describe("project reducer", () => {
  it("switches between 2d and 3d modes", () => {
    const project = projectReducer(createSampleProject(), { type: "set-mode", mode: "3d" });

    expect(project.mode).toBe("3d");
  });

  it("edits the front window sill height through a reducer action", () => {
    const project = projectReducer(createSampleProject(), {
      type: "update-opening",
      openingId: "window-front-1f",
      patch: { sillHeight: 1.1 }
    });

    expect(project.openings.find((opening) => opening.id === "window-front-1f")!.sillHeight).toBe(1.1);
  });
});
```

Create `src/__tests__/persistence.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { exportProjectJson, importProjectJson } from "../app/persistence";
import { createSampleProject } from "../domain/sampleProject";

describe("project persistence", () => {
  it("round-trips project JSON", () => {
    const project = createSampleProject();
    const json = exportProjectJson(project);
    const restored = importProjectJson(json);

    expect(restored.id).toBe(project.id);
    expect(restored.walls).toHaveLength(project.walls.length);
    expect(restored.openings[0].id).toBe("window-front-1f");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun run test -- src/__tests__/reducer.test.ts src/__tests__/persistence.test.ts
```

Expected: fail with missing app modules.

- [ ] **Step 3: Implement reducer**

Create `src/app/projectReducer.ts`:

```ts
import { applyWallMaterial, updateOpening } from "../domain/mutations";
import type { HouseProject, Mode, ToolId, ViewId, Opening } from "../domain/types";

export type ProjectAction =
  | { type: "set-mode"; mode: Mode }
  | { type: "set-view"; viewId: ViewId }
  | { type: "set-tool"; toolId: ToolId }
  | { type: "select-object"; objectId: string | undefined }
  | { type: "update-opening"; openingId: string; patch: Partial<Omit<Opening, "id" | "wallId">> }
  | { type: "apply-wall-material"; wallId: string; materialId: string }
  | { type: "replace-project"; project: HouseProject };

export function projectReducer(project: HouseProject, action: ProjectAction): HouseProject {
  if (action.type === "set-mode") {
    return { ...project, mode: action.mode };
  }

  if (action.type === "set-view") {
    return { ...project, activeView: action.viewId };
  }

  if (action.type === "set-tool") {
    return { ...project, activeTool: action.toolId };
  }

  if (action.type === "select-object") {
    return { ...project, selectedObjectId: action.objectId };
  }

  if (action.type === "update-opening") {
    return updateOpening(project, action.openingId, action.patch);
  }

  if (action.type === "apply-wall-material") {
    return applyWallMaterial(project, action.wallId, action.materialId);
  }

  return action.project;
}
```

- [ ] **Step 4: Implement JSON persistence**

Create `src/app/persistence.ts`:

```ts
import { assertValidProject } from "../domain/constraints";
import type { HouseProject } from "../domain/types";

export function exportProjectJson(project: HouseProject): string {
  return JSON.stringify(project, null, 2);
}

export function importProjectJson(json: string): HouseProject {
  const parsed = JSON.parse(json) as HouseProject;
  return assertValidProject(parsed);
}

export function saveProjectToLocalStorage(project: HouseProject, key = "houseclaw.project"): void {
  localStorage.setItem(key, exportProjectJson(project));
}

export function loadProjectFromLocalStorage(key = "houseclaw.project"): HouseProject | undefined {
  const json = localStorage.getItem(key);
  return json ? importProjectJson(json) : undefined;
}
```

- [ ] **Step 5: Verify reducer and persistence tests pass**

Run:

```bash
bun run test -- src/__tests__/reducer.test.ts src/__tests__/persistence.test.ts
```

Expected: all reducer and persistence tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app src/__tests__/reducer.test.ts src/__tests__/persistence.test.ts
git commit -m "feat: add project reducer and persistence"
```

---

## Task 7: Build the 2D/3D Application Shell

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `src/components/AppShell.tsx`
- Create: `src/components/ModeSwitch.tsx`
- Create: `src/components/ViewTabs.tsx`
- Create: `src/components/ToolPalette.tsx`
- Create: `src/components/DrawingSurface2D.tsx`
- Create: `src/components/PropertyPanel.tsx`
- Create: `src/components/Preview3D.tsx`
- Create: `src/__tests__/ui.test.tsx`

- [ ] **Step 1: Write failing UI smoke tests**

Create `src/__tests__/ui.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";

describe("HouseClaw UI", () => {
  it("shows 2d plan tools by default", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "2D" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1F" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("墙")).toBeInTheDocument();
    expect(screen.getByLabelText("2D drawing surface")).toBeInTheDocument();
  });

  it("switches to 3d preview", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "3D" }));

    expect(screen.getByText("3D 外观预览")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the UI test to verify failure**

Run:

```bash
bun run test -- src/__tests__/ui.test.tsx
```

Expected: fail because `App` still renders only the scaffold landing copy.

- [ ] **Step 3: Add shell components**

Create `src/components/ModeSwitch.tsx`:

```tsx
import type { Mode } from "../domain/types";

type Props = {
  mode: Mode;
  onChange: (mode: Mode) => void;
};

export function ModeSwitch({ mode, onChange }: Props) {
  return (
    <div className="mode-switch" aria-label="模式">
      {(["2d", "3d"] as const).map((candidate) => (
        <button
          key={candidate}
          type="button"
          aria-pressed={mode === candidate}
          onClick={() => onChange(candidate)}
        >
          {candidate === "2d" ? "2D" : "3D"}
        </button>
      ))}
    </div>
  );
}
```

Create `src/components/ViewTabs.tsx`:

```tsx
import type { ViewId } from "../domain/types";

const views: Array<{ id: ViewId; label: string }> = [
  { id: "plan-1f", label: "1F" },
  { id: "plan-2f", label: "2F" },
  { id: "plan-3f", label: "3F" },
  { id: "elevation-front", label: "正面" },
  { id: "elevation-back", label: "背面" },
  { id: "elevation-left", label: "左侧" },
  { id: "elevation-right", label: "右侧" },
  { id: "roof", label: "屋顶" }
];

type Props = {
  activeView: ViewId;
  onChange: (viewId: ViewId) => void;
};

export function ViewTabs({ activeView, onChange }: Props) {
  return (
    <nav className="view-tabs" aria-label="2D 视图">
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          aria-pressed={activeView === view.id}
          onClick={() => onChange(view.id)}
        >
          {view.label}
        </button>
      ))}
    </nav>
  );
}
```

Create `src/components/ToolPalette.tsx`:

```tsx
import type { ToolId } from "../domain/types";

const tools: Array<{ id: ToolId; label: string }> = [
  { id: "select", label: "选择" },
  { id: "wall", label: "墙" },
  { id: "door", label: "门" },
  { id: "window", label: "窗" },
  { id: "opening", label: "开孔" },
  { id: "material", label: "材质" }
];

type Props = {
  activeTool: ToolId;
  onChange: (toolId: ToolId) => void;
};

export function ToolPalette({ activeTool, onChange }: Props) {
  return (
    <aside className="tool-palette" aria-label="工具">
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          aria-pressed={activeTool === tool.id}
          onClick={() => onChange(tool.id)}
        >
          {tool.label}
        </button>
      ))}
    </aside>
  );
}
```

Create `src/components/DrawingSurface2D.tsx`:

```tsx
import { projectElevationView } from "../projection/elevation";
import { projectPlanView } from "../projection/plan";
import type { HouseProject } from "../domain/types";

type Props = {
  project: HouseProject;
};

function storeyFromView(viewId: HouseProject["activeView"]): string {
  if (viewId === "plan-2f") return "2f";
  if (viewId === "plan-3f") return "3f";
  return "1f";
}

export function DrawingSurface2D({ project }: Props) {
  const isPlan = project.activeView.startsWith("plan-");
  const plan = isPlan ? projectPlanView(project, storeyFromView(project.activeView)) : undefined;
  const elevationSide = project.activeView.replace("elevation-", "") as
    | "front"
    | "back"
    | "left"
    | "right";
  const elevation = !isPlan && project.activeView !== "roof"
    ? projectElevationView(project, elevationSide)
    : undefined;

  return (
    <section className="drawing-panel" aria-label="2D drawing surface">
      <svg viewBox="-1 -1 14 12" role="img" aria-label="当前 2D 结构视图">
        {plan?.wallSegments.map((wall) => (
          <line
            key={wall.wallId}
            x1={wall.start.x}
            y1={wall.start.y}
            x2={wall.end.x}
            y2={wall.end.y}
            strokeWidth={wall.thickness}
            className="wall-line"
          />
        ))}
        {elevation?.wallBands.map((wall) => (
          <rect
            key={wall.wallId}
            x={wall.x}
            y={8 - wall.y - wall.height}
            width={wall.width}
            height={wall.height}
            className="elevation-wall"
          />
        ))}
        {elevation?.openings.map((opening) => (
          <rect
            key={opening.openingId}
            x={opening.x}
            y={8 - opening.y - opening.height}
            width={opening.width}
            height={opening.height}
            className="opening-rect"
          />
        ))}
      </svg>
    </section>
  );
}
```

Create `src/components/PropertyPanel.tsx`:

```tsx
import type { HouseProject } from "../domain/types";

type Props = {
  project: HouseProject;
};

export function PropertyPanel({ project }: Props) {
  const selectedOpening = project.openings.find((opening) => opening.id === project.selectedObjectId);

  return (
    <aside className="property-panel">
      <h2>属性</h2>
      {selectedOpening ? (
        <dl>
          <dt>窗宽</dt>
          <dd>{selectedOpening.width.toFixed(2)} m</dd>
          <dt>离地高度</dt>
          <dd>{selectedOpening.sillHeight.toFixed(2)} m</dd>
        </dl>
      ) : (
        <p>选择墙、窗或开孔后编辑尺寸。</p>
      )}
    </aside>
  );
}
```

Create `src/components/Preview3D.tsx`:

```tsx
import type { HouseProject } from "../domain/types";

type Props = {
  project: HouseProject;
};

export function Preview3D({ project }: Props) {
  return (
    <section className="preview-panel" aria-label="3D preview">
      <h2>3D 外观预览</h2>
      <p>{project.name}</p>
      <div className="preview-stage">3D preview shell</div>
    </section>
  );
}
```

Create `src/components/AppShell.tsx`:

```tsx
import { useReducer } from "react";
import { projectReducer } from "../app/projectReducer";
import { createSampleProject } from "../domain/sampleProject";
import { DrawingSurface2D } from "./DrawingSurface2D";
import { ModeSwitch } from "./ModeSwitch";
import { Preview3D } from "./Preview3D";
import { PropertyPanel } from "./PropertyPanel";
import { ToolPalette } from "./ToolPalette";
import { ViewTabs } from "./ViewTabs";

export function AppShell() {
  const [project, dispatch] = useReducer(projectReducer, undefined, createSampleProject);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>HouseClaw</h1>
          <p>轻量住宅建模与外观沟通工具</p>
        </div>
        <ModeSwitch mode={project.mode} onChange={(mode) => dispatch({ type: "set-mode", mode })} />
      </header>
      {project.mode === "2d" && (
        <ViewTabs
          activeView={project.activeView}
          onChange={(viewId) => dispatch({ type: "set-view", viewId })}
        />
      )}
      <div className="workspace">
        {project.mode === "2d" ? (
          <>
            <ToolPalette
              activeTool={project.activeTool}
              onChange={(toolId) => dispatch({ type: "set-tool", toolId })}
            />
            <DrawingSurface2D project={project} />
            <PropertyPanel project={project} />
          </>
        ) : (
          <Preview3D project={project} />
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Replace `App` and layout CSS**

Modify `src/App.tsx`:

```tsx
import { AppShell } from "./components/AppShell";

export default function App() {
  return <AppShell />;
}
```

Replace `src/styles.css`:

```css
:root {
  color: #1f2933;
  background: #f5f2eb;
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
    "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
select {
  font: inherit;
}

button {
  border: 1px solid #c8c1b8;
  background: #fffaf2;
  color: #1f2933;
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
}

button[aria-pressed="true"] {
  background: #1f6f5b;
  border-color: #1f6f5b;
  color: white;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto auto 1fr;
}

.topbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 16px 20px;
  background: #ffffff;
  border-bottom: 1px solid #ded8cf;
}

.topbar h1,
.topbar p {
  margin: 0;
}

.topbar p {
  margin-top: 4px;
  color: #65717d;
}

.mode-switch,
.view-tabs,
.tool-palette {
  display: flex;
  gap: 8px;
}

.view-tabs {
  padding: 10px 20px;
  background: #ebe4d8;
  border-bottom: 1px solid #d5cec4;
  overflow-x: auto;
}

.workspace {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) 240px;
  min-height: 0;
}

.tool-palette,
.property-panel {
  flex-direction: column;
  padding: 16px;
  background: #fffaf2;
  border-right: 1px solid #ded8cf;
}

.property-panel {
  border-right: 0;
  border-left: 1px solid #ded8cf;
}

.drawing-panel,
.preview-panel {
  min-height: 520px;
  padding: 20px;
  background: #f8f6f0;
}

.drawing-panel svg {
  width: 100%;
  height: min(70vh, 680px);
  background: #fffdf8;
  border: 1px solid #d7d0c6;
  border-radius: 8px;
}

.wall-line {
  stroke: #39434d;
  stroke-linecap: square;
}

.elevation-wall {
  fill: #eee8dc;
  stroke: #39434d;
  stroke-width: 0.04;
}

.opening-rect {
  fill: #c8e3ef;
  stroke: #263238;
  stroke-width: 0.04;
}

.preview-stage {
  min-height: 420px;
  display: grid;
  place-items: center;
  border: 1px solid #d7d0c6;
  border-radius: 8px;
  background: #eef3f1;
  color: #65717d;
}
```

- [ ] **Step 5: Verify UI tests pass**

Run:

```bash
bun run test -- src/__tests__/ui.test.tsx
```

Expected: both UI tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/App.tsx src/styles.css src/components src/__tests__/ui.test.tsx
git commit -m "feat: add 2d and 3d application shell"
```

---

## Task 8: Replace the 3D Placeholder with a Three.js Preview

**Files:**
- Modify: `src/components/Preview3D.tsx`
- Create: `src/rendering/threeScene.ts`
- Modify: `src/__tests__/ui.test.tsx`

- [ ] **Step 1: Extend the UI test for a real canvas host**

Modify the second test in `src/__tests__/ui.test.tsx`:

```tsx
  it("switches to 3d preview", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "3D" }));

    expect(screen.getByText("3D 外观预览")).toBeInTheDocument();
    expect(screen.getByLabelText("Three.js house preview")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the UI test to verify failure**

Run:

```bash
bun run test -- src/__tests__/ui.test.tsx
```

Expected: fail because the Three.js preview host has not been added.

- [ ] **Step 3: Implement the Three.js scene helper**

Create `src/rendering/threeScene.ts`:

```ts
import * as THREE from "three";
import { buildHouseGeometry } from "../geometry/houseGeometry";
import { wallLength } from "../domain/measurements";
import type { HouseProject, Wall } from "../domain/types";
import type { HouseGeometry } from "../geometry/types";

type SceneHandle = {
  dispose: () => void;
};

function wallAngle(wall: Wall): number {
  return Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
}

function materialFor(project: HouseProject, materialId: string): THREE.Material {
  const material = project.materials.find((candidate) => candidate.id === materialId);
  return new THREE.MeshStandardMaterial({
    color: material?.color ?? "#eeeeee",
    roughness: 0.85
  });
}

function addWallMeshes(scene: THREE.Scene, project: HouseProject, geometry: HouseGeometry) {
  for (const wallGeometry of geometry.walls) {
    const wall = project.walls.find((candidate) => candidate.id === wallGeometry.wallId);
    const storey = project.storeys.find((candidate) => candidate.id === wallGeometry.storeyId);
    if (!wall || !storey) continue;

    const length = wallLength(wall);
    const angle = wallAngle(wall);
    const material = materialFor(project, wall.materialId);

    for (const panel of wallGeometry.panels) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(panel.width, panel.height, wall.thickness),
        material
      );
      const along = panel.x + panel.width / 2;
      const localX = Math.cos(angle) * along;
      const localY = Math.sin(angle) * along;
      mesh.position.set(
        wall.start.x + localX,
        storey.elevation + panel.y + panel.height / 2,
        wall.start.y + localY
      );
      mesh.rotation.y = -angle;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }

    if (length === 0) {
      material.dispose();
    }
  }
}

export function mountHouseScene(container: HTMLElement, project: HouseProject): SceneHandle {
  const width = Math.max(container.clientWidth, 640);
  const height = Math.max(container.clientHeight, 420);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#eef3f1");

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(12, 8, 14);
  camera.lookAt(5, 2, 4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight("#ffffff", 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight("#ffffff", 1.4);
  sun.position.set(8, 12, 6);
  sun.castShadow = true;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 16),
    new THREE.MeshStandardMaterial({ color: "#d8d0c2", roughness: 0.9 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(5, -0.02, 4);
  ground.receiveShadow = true;
  scene.add(ground);

  addWallMeshes(scene, project, buildHouseGeometry(project));
  renderer.render(scene, camera);

  return {
    dispose: () => {
      renderer.dispose();
      container.innerHTML = "";
    }
  };
}
```

- [ ] **Step 4: Mount the scene in `Preview3D`**

Modify `src/components/Preview3D.tsx`:

```tsx
import { useEffect, useRef } from "react";
import type { HouseProject } from "../domain/types";
import { mountHouseScene } from "../rendering/threeScene";

type Props = {
  project: HouseProject;
};

export function Preview3D({ project }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const handle = mountHouseScene(hostRef.current, project);
    return () => handle.dispose();
  }, [project]);

  return (
    <section className="preview-panel" aria-label="3D preview">
      <h2>3D 外观预览</h2>
      <p>{project.name}</p>
      <div ref={hostRef} className="three-host" aria-label="Three.js house preview" />
    </section>
  );
}
```

Add this block to `src/styles.css`:

```css
.three-host {
  min-height: 520px;
  border: 1px solid #d7d0c6;
  border-radius: 8px;
  overflow: hidden;
  background: #eef3f1;
}

.three-host canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

- [ ] **Step 5: Verify build and tests**

Run:

```bash
bun run test -- src/__tests__/ui.test.tsx src/__tests__/geometry.test.ts
bun run build
```

Expected: UI and geometry tests pass, production build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/Preview3D.tsx src/rendering/threeScene.ts src/styles.css src/__tests__/ui.test.tsx
git commit -m "feat: render house prototype with threejs"
```

---

## Task 9: Add Material Catalog and Material Application UI

**Files:**
- Create: `src/materials/catalog.ts`
- Create: `public/materials/README.md`
- Modify: `src/domain/sampleProject.ts`
- Modify: `src/components/PropertyPanel.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/__tests__/ui.test.tsx`

- [ ] **Step 1: Add a UI test for material selection**

Append this test to `src/__tests__/ui.test.tsx`:

```tsx
  it("shows a reusable material catalog", () => {
    render(<App />);

    expect(screen.getByText("白色外墙涂料")).toBeInTheDocument();
    expect(screen.getByText("灰色石材")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify failure**

Run:

```bash
bun run test -- src/__tests__/ui.test.tsx
```

Expected: fail because the material catalog UI is not visible.

- [ ] **Step 3: Create the material catalog**

Create `src/materials/catalog.ts`:

```ts
import type { Material } from "../domain/types";

export const materialCatalog: Material[] = [
  {
    id: "mat-white-render",
    name: "白色外墙涂料",
    kind: "wall",
    color: "#f2eee6",
    repeat: { x: 2, y: 2 }
  },
  {
    id: "mat-gray-stone",
    name: "灰色石材",
    kind: "wall",
    color: "#8d9290",
    repeat: { x: 1.5, y: 1.5 }
  },
  {
    id: "mat-dark-frame",
    name: "深灰窗框",
    kind: "frame",
    color: "#263238"
  }
];
```

Create `public/materials/README.md`:

```markdown
# Material Assets

This folder is reserved for reusable material images generated or imported for the project.

The first prototype ships color-backed material definitions in `src/materials/catalog.ts`.
Generated wall, stone, roof, frame, and facade patch textures should be copied here before they are referenced by `textureUrl`.
```

- [ ] **Step 4: Use the catalog in the sample project**

Modify `src/domain/sampleProject.ts` so it imports and uses the catalog:

```ts
import type { HouseProject, Storey, Wall } from "./types";
import { materialCatalog } from "../materials/catalog";

const storeys: Storey[] = [
  { id: "1f", label: "1F", elevation: 0, height: 3.2, slabThickness: 0.18 },
  { id: "2f", label: "2F", elevation: 3.2, height: 3.2, slabThickness: 0.18 },
  { id: "3f", label: "3F", elevation: 6.4, height: 3.2, slabThickness: 0.18 }
];

const walls: Wall[] = [
  {
    id: "wall-front-1f",
    storeyId: "1f",
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 },
    thickness: 0.24,
    height: 3.2,
    exterior: true,
    materialId: "mat-white-render"
  },
  {
    id: "wall-right-1f",
    storeyId: "1f",
    start: { x: 10, y: 0 },
    end: { x: 10, y: 8 },
    thickness: 0.24,
    height: 3.2,
    exterior: true,
    materialId: "mat-white-render"
  },
  {
    id: "wall-back-1f",
    storeyId: "1f",
    start: { x: 10, y: 8 },
    end: { x: 0, y: 8 },
    thickness: 0.24,
    height: 3.2,
    exterior: true,
    materialId: "mat-white-render"
  },
  {
    id: "wall-left-1f",
    storeyId: "1f",
    start: { x: 0, y: 8 },
    end: { x: 0, y: 0 },
    thickness: 0.24,
    height: 3.2,
    exterior: true,
    materialId: "mat-white-render"
  }
];

export function createSampleProject(): HouseProject {
  return {
    id: "sample-house",
    name: "三层别墅草案",
    unitSystem: "metric",
    defaultWallThickness: 0.24,
    defaultStoreyHeight: 3.2,
    mode: "2d",
    activeView: "plan-1f",
    activeTool: "select",
    selectedObjectId: undefined,
    storeys,
    materials: materialCatalog,
    walls,
    openings: [
      {
        id: "window-front-1f",
        wallId: "wall-front-1f",
        type: "window",
        offset: 3,
        sillHeight: 0.9,
        width: 1.6,
        height: 1.3,
        frameMaterialId: "mat-dark-frame"
      }
    ]
  };
}
```

- [ ] **Step 5: Show material controls in the property panel**

Modify `src/components/PropertyPanel.tsx`:

```tsx
import type { HouseProject } from "../domain/types";

type Props = {
  project: HouseProject;
  onApplyWallMaterial: (wallId: string, materialId: string) => void;
};

export function PropertyPanel({ project, onApplyWallMaterial }: Props) {
  const selectedOpening = project.openings.find((opening) => opening.id === project.selectedObjectId);
  const firstWall = project.walls[0];

  return (
    <aside className="property-panel">
      <h2>属性</h2>
      {selectedOpening ? (
        <dl>
          <dt>窗宽</dt>
          <dd>{selectedOpening.width.toFixed(2)} m</dd>
          <dt>离地高度</dt>
          <dd>{selectedOpening.sillHeight.toFixed(2)} m</dd>
        </dl>
      ) : (
        <p>选择墙、窗或开孔后编辑尺寸。</p>
      )}
      <h3>材质库</h3>
      <div className="material-list">
        {project.materials
          .filter((material) => material.kind === "wall")
          .map((material) => (
            <button
              key={material.id}
              type="button"
              className="material-swatch"
              onClick={() => onApplyWallMaterial(firstWall.id, material.id)}
            >
              <span style={{ background: material.color }} />
              {material.name}
            </button>
          ))}
      </div>
    </aside>
  );
}
```

Modify the `PropertyPanel` call in `src/components/AppShell.tsx`:

```tsx
            <PropertyPanel
              project={project}
              onApplyWallMaterial={(wallId, materialId) =>
                dispatch({ type: "apply-wall-material", wallId, materialId })
              }
            />
```

Add this block to `src/styles.css`:

```css
.material-list {
  display: grid;
  gap: 8px;
}

.material-swatch {
  display: grid;
  grid-template-columns: 20px 1fr;
  align-items: center;
  gap: 8px;
  text-align: left;
}

.material-swatch span {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #9aa4ad;
}
```

- [ ] **Step 6: Verify material tests and build**

Run:

```bash
bun run test -- src/__tests__/ui.test.tsx src/__tests__/domain.test.ts src/__tests__/constraints.test.ts
bun run build
```

Expected: tests pass and build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/materials public/materials src/domain/sampleProject.ts src/components/PropertyPanel.tsx src/components/AppShell.tsx src/styles.css src/__tests__/ui.test.tsx
git commit -m "feat: add material catalog controls"
```

---

## Task 10: Add JSON Export/Import Controls

**Files:**
- Create: `src/export/exporters.ts`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/styles.css`
- Modify: `src/__tests__/ui.test.tsx`

- [ ] **Step 1: Add UI tests for export controls**

Append this test to `src/__tests__/ui.test.tsx`:

```tsx
  it("shows project JSON export controls", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: "导出 JSON" })).toBeInTheDocument();
    expect(screen.getByLabelText("导入 JSON")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify failure**

Run:

```bash
bun run test -- src/__tests__/ui.test.tsx
```

Expected: fail because export/import controls are not present.

- [ ] **Step 3: Add download helper**

Create `src/export/exporters.ts`:

```ts
export function downloadTextFile(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Wire export/import controls into the shell**

Modify `src/components/AppShell.tsx`:

```tsx
import { ChangeEvent, useReducer } from "react";
import { downloadTextFile } from "../export/exporters";
import { exportProjectJson, importProjectJson } from "../app/persistence";
import { projectReducer } from "../app/projectReducer";
import { createSampleProject } from "../domain/sampleProject";
import { DrawingSurface2D } from "./DrawingSurface2D";
import { ModeSwitch } from "./ModeSwitch";
import { Preview3D } from "./Preview3D";
import { PropertyPanel } from "./PropertyPanel";
import { ToolPalette } from "./ToolPalette";
import { ViewTabs } from "./ViewTabs";

export function AppShell() {
  const [project, dispatch] = useReducer(projectReducer, undefined, createSampleProject);

  function handleExport() {
    downloadTextFile("houseclaw-project.json", exportProjectJson(project));
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const json = await file.text();
    dispatch({ type: "replace-project", project: importProjectJson(json) });
    event.target.value = "";
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>HouseClaw</h1>
          <p>轻量住宅建模与外观沟通工具</p>
        </div>
        <div className="top-actions">
          <button type="button" onClick={handleExport}>
            导出 JSON
          </button>
          <label className="file-button">
            导入 JSON
            <input aria-label="导入 JSON" type="file" accept="application/json" onChange={handleImport} />
          </label>
          <ModeSwitch mode={project.mode} onChange={(mode) => dispatch({ type: "set-mode", mode })} />
        </div>
      </header>
      {project.mode === "2d" && (
        <ViewTabs
          activeView={project.activeView}
          onChange={(viewId) => dispatch({ type: "set-view", viewId })}
        />
      )}
      <div className="workspace">
        {project.mode === "2d" ? (
          <>
            <ToolPalette
              activeTool={project.activeTool}
              onChange={(toolId) => dispatch({ type: "set-tool", toolId })}
            />
            <DrawingSurface2D project={project} />
            <PropertyPanel
              project={project}
              onApplyWallMaterial={(wallId, materialId) =>
                dispatch({ type: "apply-wall-material", wallId, materialId })
              }
            />
          </>
        ) : (
          <Preview3D project={project} />
        )}
      </div>
    </main>
  );
}
```

Add this block to `src/styles.css`:

```css
.top-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-button {
  border: 1px solid #c8c1b8;
  background: #fffaf2;
  color: #1f2933;
  border-radius: 6px;
  padding: 8px 10px;
  cursor: pointer;
}

.file-button input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
  pointer-events: none;
}
```

- [ ] **Step 5: Verify export tests and build**

Run:

```bash
bun run test -- src/__tests__/ui.test.tsx src/__tests__/persistence.test.ts
bun run build
```

Expected: tests pass and build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/export src/components/AppShell.tsx src/styles.css src/__tests__/ui.test.tsx
git commit -m "feat: add project json import export"
```

---

## Task 11: Final Verification and Prototype Launch

**Files:**
- Modify: `docs/2026-04-26-house-design-tool-feasibility-design.md` only if verification reveals a wording mismatch between the spec and delivered prototype.

- [ ] **Step 1: Run the full automated suite**

Run:

```bash
bun run test
bun run build
```

Expected: all tests pass and production build succeeds.

- [ ] **Step 2: Start the local development server**

Run:

```bash
bun run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL such as `http://127.0.0.1:5173/`.

- [ ] **Step 3: Manual prototype smoke test**

Open the local URL and verify:

1. The app opens to `2D`.
2. `1F` is selected.
3. The wall rectangle appears in the SVG drawing surface.
4. `正面` shows the front wall and window opening.
5. `3D` shows a Three.js canvas.
6. The material catalog shows `白色外墙涂料` and `灰色石材`.
7. `导出 JSON` downloads `houseclaw-project.json`.
8. The downloaded JSON includes `walls`, `openings`, `storeys`, and `materials`.

- [ ] **Step 4: Check git state**

Run:

```bash
git status --short
```

Expected: only intentional files are modified or untracked. Ignore `.DS_Store` unless the user asks to clean repository metadata.

- [ ] **Step 5: Commit verification notes if the spec changed**

If the spec was modified in Step 1, commit it:

```bash
git add docs/2026-04-26-house-design-tool-feasibility-design.md
git commit -m "docs: align prototype spec with implementation"
```

If the spec was not modified, skip this commit.

---

## Self-Review Notes

Spec coverage:

- Product boundary: covered by the scope boundary and by stopping at the first closed loop.
- `HouseModel`: covered by Tasks 2 and 3.
- `ConstraintEngine`: covered by Task 3.
- `ViewProjection`: covered by Task 4.
- `GeometryBuilder`: covered by Task 5.
- `Renderer3D`: covered by Task 8.
- `MaterialSystem`: covered by Task 9.
- JSON persistence: covered by Tasks 6 and 10.
- First prototype validation: covered by Task 11.

Known exclusions for the next plan:

- Balcony object editing
- Roof model and roof mesh generation
- Three-storey wall copying and per-floor editing UI
- Interactive wall drawing with pointer events
- Imagegen-generated texture production
- 2D and 3D screenshot export
- Scheme notes and one-page communication export
