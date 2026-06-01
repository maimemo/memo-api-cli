# memo-api -- 工程计划

## 概述

独立 TypeScript CLI 工具，通过 commander 解析命令调用墨墨开放 API，纯文本输出，适合管道和脚本。

---

## 技术栈

| 类别 | 选型 | 理由 |
|------|------|------|
| 语言 | TypeScript (strict) | 完善的类型推导，编译器辅助重构 |
| 运行时 | Node.js 18+ | 内置 `fetch`，无需额外 HTTP 依赖 |
| CLI 框架 | commander | 声明式命令定义，自动生成帮助，v12+ 支持 async action |
| 输出着色 | chalk | 终端颜色分量轻、API 简洁 |
| 测试 | node:test + node:assert | Node 内置，零依赖 |
| HTTP Mock | undici.MockAgent | Node 原生 undici，精确拦截 fetch |
| 构建 | tsc | TypeScript 官方编译器，足够简单 |
| 包管理 | npm / yarn | 按项目现有配置 |

### 依赖清单

```json
{
  "dependencies": {
    "commander": "^13",
    "chalk": "^5",
    "string-width": "^7"
  },
  "devDependencies": {
    "typescript": "^5",
    "undici": "^7",
    "@types/node": "^22"
  }
}
```

---

## 项目结构

```
memo-api/
├── bin/
│   └── memo-api.js           # package.json bin 入口，加载 dist/index.js
├── src/
│   ├── index.ts              # 入口：创建 program，注册子命令，parseAsync
│   ├── client.ts             # HTTP 客户端：auth、base URL、错误映射
│   ├── config.ts             # 配置读取：~/.config/memo-api.json
│   ├── stdin.ts              # stdin 检测与 JSON 解析
│   ├── output.ts             # 列式输出 / JSON 输出 / 错误输出
│   ├── commands/
│   │   ├── note.ts           # note 子命令（list/create/update/delete）
│   │   ├── interp.ts         # interpretation 子命令（list/create/update/delete）
│   │   ├── phrase.ts         # phrase 子命令（list/create/update/delete）
│   │   ├── notepad.ts        # notepad 子命令（list/get/create/update/delete）
│   │   ├── voc.ts            # vocabulary 子命令（get/query）
│   │   └── study.ts          # study 子命令（progress/today/records/add/advance）
│   ├── lib/
│       ├── auth.ts           # Token 解析（flag > env > config）
│       ├── collect.ts        # commnder 数组 collect 工厂函数
│       ├── word-resolve.ts   # --word 自动解析为 voc_id
│       └── confirm.ts        # 删除确认，--force 跳过
│   └── types/
├── test/
│   ├── commands/
│   │   ├── note.test.ts
│   │   ├── interp.test.ts
│   │   ├── phrase.test.ts
│   │   ├── notepad.test.ts
│   │   ├── voc.test.ts
│   │   └── study.test.ts
│   ├── client.test.ts
│   ├── config.test.ts
│   ├── stdin.test.ts
│   └── word-resolve.test.ts
├── package.json
├── tsconfig.json
└── docs/
    └── plans/
        ├── cli.md
        └── project.md
```

### 结构原则

- **`src/commands/`**：每个文件导出一个 `Command` 实例，内部注册其 action 子命令。模块之间无横向依赖。
- **`src/lib/`**：可复用的纯函数，无 commander 耦合，易于独立测试。
- **`test/`**：镜像 `src/` 结构，文件命名为 `<name>.test.ts`。

---

