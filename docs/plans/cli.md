# memo-api -- OpenAPI CLI 设计

## 概述

`memo-api` 是一个独立的 CLI 工具，用于调用墨墨开放 API（[OpenAPI](https://open.maimemo.com)）。

### 设计原则

- 遵循 [clig.dev](https://clig.dev/) 和 GNU 编码规范
- 使用 `yargs` 处理命令行参数，入口为 `src/index.ts`
- `noun verb` 二层结构：`memo-api <resource> <action>`
- **纯文本输出**，适合管道和脚本
- 每个参数提供合理的单字母短别名（`-x`），不与全局参数冲突
- 相同语义的参数跨子命令使用一致的短别名
- **stdin JSON 输入**：所有命令支持通过管道传入 JSON，直接映射到 API 请求，此时忽略命令行参数

---

## 已确认的设计决策

| # | 决策 | 说明 |
|---|------|------|
| 1 | 纯文本，不用 Ink | 纯文本 CLI |
| 2 | 统一用 `--status` | 移除 `--public` 便捷别名，直接映射 proto 字段 |
| 3 | 更新操作强制全字段 | 不会先 GET 再合并；用户必须传所有字段（stdin JSON 模式除外） |
| 4 | 短别名 | `interpretation` -> `interp`，`vocabulary` -> `voc` |
| 5 | 仅覆盖内容+学习 API | 不包含 token 管理命令（TokenService proto 存在但 CLI 不调用） |
| 6 | 仅生产环境 | 不设 `--dev` flag，固定连接 `open.maimemo.com/open`（proto 定义了 open-dev 测试服务但 CLI 不暴露 --dev flag） |
| 7 | 独立项目 | `memo-api` 为独立 CLI 包，直接使用 commander 入口 |
| 8 | 默认列式输出，`--output json` 输出 JSON | 列式人类可读是默认值 |
| 9 | 错误输出到 stderr | `--output json` 模式下错误仍然人类可读输出到 stderr |
| 10 | 删除需确认 + `--force` 跳过 | 符合 clig.dev 最佳实践 |
| 11 | study action 保持名词 | `progress`, `today`, `records`, `add`, `advance` |
| 12 | `--word` 自动解析 | 有 `voc_id` 无 `spelling` 参数的命令增加 `--word`，内部先调用 `voc get` 获取 ID |
| 13 | stdin JSON 模式 | 管道传入合法 JSON 时，直接作为 API 请求体，忽略命令行参数校验 |
| 14 | 数组参数：重复 flag | 数组类型参数通过重复 flag 指定：`--tag a --tag b`；也可通过 stdin 传入换行分隔的值（`--tag -`） |
| 15 | `--no-header` / `-H` 跳过表头 | `-H` 直接等价 `--no-header`（利用 commander 的 `--no-*` 否定机制） |
| 16 | `--fields` 选择字段 | 逗号分隔字段名，按指定顺序排列；忽略不存在的字段。以 `+` 开头追加到默认字段，以 `-` 开头从全部字段中移除。无短别名。默认字段集中配置在 `src/lib/default-fields.ts` |
| 17 | 列式内容折叠截断 | 换行折叠为空格；原始文本长度超过 200 字符时截断追加 `...`。指定 `--fields` 时跳过截断。数组值以 `, ` 连接，对象值以 `JSON.stringify` 紧凑输出，`null`/`undefined` 显示为空。字段名以 `time` 或 `date` 结尾时自动将 ISO 日期转为本地时区 `YYYY-MM-DD HH:mm:ss` |

---

## 认证机制

API 使用 Token 鉴权 (HMAC 签名，header `Authorization: Bearer <token>`)。

Token 获取优先级：
1. `--token` / `-T` flag（老式 API Token）
2. `MAIMEMO_API_TOKEN` 环境变量（老式 API Token）
3. `~/.config/memo-api.json` 中的 `apiToken` 字段（老式 API Token）
4. `~/.config/memo-api.json` 中的 OIDC `at` 字段（自动刷新，过期时用 `rt` 刷新）

> 配置文件默认路径为 `~/.config/memo-api.json`，可通过 `MEMO_API_CONFIG_PATH` 环境变量覆盖（测试与多账号场景使用）。

### OIDC 登录

CLI 新增 `memo-api auth login` 子命令，通过 OIDC PKCE 流程获取 access_token 和 refresh_token 并保存到配置文件。

- 库：`openid-client` v6（Panva）
- 流程：PKCE S256 → 浏览器授权 → 本地 callback server（端口 18884）→ token exchange → 写配置文件
- `memo-api auth whoami`：调用 OIDC userinfo endpoint 显示当前用户 UID 和昵称
- 详情见 [auth.md](./auth.md)

---

## 全局选项

| Flag | 短名 | 说明 |
|------|------|------|
| `--token <string>` | `-T` | API Token |
| `--output <format>` | `-O` | 输出格式：`json` 或 `column`（默认 `column`） |
| `--no-color` | — | 禁用颜色输出 |
| `--verbose` | — | 显示请求详情和原始响应 |
| `--no-header` | `-H` | 跳过列式输出的表头行（`-H` → `--no-header`） |
| `--fields <fields>` | — | 选择展示的字段（逗号分隔，如 `--fields id,name`）。以 `+` 开头追加字段，以 `-` 开头移除字段（如 `--fields "+extra"`、`--fields "-id,status"`）。无短别名（`-f` 与 delete 子命令 `--force` 冲突） |
| `--help` | `-h` | 帮助信息 |
| `--version` | `-V` | 版本号（commander 内置） |

全局选项可放置在子命令前后（顺序无关）。

---

## 通用输入模式

### 模式 1：命令行参数

用户通过 flag 和位置参数提供输入，CLI 进行校验后构造 API 请求。

```
memo-api note create -v <id> -t 谐音 -n "这是助记"
```

### 模式 2：stdin JSON（优先）

当 stdin 是管道（非 TTY）且内容为合法 JSON 时，CLI **跳过所有命令行参数校验**，将 JSON 直接作为 API 请求体（POST/PUT/DELETE）或查询参数（GET）。

URL 路径参数（如 `{id}`）从 JSON 顶层字段中提取（如 `"id"`），不需通过命令行传递。

```
echo '{"note":{"voc_id":"xxx","note_type":"谐音","note":"这是助记"}}' | memo-api note create
echo '{"voc_id":"xxx"}' | memo-api note list
echo '{"id":"note_id_123"}' | memo-api note delete -f
```

> - 全局选项（`--token`、`--output`、`--no-color`、`--verbose`、`--no-header`、`--fields`）在两种模式下均生效
> - stdin JSON 模式不进行参数校验，信任用户提供的 JSON 结构
> - stdin 不是 JSON 时视为普通文本输入（数组参数 `-` 模式）

### 数组参数约定

数组类型参数（`--tag`、`--id`、`--voc-id`、`--spelling` 等）支持两种输入方式（`study records --tag` 除外，仅支持重复 flag）：

**方式 A：重复 flag**
```
memo-api interp create -v xxx -i "释义" -g 考研 -g 托福 -g 雅思
```

**方式 B：stdin 换行输入**（值设为 `-`）
```
printf "考研\n托福\n雅思" | memo-api interp create -v xxx -i "释义" -g -
```

---

## 资源：note (助记)

```
memo-api note <action> [options]
```

| Action | HTTP | API |
|--------|------|-----|
| `list` | GET /api/v1/memo/notes | ListNotes |
| `create` | POST /api/v1/memo/notes | CreateNote |
| `update` | POST /api/v1/memo/notes/{id} | UpdateNote |
| `delete` | DELETE /api/v1/memo/notes/{id} | DeleteNote |

### `note list` — 获取单词的助记列表

```
memo-api note list (-v <id> | -w <spelling>)
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--voc-id <id>` | `-v` | string | 二选一 | 单词 ID |
| `--word <spelling>` | `-w` | string | 二选一 | 单词拼写（自动调用 `voc get` 获取 ID） |

stdin JSON：
```
echo '{"voc_id":"5a7BFf4F63612e5AD9fdebB7a50D3881"}' | memo-api note list
```

---

### `note create` — 创建助记

```
memo-api note create (-v <id> | -w <spelling>) -t <type> -n <text>
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--voc-id <id>` | `-v` | string | 二选一 | 单词 ID |
| `--word <spelling>` | `-w` | string | 二选一 | 单词拼写（自动调用 `voc get` 获取 ID） |
| `--type <type>` | `-t` | string | **是** | 助记类型（如 "谐音"） |
| `--note <text>` | `-n` | string | **是** | 助记内容 |

stdin JSON：
```
echo '{"note":{"voc_id":"xxx","note_type":"谐音","note":"这是助记"}}' | memo-api note create
```

**说明**：`CreateNote` API 不接受 status 参数，创建后状态默认为 PUBLISHED。

---

### `note update` — 更新助记

```
memo-api note update <id> -t <type> -n <text>
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `<id>` | — | string | **是** | 助记 ID（位置参数） |
| `--type <type>` | `-t` | string | **是** | 助记类型 |
| `--note <text>` | `-n` | string | **是** | 助记内容 |

stdin JSON：
```
echo '{"id":"note_id","note":{"note_type":"谐音","note":"新内容"}}' | memo-api note update
```

**说明**：Proto 中 UpdateData 的 note_type 和 note 均为 all_required，两者必须全传。

---

### `note delete` — 删除助记

```
memo-api note delete <id> [-f]
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `<id>` | — | string | **是** | 助记 ID（位置参数） |
| `--force` | `-f` | flag | 否 | 跳过确认提示 |

stdin JSON：
```
echo '{"id":"note_id"}' | memo-api note delete -f
```

---

## 资源：interpretation / interp (释义)

```
memo-api interpretation <action> [options]
memo-api interp <action> [options]          # 别名
```

| Action | HTTP | API |
|--------|------|-----|
| `list` | GET /api/v1/memo/interpretations | ListInterpretations |
| `create` | POST /api/v1/memo/interpretations | CreateInterpretation |
| `update` | POST /api/v1/memo/interpretations/{id} | UpdateInterpretation |
| `delete` | DELETE /api/v1/memo/interpretations/{id} | DeleteInterpretation |

### `interpretation list` — 获取单词的释义列表

```
memo-api interp list (-v <id> | -w <spelling>)
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--voc-id <id>` | `-v` | string | 二选一 | 单词 ID |
| `--word <spelling>` | `-w` | string | 二选一 | 单词拼写（自动调用 `voc get` 获取 ID） |

---

### `interpretation create` — 创建释义

```
memo-api interp create (-v <id> | -w <spelling>) -i <text> [-g <tag> ...] [-s <status>]
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--voc-id <id>` | `-v` | string | 二选一 | 单词 ID |
| `--word <spelling>` | `-w` | string | 二选一 | 单词拼写（自动调用 `voc get` 获取 ID） |
| `--interpretation <text>` | `-i` | string | **是** | 释义内容 |
| `--tag <tag>` | `-g` | string[] | 否 | 标签（可重复，也可 `-g -` 从 stdin 读换行分隔值） |
| `--status <status>` | `-s` | string | 否 | 默认 `PUBLISHED`；可选 `UNPUBLISHED` |

stdin JSON：
```
echo '{"interpretation":{"voc_id":"xxx","interpretation":"n. 苹果","tags":["考研","托福"],"status":"PUBLISHED"}}' | memo-api interp create
```

---

### `interpretation update` — 更新释义

```
memo-api interp update <id> -i <text> -g <tag> [-g <tag> ...] -s <status>
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `<id>` | — | string | **是** | 释义 ID（位置参数） |
| `--interpretation <text>` | `-i` | string | **是** | 释义内容 |
| `--tag <tag>` | `-g` | string[] | **是** | 标签（可重复 / stdin `-`） |
| `--status <status>` | `-s` | string | **是** | PUBLISHED / UNPUBLISHED / DELETED |

---

### `interpretation delete` — 删除释义

```
memo-api interp delete <id> [-f]
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `<id>` | — | string | **是** | 释义 ID（位置参数） |
| `--force` | `-f` | flag | 否 | 跳过确认提示 |

---

## 资源：phrase (例句)

```
memo-api phrase <action> [options]
```

| Action | HTTP | API |
|--------|------|-----|
| `list` | GET /api/v1/memo/phrases | ListPhrases |
| `create` | POST /api/v1/memo/phrases | CreatePhrase |
| `update` | POST /api/v1/memo/phrases/{id} | UpdatePhrase |
| `delete` | DELETE /api/v1/memo/phrases/{id} | DeletePhrase |

### `phrase list` — 获取单词的例句列表

```
memo-api phrase list (-v <id> | -w <spelling>)
```

---

### `phrase create` — 创建例句

```
memo-api phrase create (-v <id> | -w <spelling>) -p <text> -i <text> [-g <tag> ...] [-o <origin>]
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--voc-id <id>` | `-v` | string | 二选一 | 单词 ID |
| `--word <spelling>` | `-w` | string | 二选一 | 单词拼写（自动调用 `voc get` 获取 ID） |
| `--phrase <text>` | `-p` | string | **是** | 例句原文 |
| `--interpretation <text>` | `-i` | string | **是** | 例句翻译 |
| `--tag <tag>` | `-g` | string[] | 否 | 标签（可重复 / stdin `-`） |
| `--origin <origin>` | `-o` | string | 否 | 来源 |

---

### `phrase update` — 更新例句

```
memo-api phrase update <id> -p <text> -i <text> -g <tag> [-g <tag> ...] -o <origin>
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `<id>` | — | string | **是** | 例句 ID（位置参数） |
| `--phrase <text>` | `-p` | string | **是** | 例句原文 |
| `--interpretation <text>` | `-i` | string | **是** | 例句翻译 |
| `--tag <tag>` | `-g` | string[] | **是** | 标签（可重复 / stdin `-`） |
| `--origin <origin>` | `-o` | string | **是** | 来源 |

---

### `phrase delete` — 删除例句

```
memo-api phrase delete <id> [-f]
```

---

## 资源：notepad (云词本)

```
memo-api notepad <action> [options]
```

| Action | HTTP | API |
|--------|------|-----|
| `list` | GET /api/v1/memo/notepads | ListNotepads |
| `get` | GET /api/v1/memo/notepads/{id} | GetNotepad |
| `create` | POST /api/v1/memo/notepads | CreateNotepad |
| `update` | POST /api/v1/memo/notepads/{id} | UpdateNotepad |
| `delete` | DELETE /api/v1/memo/notepads/{id} | DeleteNotepad |

### `notepad list` — 查询云词本

```
memo-api notepad list [-l <n>] [-o <n>] [-I <id> ...]
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--limit <n>` | `-l` | number | 否 | 查询数量，默认 10 |
| `--offset <n>` | `-o` | number | 否 | 跳过数量，默认 0 |
| `--id <id>` | `-I` | string[] | 否 | 按 ID 过滤（可重复 / stdin `-`） |

---

### `notepad get` — 获取单个云词本

```
memo-api notepad get <id>
```

无额外参数（ID 为位置参数）。

---

### `notepad create` — 创建云词本

```
memo-api notepad create -t <title> -c <text> [-b <text>] [-g <tag> ...] [-s <status>]
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--title <title>` | `-t` | string | **是** | 标题 |
| `--content <text>` | `-c` | string | **是** | 内容 |
| `--brief <text>` | `-b` | string | 否 | 简介 |
| `--tag <tag>` | `-g` | string[] | 否 | 标签（可重复 / stdin `-`） |
| `--status <status>` | `-s` | string | 否 | 默认 `PUBLISHED`；可选 `UNPUBLISHED` |

---

### `notepad update` — 更新云词本

```
memo-api notepad update <id> -t <title> -c <text> -b <text> -g <tag> [-g <tag> ...] -s <status>
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `<id>` | — | string | **是** | 云词本 ID（位置参数） |
| `--title <title>` | `-t` | string | **是** | 标题 |
| `--content <text>` | `-c` | string | **是** | 内容 |
| `--brief <text>` | `-b` | string | **是** | 简介 |
| `--tag <tag>` | `-g` | string[] | **是** | 标签（可重复 / stdin `-`） |
| `--status <status>` | `-s` | string | **是** | PUBLISHED / UNPUBLISHED / DELETED |

---

### `notepad delete` — 删除云词本

```
memo-api notepad delete <id> [-f]
```

---

## 资源：voc / vocabulary (单词)

```
memo-api vocabulary <action> [options]
memo-api voc <action> [options]             # 别名
```

| Action | HTTP | API |
|--------|------|-----|
| `get` | GET /api/v1/memo/vocabulary | GetVocabulary |
| `query` | POST /api/v1/memo/vocabulary/query | ListVocabulary |

### `voc get` — 按拼写获取单词

```
memo-api voc get -s <word>
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--spelling <word>` | `-s` | string | **是** | 单词拼写 |

---

### `voc query` — 批量查询单词

```
memo-api voc query -s <word> [-s <word> ...] | -I <id> [-I <id> ...]
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--spelling <word>` | `-s` | string[] | 二选一 | 按拼写查询（可重复 / stdin `-`，最多 1000） |
| `--id <id>` | `-I` | string[] | 二选一 | 按 ID 查询（可重复 / stdin `-`，最多 1000） |

---

## 资源：study (学习数据)

```
memo-api study <action> [options]
```

| Action | HTTP | API |
|--------|------|-----|
| `progress` | POST /api/v1/memo/study/get_study_progress | GetStudyProgress |
| `today` | POST /api/v1/memo/study/get_today_items | GetTodayItems |
| `records` | POST /api/v1/memo/study/query_study_records | QueryStudyRecords |
| `add` | POST /api/v1/memo/study/add_words | AddWords |
| `advance` | POST /api/v1/memo/study/advance_study | AdvanceStudy |

### `study progress` — 获取今日学习进度

```
memo-api study progress
```

无额外参数。

---

### `study today` — 获取今日学习单词

```
memo-api study today [-F] [--no-finished] [-n] [--no-new] [-v <id> ...] [-s <word> ...] [-l <n>]
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--finished` | `-F` | flag | 否 | 仅筛选已完成的 |
| `--no-finished` | — | flag | 否 | 仅筛选未完成的 |
| `--new` | `-n` | flag | 否 | 仅筛选新学单词 |
| `--no-new` | — | flag | 否 | 仅筛选非新学单词 |
| `--voc-id <id>` | `-v` | string[] | 否 | 按单词 ID 筛选（可重复 / stdin `-`，最多 1000） |
| `--spelling <word>` | `-s` | string[] | 否 | 按拼写筛选（可重复 / stdin `-`，最多 1000） |
| `--limit <n>` | `-l` | number | 否 | 最大返回数，默认 50，上限 1000 |

---

### `study records` — 查询学习记录

```
memo-api study records [-S <iso8601>] [-E <iso8601>] [-v <id> ...] [-s <word> ...] [-t <tag> ...] [-c] [-l <n>]
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--next-study-start <iso8601>` | `-S` | string | 否 | 下次学习日期起始（ISO 8601，北京时区） |
| `--next-study-end <iso8601>` | `-E` | string | 否 | 下次学习日期截止（ISO 8601，北京时区） |
| `--voc-id <id>` | `-v` | string[] | 否 | 按单词 ID 筛选（可重复 / stdin `-`） |
| `--spelling <word>` | `-s` | string[] | 否 | 按拼写筛选（可重复 / stdin `-`） |
| `--tag <tag>` | `-t` | string[] | 否 | 按标签筛选（可重复，目前仅支持 `STICKING` 顽固单词；与 `-v`/`-s` 同用时不生效） |
| `--count` | `-c` | flag | 否 | 仅返回计数 |
| `--limit <n>` | `-l` | number | 否 | 最大返回数，默认 50，上限 1000 |

---

### `study add` — 添加单词到学习计划

```
memo-api study add (-I <id> | -w <word>) [...] [-a]
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--id <id>` | `-I` | string[] | 二选一 | 单词 ID 列表（可重复 / stdin `-`，与 `--word` 合计最多 1000） |
| `--word <word>` | `-w` | string[] | 二选一 | 单词拼写列表（自动解析为 ID，可重复 / stdin `-`） |
| `--advance` | `-a` | flag | 否 | 一并提前复习 |

---

### `study advance` — 提前复习

```
memo-api study advance (-v <id> | -w <word>) [...]
```

| 参数 | 短名 | 类型 | 必需 | 说明 |
|------|------|------|------|------|
| `--voc-id <id>` | `-v` | string[] | 二选一 | 单词 ID 列表（可重复 / stdin `-`，与 `--word` 合计最多 1000） |
| `--word <word>` | `-w` | string[] | 二选一 | 单词拼写列表（自动解析为 ID，可重复 / stdin `-`） |

---

## 资源：auth (认证)

```
memo-api auth <action>
```

| Action | 说明             | 需要 Token |
|--------|----------------|-----------|
| `login` | 登录             | 否 |
| `whoami` | 显示当前用户 UID 和昵称 | 是（仅 OIDC at） |

### `auth login` — OIDC PKCE 登录

```
memo-api auth login
```

无参数。发起完整 PKCE 流程：打开浏览器 → 用户授权 → 本地回调 → 保存 at/rt 到配置文件。

- 端口 18884 被占用时终止
- 10 分钟超时
- 输出登录成功信息（列式显示 uid + name，JSON 输出 `{"uid":"...","name":"..."}`）
- 详情见 [auth.md](./auth.md)

### `auth whoami` — 当前用户信息

```
memo-api auth whoami
```

无参数。仅 OIDC at 可用（apiToken 时提示 "请先执行 memo-api auth login"）。

- 调用 OIDC userinfo endpoint
- 列式输出 uid + name
- JSON 输出完整 userinfo 响应

---

## `--word` 自动解析

部分 API 仅接受 `voc_id` 而不提供按拼写查询的等价参数（note list/create、interpretation list/create、phrase list/create）。`--word` 参数提供便捷方式：先调用 `voc get --spelling <word>` 获取单词 ID，再执行原操作。`study add`、`study advance` 原生接受 ID 列表，同样提供 `-w/--word` 拼写解析（可与 `--id`/`--voc-id` 同时使用，合计最多 1000）。

| 行为 | 说明 |
|------|------|
| `--word` 与 `--voc-id` 互斥 | 必须二选一 |
| 解析失败 | 若单词不存在则报错退出（exit 1），不执行后续操作 |
| 实现 | 内部调用 `GET /api/v1/memo/vocabulary` |
| 已有 `--spelling` 的命令不受影响 | `study today`、`study records`、`voc query` 已有原生拼写查询 |
| stdin JSON 模式下无效 | JSON 中已有 voc_id 时不需要解析 |

---

## 短别名对照表

### 全局

| 短名 | 参数 |
|------|------|
| `-T` | `--token` |
| `-O` | `--output json` |
| `-h` | `--help` |
| `-V` | `--version` |

### 跨资源一致

| 短名 | 参数 | 适用资源 |
|------|------|----------|
| `-v` | `--voc-id` | note, interp, phrase, study |
| `-w` | `--word` | note, interp, phrase |
| `-s` | `--spelling` / `--status` | voc (spelling), study (spelling), interp & notepad (status) |
| `-g` | `--tag` | interp, phrase, notepad |
| `-f` | `--force` | note, interp, phrase, notepad |
| `-l` | `--limit` | notepad, study |
| `-I` | `--id` | notepad, voc, study |
| `-n` | `--note` / `--new` | note (note), study (new) |
| `-t` | `--type` / `--title` / `--tag` | note (type), notepad (title), study records (tag) |
| `-c` | `--content` / `--count` | notepad (content), study (count) |

### 资源专属

| 短名 | 参数 | 适用命令 |
|------|------|----------|
| `-i` | `--interpretation` | interp, phrase |
| `-p` | `--phrase` | phrase |
| `-o` | `--origin` / `--offset` | phrase (origin), notepad (offset) |
| `-b` | `--brief` | notepad |
| `-F` | `--finished` | study today |
| `-S` | `--next-study-start` | study records |
| `-E` | `--next-study-end` | study records |
| `-a` | `--advance` | study add |

> 同一短名在不同子命令中可复用（如 `-s` 在 `voc` 中表示 `--spelling`，在 `interp` 中表示 `--status`），commander 按子命令作用域解析。

---

## Flag 命名规范

- 多单词 flag 使用小写 + 连字符：`--voc-id`、`--no-color`
- 布尔 flag 使用 `--<name>` 开启、`--no-<name>` 关闭
- 布尔否定 flag（`--no-*`）不分配短别名
- 数组 flag 通过重复指定：`-g 考研 -g 托福`；也可用 `-g -` 从 stdin 读取换行分隔值
- 位置参数仅用于实体 ID（如 `<id>`），其余一律使用命名 flag
- 支持 `=` 分隔值：`--token=xxx` 与 `--token xxx` 等效

---

## 帮助信息

所有帮助文本由 **commander API 动态生成**，不手写静态帮助字符串。通过 `.description()`、`.option()`、`.addHelpText()`、`.command()` 等方法声明，commander 自动排版，确保选项变更时帮助保持同步。

### 二层帮助结构

```
memo-api --help             # 顶层：列出所有资源 + 全局选项
memo-api note --help        # 资源级：列出该资源下所有 action
memo-api note create --help # action 级：该命令的完整选项和示例
```

### 顶层 `memo-api --help`

**commander 声明：**

```typescript
const program = new Command('memo-api')
  .description('调用墨墨开放 API')
  .option('-T, --token <string>', 'API Token（也可通过 MAIMEMO_API_TOKEN 环境变量或 ~/.config/memo-api.json 配置）')
  .option('-O, --output <format>', '输出格式：json 或 column', 'column')
  .option('--no-color', '禁用颜色')
  .option('--verbose', '显示请求详情和原始响应')
  .addHelpText('after', `
示例:
  $ memo-api voc get --spelling=apple
  $ memo-api note list --word=apple -O json
  $ memo-api study progress
  $ echo '{"spelling":"apple"}' | memo-api voc get

高级用法:
  所有命令支持 stdin JSON 输入作为 API 请求体，管道传入时自动跳过命令行参数校验。
  数组参数可通过重复 flag 指定（-g A -g B），或通过 stdin 换行输入（-g -）。
  详情见各子命令 --help。
`)

program.addCommand(noteCmd)
program.addCommand(interpCmd)
program.addCommand(phraseCmd)
program.addCommand(notepadCmd)
program.addCommand(vocCmd)
program.addCommand(studyCmd)
```

全局选项直接定义在根 `program` 上，commander 自动将其传播到所有子命令。

**生成效果：**

```
Usage: memo-api [options] [command]

调用墨墨开放 API

Options:
  -T, --token <string>    API Token（也可通过 MAIMEMO_API_TOKEN 环境变量或
                          ~/.config/memo-api.json 配置）
  -O, --output <format>   输出格式：json 或 column（默认 column）
  --no-color              禁用颜色
  --verbose               显示请求详情和原始响应
  -H, --no-header          跳过表头行
  --fields <fields>       选择展示的字段（逗号分隔）
  -h, --help              帮助信息
  -V, --version           版本号

Commands:
  auth       OIDC 登录与身份查询（login / whoami）
  note       助记查询与编辑（list / create / update / delete）
  interp     释义查询与编辑（list / create / update / delete）
  phrase     例句查询与编辑（list / create / update / delete）
  notepad    云词本查询与编辑（list / get / create / update / delete）
  voc        单词查询（get / query）
  study      学习数据（progress / today / records / add / advance）

示例:
  $ memo-api voc get --spelling=apple
  ...

高级用法:
  ...
```

> **要点**：每个 Command 的 `.description()` 应简短说明该资源包含哪些 action（如 `"单词查询（get / query）"`）。子命令列表由 `addCommand()` 自动生成，名称和顺序与注册一致。

### 资源级 `memo-api note --help`

**commander 声明：**

```typescript
const noteCmd = new Command('note')
  .configureHelp({ showGlobalOptions: true })
  .description('助记查询与编辑')
  .addHelpText('after', `
示例:
  $ memo-api note list --voc-id <id>
  $ memo-api note create --word apple --type 谐音 --note "这是助记"
  $ echo '{"note":{"voc_id":"x","note_type":"谐音","note":"text"}}' | memo-api note create
`)

noteCmd.addCommand(noteListCmd)
noteCmd.addCommand(noteCreateCmd)
noteCmd.addCommand(noteUpdateCmd)
noteCmd.addCommand(noteDeleteCmd)
```

**生成效果：**

```
Usage: memo-api note [options] [command]

助记查询与编辑

Options:
  -h, --help             display help for command

Global Options:
  -T, --token <string>   API Token
  -O, --output <format>  输出格式：json 或 column
  --no-color             禁用颜色
  --verbose              显示请求详情和原始响应
  -H, --no-header        跳过表头行
  --fields <fields>      选择展示的字段（逗号分隔）

Commands:
  list [options]         获取单词的助记列表
  create [options]       为单词创建一条助记
  update [options] <id>  更新助记
  delete [options] <id>  删除助记

示例:
  $ memo-api note list --voc-id <id>
  ...
```

> 每个资源子命令通过 `configureHelp({ showGlobalOptions: true })` 展示全局选项。功能上全局选项可放置在子命令前后任意位置。

### Action 级 `memo-api note create --help`

**commander 声明：**

```typescript
const noteCreateCmd = new Command('create')
  .description('为单词创建一条助记')
  .option('-v, --voc-id <id>', '单词 ID')
  .option('-w, --word <spelling>', '单词拼写（自动调用 voc get 解析为 ID）')
  .option('-t, --type <type>', '助记类型，如"谐音"')
  .option('-n, --note <text>', '助记内容')
  .addHelpText('after', `
--word 与 --voc-id 互斥，必须指定其一。

stdin JSON 模式:
  echo '{"note":{"voc_id":"x","note_type":"谐音","note":"text"}}' | memo-api note create

示例:
  $ memo-api note create --word=apple --type=谐音 --note="苹果的助记"
  $ memo-api note create -w apple -t 谐音 -n "苹果的助记"
  $ echo '{"note":{"voc_id":"x","note_type":"谐音","note":"text"}}' | memo-api note create
`)
  .action(async (options, cmd) => { /* ... */ })
```

**生成效果：**

```
Usage: memo-api note create [options]

为单词创建一条助记

Options:
  -v, --voc-id <id>       单词 ID
  -w, --word <spelling>   单词拼写（自动调用 voc get 解析为 ID）
  -t, --type <type>       助记类型，如"谐音"
  -n, --note <text>       助记内容
  -h, --help              display help for command

Global Options:
  -T, --token <string>    API Token
  -O, --output <format>   输出格式：json 或 column
  --no-color              禁用颜色
  --verbose               显示请求详情和原始响应
  -H, --no-header         跳过表头行
  --fields <fields>       选择展示的字段（逗号分隔）

--word 与 --voc-id 互斥，必须指定其一。

stdin JSON 模式:
  echo '{"note":{"voc_id":"x","note_type":"谐音","note":"text"}}' | memo-api note create

示例:
  $ memo-api note create --word=apple --type=谐音 --note="苹果的助记"
  $ memo-api note create -w apple -t 谐音 -n "苹果的助记"
  $ echo '{"note":{"voc_id":"x","note_type":"谐音","note":"text"}}' | memo-api note create
```

### `.addHelpText()` 规范

所有 action 级命令通过 `.addHelpText('after', ...)` 补充以下内容（如有）：

| 补充内容 | 触发条件 | 示例 |
|----------|----------|------|
| 互斥约束 | 参数互斥（`--word`/`--voc-id`、`--spelling`/`--id`） | `--word 与 --voc-id 互斥，必须指定其一。` |
| stdin JSON 示例 | 所有命令 | `echo '{"note":{...}}' \| memo-api note create` |
| 数组输入说明 | 有数组参数的命令 | `可重复指定：-g A -g B；或用 -g - 从 stdin 读取换行分隔值。` |
| 删除确认说明 | `delete` 命令 | `删除需确认，使用 -f 跳过。stdin 非 TTY 时须指定 -f。` |
| `--word` 解析说明 | 有 `--word` 参数的命令 | `--word 内部先查询单词获取 ID 再执行操作，单词不存在时报错退出。` |
| 使用示例 | 所有命令 | 至少 2 个示例（短名 + 长名风格各一） |

`.addHelpText()` 内容跟随 commander 自动生成的选项列表之后。全局选项 `-T`/`-O`/`--no-color` 定义在根 `program` 上，commander 自动将其传播到所有子命令帮助中，无需手动添加。

---

## commander 实现模式

以下是与 commander API 密切相关的关键实现模式。

### 数组参数：重复 flag（collect 模式）

commander 不原生支持重复 flag（如 `-g A -g B` 自动累积为数组），需通过 `argParser` 收集：

```typescript
import { Option } from 'commander'

// 模式 A：使用 Option 的 argParser
cmd.addOption(
  new Option('-g, --tag <tag>', '标签（可重复）')
    .argParser((val: string, prev: string[]) => prev.concat([val]))
    .default([])
)

// 模式 B：使用 option() 的第三个参数（collect 函数）
function collect(value: string, previous: string[]) {
  return previous.concat([value])
}
cmd.option('-g, --tag <tag>', '标签（可重复）', collect, [])
```

所有数组类型参数（`--tag`、`--id`、`--spelling`、`--voc-id`（study 中））均使用此模式。

### stdin JSON 检测

在 `.action()` 或 `preAction` hook 中检测 stdin：

```typescript
async function readStdinIfPipe(): Promise<string | null> {
  if (process.stdin.isTTY) return null
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf-8')
}

function tryParseStdinJson(stdin: string | null): object | null {
  if (!stdin) return null
  try { return JSON.parse(stdin) } catch { return null }
}
```

### 全局选项访问

action handler 中通过 `cmd.optsWithGlobals()` 获取合并后的选项（包含父级 `--token`、`--output`）：

```typescript
cmd.action(async (options, cmd) => {
  const globalOptions = cmd.optsWithGlobals()
  const token = globalOptions.token || process.env.MAIMEMO_API_TOKEN || config.apiToken
  const outputFormat = globalOptions.output  // 'json' | 'column'
})
```

### Token 注入（preAction hook）

在根 `program` 上注册 `preAction` hook，统一解析 Token 并注入到所有子命令：

```typescript
program.hook('preAction', (parentCmd, actionCmd) => {
  const opts = actionCmd.optsWithGlobals()
  const token = opts.token || process.env.MAIMEMO_API_TOKEN || configService.config.apiToken
  if (!token) {
    console.error('错误: 缺少 API Token。请通过 -T、MAIMEMO_API_TOKEN 环境变量或 ~/.config/memo-api.json 提供。')
    process.exit(1)
  }
  // 将 token 挂到 command 上供 action 使用
  ;(actionCmd as any)._apiToken = token
})
```

### 别名注册

资源别名通过 `.alias()` 在父级 `.command()` 返回的 cmd 上注册：

```typescript
// interpretation -> interp
const interpCmd = program.command('interpretation').alias('interp')
interpCmd.description('释义查询与编辑（list / create / update / delete）')

// vocabulary -> voc
const vocCmd = program.command('vocabulary').alias('voc')
vocCmd.description('单词查询（get / query）')
```

### parseAsync

所有 action 需用 async，入口使用 `parseAsync`：

```typescript
await program.parseAsync(process.argv)
```

### 入口示例

```typescript
// src/index.ts
import { Command } from 'commander'
import { noteCmd } from './note.js'
import { interpCmd } from './interp.js'
import { phraseCmd } from './phrase.js'
import { notepadCmd } from './notepad.js'
import { vocCmd } from './voc.js'
import { studyCmd } from './study.js'
import { resolveToken } from './lib/auth.js'
import { setColor, setShowHeader, setSelectedFields } from './output.js'
import { setVerbose } from './client.js'

const program = new Command('memo-api')
  .description('调用墨墨开放 API')
  .option('-T, --token <string>', 'API Token')
  .option('-O, --output <format>', '输出格式：json 或 column', 'column')
  .option('--no-color', '禁用颜色')
  .option('--verbose', '显示请求详情和原始响应')
  .option('-H, --no-header', '跳过表头行')
  .option('--fields <fields>', '选择展示的字段（逗号分隔）。以 + 开头追加，以 - 开头移除')

program.hook('preAction', (parentCmd, actionCmd) => {
  const opts = actionCmd.optsWithGlobals()
  if (opts.color === false) setColor(false)
  if (opts.verbose) setVerbose(true)
  if (opts.header === false) setShowHeader(false)
  if (opts.fields) setSelectedFields(opts.fields)
  const token = resolveToken({ token: opts.token })
  ;(actionCmd as any)._apiToken = token
})

program.addCommand(noteCmd)
program.addCommand(interpCmd)
program.addCommand(phraseCmd)
program.addCommand(notepadCmd)
program.addCommand(vocCmd)
program.addCommand(studyCmd)

await program.parseAsync(process.argv)

---

## 输出格式

- **默认**：人类可读列式（单条记录也以列式呈现，保持一致性）
- **列式行为**：
  - 内容包含换行符时折叠为空格（单行显示）
  - 原始文本长度超过 200 字符时截断追加 `...`。指定 `--fields` 时跳过截断
  - `--no-header` / `-H` 跳过表头行
  - `--fields id,name` 仅展示指定字段，按指定顺序排列。`--fields "+extra"` 在默认字段基础上追加，`--fields "-id,status"` 移除
  - 未指定 `--fields` 时使用默认字段集（集中配置于 `src/lib/default-fields.ts`，各实体仅展示核心字段避免过宽）
  - 字段名以 `time` 或 `date` 结尾时自动将 ISO 日期（如 `2024-06-15T08:30:00Z`）转为本地时区 `YYYY-MM-DD HH:mm:ss`
- **`--output json` / `-O json`**：纯 JSON 输出到 stdout，适合管道处理
- 进度/提示/错误信息始终输出到 stderr（即使在 `-O json` 模式下）

---

## 删除确认

- 交互终端中 `delete` 操作默认提示 `y/N` 确认
- `--force` / `-f` 跳过确认（脚本/管道场景）
- stdin 不是 TTY 且未提供 `--force` 时，报错退出（exit 1）

---

## 资源别名汇总

| 完整名称 | 别名 | HTTP 路径前缀 |
|----------|------|---------------|
| `auth` | — | OIDC endpoints |
| `note` | — | `/api/v1/memo/notes` |
| `interpretation` | `interp` | `/api/v1/memo/interpretations` |
| `phrase` | — | `/api/v1/memo/phrases` |
| `notepad` | — | `/api/v1/memo/notepads` |
| `vocabulary` | `voc` | `/api/v1/memo/vocabulary` |
| `study` | — | `/api/v1/memo/study` |

---

## 测试方案

### 测试框架

- **单元测试**：`node:test` + `node:assert`（Node 18+ 内置，无需额外依赖）
- **HTTP Mock**：`undici.MockAgent` 或拦截 `global.fetch`
- **CLI 测试**：`child_process.execFile` 执行编译后的 `dist/index.js`
- **测试文件**：`test/` 目录

### 用例清单

#### 1. 全局选项

| ID | 用例 | 预期 |
|----|------|------|
| G1 | `memo-api --help` | 显示 api 帮助 |
| G2 | `memo-api --version` | 显示版本号 |
| G3 | `memo-api note list -v xxx -T <token>` | Token 通过 flag 传入 |
| G4 | `MAIMEMO_API_TOKEN=xxx memo-api note list -v xxx` | Token 从环境变量读取 |
| G5 | `memo-api note list -v xxx -O json` | 输出 JSON |
| G6 | `memo-api note list -v xxx --no-color` | 禁用颜色 |
| G7 | `memo-api note list -v xxx -H` | 跳过表头（`-H` = `--no-header`） |
| G8 | `memo-api note list -v xxx --fields id,note` | 仅显示 id、note 两列 |
| G9 | 列式输出：内容含换行 | 折叠为空格，单行显示 |
| G10 | 列式输出：内容超 80 字符 | 截断追加 `...` |

#### 2. 短别名

| ID | 用例 | 预期 |
|----|------|------|
| A1 | `memo-api note create -v xxx -t 谐音 -n "test"` | `-v`→`--voc-id`, `-t`→`--type`, `-n`→`--note` |
| A2 | `memo-api interp create -v xxx -i "释义" -g A -g B -s PUBLISHED` | 所有短名正确映射 |
| A3 | `memo-api phrase create -v xxx -p "text" -i "trans" -o "source"` | `-p`→`--phrase`, `-i`→`--interpretation`, `-o`→`--origin` |
| A4 | `memo-api notepad create -t "T" -c "C" -b "B" -g A -g B` | `-t`→`--title`, `-c`→`--content`, `-b`→`--brief` |
| A5 | `memo-api voc get -s apple` | `-s`→`--spelling` |
| A6 | `memo-api voc query -s apple -s banana` | 重复 `-s` 构建数组 |
| A7 | `memo-api study today -F -n -v id1 -v id2 -l 20` | 所有 study 短名正确 |
| A8 | `memo-api study records -S "2026-01-01" -E "2026-12-31" -c` | `-S`/`-E`/`-c` 正确 |
| A9 | `memo-api study add -I id1 -I id2 -a` | `-I`/`-a` 正确 |
| A10 | `memo-api study advance -v id1 -v id2` | `-v`→`--voc-id` in study context |
| A11 | `memo-api note delete xxx -f` | `-f`→`--force` 跳过确认 |

#### 3. note 命令

| ID | 用例 | 预期 |
|----|------|------|
| N1 | `memo-api note list -v xxx` | 调用 GET /api/v1/memo/notes?voc_id=xxx |
| N2 | `memo-api note list -w apple` | 先 GET /api/v1/memo/vocabulary?spelling=apple，再 list |
| N3 | `memo-api note create -v xxx -t 谐音 -n "助记"` | POST /api/v1/memo/notes body `{note:{voc_id,note_type,note}}` |
| N4 | `memo-api note update id123 -t 谐音 -n "新"` | POST /api/v1/memo/notes/id123 |
| N5 | `memo-api note delete id123` | 提示确认，输入 `y` 后 DELETE |
| N6 | `memo-api note delete id123 -f` | 不提示，直接 DELETE |
| N7 | `memo-api note list` (缺参数) | 报错：缺少 --voc-id 或 --word |
| N8 | `memo-api note list -v xxx -w apple` | 报错：--voc-id 和 --word 互斥 |

#### 4. interpretation 命令

| ID | 用例 | 预期 |
|----|------|------|
| I1 | `memo-api interp list -v xxx` | GET /api/v1/memo/interpretations?voc_id=xxx |
| I2 | `memo-api interp create -v xxx -i "释义"` | POST /api/v1/memo/interpretations（默认 status=PUBLISHED） |
| I3 | `memo-api interp create -w apple -i "释义" -g A -g B -s UNPUBLISHED` | `-w` 解析后创建，带标签和状态 |
| I4 | `memo-api interp update id123 -i "新" -g A -s DELETED` | POST /api/v1/memo/interpretations/id123 |
| I5 | `memo-api interp delete id123 -f` | DELETE 无确认 |
| I6 | `memo-api interpretation list -v xxx` | 全名 `interpretation` 等同 `interp` |

#### 5. phrase 命令

| ID | 用例 | 预期 |
|----|------|------|
| P1 | `memo-api phrase list -v xxx` | GET /api/v1/memo/phrases?voc_id=xxx |
| P2 | `memo-api phrase create -v xxx -p "Hello" -i "你好" -g A -o "book"` | POST /api/v1/memo/phrases |
| P3 | `memo-api phrase update id123 -p "Hi" -i "嗨" -g A -o "web"` | POST /api/v1/memo/phrases/id123 |
| P4 | `memo-api phrase delete id123 -f` | DELETE 无确认 |

#### 6. notepad 命令

| ID | 用例 | 预期 |
|----|------|------|
| O1 | `memo-api notepad list` | GET /api/v1/memo/notepads（默认 limit=10, offset=0） |
| O2 | `memo-api notepad list -l 5 -o 10 -I id1 -I id2` | GET 带 query params |
| O3 | `memo-api notepad get id123` | GET /api/v1/memo/notepads/id123 |
| O4 | `memo-api notepad create -t "标题" -c "内容"` | POST /api/v1/memo/notepads（默认 status=PUBLISHED） |
| O5 | `memo-api notepad create -t "T" -c "C" -b "B" -g A -s UNPUBLISHED` | POST 带全部字段 |
| O6 | `memo-api notepad update id123 -t "T" -c "C" -b "B" -g A -s PUBLISHED` | POST /api/v1/memo/notepads/id123 |
| O7 | `memo-api notepad delete id123 -f` | DELETE 无确认 |

#### 7. voc 命令

| ID | 用例 | 预期 |
|----|------|------|
| V1 | `memo-api voc get -s apple` | GET /api/v1/memo/vocabulary?spelling=apple |
| V2 | `memo-api voc query -s apple -s banana` | POST /api/v1/memo/vocabulary/query body `{spellings:["apple","banana"]}` |
| V3 | `memo-api voc query -I id1 -I id2` | POST body `{ids:["id1","id2"]}` |
| V4 | `memo-api voc query` (缺参数) | 报错：需 --spelling 或 --id |
| V5 | `memo-api voc query -s apple -I id1` | 报错：互斥 |
| V6 | `memo-api vocabulary get -s apple` | 全名 `vocabulary` 等同 `voc` |

#### 8. study 命令

| ID | 用例 | 预期 |
|----|------|------|
| S1 | `memo-api study progress` | POST /api/v1/memo/study/get_study_progress（空 body） |
| S2 | `memo-api study today` | POST /api/v1/memo/study/get_today_items（默认 body） |
| S3 | `memo-api study today -F -n -l 10` | POST 带 is_finished=true, is_new=true, limit=10 |
| S4 | `memo-api study today --no-finished --no-new -v id1 -v id2` | POST 带 is_finished=false, is_new=false, voc_ids |
| S5 | `memo-api study today -s apple -s banana` | POST 带 spellings |
| S6 | `memo-api study records -S "2026-01-01T00:00:00+08:00" -E "2026-01-02T00:00:00+08:00"` | POST 带 next_study_date range |
| S7 | `memo-api study records -c` | POST 带 as_count=true |
| S8 | `memo-api study records -t STICKING` | POST 带 tags=["STICKING"] |
| S9 | `memo-api study add -I id1 -a` | POST 带 advance=true |
| S10 | `memo-api study advance -v id1 -v id2` | POST /api/v1/memo/study/advance_study |
| S11 | `memo-api study add` (缺 -I) | 报错：缺少 --id |
| S12 | `memo-api study add -I id1 -I id2` | POST /api/v1/memo/study/add_words |

#### 9. `--word` 自动解析

| ID | 用例 | 预期 |
|----|------|------|
| W1 | `memo-api note list -w apple` | 内部先 GET /api/v1/memo/vocabulary?spelling=apple，再 list |
| W2 | `memo-api note create -w nonexist -t 谐音 -n "text"` | voc get 返回空 → 报错退出 |
| W3 | `memo-api interp list -w apple -O json` | 先解析单词，再以 JSON 输出释义列表 |
| W4 | `memo-api phrase create -w apple -p "Hi" -i "嗨"` | 解析后创建 |

#### 10. stdin JSON 输入

| ID | 用例 | 预期 |
|----|------|------|
| J1 | `echo '{"note":{"voc_id":"x","note_type":"t","note":"n"}}' \| memo-api note create` | 直接 POST JSON，忽略命令行参数 |
| J2 | `echo '{"voc_id":"x"}' \| memo-api note list` | GET /api/v1/memo/notes?voc_id=x |
| J3 | `echo '{"id":"id123"}' \| memo-api note delete -f` | DELETE /api/v1/memo/notes/id123 |
| J4 | `echo '{"id":"id123","note":{"note_type":"t","note":"n"}}' \| memo-api note update` | POST /api/v1/memo/notes/id123，取 JSON 中的 id |
| J5 | `echo '{"spelling":"apple"}' \| memo-api voc get` | GET /api/v1/memo/vocabulary?spelling=apple |
| J6 | `echo '{"spellings":["a","b"]}' \| memo-api voc query` | POST /api/v1/memo/vocabulary/query |
| J7 | `echo '{"notepad":{"title":"T","content":"C"}}' \| memo-api notepad create` | POST /api/v1/memo/notepads |
| J8 | `echo 'not json' \| memo-api note list -v xxx` | stdin 非 JSON → 视作普通输入（数组 `-` 模式），使用命令行参数 |
| J9 | stdin 为 TTY 时 `memo-api note create -v xxx -t t -n n` | 正常使用命令行参数 |
| J10 | `echo '{"spelling":"invalid"}' \| memo-api note list` | JSON 缺少 voc_id → API 返回错误（不校验），透传 |

#### 11. 数组参数（重复 flag + stdin 换行）

| ID | 用例 | 预期 |
|----|------|------|
| R1 | `memo-api interp create -v xxx -i "text" -g A -g B -g C` | tags: ["A","B","C"] |
| R2 | `printf "A\nB\nC" \| memo-api interp create -v xxx -i "text" -g -` | 同上，从 stdin 读取 |
| R3 | `memo-api voc query -s a -s b -s c` | spellings: ["a","b","c"] |
| R4 | `memo-api notepad list -I id1 -I id2` | ids: ["id1","id2"] |
| R5 | `memo-api study today -v id1 -v id2 -s apple -s banana` | voc_ids + spellings 均为数组 |

#### 12. 删除确认

| ID | 用例 | 预期 |
|----|------|------|
| D1 | `memo-api note delete id123` (stdin TTY) | 提示 "Delete note id123? (y/N)"，输入 y 执行 |
| D2 | `memo-api note delete id123` (stdin TTY, 输入 n) | 取消，exit 0 |
| D3 | `memo-api note delete id123 -f` | 直接执行，无提示 |
| D4 | `echo '{"id":"x"}' \| memo-api note delete` (stdin pipe, 无 -f) | 报错：stdin 非 TTY 且未指定 --force |

#### 13. 输出格式

| ID | 用例 | 预期 |
|----|------|------|
| U1 | `memo-api voc get -s apple` | 列式输出到 stdout |
| U2 | `memo-api voc get -s apple -O json` | JSON 输出到 stdout |
| U3 | `memo-api note list -v xxx -O json \| jq .` | 可管道给 jq 处理 |
| U4 | 网络错误 | 错误信息输出到 stderr，stdout 无输出 |
| U5 | Mock API note list → printColumns | 正确解析 API 响应并输出 tab 分隔列 |
| U6 | Mock API response 含 `\n` → printColumns | 折叠为空格，单行输出 |
| U7 | Mock API response 超长字段 → printColumns | 截断追加 `...` |
| U8 | Mock API + --no-header → printColumns | 跳过表头行 |
| U9 | Mock API + --fields id,note → printColumns | 仅选中字段，按指定顺序 |
| U10 | Mock API empty → printColumns | stderr 输出 `(empty)` |
| U11 | Mock API + printJson | 输出格式化 JSON 至 stdout |
| U12 | --no-header/--fields + printJson | 不影响 JSON 输出（仅列式受影响） |
| U13 | Mock API error (400 + structured errors) | stderr 展示 code: message |

#### 14. 认证

| ID | 用例 | 预期 |
|----|------|------|
| T1 | 无 Token（无 flag/环境变量/config） | 报错：缺少 API Token |
| T2 | `--token` flag 优先级最高 | 忽略环境变量和 config |
| T3 | 环境变量次之 | `MAIMEMO_API_TOKEN` 覆盖 config |
| T4 | `~/.config/memo-api.json` 中 `apiToken` 字段 | 作为兜底 |

#### 15. 别名

| ID | 用例 | 预期 |
|----|------|------|
| L1 | `memo-api interp list -v xxx` | 等同 `interpretation list` |
| L2 | `memo-api voc get -s apple` | 等同 `vocabulary get` |
| L3 | `memo-api study add -I id1` | 等同 `study add-words`（旧名不保留） |

#### 16. 错误处理

| ID | 用例 | 预期 |
|----|------|------|
| E1 | API 返回 400 + 结构化 errors | stderr 显示每条 code: message |
| E2 | API 返回 400 + 多个 errors | 每个 error 独立成行 |
| E3 | API 返回 200 + errors 字段非空 | stderr 显示 code: message（逐个） |
| E4 | API 返回 401 且 body 不可解析 | stderr: "HTTP 401: 认证失败，请检查 API Token" |
| E5 | API 返回 404 且 body 为空 | stderr: "HTTP 404: 资源不存在" |
| E6 | API 返回非标准状态（如 429） | stderr: "HTTP 429: 请求失败" |
| E7 | 网络超时 | stderr: "请求超时" |
| E8 | 网络连接失败 | stderr: "网络连接失败" |
| E9 | 未知子命令 `memo-api foo` | 显示 api 帮助 |
| E10 | 未知 action `memo-api note foo` | 显示 note 帮助 |

#### 17. 列式输出扩展（`--no-header` / `--fields` / 截断）

| ID | 用例 | 预期 |
|----|------|------|
| F1 | `memo-api note list -v xxx -H` | 跳过表头，仅数据行 |
| F2 | `memo-api note list -v xxx --fields id,note_type` | 仅显示 id、note_type 两列，按指定顺序 |
| F3 | `memo-api note list -v xxx --fields extra,id` | 忽略不存在的字段 extra，只显示 id |
| F4 | 列式：字段值含 `\n` | 折叠为空格，单行显示 |
| F5 | 列式：字段值超 200 字符 | 截断追加 `...`；`--fields` 模式下不截断 |
| F6 | `-H` 和 `--fields` 组合 | 无表头，仅选中字段 |
| F7 | `--fields "+extra"` | 在默认字段基础上追加 extra |
| F8 | `--fields "-id,status"` | 从默认字段中移除 id、status |
| F9 | `--fields "-id"` | 移除 id 列，其余保留 |

#### 18. 帮助显示

| ID | 用例 | 预期 |
|----|------|------|
| H1 | `memo-api note --help` | 显示 Global Options 块 |
| H2 | `memo-api note create --help` | 显示 Global Options 块 |
| H3 | Global Options 包含 `-H, --no-header` | 子命令帮助可见 |
| H4 | Global Options 包含 `--fields <fields>` | 子命令帮助可见 |

#### 19. 最大参数限制

| ID | 用例 | 预期 |
|----|------|------|
| M1 | `memo-api voc query` 超过 1000 个 spelling | 报错：超过最大限制 1000 |
| M2 | `memo-api study add` 超过 1000 个 id | 报错：超过最大限制 1000 |

#### 20. auth 命令

| ID | 用例 | 预期 |
|----|------|------|
| A1 | `memo-api auth login` | Mock OIDC discovery + token endpoint，验证 at/rt 写入 config（0600） |
| A2 | `memo-api auth login` 端口 18884 占用 | 报错退出 |
| A3 | `memo-api auth login` 超时 | 10 分钟后报错 "登录超时" |
| A4 | `memo-api auth login` OIDC 回调 error | 输出 OIDC 错误描述并退出 |
| A5 | `memo-api auth login` 浏览器打开失败 | 打印 authorization URL 到 stderr，等待手动操作 |
| A6 | `memo-api auth login` 已登录再次执行 | 覆盖旧 at/rt |
| A7 | `memo-api auth whoami` (OIDC at 有效) | 列式输出 uid + name |
| A8 | `memo-api auth whoami -O json` (OIDC at 有效) | JSON 输出完整 userinfo |
| A9 | `memo-api auth whoami` (使用 apiToken) | 报错 "whoami 仅支持 OIDC 登录" |
| A10 | 无任何凭据执行 `memo-api voc get` | 提示 "请通过 -T、MAIMEMO_API_TOKEN 提供 Token，或执行 memo-api auth login 登录" |
| A11 | OIDC at 过期，rt 有效 → 执行命令 | 自动刷新 at，更新 config，命令正常执行 |
| A12 | OIDC at 过期，rt 过期 → 执行命令 | 清除 config 中 at/rt，报错 "登录已过期" |
| A13 | config 有 apiToken + OIDC at | 优先使用 apiToken |
| A14 | config 有 OIDC at（有效），无 apiToken | 直接使用 OIDC at |
| A15 | `--help` 不触发 token 解析 | auth login 也不触发 |
| A16 | `memo-api auth --help` | 显示 login / whoami 子命令 |
| A17 | `memo-api auth login --help` | 显示 login 帮助（无参数） |

---

## 实现要点

1. **入口**：`src/index.ts` 创建 commander `program`，注册 6 个资源子命令，直接调用 `program.parseAsync(process.argv)`
2. **依赖**：`commander`、`chalk`、`string-width`
3. **HTTP 客户端**：使用 `fetch`（Node 18+ 内置）
4. **配置**：读取 `~/.config/memo-api.json` 中的 `apiToken` 字段
5. **配置文件位置**：`~/.config/memo-api.json`（可用 `MEMO_API_CONFIG_PATH` 环境变量覆盖）
6. **stdin 检测**：`process.stdin.isTTY` 判断是否管道输入；尝试 `JSON.parse` 判断是否 JSON 模式
7. **parseAsync**：入口使用 `await program.parseAsync(process.argv)`（commander v12+ 兼容 `.action(async () => {})` 时须手动 `parseAsync`）
8. **数组 collect**：通过 `new Option('-g, --tag <tag>').argParser(fn, [])` 实现重复 flag 累积
9. **全局选项传播**：每个资源子命令通过 `.configureHelp({ showGlobalOptions: true })` 展示父级全局选项。全局选项功能上可放置在子命令前后任意位置。
10. **Token 注入**：`program.hook('preAction', ...)` 统一解析 Token，无需在每个 action 中重复
11. **输出格式集成测试**：`test/commands/output-format.test.ts` 通过 MockAgent 模拟 API + 调用 `printColumns`/`printJson` + 捕获 stdout/stderr 断言输出内容，覆盖列式截断/折叠/字段选择/JSON 输出/错误输出
12. **列式数据传递**：所有命令 handler 使用 `{ ...item }` 展开完整 API 响应字段，`printColumns` 通过 `flattenValue` 将数组 join、对象 JSON.stringify、null/undefined 转空字符串，字段名以 `time`/`date` 结尾时 ISO 日期转本地时区。未指定 `--fields` 时按 `src/lib/default-fields.ts` 配置仅展示核心字段，超过 200 字符截断追加 `...`
