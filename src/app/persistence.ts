import { assertValidProject } from "../domain/constraints";
import type { HouseProject, MaterialKind, OpeningType, SkirtRoof, ToolId, ViewId, Wall } from "../domain/types";

const VALID_TOOL_IDS = [
  "select",
  "wall",
  "door",
  "window",
  "opening",
  "balcony",
  "stair",
  "skirt",
  "material",
] as const satisfies readonly ToolId[];
const VALID_VIEW_IDS = [
  "plan-1f",
  "plan-2f",
  "plan-3f",
  "elevation-front",
  "elevation-back",
  "elevation-left",
  "elevation-right",
  "roof",
] as const satisfies readonly ViewId[];
const VALID_MATERIAL_KINDS = ["wall", "roof", "frame", "railing", "decor"] as const satisfies readonly MaterialKind[];
const VALID_OPENING_TYPES = ["door", "window", "void"] as const satisfies readonly OpeningType[];

type ProjectJsonObject = Record<string, unknown>;

const CURRENT_SCHEMA_VERSION = 1;

type Migration = {
  from: number;
  to: number;
  apply(raw: ProjectJsonObject): ProjectJsonObject;
};

function invalidProjectJson(message: string): never {
  throw new Error(`Invalid project JSON: ${message}`);
}

function assertProjectJsonObject(value: unknown): asserts value is ProjectJsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidProjectJson("expected a project object.");
  }
}

const MIGRATIONS: Migration[] = [
  {
    from: 0,
    to: 1,
    apply(raw) {
      if (raw.balconies === undefined) raw.balconies = [];
      if (raw.skirts === undefined) raw.skirts = [];
      if (raw.roof !== undefined) {
        try {
          assertRoofShape(raw.roof);
        } catch {
          delete raw.roof;
        }
      }
      raw.schemaVersion = 1;
      return raw;
    },
  },
];

function migrate(raw: ProjectJsonObject): ProjectJsonObject {
  let v = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 0;
  let p = raw;
  while (v < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === v);
    if (!step) invalidProjectJson(`No migration path from schemaVersion ${v}.`);
    p = step.apply(p);
    v = step.to;
  }
  if (v > CURRENT_SCHEMA_VERSION) {
    invalidProjectJson(`schemaVersion ${v} is newer than supported (${CURRENT_SCHEMA_VERSION}).`);
  }
  return p;
}

function assertObject(value: unknown, field: string): asserts value is ProjectJsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidProjectJson(`${field} must be an object.`);
  }
}

function assertArrayField(value: ProjectJsonObject, field: string): unknown[] {
  const arrayValue = value[field];

  if (!Array.isArray(arrayValue)) {
    invalidProjectJson(`${field} must be an array.`);
  }

  return arrayValue;
}

function assertStringField(value: ProjectJsonObject, field: string): void {
  if (typeof value[field] !== "string") {
    invalidProjectJson(`${field} must be a string.`);
  }
}

function assertOptionalStringField(value: ProjectJsonObject, field: string): void {
  if (value[field] !== undefined && typeof value[field] !== "string") {
    invalidProjectJson(`${field} must be a string.`);
  }
}

function assertBooleanField(value: ProjectJsonObject, field: string): void {
  if (typeof value[field] !== "boolean") {
    invalidProjectJson(`${field} must be a boolean.`);
  }
}

function assertFiniteNumberField(value: ProjectJsonObject, field: string): number {
  const numberValue = value[field];

  if (typeof numberValue !== "number" || !Number.isFinite(numberValue)) {
    invalidProjectJson(`${field} must be a finite number.`);
  }

  return numberValue;
}

function assertPositiveNumberField(value: ProjectJsonObject, field: string): void {
  const numberValue = assertFiniteNumberField(value, field);

  if (numberValue <= 0) {
    invalidProjectJson(`${field} must be positive.`);
  }
}

function assertNonNegativeNumberField(value: ProjectJsonObject, field: string): void {
  const numberValue = assertFiniteNumberField(value, field);

  if (numberValue < 0) {
    invalidProjectJson(`${field} must be non-negative.`);
  }
}

