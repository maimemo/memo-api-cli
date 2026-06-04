# OIDC PKCE 登录功能设计

## 概述

为 CLI 新增 `memo-api auth` 子命令，支持通过 OIDC PKCE 流程登录墨墨账号。登录后自动获取 access_token 和 refresh_token 并保存到配置文件，后续命令自动使用 OIDC 凭证鉴权。

## 认证优先级

CLI 按以下优先级选择鉴权方式：

1. `-T` / `--token` 命令行参数（老式 API Token）
2. `MAIMEMO_API_TOKEN` 环境变量（老式 API Token）
3. `~/.config/memo-api.json` 中的 `apiToken` 字段（老式 API Token）
4. `~/.config/memo-api.json` 中的 OIDC `at` 字段（自动刷新）

用户提供老式 Token 时，优先使用老式 Token，不触发 OIDC 流程。

---

## CLI 命令

```
memo-api auth <action>
```

| Action | 说明             | 需要 Token     |
|--------|----------------|--------------|
| `login` | 登录             | 否            |
| `whoami` | 显示当前用户 UID 和昵称 | 是（仅 OIDC 登录） |

### `memo-api auth login`

零参数，发起完整 PKCE 登录流程：

1. 通过 openid-client 从 `issuer/.well-known/openid-configuration` 拉取 OIDC metadata（authorization_endpoint、token_endpoint）
2. 生成 PKCE `code_verifier` + `code_challenge`（S256）和 `state`（openid-client 自动处理）
3. 在 `localhost:18884` 启动临时 HTTP server 等待回调
4. 构建 authorization URL，打开系统浏览器；若浏览器打开失败则在 stderr 打印 URL 让用户手动打开
5. 用户在浏览器完成授权后，redirect 到 `http://localhost:18884/callback?code=...&state=...`
6. 校验 `state`，用 `code` + `code_verifier` 向 token endpoint 换取 `access_token`、`refresh_token`、`id_token`
7. openid-client 自动验证 `id_token`（签名、issuer、audience、nonce），从中提取 `sub` 和 `name`
8. 浏览器显示 HTML 页面："登录成功，可以关闭页面"
9. 将 `at` 和 `rt` 原子写入 `~/.config/memo-api.json`（先写 `.tmp` 再 `rename`，`chmod 0600`）
10. stderr 输出 `printSuccess("登录成功: <name> (<uid>)")`；若 `-O json` 则 stdout 输出 `{"uid":"...", "name":"..."}`

**边界行为**：
- 端口 18884 被占用 → 报错退出，提示关闭占用程序后重试
- 用户 10 分钟未完成授权 → 超时报错退出，提示 "登录超时，请重试"
- 已登录状态下再次执行 → 允许，直接覆盖旧凭据
- OIDC 回调携带 error → 输出错误描述并退出

### `memo-api auth whoami`

调用 OIDC userinfo endpoint 获取当前用户信息。

- 仅支持 OIDC at 鉴权；若当前使用的是 `apiToken`，报错提示 "whoami 仅支持 OIDC 登录，请先执行 memo-api auth login"
- column 模式：stdout 列式输出 `uid` + `name`
- json 模式：stdout 输出 userinfo 完整响应
- 不注册到 `default-fields.ts`

---

## OIDC 配置

所有 OIDC 参数作为常量硬编码在 `src/lib/oidc.ts` 中，不通过命令行参数覆盖：

```ts
const OIDC_CLIENT_ID = "6a2157c1fa31b7c875a8e4ba";
const OIDC_ISSUER = "https://accounts.maimemo.com/oidc";
const OIDC_REDIRECT_URI = "http://localhost:18884/callback";
const OIDC_SCOPE = "openid profile offline_access open.memo.content open.memo.study";
```

---

## 配置文件

路径：`~/.config/memo-api.json`
权限：0600

### 结构