## TypeScript 配置

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["test", "dist"]
}
```

### 关键选项

- `strict: true`：所有严格检查全开，从源头杜绝隐式 any 和空值问题。
- `noUncheckedIndexedAccess`：数组/Record 访问强制处理 undefined，避免运行时崩溃。
- `module: "NodeNext"` + `moduleResolution: "NodeNext"`：原生 ESM，与 Node 18+ 一致。
- `declaration: true`：输出 `.d.ts`，方便 IDE 智能提示。

### 类型设计原则

1. **避免类型体操**。类型服务于代码可读性，不追求泛型魔法。
2. **优先 type 而非 interface**。type 组合更灵活，无隐式合并风险。
3. **API 类型从 proto / 文档 手动定义**。不引入 protobuf 编译步骤，直接定义请求/响应的 type。
4. **禁止 any**。eslint no-explicit-any 为 error。特殊情况使用 `as` 断言代替。
5. **类型文件只放类型**。运行时代码不混入 `src/types/` 目录。

### Proto 类型引用

API 请求/响应的 TypeScript 类型定义来源于 `~/Projects/proto/maimemo.openapi/ts/maimemo/openapi/`，由 `protoc-gen-ts_proto` 自动生成。实现时直接从该目录复制对应的类型定义到 `src/types/`，确保与 proto 定义一致。

| 服务 | 类型文件 |
|------|---------|
| NoteService | `note/v1/note.ts` |
| InterpretationService | `interpretation/v1/interpretation.ts` |
| PhraseService | `phrase/v1/phrase.ts` |
| NotepadService | `notepad/v1/notepad.ts` |
| VocabularyService | `vocabulary/v1/vocabulary.ts` |
| StudyService | `study/v1/study.ts` + `study/v1/study_model.ts` |

---

## 模块职责

### `src/index.ts` — 入口

创建根 `Command('memo-api')`，注册全局选项（`-T`、`-O`、`--no-color`），注册 preAction hook（Token 注入），挂载 6 个资源子命令，调用 `program.parseAsync(process.argv)`。

不包含业务逻辑，不 import 业务模块。仅做组装。

### `src/client.ts` — HTTP 客户端

```
api('/api/v1/notes', { method: 'GET', query: { voc_id: 'xxx' } }, token)
```

封装 `fetch`，自动添加 `Authorization` header、base URL、超时、错误映射（401/404/500 → 人类可读错误信息）。

**单一导出**：`api(path, options, token): Promise<T>`

### `src/config.ts` — 配置

读取 `~/.config/memo-api.json`，提取 `apiToken`。单一导出 `getConfig(): { apiToken?: string }`。

### `src/stdin.ts` — 标准输入

两个导出：
- `readStdin(): Promise<string | null>` — 读取管道输入（TTY 则返回 null）
- `tryParseJson(input: string): unknown` — 尝试 JSON.parse，失败返回 null

### `src/output.ts` — 输出

- `printColumns(rows: Record<string, unknown>[]): void` — 彩色列式到 stdout
- `printJson(data: unknown): void` — `JSON.stringify` 到 stdout
- `printError(message: string): void` — 错误信息到 stderr
- `printInfo(message: string): void` — 进度/提示到 stderr

列式实现：自绘 ASCII 边框（`│ ─ ┌ ┬ ┐ ├ ┼ ┤ └ ┴ ┘`），无第三方依赖，简单可控。

### `src/commands/*.ts` — 命令模块

每个文件模式：

```typescript
import { Command } from 'commander'

export const noteCmd = new Command('note')
  .description('助记查询与编辑（list / create / update / delete）')

// ... 创建子命令，用 noteCmd.addCommand(...) 注册
```

**关键约束**：
- action handler 签名统一：`async (options: CliOptions, cmd: Command) => void`
- 每个 action 先检测 stdin JSON，优先级高于命令行参数
- API 调用走 `src/client.ts` 的 `api()` 函数
- 输出走 `src/output.ts`

### `src/lib/auth.ts` — 认证

```typescript
function resolveToken(opts: { token?: string }): string
```

优先级：`opts.token` → `MAIMEMO_API_TOKEN` env → `~/.config/memo-api.json` `apiToken` → throw

### `src/lib/collect.ts` — 数组收集

```typescript
function collect(value: string, previous: string[]): string[]
```

所有数组参数（`-g`、`-I`、`-v`（study）、`-s`（voc/study））复用此函数。

### `src/lib/word-resolve.ts` — 单词解析

```typescript
async function resolveVocId(spelling: string, token: string): Promise<string>
```

内部调用 `GET /api/v1/vocabulary?spelling=xxx`，失败抛错。

### `src/lib/confirm.ts` — 删除确认

```typescript
async function confirmDelete(resource: string, id: string, force?: boolean): Promise<void>
```

TTY + 无 `--force` → 提示 y/N；管道 + 无 `--force` → 报错退出。

---

## KISS 原则

1. **一个文件一个职责**。client.ts 只管 HTTP，stdin.ts 只管管道读取，不交叉。
2. **函数短小**。每个函数 ≤ 50 行，超过则拆分。
3. **不引入状态管理**。无 DI 容器，无 Store。参数通过 commander options 和函数参数传递。
4. **纯函数优先**。`src/lib/` 下的模块优先写成纯函数，方便测试。
5. **不提前抽象**。3 个以上重复时才提取公共逻辑。
6. **依赖少**。当前依赖仅 `commander` 和 `chalk`（均已存在）。

## 可拓展性

### 新增 API 资源

1. 在 `src/commands/` 新增 `<resource>.ts`
2. 创建 `Command`，注册 action 子命令
3. 在 `src/index.ts` 中 `program.addCommand(xxxCmd)`

无需修改任何其他文件。命令之间零耦合。

### 新增 action

在现有命令文件中 `.addCommand()` 新增子命令即可。

### 新增全局选项

在 `src/index.ts` 的 `program.option()` 注册。所有子命令通过 `optsWithGlobals()` 自动获取。

---

## 测试方案

### 测试框架

- **框架**：`node:test`（Node 22 内置 `node --experimental-test-coverage`）
- **断言**：`node:assert/strict`
- **Mock HTTP**：`undici.MockAgent` 拦截 `global.fetch`
- **CLI 测试**：`child_process.execFile` 执行 `node dist/index.js`

### 三层测试

| 层级 | 范围 | 技术 | 覆盖目标 |
|------|------|------|----------|
| 单元测试 | `src/lib/*.ts` 纯函数 | `node:test` | 认证、配置、stdin 解析、数组收集 |
| 集成测试 | `src/commands/*.ts` action handler | `undici.MockAgent` | API 请求体构造、响应解析、错误处理 |
| CLI E2E | 命令全链路 | `execFile` | 选项解析、帮助输出、stdin JSON 模式 |

### 测试文件结构

```
test/
├── lib/
│   ├── auth.test.ts
│   ├── collect.test.ts
│   ├── config.test.ts
│   ├── confirm.test.ts
│   ├── stdin.test.ts
│   └── word-resolve.test.ts
├── commands/
│   ├── note.test.ts
│   ├── interp.test.ts
│   ├── phrase.test.ts
│   ├── notepad.test.ts
│   ├── voc.test.ts
│   └── study.test.ts
└── e2e/
    └── cli.test.ts
```

### 单元测试示例

```typescript
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { collect } from '../src/lib/collect.js'

describe('collect', () => {
  it('accumulates values', () => {
    const acc1 = collect('A', [])
    const acc2 = collect('B', acc1)
    assert.deepEqual(acc2, ['A', 'B'])
  })
})
```

### API Mock 示例

```typescript
import { describe, it, before, after } from 'node:test'
import { MockAgent, setGlobalDispatcher } from 'undici'

const agent = new MockAgent()
agent.disableNetConnect()

describe('note list', () => {
  before(() => setGlobalDispatcher(agent))

  it('parses response', async () => {
    agent
      .get('https://open.maimemo.com')
      .intercept({ path: '/api/v1/notes', query: { voc_id: 'xxx' } })
      .reply(200, { data: [{ id: '1', note: 'test' }] })

    const result = await /* action handler */
    assert.equal(result.length, 1)
  })
})
```

### 测试运行

```bash
# 单元 / 集成测试
node --import tsx --test test/**/*.test.ts