function assertPointField(value: ProjectJsonObject, field: string): void {
  const point = value[field];

  assertObject(point, field);
  assertFiniteNumberField(point, "x");
  assertFiniteNumberField(point, "y");
}

function assertRepeatField(value: ProjectJsonObject): void {
  if (value.repeat === undefined) {
    return;
  }

  const repeat = value.repeat;

  assertObject(repeat, "repeat");
  assertPositiveNumberField(repeat, "x");
  assertPositiveNumberField(repeat, "y");
}

function assertIncludes<T extends string>(values: readonly T[], value: unknown, field: string): void {
  if (typeof value !== "string" || !values.includes(value as T)) {
    invalidProjectJson(`${field} is not supported.`);
  }
}

function assertRoofShape(value: unknown): void {
  assertObject(value, "roof");
  const pitch = assertFiniteNumberField(value, "pitch");
  if (pitch < Math.PI / 36 || pitch > Math.PI / 3) {
    invalidProjectJson("roof.pitch out of range.");
  }
  const overhang = assertFiniteNumberField(value, "overhang");
  if (overhang < 0 || overhang > 2) {
    invalidProjectJson("roof.overhang out of range.");
  }
  assertStringField(value, "materialId");
  const edges = (value as ProjectJsonObject).edges;
  assertObject(edges, "roof.edges");
  let hasEave = false;
  for (const v of Object.values(edges as Record<string, unknown>)) {
    if (v !== "eave" && v !== "gable") invalidProjectJson("roof.edges values must be 'eave' or 'gable'.");
    if (v === "eave") hasEave = true;
  }
  if (!hasEave) invalidProjectJson("roof.edges must contain at least one 'eave'.");
}

function assertStoreyShape(value: unknown): void {
  assertObject(value, "storey");
  assertStringField(value, "id");
  assertStringField(value, "label");
  assertFiniteNumberField(value, "elevation");
  assertPositiveNumberField(value, "height");
  assertPositiveNumberField(value, "slabThickness");
}

function assertMaterialShape(value: unknown): void {
  assertObject(value, "material");
  assertStringField(value, "id");
  assertStringField(value, "name");
  assertStringField(value, "color");
  assertIncludes(VALID_MATERIAL_KINDS, value.kind, "material.kind");
  assertOptionalStringField(value, "textureUrl");
  assertRepeatField(value);
}

function assertWallShape(value: unknown): void {
  assertObject(value, "wall");
  assertStringField(value, "id");
  assertStringField(value, "storeyId");
  assertStringField(value, "materialId");
  assertPointField(value, "start");
  assertPointField(value, "end");
  assertPositiveNumberField(value, "thickness");
  assertPositiveNumberField(value, "height");
  assertBooleanField(value, "exterior");
}

function assertOpeningShape(value: unknown): void {
  assertObject(value, "opening");
  assertStringField(value, "id");
  assertStringField(value, "wallId");
  assertStringField(value, "frameMaterialId");
  assertIncludes(VALID_OPENING_TYPES, value.type, "opening.type");
  assertNonNegativeNumberField(value, "offset");
  assertNonNegativeNumberField(value, "sillHeight");
  assertPositiveNumberField(value, "width");
  assertPositiveNumberField(value, "height");
}

function assertBalconyShape(value: unknown): void {
  assertObject(value, "balcony");
  assertStringField(value, "id");
  assertStringField(value, "storeyId");
  assertStringField(value, "attachedWallId");
  assertStringField(value, "materialId");
  assertStringField(value, "railingMaterialId");
  assertNonNegativeNumberField(value, "offset");
  assertPositiveNumberField(value, "width");
  assertPositiveNumberField(value, "depth");
  assertPositiveNumberField(value, "slabThickness");
  assertPositiveNumberField(value, "railingHeight");
}

