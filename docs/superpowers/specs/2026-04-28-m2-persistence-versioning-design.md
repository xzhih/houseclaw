# M2：持久化版本化

日期：2026-04-28
分支：`xzhih-dev`
路线图：`docs/2026-04-28-iteration-friction-roadmap.md`

## 背景

`src/app/persistence.ts` 中 `withImportedDefaults`（line 40-68）是当前"为兼容老存档而散在的回填逻辑"——补 `balconies: []` / `skirts: []`、剔除无效 `roof` 形状、清掉 transient `selection` / `selectedObjectId`。

这种隐式回填的问题：

- 每次新增 array 字段（M1 加 skirts 时就发生过），都要记得改这里——容易漏
- 老存档与新代码的"兼容假设"散在代码里，没有形式化记录
- 没有办法表达"破坏性 schema 变更"——未来若 M3/M4 改字段名或重整结构，没有锚点知道哪些是老格式

本轮把"加载时的兼容逻辑"形式化为 **schema 版本 + 迁移链**。

## 目标

- `HouseProject` 增 `schemaVersion: 1`（字面量类型，必填）
- 把 `withImportedDefaults` 形式化为一个 v0→v1 迁移步骤；老存档（无 schemaVersion）被识别为 v0
- 导出永远写 `schemaVersion: 1`；导入校验版本号
- 加新构件数组时路径清晰：定义 migration step → 加 assert → 加 type 字段，不会再"忘改 persistence.ts"

## 非目标（明确推迟）

- mutation 层重构（M3 范围）
- 真实 v1→v2 迁移（等 M3/M4 出现破坏性 schema 变更时才需要）
- localStorage key namespacing / 多版本并存
- 损坏存档的错误恢复 UI（仍直接抛 `Invalid project JSON: ...`）
- DrawingSurface2D 拆分（M4 范围）

## 方案

### 整体结构

修改 2 个文件，1 个测试文件加内容（无新文件）：

```
~ src/domain/types.ts             # HouseProject 增 schemaVersion: 1
~ src/app/persistence.ts          # withImportedDefaults → MIGRATIONS / migrate；export 写 version；assert 校验
~ src/__tests__/persistence.test.ts # 增 schema migration describe，含 v0 fixture
```

调用方需要补 `schemaVersion: 1` 的文件（约 2-3 处）：
- `src/domain/sampleProject.ts` —— `createSampleProject` 构造时加
- 可能的其他 `HouseProject` 字面量构造点（`AppShell.tsx` 等）—— TS 字面量类型会强制提示，不会漏

### schemaVersion 字段

```ts
// src/domain/types.ts
export type HouseProject = {
  schemaVersion: 1;            // 字面量类型；未来 bump 时此处一起改
  id: string;
  name: string;
  // ... 其他字段
};
```

字面量类型而非 `number`：内存里只能是 1，避免运行期持有"奇怪版本号"的项目。

### MIGRATIONS 链