# 带覆盖率
node --import tsx --experimental-test-coverage --test test/**/*.test.ts
```

### 用例清单

详见 [cli.md](./cli.md) 测试方案中的用例清单，共 17 组约 100 条用例。

---

## package.json

```json
{
  "name": "@maimemo/memo-api",
  "version": "1.0.0",
  "description": "墨墨开放 API 命令行工具",
  "license": "MIT",
  "type": "module",
  "bin": {
    "memo-api": "./bin/memo-api.js"
  },
  "main": "./dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "node --import tsx --test test/**/*.test.ts",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "commander": "^13.1.0",
    "chalk": "^5.4.0"
  },
  "devDependencies": {
    "typescript": "^5.8.0",
    "undici": "^7.12.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0"
  },
  "engines": {
    "node": ">=18"
  },
  "files": [
    "dist",
    "bin"
  ]
}
```

### bin 入口

```javascript
#!/usr/bin/env node
// bin/memo-api.js
import('../dist/index.js')
```

`tsx` 用于测试时直接跑 TypeScript。构建产物 `dist/` 由 `tsc` 生成，发布时不包含源码。

---

## 实现顺序

| 阶段 | 内容 | 可并行 |
|------|------|--------|
| 1 | `tsconfig.json`、`src/client.ts`、`src/config.ts`、`src/output.ts`、`src/stdin.ts` | 是 |
| 2 | `src/lib/auth.ts`、`src/lib/collect.ts`、`src/lib/confirm.ts`、`src/lib/word-resolve.ts` | 是 |
| 3 | `src/index.ts`（骨架，仅注册空子命令） | 依赖 1 |
| 4 | `src/commands/note.ts`、`src/commands/interp.ts`、`src/commands/study.ts` | 依赖 2,3 |
| 5 | `src/commands/phrase.ts`、`src/commands/notepad.ts`、`src/commands/voc.ts` | 依赖 2,3 |
| 6 | `test/`（与对应模块同频编写） | 与 1-5 交替 |
| 7 | `bin/memo-api.js`、package.json scripts | 依赖 3 |

---

## Todo List

### Phase 1 — 项目初始化

- [ ] 初始化 `package.json`（设为 `"type": "module"`，填充 scripts、dependencies）
- [ ] 创建 `tsconfig.json`（strict 模式，NodeNext 模块）
- [ ] `npm install` 安装依赖
- [ ] 创建 `bin/memo-api.js`（ESM 动态导入 `../dist/index.js`）

### Phase 2 — Proto 类型引入

- [ ] 从 `~/Projects/proto/maimemo.openapi/ts/maimemo/openapi/` 复制类型文件到 `src/types/`
  - [ ] `src/types/note.ts`（Note、NoteStatus、CreateNoteRequest、UpdateNoteRequest 等）
  - [ ] `src/types/interpretation.ts`（Interpretation、InterpretationStatus、CreateInterpretationRequest 等）
  - [ ] `src/types/phrase.ts`（Phrase、PhraseStatus、PhraseHighlightRange、CreatePhraseRequest 等）
  - [ ] `src/types/notepad.ts`（Notepad、BriefNotepad、NotepadStatus、NotepadType、CreateNotepadRequest 等）
  - [ ] `src/types/vocabulary.ts`（Vocabulary、GetVocabularyRequest、ListVocabularyRequest 等）
  - [ ] `src/types/study.ts`（StudyProgress、StudyTodayItem、StudyRecord、GetTodayItemsRequest 等）

### Phase 3 — 基础设施层

- [ ] `src/config.ts`
  - [ ] 读取 `~/.config/memo-api.json`
  - [ ] 解析 `apiToken` 字段
  - [ ] 文件不存在时返回空对象，不报错
- [ ] `src/client.ts`
  - [ ] `api<T>(path, options, token): Promise<T>` 函数
  - [ ] 自动拼接 base URL `https://open.maimemo.com/open`
  - [ ] 自动添加 `Authorization: Bearer <token>` header
  - [ ] HTTP 错误映射：401 → 认证失败，404 → 资源不存在，500 → 服务器内部错误
  - [ ] 网络错误映射：timeout、fetch failed → 用户友好信息
  - [ ] 支持 GET（query params）和 POST（JSON body）
