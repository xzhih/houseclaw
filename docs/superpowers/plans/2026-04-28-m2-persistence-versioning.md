# M2 持久化版本化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `src/app/persistence.ts` 中隐式的 `withImportedDefaults` 兼容回填，形式化为 schema version + migrate 链；`HouseProject.schemaVersion: 1` 字面量类型。

**Architecture:** `MIGRATIONS` 数组（v0→v1 一步）+ `migrate(raw)` 步进 runner。`importProjectJson` 改为：`parse → strip transients → migrate → assert（含 schemaVersion 检查）→ validateSkirts → assertValidProject`。`exportProjectJson` 强制写 `schemaVersion: CURRENT_SCHEMA_VERSION`。

**Tech Stack:** TypeScript, Vitest, bun

**关联文档：**
- Spec: `docs/superpowers/specs/2026-04-28-m2-persistence-versioning-design.md`
- Roadmap: `docs/2026-04-28-iteration-friction-roadmap.md`

---

## 文件结构

| 文件 | 操作 | 责任 |
|---|---|---|
| `src/domain/types.ts` | 修改 | `HouseProject` 增 `schemaVersion: 1` 字面量字段 |
| `src/domain/sampleProject.ts` | 修改 | `createSampleProject` 加 `schemaVersion: 1` |
| `src/app/persistence.ts` | 修改 | 加 MIGRATIONS / migrate / CURRENT_SCHEMA_VERSION；改 import/export/asserter；删 withImportedDefaults |
| `src/__tests__/persistence.test.ts` | 修改 | 加 schema migration describe（5 tests，含 V0_FIXTURE）；调整 legacy-balcony 测试 |

---

## Task 1：foundation — 加 schemaVersion 字段

> **目标**：把 `schemaVersion: 1` 加进 `HouseProject` 类型与 `createSampleProject`；调整既有 legacy 测试 fixture 让它真的是 v0 格式（不含 schemaVersion）。完成后所有现有测试仍绿。

**Files:**
- Modify: `src/domain/types.ts:148-165`
- Modify: `src/domain/sampleProject.ts:57+`（`createSampleProject` 函数返回值）
- Modify: `src/__tests__/persistence.test.ts:47-53`（legacy 测试 destructure schemaVersion 一并剥离）

- [ ] **Step 1.1：HouseProject 类型加 schemaVersion**

`src/domain/types.ts:148-165` 的 HouseProject 在第一行加 `schemaVersion: 1`：

```ts
export type HouseProject = {
  schemaVersion: 1;
  id: string;
  name: string;
  unitSystem: UnitSystem;
  defaultWallThickness: number;
  defaultStoreyHeight: number;
  mode: Mode;
  activeView: ViewId;
  activeTool: ToolId;
  selection?: ObjectSelection;
  storeys: Storey[];
  materials: Material[];
  walls: Wall[];
  openings: Opening[];
  balconies: Balcony[];
  roof?: Roof;
  skirts: SkirtRoof[];
};
```

字面量类型 `1`（不是 `number`）：未来 bump 时此处必须一起改。

- [ ] **Step 1.2：createSampleProject 加 schemaVersion: 1**

打开 `src/domain/sampleProject.ts`，找到 `createSampleProject` 函数返回的 object literal，在最前面加：

```ts
export function createSampleProject(): HouseProject {
  return {
    schemaVersion: 1,
    id: ...,
    // ... 其他原有字段
  };
}
```

具体行数请用 Read 确认；插入位置紧跟 `return {` 后第一行。

- [ ] **Step 1.3：调整 legacy 测试 destructure**

`src/__tests__/persistence.test.ts:47-53` 当前是：

```ts
it("imports older project JSON without balcony data", () => {
  const project = createSampleProject();
  const { balconies: _balconies, ...legacyProject } = project;
  const restored = importProjectJson(JSON.stringify(legacyProject));
  expect(restored.balconies).toEqual([]);
});
```

改为：

```ts
it("imports older project JSON without balcony data", () => {
  const project = createSampleProject();
  const { balconies: _balconies, schemaVersion: _v, ...legacyProject } = project;
  const restored = importProjectJson(JSON.stringify(legacyProject));
  expect(restored.balconies).toEqual([]);
});
```

理由：`createSampleProject` 现在返回 `schemaVersion: 1`。如果只剥 balconies 不剥 schemaVersion，JSON 会是 `{ schemaVersion: 1, ...无 balconies }` —— Task 3 完成后会被 asserter 当成"v1 项目缺 balconies"拒绝，破坏 legacy 测试语义。把 schemaVersion 一并剥掉，让 fixture 是真的 v0 格式。