```json
{
  "apiToken": "...",
  "at": {
    "token": "<access_token>",
    "expireAt": 1717526400
  },
  "rt": {
    "token": "<refresh_token>",
    "expireAt": 1717526400
  }
}
```

### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `apiToken` | `string?` | 老式 API Token（保留兼容） |
| `at.token` | `string` | OIDC access_token |
| `at.expireAt` | `number` | access_token 过期时间（Unix 秒） |
| `rt.token` | `string` | OIDC refresh_token |
| `rt.expireAt` | `number` | refresh_token 过期时间（Unix 秒） |

### 类型定义

```ts
type TokenEntry = {
  token: string;
  expireAt: number; // Unix 秒
};

type Config = {
  apiToken?: string;
  at?: TokenEntry;
  rt?: TokenEntry;
};
```

### 写入策略

- `writeConfig(config)` — 以传入的完整 Config 对象写入；先写临时文件 `.tmp` → `rename` 原子替换 → `chmodSync(0600)`
- 调用方负责合并（先 `getConfig()` 再拼入新字段传入 `writeConfig()`）
- `getConfig()` — 文件不存在返回 `{}`；JSON 解析失败视为文件不存在返回 `{}`
- login 成功后 **保留** `apiToken` 字段（优先级在 at 之上，按优先级规则生效）

---

## Token 生命周期

### at / rt 过期判定

```ts
function isExpired(entry: TokenEntry): boolean {
  return Date.now() / 1000 + 60 >= entry.expireAt;
}
```

提前 60 秒刷新，抵消服务器时钟偏差。

### at 使用流程

1. 读取 config 中的 `at`
2. 若 `at` 未过期 → 直接返回
3. 若 `at` 已过期 → 用 `rt` 调 token endpoint 刷新 `at`
4. 刷新成功 → 写入新 `at` 到 config，返回新 token
5. 刷新失败（rt 过期或被撤销） → 清除 config 中 `at` 和 `rt`，报错 "登录已过期，请重新执行 memo-api auth login"

### rt 不会轮换

OIDC provider 不会在 refresh 时返回新的 refresh_token。rt 过期后需重新 login。

### 并发

不做并发控制。两个进程同时刷新 at 时各刷各的，后写 config 的覆盖先写的。不做 401 重试，信任 60 秒缓冲。

### Discovery

每次刷新 at 时重新拉取 issuer metadata（`.well-known/openid-configuration`），不做缓存。

---

## 依赖

新增 `openid-client` v6（Panva），用于：

- OIDC discovery（`client.discovery()`）
- PKCE code_challenge / code_verifier 生成
- state / nonce 生成与校验
- Token exchange（`client.callback()`）
- id_token JWT 验证（签名、issuer、audience、nonce）
- Token 刷新（`client.refresh()`）
- Userinfo 获取（`client.userinfo()`）

`package.json` 新增：

```json
{
  "dependencies": {
    "openid-client": "^6"
  }
}
```

---

## 代码架构

```
src/
├── commands/
│   └── auth.ts              # CommandModule: login + whoami
├── lib/
│   ├── auth.ts              # resolveToken (async) + resolveOidcToken
│   └── oidc.ts              # startLogin(), refreshToken(), getUserInfo()
├── index.ts                 # middleware: 注册 authCmd, 跳过 auth login 的 token 解析
├── config.ts                # 新增 TokenEntry 类型, writeConfig(), 0600 权限
└── client.ts                # 不变 —— OIDC 请求全走 openid-client
```

### `src/lib/oidc.ts`

```ts
export async function startLogin(): Promise<{
  at: TokenEntry;
  rt: TokenEntry;
  uid: string;
  name: string;
}>;

export async function refreshToken(rt: string): Promise<{ at: TokenEntry }>;

export async function getUserInfo(at: string): Promise<{
  uid: string;
  name: string;
  sub: string;
}>;
```