- [ ] `src/output.ts`
  - [ ] `printColumns(rows)` — 自绘 ASCII 列式（`│ ─ ┌ ┬ ┐` 等）
  - [ ] `printJson(data)` — `JSON.stringify` 到 stdout
  - [ ] `printError(message)` — 红色文本到 stderr
  - [ ] `printInfo(message)` — 灰色文本到 stderr
  - [ ] 支持 `--no-color` 全局选项禁用颜色
- [ ] `src/stdin.ts`
  - [ ] `readStdin()` — 读取管道输入，TTY 返回 null
  - [ ] `tryParseJson(input)` — 尝试 JSON.parse，失败返回 null

### Phase 4 — 工具层

- [ ] `src/lib/auth.ts`
  - [ ] `resolveToken(opts)` — 优先级：`-T` flag > `MAIMEMO_API_TOKEN` env > config file apiToken
  - [ ] 无 Token 时打印错误信息并 `process.exit(1)`
- [ ] `src/lib/collect.ts`
  - [ ] `collect(value, previous)` — commander 数组累积函数
  - [ ] 支持 stdin `-` 输入：值是 `"-"` 时从进程 stdin 读取换行分隔值
- [ ] `src/lib/confirm.ts`
  - [ ] `confirmDelete(resource, id, force?)` — 删除确认
  - [ ] TTY + 无 `--force` → 提示 `Delete {resource} {id}? (y/N)`
  - [ ] 输入 `y`/`Y` 返回 true，其他取消
  - [ ] 管道 + 无 `--force` → 报错退出