注：本 Task 完成时 asserter 还没改，行为不变，但顺手改了让后续 Task 不会回过来动这一处。

- [ ] **Step 1.4：跑 lint + test**

```bash
bun run lint && bun run test
```

**期望**：全绿。Task 1 仅扩展类型与 fixture，不动行为。

如果 TS 报错 "Property 'schemaVersion' is missing in type ..."，说明有别的 HouseProject literal 构造点没找到。grep 一下：

```bash
grep -rn ": HouseProject\s*=\s*{" src/
```

如果发现新的字面量构造（不是 spread `...project`），加上 `schemaVersion: 1` 即可。

- [ ] **Step 1.5：commit**

```bash
git add src/domain/types.ts src/domain/sampleProject.ts src/__tests__/persistence.test.ts
git commit -m "$(cat <<'EOF'
feat(types): HouseProject 增 schemaVersion: 1 字面量字段

为 M2 持久化版本化做准备。createSampleProject 提供字段；
legacy 测试 fixture 同步剥掉 schemaVersion 让它保持 v0 形态。

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2：write failing schema migration tests

> **目标**：先写 5 个新测试 + 调整 1 个现有测试断言，验证它们 **当前失败**（schemaVersion 字段没在 export/import 里被处理）。这是 TDD 的"红"阶段。

**Files:**
- Modify: `src/__tests__/persistence.test.ts`

- [ ] **Step 2.1：新增 schema migration describe 块**

在 `src/__tests__/persistence.test.ts` 文件末尾（最后一个 describe 之后），添加：

```ts
const V0_FIXTURE = {
  id: "p1",
  name: "v0 sample",
  unitSystem: "metric",
  mode: "2d",
  activeView: "plan-1f",
  activeTool: "select",
  defaultWallThickness: 0.2,
  defaultStoreyHeight: 3,
  storeys: [{ id: "1f", label: "1F", elevation: 0, height: 3, slabThickness: 0.2 }],
  materials: [{ id: "m-wall", name: "墙", color: "#fff", kind: "wall" }],
  walls: [],
  openings: [],
  // 缺 balconies / skirts / roof / schemaVersion
  selection: { kind: "wall", id: "abc" }, // transient
};

describe("schema migration", () => {
  it("migrates v0 (no schemaVersion) → v1: backfills arrays, drops transient", () => {
    const restored = importProjectJson(JSON.stringify(V0_FIXTURE));
    expect(restored.schemaVersion).toBe(1);
    expect(restored.balconies).toEqual([]);
    expect(restored.skirts).toEqual([]);
    expect(restored.roof).toBeUndefined();
    expect(restored.selection).toBeUndefined();
  });

  it("migrates v0 with invalid roof: drops roof silently", () => {
    const v0 = {
      ...V0_FIXTURE,
      roof: { pitch: 999, overhang: 99, materialId: "x", edges: {} },
    };
    const restored = importProjectJson(JSON.stringify(v0));
    expect(restored.roof).toBeUndefined();
  });

  it("rejects schemaVersion newer than supported", () => {
    const v999 = { ...V0_FIXTURE, schemaVersion: 999, balconies: [], skirts: [] };
    expect(() => importProjectJson(JSON.stringify(v999))).toThrow(/newer than supported/);
  });

  it("v1 round-trip preserves schemaVersion", () => {
    const project = createSampleProject();
    const json = exportProjectJson(project);
    expect(JSON.parse(json).schemaVersion).toBe(1);
    const restored = importProjectJson(json);
    expect(restored.schemaVersion).toBe(1);
  });

  it("export always writes schemaVersion: 1 even if memory copy differs", () => {
    const project = { ...createSampleProject(), schemaVersion: 0 as unknown as 1 };
    const json = exportProjectJson(project);
    expect(JSON.parse(json).schemaVersion).toBe(1);
  });
});
```

- [ ] **Step 2.2：跑测试，确认相应测试 fail**

```bash
bun run test src/__tests__/persistence.test.ts 2>&1 | tail -40
```

**期望失败**（在 Task 3 之前）：
- `migrates v0 (no schemaVersion) → v1: backfills arrays, drops transient` —— `expect(restored.schemaVersion).toBe(1)` 失败（当前 import 不加 schemaVersion）
- `rejects schemaVersion newer than supported` —— 没抛错（当前 asserter 不检查 schemaVersion）
- `export always writes schemaVersion: 1 even if memory copy differs` —— 失败（exportProjectJson 透传内存值）
- `v1 round-trip preserves schemaVersion` —— 可能通过（createSampleProject 现在有 schemaVersion 字段，export 透传，import 透传不去掉）—— 但这取决于 asserter 是否抛错，可能失败也可能通过

**期望通过**：
- `migrates v0 with invalid roof: drops roof silently` —— 现有 withImportedDefaults 已实现这个

如果有些预期失败的测试反而通过了，停下来诊断——可能 Task 1 的改动让某个行为提前实现了。

- [ ] **Step 2.3：不要修复，先 commit failing tests**

TDD 流程把红测试单独 commit 锁住意图。但因为 vitest 默认 fail 的 test 阻塞 CI，**这一步不 commit**——直接进入 Task 3。

如果你希望分两次 commit（一次写测试、一次实现），可以用 `it.skip` 暂时跳过失败的，commit，然后 Task 3 删 skip 一并实现。这里我们选择**不分**，让 Task 3 一次完成，避免引入 skip 的临时态。

继续 Task 3。

---

## Task 3：implement migrate + wire into import/export/asserter + delete withImportedDefaults

> **目标**：加 `MIGRATIONS` 数组、`migrate()` runner、`CURRENT_SCHEMA_VERSION` 常量；改 importProjectJson 走 migrate；改 exportProjectJson 强制写 version；改 assertImportedProjectShape 校验 schemaVersion；删除 withImportedDefaults。Task 2 中的失败测试此后全绿。

**Files:**
- Modify: `src/app/persistence.ts`

- [ ] **Step 3.1：在 persistence.ts 顶部加常量与类型**

在 `src/app/persistence.ts` 现有 import 之后、`VALID_TOOL_IDS` 之前，加：

```ts
const CURRENT_SCHEMA_VERSION = 1;

