# 从 Commander 迁移到 Yargs

## 背景

当前 CLI 使用 [commander](https://github.com/tj/commander.js) v13 作为命令行参数解析框架。Commander 缺少内置 shell 自动补全能力，而 [yargs](https://yargs.js.org/) 原生支持 bash/zsh 补全、提供了更强大的类型约束（`choices`、`check`、`coerce`）、内置 `recommendCommands()`（拼写纠错建议）以及更简洁的中间件机制。

### 目标

| 目标 | 说明 |
|---|---|
| shell 自动补全 | `.completion()` 注册 `completion` 子命令，用户执行 `memo-api completion` 输出补全脚本 |
| 简化代码 | 消除 `collect()` 工具函数（yargs `type: "array"` 原生支持重复 flag） |
| 消除黑魔法 | 去掉 `(cmd as any)._apiToken` 模式（yargs 中间件直接注入 `argv`） |
| 更好的校验 | `choices`、`check`、`implies` 等声明式校验替代手动 `if/printError/process.exit` |
| 拼写纠错 | `recommendCommands()` 自动提示相似命令 |

### 非目标

- 不改变 CLI 对外接口（命令名、flag 名、参数格式、输出格式）
- 不改变 API 调用逻辑（`client.ts`、`auth.ts`、`config.ts` 不变）
- 不增加运行时依赖数量（yargs 仅替换 commander，chalk 和 string-width 保留）

---

## Commander → Yargs API 映射

### 框架初始化

| Commander | Yargs |
|---|---|
| `new Command("memo-api")` | `yargs(hideBin(process.argv)).scriptName("memo-api")` |
| `.description("文本")` | `.usage("$0 <command> [options]").epilogue("...")` |
| `.parseAsync(process.argv)` | `.parseAsync()` 或 `await ... .parse()` |
| 导入 `commander` | 导入 `yargs` + `yargs/helpers` |

### 全局选项

| Commander | Yargs | 说明 |
|---|---|---|
| `.option("-T, --token <string>", "desc")` | `.option("token", { alias: "T", type: "string", description: "desc" })` | 直译 |
| `.option("-O, --output <format>", "desc", "column")` | `.option("output", { alias: "O", type: "string", default: "column", description: "desc" })` | Yargs 的 `default` 替代 Commander 第四个参数 |
| `.option("--no-color", "desc")` | `.option("color", { type: "boolean", default: true, description: "desc" })` | Yargs 解析 `--no-color` 自动将 `color` 设为 `false` |
| `.option("--verbose", "desc")` | `.option("verbose", { type: "boolean", description: "desc" })` | 直译 |
| `.option("-H, --no-header", "desc")` | 单独注册 `H` flag，middleware 中翻转 `header`。见 [\-H / --no-header 处理](#-h----no-header-处理) | 需 middleware 专项处理 |
| `.option("--fields <fields>", "desc")` | `.option("fields", { type: "string", description: "desc" })` | 直译 |

### 中间件 (preAction → middleware)

```typescript
// Commander (旧)
program.hook("preAction", (parentCmd, actionCmd) => {
  const opts = actionCmd.optsWithGlobals<{...}>();
  if (opts.color === false) setColor(false);
  // ...
  (actionCmd as any)._apiToken = resolveToken({ token: opts.token });
});

// Yargs (新)
.middleware((argv) => {
  if (argv.color === false) setColor(false);
  if (argv.verbose) setVerbose(true);
  // -H 翻转 header（见下方"H / --no-header 处理"一节）
  if (argv.H === true) argv.header = false;
  if (argv.header === false) setShowHeader(false);
  if (argv.fields) setSelectedFields(argv.fields);
  // 跳过 token 解析，让 --help 和 completion 不经鉴权即可运行
  if (!argv.help && argv._[0] !== "completion") {
    (argv as any).token = resolveToken({ token: argv.token });
  }
})
```

关键差异：
- Yargs `middleware` 接收合并后的 `argv` 对象，可直接修改传给 handler
- 不再需要 `optsWithGlobals()` 调用，argv 已包含所有父级选项
- `_apiToken` 注入改为 `argv.token` 直接赋值

### 子命令注册

```typescript
// Commander (旧) — 方式 A: addCommand
export const noteCmd = new Command("note")
  .configureHelp({ showGlobalOptions: true })
  .description("...");
noteCmd.command("list").option(...).action(handler);
program.addCommand(noteCmd);

// Yargs (新) — 方式 B: CommandModule
export const noteCmd: CommandModule = {
  command: "note",
  describe: "...",
  builder: (yargs) =>
    yargs
      .command("list", "...", listBuilder, listHandler)
      .command("create", "...", createBuilder, createHandler)
      .command("update <id>", "...", updateBuilder, updateHandler)
      .command("delete <id>", "...", deleteBuilder, deleteHandler)
      .help()
      .epilogue("示例:\n  ..."),
  handler: () => {}, // 空 handler，因为 note 本身没有 action
};
program.command(noteCmd);
```

| Commander | Yargs |
|---|---|
| `.command("list")` | `.command("list", "desc", builder, handler)` |
| `.configureHelp({ showGlobalOptions: true })` | 无需配置，全局选项自动出现在子命令 help |
| `.addHelpText("after", "...")` | `.epilogue("...")` 或 `.example("$0 ...", "desc")` |
| `.alias("interp")` | `command: "interpretation", aliases: ["interp"]` |

### 选项定义

```typescript
// Commander (旧)
.option("-v, --voc-id <id>", "单词 ID")
.option("-g, --tag <tag>", "标签（可重复）", collect, [])
.option("-l, --limit <n>", "最大返回数", "50")

// Yargs (新)
.option("voc-id", { alias: "v", type: "string", description: "单词 ID" })
.option("tag", { alias: "g", type: "array", default: [], description: "标签（可重复）" })
.option("limit", { alias: "l", type: "number", default: 50, description: "最大返回数" })
```

关键差异：
- **`collect()` 废除**：Yargs `type: "array"` 原生积累重复 flag 值
- **类型自动转换**：`type: "number"` 自动将 `"--limit 50"` 转为 `{ limit: 50 }`（数字），而非字符串
- **`choices` 校验**：`.option("status", { choices: ["PUBLISHED", "UNPUBLISHED"] })` 自动校验并拒绝非法值

### 位置参数

```typescript
// Commander (旧)
.argument("<id>", "ID 描述")

// Yargs (新)
.positional("id", { type: "string", describe: "ID 描述" })
```

差异：Yargs handler 中通过 `argv.id` 访问，不再作为独立参数。handler 签名统一为 `(argv) => {...}`。

### handler 签名

```typescript
// Commander (旧)
.action(async (options, cmd) => {
  const token = getToken(cmd);
  const globalOpts = (cmd as any).optsWithGlobals();
  // ...
});
.action(async (id, options, cmd) => {
  const token = getToken(cmd);
  // ...
});

// Yargs (新)
const handler = async (argv: Args) => {
  const token = (argv as any).token as string;
  // argv.id    → 位置参数
  // argv.vocId → --voc-id
  // argv.output → 全局 option，自动继承
};
```

核心变化：
- `getToken(cmd)` → `(argv as any).token`（token 由 middleware 注入到 argv 的任意属性）
- `cmd.optsWithGlobals()` → 无需调用，所有选项已在 `argv` 中
- 位置参数不再是独立函数参数，统一通过 argv 访问
- 不再需要 `(cmd as any)` 类型断言
- `--help` 和 `completion` 不触发 token 解析，无需鉴权即可运行

---

## 逐文件迁移计划

### 第 1 步：安装依赖

```bash
npm uninstall commander
npm install yargs
```

> **注意**：yargs v17+ 自带 TypeScript 类型定义，**无需**安装 `@types/yargs`。类型（`CommandModule`、`Argv`、`Arguments` 等）直接从 `"yargs"` 导入。

### 第 2 步：`src/lib/helpers.ts` — getToken 改写

```diff
- import type { Command } from "commander";
-
- export function getToken(cmd: Command): string {
-   return (cmd as Command & { _apiToken: string })._apiToken;
- }
+ // getToken 移除，改为在 middleware 中将 token 注入 argv
```

`isJsonOutput` 和 `resolveArrayArg` 保持不变。

### 第 3 步：`src/lib/collect.ts` — 删除

Yargs `type: "array"` 原生支持重复 flag，`collect` 函数不再需要。

### 第 4 步：`src/index.ts` — 完全重写

```typescript
#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { resolveToken } from "./lib/auth.js";
import { setColor, setShowHeader, setSelectedFields } from "./output.js";
import { setVerbose } from "./client.js";

await yargs(hideBin(process.argv))
  .scriptName("memo-api")
  .usage("$0 <command> [options]")
  .epilogue(`
示例:
  $ memo-api voc get --spelling=apple
  $ memo-api note list --word=apple -O json
  $ memo-api study progress
  $ echo '{"spelling":"apple"}' | memo-api voc get
`)

  // 全局选项
  .option("token", { alias: "T", type: "string", description: "API Token" })
  .option("output", { alias: "O", type: "string", default: "column", description: "输出格式：json 或 column" })
  .option("color", { type: "boolean", default: true, description: "是否开启颜色" })
  .option("verbose", { type: "boolean", description: "显示请求详情和原始响应" })
  .option("header", { type: "boolean", default: true, description: "是否显示表头（--no-header 关闭）" })
  .option("H", { type: "boolean", hidden: true, description: "等同于 --no-header" })
  .option("fields", { type: "string", description: "选择展示的字段（逗号分隔）" })

  // 中间件（替代 preAction hook）
  .middleware((argv) => {
    if (argv.color === false) setColor(false);
    if (argv.verbose) setVerbose(true);
    if (argv.H === true) argv.header = false;  // -H 等同 --no-header
    if (argv.header === false) setShowHeader(false);
    if (argv.fields) setSelectedFields(argv.fields);
    // --help 和 completion 不需要 token
    const isHelpCommand = argv.help === true
      || (argv._.length > 0 && argv._[0] === "completion");
    if (!isHelpCommand) {
      // 将 token 注入 argv，供所有 handler 使用
      (argv as any).token = resolveToken({ token: argv.token });
    }
  })

  // 子命令
  .command(noteCmd)
  .command(interpCmd)
  .command(phraseCmd)
  .command(notepadCmd)
  .command(vocCmd)
  .command(studyCmd)

  .demandCommand(1, "请指定子命令")
  .strict()
  .recommendCommands()
  .completion()
  .help()
  .parseAsync();
```

### 第 5 步：各 command 文件 — 改为 CommandModule 格式

以 `src/commands/voc.ts` 为例：

```typescript
import type { CommandModule, Argv } from "yargs";
import { api } from "../client.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError } from "../output.js";
import { isJsonOutput } from "../lib/helpers.js";
import type {
  GetVocabularyResponse,
  ListVocabularyRequest,
  ListVocabularyResponse,
} from "../types/vocabulary.js";

// Handler 参数类型
interface VocGetArgs {
  token: string;
  output: string;
  spelling?: string;
}
interface VocQueryArgs {
  token: string;
  output: string;
  spelling?: string[];
  id?: string[];
}

const getBuilder = (yargs: Argv) =>
  yargs
    .option("spelling", { alias: "s", type: "string", description: "单词拼写" })
    .epilogue("示例:\n  $ memo-api voc get -s apple\n  $ echo '{\"spelling\":\"apple\"}' | memo-api voc get");

const getHandler = async (argv: VocGetArgs) => {
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let spelling: string;
  if (stdinJson && typeof stdinJson === "object" && "spelling" in stdinJson) {
    spelling = String((stdinJson as Record<string, unknown>).spelling);
  } else if (argv.spelling) {
    spelling = argv.spelling;
  } else {
    printError("错误: 缺少 --spelling 参数");
    process.exit(1);
  }

  const res = await api<GetVocabularyResponse>(
    "/api/v1/vocabulary",
    { method: "GET", query: { spelling } },
    argv.token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else if (res.voc) {
    printColumns([{ ...res.voc }], "voc");
  } else {
    process.stderr.write("单词不存在\n");
    process.exit(1);
  }
};

const queryBuilder = (yargs: Argv) =>
  yargs
    .option("spelling", { alias: "s", type: "array", default: [], description: "按拼写查询（可重复，最多 1000）" })
    .option("id", { alias: "I", type: "array", default: [], description: "按 ID 查询（可重复，最多 1000）" })
    .epilogue("--spelling 与 --id 互斥。\n\n示例:\n  $ memo-api voc query -s apple -s banana\n  $ memo-api voc query -I id1 -I id2");

const queryHandler = async (argv: VocQueryArgs) => {
  // ...类似结构，但使用 argv.spelling (string[]) 替代 options.spelling
};

export const vocCmd: CommandModule = {
  command: "vocabulary",
  aliases: ["voc"],
  describe: "单词查询（get / query）",
  builder: (yargs) =>
    yargs
      .command("get", "按拼写获取单词", getBuilder, getHandler as any)
      .command("query", "批量查询单词", queryBuilder, queryHandler as any)
      .help(),
  handler: () => {},
};
```

每个 command 文件需要改造的要点：
1. 将 `new Command("name")` 改为导出 `CommandModule` 对象
2. 每个 action 拆分为独立的 `builder` 和 `handler` 函数
3. `handler` 统一签名为 `(argv: Args) => Promise<void>`
4. `getToken(cmd)` → `argv.token`
5. `(cmd as any).optsWithGlobals()` → 直接用 `argv.output` 等
6. `.option("--flag", "desc", collect, [])` → `.option("flag", { type: "array", default: [] })`
7. `.option("--flag", "desc", "default")` → `.option("flag", { type: "string", default: "default" })`
8. `.argument("<id>", "desc")` → `.positional("id", { type: "string", describe: "desc" })`
9. `.addHelpText("after", "...")` → `.epilogue("...")`
10. 移除 `.configureHelp({ showGlobalOptions: true })` — Yargs 自动展示全局选项

### 第 6 步：`--no-*` 标志处理

| Commander 标志 | Yargs 等价 |
|---|---|
| `--no-color` | `.option("color", { type: "boolean", default: true })` → `--no-color` 将 `color` 设为 `false` |
| `--no-header` / `-H` | 单独 `.option("header", { type: "boolean", default: true })` + `.option("H", { type: "boolean", hidden: true })`；middleware 中 `if (argv.H) argv.header = false` |
| `--no-new` (study today) | `.option("new", { type: "boolean" })` → `--no-new` 将 `new` 设为 `false` |
| `--no-finished` (study today) | `.option("finished", { type: "boolean" })` → `--no-finished` 将 `finished` 设为 `false` |

Yargs 对 `type: "boolean"` 的选项自动支持 `--no-<name>` 前缀取反。行为与 Commander 的自动 `--no-*` 生成完全一致。

### 第 7 步：`bin/memo-api.js` 入口

检查是否需要调整 shebang 或导入路径。当前 `bin/memo-api.js` 是 `#!/usr/bin/env node` + `import "../dist/index.js"`，不需要改变。

---

## 测试策略

### 已有测试

| 层级 | 测试类型 | 数量 | 迁移影响 |
|---|---|---|---|
| unit (`test/lib/*.test.ts`) | `collect`, `helpers`, `mock`, `auth`, `config`, `stdin`, `word-resolve` | ~50 | `collect.test.ts` 可删除，`helpers.test.ts` 需去掉 `getToken` 相关 |
| output (`test/output.test.ts`) | `printColumns`, `printJson`, 着色 | ~39 | 不受影响 |
| client (`test/client.test.ts`) | `api()` HTTP 请求/响应处理 | ~14 | 不受影响（mock 分支不影响正常路径） |
| integration (`test/commands/*.test.ts`) | 直接调用 `api()` + MockAgent | ~47 | 不受影响 |
| e2e old (`test/e2e/cli.test.ts`) | `execFile` 跑真实 CLI，仅测 help | ~11 | 需改写为 Yargs 的 help 输出格式 |
| e2e mock (`test/e2e/mock-cli.test.ts`) | `execFile` + `MAIMEMO_API_MOCK` 跑完整 CLI | 49 | **关键验证层**：所有 49 个测试必须通过 |

### 测试验证流程

```bash
# 1. 逐模块迁移，每改完一个 command 文件跑对应测试
node --import tsx --test --test-name-pattern="voc" test/e2e/mock-cli.test.ts

# 2. 跑全部
npm test
```

---

## 风险与注意事项

### 类型安全

Yargs 的类型推断不如 Commander 直观。`CommandModule` 的泛型参数为 `<ParentArgs, Args>`。handler 中的 `argv` 类型需要显式声明 interface。

**缓解**：每个 command 文件为 handler 定义本地 `Args` 接口。

### `-H` / `--no-header` 处理

Commander 中 `.option("-H, --no-header")` 是一种特殊语法：`-H` 和 `--no-header` 都表示"关闭表头"。Yargs 不支持这种语义——若将 `-H` 设为 `header` 的 alias，则 `-H` 会**开启**表头。

解决方案：分开注册两个 flag，在 middleware 中翻转。

```typescript
// 全局选项定义
.option("header", { type: "boolean", default: true, description: "是否显示表头（--no-header 关闭）" })
.option("H", { type: "boolean", hidden: true, description: "等同于 --no-header" })

// middleware
.middleware((argv) => {
  if (argv.H === true) argv.header = false;  // -H 等同 --no-header
  if (argv.header === false) setShowHeader(false);
})
```

`hidden: true` 使 `-H` 不出现在帮助文档中——用户看到的是 `--no-header`（由 `header` 选项自动生成），行为与 Commander 一致。

### help 输出格式差异

Yargs 的 help 输出格式与 Commander 不同。`test/e2e/cli.test.ts` 中检查 `stdout.includes("Global Options:")`、`stdout.includes("Commands:")` 等字符串需要更新为 Yargs 对应的输出关键词（如 `"Commands:"` → `"Commands:"`，`"Global Options:"` → `"Options:"`）。

**缓解**：迁移时同步更新 e2e 旧测试的断言。mock-cli 测试通过输出内容（数据行、错误信息）验证，不受 help 格式影响。

### `--output` 选项校验

Commander 允许任意 `--output <format>` 值，校验在 handler 中手动完成。Yargs 可用 `choices` 内建校验。

```typescript
.option("output", {
  alias: "O",
  type: "string",
  choices: ["json", "column"],
  default: "column",
  description: "输出格式：json 或 column",
})
```

### `resolveArrayArg` 保留说明

`type: "array"` 替代了 `collect()`，但 `resolveArrayArg()` 仍需要保留。它处理 `-g -` 这种 `"-"` 占位符——从 stdin 逐行读取填充到数组中。这与 flag 解析无关，是业务逻辑。

### middleware 中 `argv.token` 类型问题

Yargs 的 `argv` 类型不包含自定义属性 `token`。middleware 中需要通过 `(argv as any).token = ...` 赋值；handler 中通过 `(argv as any).token` 读取。handler 的 `Args` 接口不需要声明 `token` 字段。

### `strict()` 与全局选项

Yargs 的 `.strict()` 会拒绝未声明的选项。全局选项定义在根级但必须在子命令中也能使用。Yargs 默认将根级选项传递给子命令（子命令的 `argv` 包含所有父级选项），所以无需 `.global()` 调用。但需确认 `--token`、`--output` 等在子命令中不会触发 strict 报错。



### `process.exit` 行为

Commander 不为 help/error 自动 exit。Yargs 默认 `.exitProcess(true)`，会在 `--help`、`.version`、校验失败或 handler 报错时自动 exit。

**缓解**：保持默认 `.exitProcess(true)`，这与项目现有行为兼容（代码中多处手动调用 `process.exit(1)`）。

---

## 验证清单

迁移完成后，逐项确认：

- [ ] `npm run build` 编译通过，无 TypeScript 错误
- [ ] `npm test` 全部 200+ 测试通过
- [ ] `memo-api --help` 显示命令树
- [ ] `memo-api note --help` 显示子命令和全局选项
- [ ] `memo-api note list --help` 显示选项说明
- [ ] `memo-api voc get -s apple` 返回正确列输出
- [ ] `memo-api voc get -s apple -O json` 返回 JSON
- [ ] `memo-api voc query -s apple -s banana` 返回多条记录
- [ ] `memo-api note list -w apple` 链式调用 (voc get → note list)
- [ ] `memo-api note create -w apple --type 谐音 --note "test"` 创建成功
- [ ] `memo-api note update id123 --type 联想 --note "new"` 更新成功
- [ ] `memo-api note delete id123 -f` 删除成功
- [ ] `memo-api study progress` 显示进度
- [ ] `memo-api study add -w apple -w banana` 批量添加
- [ ] `echo '{"spelling":"apple"}' | memo-api voc get` stdin 管道工作
- [ ] `memo-api voc get -s test --no-color` 无颜色输出
- [ ] `memo-api voc get -s test --no-header` 无表头
- [ ] `memo-api voc get -s test --fields id` 仅显示 id 列
- [ ] `memo-api voc get -s test --verbose` 显示请求详情
- [ ] `memo-api interp list -v xxx` 别名 `interp` 可用
- [ ] `memo-api voc get -s test` 别名 `voc` 可用
- [ ] `memo-api completion` 输出补全脚本
- [ ] `eval "$(memo-api completion)"` 在 bash 中启用 TAB 补全
- [ ] `memo-api --help` 无需 token 即可显示帮助
- [ ] `memo-api completion` 无需 token 即可输出补全脚本
- [ ] `memo-api unknown` 显示错误 + 推荐相似命令
- [ ] `memo-api voc qeury` 拼写纠正提示 `query`
- [ ] `memo-api voc get --output xml` 校验失败，提示 `choices: json, column`

---

## 相关文件更新

迁移完成后需同步更新以下文档：

| 文件 | 更新内容 |
|---|---|
| `docs/plans/cli.md` | 第 4 行 "commander" → "yargs"；新增自动补全设计决策；更新库表 |
| `docs/plans/project.md` | 第 15 行 "commander" → "yargs"；更新依赖清单 |
| `AGENTS.md` | 更新 CLI 框架描述、依赖说明 |
| `package.json` | 替换 commander → yargs |

---

## 预估工作量

| 步骤 | 文件 | 预估耗时 |
|---|---|---|
| 安装依赖 | `package.json` | 5 分钟 |
| 重写入口 | `src/index.ts` | 30 分钟 |
| 改写 6 个 command 文件 | `src/commands/*.ts` | 3-4 小时 |
| 删除 collect | `src/lib/collect.ts` | 1 分钟 |
| 移除 getToken | `src/lib/helpers.ts` | 5 分钟 |
| 更新单元测试 | `test/lib/*.test.ts` | 30 分钟 |
| 更新 e2e 测试 | `test/e2e/cli.test.ts`, `test/e2e/mock-cli.test.ts` | 1-2 小时 |
| 更新文档 | 5 个文件 | 30 分钟 |
| 集成测试 + 修复 | — | 1-2 小时 |
| **总计** | | **6-10 小时** |