function validateSkirts(raw: unknown, walls: Wall[]): SkirtRoof[] {
  if (!Array.isArray(raw)) return [];
  const wallIds = new Set(walls.map((w) => w.id));
  return raw.filter((s): s is SkirtRoof => {
    if (!s || typeof s !== "object") return false;
    if (typeof s.id !== "string") return false;
    if (typeof s.hostWallId !== "string" || !wallIds.has(s.hostWallId)) return false;
    if (typeof s.offset !== "number" || s.offset < 0) return false;
    if (typeof s.width !== "number" || s.width < 0.3) return false;
    if (typeof s.depth !== "number" || s.depth < 0.3 || s.depth > 4) return false;
    if (typeof s.pitch !== "number" || s.pitch < Math.PI / 36 || s.pitch > Math.PI / 3) return false;
    if (typeof s.overhang !== "number" || s.overhang < 0.05 || s.overhang > 1.5) return false;
    if (typeof s.elevation !== "number") return false;
    if (typeof s.materialId !== "string") return false;
    return true;
  });
}

function assertImportedProjectShape(value: unknown): asserts value is HouseProject {
  assertProjectJsonObject(value);

  const schemaVersion = assertFiniteNumberField(value, "schemaVersion");
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    invalidProjectJson(`schemaVersion must be ${CURRENT_SCHEMA_VERSION}.`);
  }

  const storeys = assertArrayField(value, "storeys");
  const materials = assertArrayField(value, "materials");
  const walls = assertArrayField(value, "walls");
  const openings = assertArrayField(value, "openings");
  const balconies = assertArrayField(value, "balconies");

  for (const field of ["id", "name", "unitSystem", "mode", "activeView", "activeTool"]) {
    assertStringField(value, field);
  }

  for (const field of ["defaultWallThickness", "defaultStoreyHeight"]) {
    assertPositiveNumberField(value, field);
  }

  if (value.unitSystem !== "metric") {
    invalidProjectJson("unitSystem must be metric.");
  }

  if (value.mode !== "2d" && value.mode !== "3d") {
    invalidProjectJson("mode must be 2d or 3d.");
  }

  if (!VALID_TOOL_IDS.includes(value.activeTool as ToolId)) {
    invalidProjectJson("activeTool is not supported.");
  }

  if (!VALID_VIEW_IDS.includes(value.activeView as ViewId)) {
    // Permit dynamic plan-<storeyId> ids that match a defined storey.
    const planMatch = /^plan-(.+)$/.exec(value.activeView as string);
    const matchedStorey =
      planMatch
        ? storeys.some(
            (storey) =>
              typeof storey === "object" &&
              storey !== null &&
              (storey as { id?: unknown }).id === planMatch[1],
          )
        : false;
    if (!matchedStorey) {
      invalidProjectJson("activeView is not supported.");
    }
  }

  storeys.forEach(assertStoreyShape);
  materials.forEach(assertMaterialShape);
  walls.forEach(assertWallShape);
  openings.forEach(assertOpeningShape);
  balconies.forEach(assertBalconyShape);
}

export function exportProjectJson(project: HouseProject): string {
  const { selection: _selection, ...rest } = project;
  return JSON.stringify({ ...rest, schemaVersion: CURRENT_SCHEMA_VERSION }, null, 2);
}

function normalizeRoof(p: ProjectJsonObject): ProjectJsonObject {
  if (p.roof !== undefined) {
    try {
      assertRoofShape(p.roof);
    } catch {
      delete p.roof;
    }
  }
  return p;
}

export function importProjectJson(json: string): HouseProject {
  const raw = JSON.parse(json) as unknown;
  assertProjectJsonObject(raw);
  const cloned = { ...raw };
  delete cloned.selection;
  delete cloned.selectedObjectId;
  const migrated = migrate(cloned);
  normalizeRoof(migrated);
  assertImportedProjectShape(migrated);

  // Filter skirts to only those with valid shape and a known host wall.
  // Done post-assertion so `migrated.walls` is already type-safe.
  migrated.skirts = validateSkirts(migrated.skirts, migrated.walls);

  try {
    return assertValidProject(migrated);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    invalidProjectJson(message);
  }
}

export function saveProjectToLocalStorage(project: HouseProject, key = "houseclaw.project"): void {
  localStorage.setItem(key, exportProjectJson(project));
}

export function loadProjectFromLocalStorage(key = "houseclaw.project"): HouseProject | undefined {
  const json = localStorage.getItem(key);
  return json ? importProjectJson(json) : undefined;
}