```ts
// src/app/persistence.ts
const CURRENT_SCHEMA_VERSION = 1;

type Migration = {
  from: number;
  to: number;
  apply(raw: ProjectJsonObject): ProjectJsonObject;
};

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

设计取舍：

- **Array `{from, to, apply}` 而非 map keyed by from**：array 让"第 N 步"序列化到代码顺序，review 友好
- **无 schemaVersion 或非数字 → v0**：宽松解析旧数据，老存档不需要任何标记
- **未来版本（v > CURRENT）→ 抛错**：明确拒绝，比静默兼容安全
- **`apply` 可 mutate 入参**：调用方传入的已是 `{...raw}` 副本（见下文 importProjectJson 改造）；step 内部 mutate 不会影响原 JSON

### importProjectJson / exportProjectJson 改造

**importProjectJson**（替换 `withImportedDefaults` 调用）：

```ts
export function importProjectJson(json: string): HouseProject {
  const raw = JSON.parse(json) as unknown;
  assertProjectJsonObject(raw);
  const cloned = { ...raw };
  // 序列化层 hygiene：transient 字段永远不该在保存的 JSON 里，与版本无关
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
1. 显式 `assertProjectJsonObject(raw)` 在 migrate 前（migrate 期望对象）
2. **transient strip 移出 migrate**：`selection` / `selectedObjectId` 是 runtime-only 字段，无论版本号都不该在 JSON 里，所以 strip 是 serialization hygiene，不是 schema 演化
3. `withImportedDefaults` → `migrate`，传入浅拷贝
4. 其他步骤（assertImportedProjectShape、validateSkirts、assertValidProject）顺序不变

**exportProjectJson**：

```ts
export function exportProjectJson(project: HouseProject): string {
  const { selection: _selection, ...rest } = project;
  return JSON.stringify({ ...rest, schemaVersion: CURRENT_SCHEMA_VERSION }, null, 2);
}
```

强制写 `CURRENT_SCHEMA_VERSION` 而非透传 `project.schemaVersion`——避免内存里损坏的版本号被序列化。

### assertImportedProjectShape 校验 schemaVersion

`assertImportedProjectShape` 的字段循环里增加：

```ts
const schemaVersion = assertFiniteNumberField(value, "schemaVersion");
if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
  invalidProjectJson(`schemaVersion must be ${CURRENT_SCHEMA_VERSION}.`);
}
```

migrate 之后版本必为当前；asserter 把这点写入契约。如果 migrate 链有 bug 漏跳了某步，asserter 会直接拦下来。

### validateSkirts 保持原位

`validateSkirts`（line 234-250）继续在 post-assert 阶段过滤"形状坏的 skirt"。**不**挪进 migrate。

理由：它处理的是**不合法**数据（坏 host wall、超范围 pitch 等），是 graceful degradation，与"补缺失数组"的语义不同。混进 migrate 会让 v0→v1 step 既做 schema 演化又做数据清洗，职责不清。未来若 v2 引入新约束，再为新形态加一个类似的过滤函数。

### withImportedDefaults 删除

整个函数（line 40-68）从代码里移除。所有逻辑已迁入 `MIGRATIONS[0].apply`。

## 测试

`src/__tests__/persistence.test.ts` 新增 `describe("schema migration")` 块，含 5 个测试：

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

现有测试调整：
- `round-trips project JSON`：增加 `expect(restored.schemaVersion).toBe(1)`
- `imports older project JSON without balcony data`：行为不变（走 v0→v1 migrate），可加 schemaVersion 断言

不测：
- v0→v1→v2 多步组合（目前只有一步，等 v2 时再加）
- 并发 / 竞争（单线程，N/A）

## 迁移路径

单分支 `xzhih-dev` 推进，分步 commit：
1. `domain/types.ts` 加 `schemaVersion: 1`
2. `sampleProject.ts` 等构造点补字段（TS 字面量类型会强制提示）
3. `persistence.ts` 引入 MIGRATIONS / migrate / CURRENT_SCHEMA_VERSION
4. `importProjectJson` / `exportProjectJson` / `assertImportedProjectShape` 切换到 migrate
5. 删除 `withImportedDefaults`
6. 测试覆盖
7. 验收

每步都要保持 `bun run test` + `bun run lint` 全绿。

## Done criteria

1. `bun run lint` + `bun run test` + `bun run build` 全绿
2. 现有所有 `.house.json` 存档（含 sample 与 localStorage 里的）无回退加载
3. 加新构件类型时路径清晰：定义新 migration step → 加 assert → 加 type 字段
4. 验收实验：人为构造 `schemaVersion: 999` 的 JSON 尝试 import → 立即抛"newer than supported"

## 风险与回滚

- **`createSampleProject` 等内存构造点漏改**：TS 字面量类型 `schemaVersion: 1` 会让漏改的位置编译期报错，不会静默
- **localStorage 里的旧数据**：用户硬盘里可能存有无 schemaVersion 的项目。加载时走 v0→v1 migrate，对用户透明
- **`migrate` 内 mutate 入参**：必须保证调用方传入副本（importProjectJson 用 `{...raw}` 满足这一点）。直接调用 `migrate(JSON.parse(json))` 不会污染原始 JSON 字符串，但 `migrate(someInMemoryRecord)` 会。封装在 importProjectJson 内部使用即可，不导出 migrate 给外部
- **回滚**：纯 import/export 层重构，无业务逻辑变化。git revert 即可