- 内部使用 openid-client，每次 discovery 拉取最新 metadata
- 不经过 `src/client.ts` 的 `api()` 函数
- verbose 模式：通过 openid-client 的 `customFetch` 注入日志输出，风格与 `client.ts` 一致

### `src/lib/auth.ts`（改动）

```ts
type TokenSource = "flag" | "env" | "apiToken" | "oidc";
type TokenResult = { token: string; source: TokenSource };

export async function resolveToken(opts: {
  token?: string;
}): Promise<TokenResult>;

async function resolveOidcToken(config: Config): Promise<TokenResult | null>;
```

- `resolveToken` 改为 async，按优先级尝试各种来源
- `resolveOidcToken` 负责 OIDC at/rt 的过期检查、刷新、config 写回
- 返回值包含 `source` 字段，供 whoami 判断 token 来源

### `src/index.ts` middleware（改动）

```ts
.middleware(async (argv) => {
  // ... existing global option handling ...

  const isHelpOrCompletion =
    argv.help === true ||
    (argv._.length > 0 && argv._[0] === "completion");
  const isAuthLogin =
    argv._[0] === "auth" && argv._[1] === "login";

  if (!isHelpOrCompletion && !isAuthLogin) {
    const result = await resolveToken({ token: argv.token });
    (argv as any).token = result.token;
    (argv as any)._tokenSource = result.source;
  }
})
```

### `src/config.ts`（改动）

```ts
type TokenEntry = { token: string; expireAt: number };
type Config = { apiToken?: string; at?: TokenEntry; rt?: TokenEntry };

export function getConfig(): Config;
export function writeConfig(config: Config): void;
```

- `writeConfig` 完整写入：先写 `<path>.tmp`，`renameSync`，`chmodSync(0600)`
- 调用方负责合并（先 `getConfig()`，再拼入新字段传入 `writeConfig()`）

---

## 错误提示

| 场景 | 信息 |
|------|------|
| 无任何 Token / OIDC 凭据 | `错误: 缺少 API Token。请通过 -T、MAIMEMO_API_TOKEN 环境变量提供 Token，或执行 memo-api auth login 登录。` |
| rt 过期刷新失败 | `登录已过期，请重新执行 memo-api auth login` |
| whoami + apiToken 鉴权 | `错误: whoami 仅支持 OIDC 登录，请先执行 memo-api auth login` |
| 端口 18884 被占用 | `端口 18884 被占用，请关闭占用程序后重试` |
| 浏览器打开失败 | `无法自动打开浏览器，请手动复制以上 URL 访问。` |
| 登录超时（10 分钟） | `登录超时，请重试` |
| OIDC 回调 error | 输出 OIDC 返回的错误描述 |
| 配置文件 JSON 损坏 | 视为文件不存在，返回 `{}` |

---

## 测试策略

| 层级 | 文件 | 覆盖 |
|------|------|------|
| 单元 | `test/lib/auth.test.ts` | resolveToken 优先级、过期判断、resolveOidcToken 逻辑 |
| 单元 | `test/lib/config.test.ts` | writeConfig 原子写入、0600 权限、合并逻辑 |
| 单元 | `test/lib/oidc.test.ts` | refreshToken、getUserInfo 调用（mock openid-client） |
| 集成 | `test/commands/auth.test.ts` | login / whoami handler 逻辑（MockAgent mock OIDC endpoints） |
| 不做 E2E | — | 本地 server 启停、浏览器打开、完整 PKCE 交互不自动化 |

---

## 文档更新

| 文件 | 变更 |
|------|------|
| `docs/plans/auth.md` | 本文件（完整设计） |
| `docs/plans/cli.md` | 认证机制补充 OIDC；测试用例新增 auth 组 |
| `docs/plans/project.md` | 依赖清单 + `openid-client`；项目结构新增 `auth.ts` + `oidc.ts` |
| `AGENTS.md` | CLI command structure 新增 `auth`；依赖补充 `openid-client` |
| `README.md` | 新增 OIDC 登录说明 |