type Migration = {
  from: number;
  to: number;
  apply(raw: ProjectJsonObject): ProjectJsonObject;
};
```

注意 `ProjectJsonObject` 已在 line 28 定义为 `Record<string, unknown>`。

- [ ] **Step 3.2：删除 withImportedDefaults，加 MIGRATIONS 与 migrate**

`src/app/persistence.ts:40-68` 的 `withImportedDefaults` 整段删除。在原位置（assertObject 等 helpers 之前）加：

```ts
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
```

注意 v0→v1 step **不**包含 `delete raw.selection / selectedObjectId` —— 那是 transient strip，移到 importProjectJson 直接做。

注意 `assertRoofShape` 在 line 156 已定义；MIGRATIONS 在它之前还是之后？JS module 内函数声明会 hoist，typeof MIGRATIONS 内部引用 assertRoofShape 没问题。但为了可读性，如果 MIGRATIONS 写在 assertRoofShape 之前，TS 不会报错（函数声明 hoist），但视觉上有"前向引用"。可以接受。

- [ ] **Step 3.3：改 importProjectJson**

`src/app/persistence.ts:310-324` 当前：

```ts
export function importProjectJson(json: string): HouseProject {
  const parsed = withImportedDefaults(JSON.parse(json) as unknown);
  assertImportedProjectShape(parsed);
  parsed.skirts = validateSkirts(parsed.skirts, parsed.walls);
  try {
    return assertValidProject(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    invalidProjectJson(message);
  }
}
```

替换为：

```ts
export function importProjectJson(json: string): HouseProject {
  const raw = JSON.parse(json) as unknown;
  assertProjectJsonObject(raw);
  const cloned = { ...raw };
  delete cloned.selection;
  delete cloned.selectedObjectId;
  const migrated = migrate(cloned);
  assertImportedProjectShape(migrated);
  migrated.skirts = validateSkirts(migrated.skirts, migrated.walls);
  try {
    return assertValidProject(migrated);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    invalidProjectJson(message);
  }
}
```

变化：
1. `assertProjectJsonObject(raw)` 显式断言为对象（migrate 假设入参已是 object）
2. `{ ...raw }` 浅拷贝避免污染原始 parse 结果
3. `delete cloned.selection / selectedObjectId` 在 migrate **之前**做 transient strip——版本无关
4. `migrate(cloned)` 替代 `withImportedDefaults`

- [ ] **Step 3.4：改 exportProjectJson**

`src/app/persistence.ts:305-308` 当前：

```ts
export function exportProjectJson(project: HouseProject): string {
  const { selection: _selection, ...rest } = project;
  return JSON.stringify(rest, null, 2);
}
```

替换为：

```ts
export function exportProjectJson(project: HouseProject): string {
  const { selection: _selection, ...rest } = project;
  return JSON.stringify({ ...rest, schemaVersion: CURRENT_SCHEMA_VERSION }, null, 2);
}
```

强制写 CURRENT_SCHEMA_VERSION 而不是透传 `project.schemaVersion`，避免内存里损坏的版本号被序列化。

- [ ] **Step 3.5：改 assertImportedProjectShape 校验 schemaVersion**

在 `src/app/persistence.ts:252-303` 的 `assertImportedProjectShape` 函数体里，找到 `assertProjectJsonObject(value);` 之后的下一行，加入 schemaVersion 检查：

```ts
function assertImportedProjectShape(value: unknown): asserts value is HouseProject {
  assertProjectJsonObject(value);

  const schemaVersion = assertFiniteNumberField(value, "schemaVersion");
  if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    invalidProjectJson(`schemaVersion must be ${CURRENT_SCHEMA_VERSION}.`);
  }

  const storeys = assertArrayField(value, "storeys");
  // ...其余原有逻辑不动
```

注意 `assertFiniteNumberField` 在 line 104 已定义；返回 number。

- [ ] **Step 3.6：跑测试**

```bash
bun run lint && bun run test
```

**期望**：全绿。Task 2 中预期失败的 4 个测试现应通过；现有测试也应继续绿。

如果 `imports older project JSON without balcony data` 仍失败，检查 Task 1 的 destructure 调整是否生效（应当 destructure 出 `schemaVersion`）。

如果 `ignores legacy selectedObjectId fields on import` 失败，检查 Step 3.3 的 transient strip 顺序——它必须在 migrate 之前（或之后都行，但必须运行）。

- [ ] **Step 3.7：commit**

```bash
git add src/app/persistence.ts
git commit -m "$(cat <<'EOF'
feat(persistence): MIGRATIONS 链 + schemaVersion 校验

- 加 CURRENT_SCHEMA_VERSION=1 / Migration 类型 / MIGRATIONS 数组（v0→v1 一步）
- migrate() runner：识别 schemaVersion，按链推进；未来版本拒绝
- importProjectJson 走 migrate，transient strip 前置（版本无关）
- exportProjectJson 强制写 CURRENT_SCHEMA_VERSION
- assertImportedProjectShape 校验 schemaVersion === 1
- 删除 withImportedDefaults（功能迁入 v0→v1 step）

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4：验收

> **目标**：跑全量构建/测试；做 schemaVersion=999 的 exhaustiveness 实验；确认 spec Done criteria 全部满足。

- [ ] **Step 4.1：build 全绿**

```bash
bun run build
```

**期望**：`tsc --noEmit && vite build` 无错。

- [ ] **Step 4.2：test 全绿**

```bash
bun run test
```

**期望**：约 335 tests pass（330 原有 + 5 新增）。

- [ ] **Step 4.3：exhaustiveness 锁定（已由测试覆盖）**

`rejects schemaVersion newer than supported` 单测已经锁住"未来版本被拒绝"这条契约。可选的手动复现：`bun run dev` 启动后，浏览器 dev tools → Application → localStorage → 找到 `houseclaw.project` key → 把 JSON 里的 `schemaVersion` 改成 `999` → 刷新页面，应该看到 `import error`（应用不闪退）。

不强制做这步——单测已足够。

- [ ] **Step 4.4：grep 确认 withImportedDefaults 真的删干净了**

```bash
grep -rn "withImportedDefaults" src/
```

**期望**：无输出（包括注释）。

- [ ] **Step 4.5：grep 确认 schemaVersion 处处对齐**

```bash
grep -rn "schemaVersion" src/ | sort
```

**期望输出**（大致）：
- `src/__tests__/persistence.test.ts` —— V0_FIXTURE 内嵌引用 + 多个 expect + destructure
- `src/app/persistence.ts` —— CURRENT_SCHEMA_VERSION 定义 + MIGRATIONS 内 set + asserter check + export 写
- `src/domain/sampleProject.ts` —— `schemaVersion: 1`
- `src/domain/types.ts` —— 类型定义

不应有"忘了改"的零散位置。

- [ ] **Step 4.6：人工确认 Done criteria**

对照 spec Done criteria 4 条：

1. ✅ `bun run lint` + `bun run test` + `bun run build` 全绿（Step 4.1, 4.2）
2. ✅ 现有 sample 项目 round-trip 加载无回退（Task 2 的 round-trip test 锁定）
3. ✅ 加新构件路径清晰（这条是设计目标，不需要测；下次加新数组时验证）
4. ✅ 验收实验：v999 拒绝（Step 4.3 + 测试用例双重锁定）

不需要 commit。

---

## 总结：commit 链

完成后 `git log --oneline xzhih-dev` 在 spec commit 后应看到：

```
<hash> feat(persistence): MIGRATIONS 链 + schemaVersion 校验
<hash> feat(types): HouseProject 增 schemaVersion: 1 字面量字段
c3083be docs(spec): M2 修正 — transient strip 移出 migrate
b8665e4 docs(spec): M2 持久化版本化设计
```

3 个代码相关 commit + 2 个文档 commit。
