# memo-api

墨墨开放 API 命令行工具。通过命令行管理词汇助记、释义、短语、生词本和学习记录。

## 安装

```bash
npm install -g @maimemo/memo-api
```

要求 Node.js >= 18。

## 设置

工具支持三种方式提供 API Token（优先级从高到低）：

1. **命令行参数**：`-T` 或 `--token`
2. **环境变量**：`MAIMEMO_API_TOKEN`
3. **配置文件**：`~/.config/memo-api.json`，内容为 `{ "apiToken": "你的Token" }`

## 用法

```
memo-api <资源> <操作> [参数...]
```

### 资源与操作

| 资源 | 操作 | 说明 |
|------|------|------|
| `voc` / `vocabulary` | `get`, `query` | 查询单词 |
| `note` | `list`, `create`, `update`, `delete` | 助记管理 |
| `interp` / `interpretation` | `list`, `create`, `update`, `delete` | 释义管理 |
| `phrase` | `list`, `create`, `update`, `delete` | 短语管理 |
| `notepad` | `list`, `get`, `create`, `update`, `delete` | 生词本管理 |
| `study` | `progress`, `today`, `records`, `add`, `advance` | 学习记录 |

### 常用选项

| 选项 | 说明 |
|------|------|
| `-T, --token` | API Token |
| `-O, --output` | 输出格式：`json` 或 `column`（默认 `column`） |
| `--no-color` | 禁用彩色输出 |
| `--verbose` | 显示请求详情 |
| `-H, --no-header` | 跳过表头行 |
| `--fields` | 选择展示字段（逗号分隔，`+` 追加，`-` 移除） |

### 示例

```bash
# 查询单词
memo-api voc get --spelling=apple

# 查看助记列表
memo-api note list --word=apple

# 创建助记
memo-api note create --word=apple --type=谐音 --note="苹果的助记"

# JSON 输出
memo-api voc get --spelling=apple -O json

# 查看学习进度
memo-api study progress

# 添加单词到学习规划
memo-api study add -w hello -w world

# 管道输入
echo '{"spelling":"apple"}' | memo-api voc get
```

### 高级用法

**管道 JSON 输入**：支持通过 stdin 传入 JSON 作为请求体或参数，传入有效 JSON 时自动跳过命令行参数校验。

```bash
# stdin JSON 作为请求体
echo '{"note":{"voc_id":"v123","note_type":"谐音","note":"内容"}}' | memo-api note create

# stdin JSON 提供参数
echo '{"id":"note_id"}' | memo-api note delete -f
```

**字段筛选**：`--fields` 支持三种模式。

```bash
# 替换：只显示指定字段
memo-api note list --word=apple --fields=id,note

# 追加：在默认字段基础上增加
memo-api note list --word=apple --fields=+updated_time

# 移除：从默认字段中排除
memo-api note list --word=apple --fields=-status
```

**数组参数**：可通过重复 flag 或 stdin 换行输入。

```bash
# 重复 flag
memo-api study add --voc-id v1 --voc-id v2 --voc-id v3

# stdin 换行（- 表示从 stdin 读取）
echo -e "v1\nv2\nv3" | memo-api study add --voc-id -
```

**调试**：使用 `--verbose` 查看完整的 HTTP 请求和响应。

```bash
memo-api voc get --spelling=apple --verbose
```

**跳过确认**：删除操作默认会要求确认，使用 `-f` 跳过。

```bash
memo-api note delete id123 -f
```