- [ ] `src/lib/word-resolve.ts`
  - [ ] `resolveVocId(spelling, token)` — 调用 `GET /api/v1/vocabulary?spelling=xxx`
  - [ ] 单词不存在时抛错
  - [ ] 返回 `voc_id`

### Phase 5 — 入口

- [ ] `src/index.ts`
  - [ ] 创建根 `Command('memo-api')`
  - [ ] 注册全局选项：`-T --token`、`-O --output`、`--no-color`
  - [ ] `preAction` hook：调用 `resolveToken()`，挂载到 `(actionCmd as any)._apiToken`
  - [ ] 注册 `noteCmd`、`interpCmd`、`phraseCmd`、`notepadCmd`、`vocCmd`、`studyCmd`
  - [ ] `await program.parseAsync(process.argv)`

### Phase 6 — 命令模块

- [ ] `src/commands/note.ts`
  - [ ] `note list` — GET /api/v1/notes?voc_id=xxx，`--voc-id` / `--word` 互斥
  - [ ] `note create` — POST /api/v1/notes，`--voc-id`+`--type`+`--note`
  - [ ] `note update <id>` — POST /api/v1/notes/{id}，`--type`+`--note`
  - [ ] `note delete <id>` — DELETE /api/v1/notes/{id}，确认 + `--force`
  - [ ] 全部支持 stdin JSON 模式
- [ ] `src/commands/interp.ts`
  - [ ] `interp list` — GET /api/v1/interpretations?voc_id=xxx，`--voc-id` / `--word`
  - [ ] `interp create` — POST /api/v1/interpretations，`--voc-id`+`--interpretation`+`--tag`+`--status`
  - [ ] `interp update <id>` — POST /api/v1/interpretations/{id}，`--interpretation`+`--tag`+`--status`
  - [ ] `interp delete <id>` — DELETE /api/v1/interpretations/{id}
  - [ ] `interpretation` 别名 = `interp`
- [ ] `src/commands/phrase.ts`
  - [ ] `phrase list` — GET /api/v1/phrases?voc_id=xxx
  - [ ] `phrase create` — POST /api/v1/phrases，`--voc-id`+`--phrase`+`--interpretation`+`--tag`+`--origin`
  - [ ] `phrase update <id>` — POST /api/v1/phrases/{id}
  - [ ] `phrase delete <id>` — DELETE /api/v1/phrases/{id}
- [ ] `src/commands/notepad.ts`
  - [ ] `notepad list` — GET /api/v1/notepads，`--limit`+`--offset`+`--id`
  - [ ] `notepad get <id>` — GET /api/v1/notepads/{id}
  - [ ] `notepad create` — POST /api/v1/notepads，`--title`+`--content`+`--brief`+`--tag`+`--status`
  - [ ] `notepad update <id>` — POST /api/v1/notepads/{id}
  - [ ] `notepad delete <id>` — DELETE /api/v1/notepads/{id}
- [ ] `src/commands/voc.ts`
  - [ ] `voc get` — GET /api/v1/vocabulary?spelling=xxx
  - [ ] `voc query` — POST /api/v1/vocabulary/query，`--spelling` / `--id` 互斥，上限 1000
  - [ ] `vocabulary` 别名 = `voc`
- [ ] `src/commands/study.ts`
  - [ ] `study progress` — POST /api/v1/study/get_study_progress（空 body）
  - [ ] `study today` — POST /api/v1/study/get_today_items，`--finished`/`--no-finished`/`--new`/`--no-new`/`--voc-id`/`--spelling`/`--limit`
  - [ ] `study records` — POST /api/v1/study/query_study_records，`--next-study-start`/`--next-study-end`/`--voc-id`/`--spelling`/`--count`/`--limit`
  - [ ] `study add` — POST /api/v1/study/add_words，`--id`+`--advance`
  - [ ] `study advance` — POST /api/v1/study/advance_study，`--voc-id`

### Phase 7 — 测试

- [ ] `test/lib/auth.test.ts` — Token 解析优先级
- [ ] `test/lib/collect.test.ts` — 数组累积和 stdin `-` 模式
- [ ] `test/lib/config.test.ts` — 配置文件读取
- [ ] `test/lib/confirm.test.ts` — 删除确认逻辑
- [ ] `test/lib/stdin.test.ts` — stdin 读取和 JSON 解析
- [ ] `test/lib/word-resolve.test.ts` — 单词拼写 → voc_id 解析
- [ ] `test/client.test.ts` — HTTP 客户端（MockAgent）
- [ ] `test/commands/note.test.ts` — note 全部 action（MockAgent）
- [ ] `test/commands/interp.test.ts` — interpretation 全部 action（MockAgent）
- [ ] `test/commands/phrase.test.ts` — phrase 全部 action（MockAgent）
- [ ] `test/commands/notepad.test.ts` — notepad 全部 action（MockAgent）
- [ ] `test/commands/voc.test.ts` — vocabulary 全部 action（MockAgent）
- [ ] `test/commands/study.test.ts` — study 全部 action（MockAgent）
- [ ] `test/e2e/cli.test.ts` — CLI 全链路（execFile）
  - [ ] `memo-api --help` 输出验证
  - [ ] `memo-api note --help` 输出验证
  - [ ] `memo-api note create --help` 输出验证
  - [ ] `memo-api note create -v xxx -t 谐音 -n "test"` 端到端
  - [ ] stdin JSON 管道输入模式
  - [ ] `--output json` 输出格式
  - [ ] `--no-color` 禁用颜色
  - [ ] 缺少参数的错误提示
  - [ ] 互斥参数冲突的错误提示
  - [ ] 删除确认流程（y/n/--force）
  - [ ] 未知子命令显示帮助
  - [ ] 别名 `interp` `voc` 正确解析
  - [ ] `--word` 自动解析
  - [ ] 数组参数重复 flag
  - [ ] 数组参数 stdin `-` 模式
  - [ ] 最大参数限制校验（1000）
