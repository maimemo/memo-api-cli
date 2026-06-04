# AGENTS.md

## Project Overview

`@maimemo/memo-api` is the official CLI tool for the Maimemo (墨墨) Open API. It provides a command-line interface—`memo-api`—for managing vocabulary notes, interpretations, phrases, notepads, and study records on the Maimemo platform.

- **Language**: TypeScript (strict mode, ES2022 target)
- **Runtime**: Node.js >= 18
- **Module system**: ESM (`"type": "module"`)
- **CLI framework**: [yargs](https://yargs.js.org/) v18
- **Package manager**: npm
- **Single-package repository** (not a monorepo)

### Architecture

```
src/
  index.ts        -- CLI entry point (yargs program assembly, middleware, global options)
  client.ts       -- HTTP client wrapping fetch (auth, timeout, error handling)
  config.ts       -- Config file reader (~/.config/memo-api.json)
  output.ts       -- Output formatters (columns with CJK alignment, JSON, errors)
  stdin.ts        -- Stdin reading & JSON parsing for piped input
  commands/       -- One file per API resource (auth, note, interp, phrase, notepad, voc, study)
  lib/            -- Shared utilities (auth, oidc, confirm, default-fields, helpers, mock, word-resolve)
  types/          -- TypeScript type definitions mirroring protobuf API schemas
test/             -- Test files mirroring src/ structure
dist/             -- Compiled JS output (tsc, git-ignored)
bin/memo-api.js   -- CLI binary entry (shebang, re-exports dist/index.js)
```

All API requests go to `https://open.maimemo.com/open/`. OIDC authentication requests go to `https://accounts.maimemo.com/oidc`. The CLI follows a `memo-api <resource> <action>` pattern.

---

## Setup Commands

```bash
npm install
```

- Requires Node.js >= 18
- No `.env` file needed; the tool reads API tokens from `~/.config/memo-api.json` (field `apiToken` or OIDC `at`/`rt`), the `MAIMEMO_API_TOKEN` environment variable, or the `-T`/`--token` CLI flag

---

## Development Workflow

```bash
npm run dev          # Watch mode — recompiles src/ to dist/ on changes
npm run cli          # Run CLI directly from TypeScript source (tsx src/index.ts)
npm run build        # One-off TypeScript compilation (tsc)
```

- Always run `npm run build` before testing, as tests import from `src/` via tsx
- Before publishing: `npm run prepublishOnly` auto-runs `npm run build`
- To test the CLI as a user would, run `npm run cli` with flags, e.g.:
  ```bash
  npx tsx src/index.ts voc get --spelling=apple -T $TOKEN
  ```

---

## Testing Instructions

```bash
npm test             # Run all tests (node test runner + tsx loader)
```

All tests use Node.js built-in `node:test` and `node:assert/strict`. HTTP calls in tests use `undici.MockAgent` to mock fetch responses — no real network calls are made.

**Test file conventions**:
- Unit tests: `test/*.test.ts`, `test/lib/*.test.ts`
- Integration tests: `test/commands/*.test.ts` (mocked HTTP, full command logic)
- End-to-end tests: `test/e2e/*.test.ts` (real CLI execution via `execFile`)
- Test files mirror `src/` structure

**Running specific tests**:
```bash
node --import tsx --test test/output.test.ts                        # Single file
node --import tsx --test --test-name-pattern="printColumns" test/output.test.ts   # Matching names
```

**Coverage**:
```bash
node --import tsx --experimental-test-coverage --test test/**/*.test.ts
```

**Writing new tests**:
- Import from `node:test` (`describe`, `it`, `beforeEach`, `afterEach`)
- Import from `node:assert/strict`
- For HTTP mocking, use `new MockAgent()` from `undici`, call `.disableNetConnect()`, and `setGlobalDispatcher(mockAgent)`
- Redirect `process.stdout.write` / `process.stderr.write` to capture and assert output
- Mock `process.exit` (the codebase calls it directly on errors) by replacing it with a function that throws
- Always restore mocked globals in `afterEach`

---

## Code Style

- **TypeScript strict mode** — `strict: true`, `noUncheckedIndexedAccess: true`
- **Target**: ES2022
- **Module**: NodeNext (`.js` extensions on relative imports, even in `.ts` files)
- **No linter or formatter** configured — rely on `tsc` for correctness
- **File naming**: kebab-case (`word-resolve.ts`, `default-fields.ts`)
- **Import ordering**: external packages first (`yargs`, `chalk`), then internal (`./client.js`, `./output.js`)
- **Error messages**: Chinese, written to stderr via `printError(message)`
- **Output**: JSON to stdout via `printJson()`, tab-separated columns via `printColumns()` with CJK-aware alignment (`string-width`)
- **Token injection**: Token is resolved by global middleware in `src/index.ts` (now async) and injected into `argv` via `(argv as any).token`. Handlers access it via `(argv as any).token`. Token resolution is skipped for `--help`, `completion`, and `auth login` commands.

---

## CLI Command Structure

```
memo-api [global options] <resource> <action> [arguments...]

Resources:
  auth        login / whoami
  note        list / create / update / delete
  interp      list / create / update / delete  (alias: interpretation)
  phrase      list / create / update / delete
  notepad     list / get / create / update / delete
  voc         get / query  (alias: vocabulary)
  study       progress / today / records / add / advance

Global options:
  -T, --token       API Token
  -O, --output      Output format: json | column (default: column)
  --no-color        Disable colored output
  --verbose         Show request details and raw response
  -H, --no-header   Skip header row in column output
  --fields <fields> Select fields (comma-separated; + to add, - to remove)
```

**Stdin JSON mode**: Any command that accepts pipe input will bypass CLI argument validation if valid JSON is received on stdin. This allows programmatic usage like:
```bash
echo '{"spelling":"apple"}' | memo-api voc get
```

---

## Build and Deployment

- **Build**: `npm run build` → `tsc` → outputs to `dist/`
- **Publish**: `npm publish` (auto-runs `npm run build` via `prepublishOnly`)
- **Published files**: only `dist/` and `bin/` (specified in `package.json.files`)
- **CI/CD**: No CI pipeline is configured in this repository

---

## Adding a New Resource / Command

1. Create `src/types/<resource>.ts` with TypeScript types for request/response shapes (skip for auth — uses openid-client types)
2. Create `src/commands/<resource>.ts` exporting a `CommandModule` with subcommands
3. Add default column fields in `src/lib/default-fields.ts` (skip for auth — whoami outputs uid/name directly)
4. Register the command in `src/index.ts` via `program.command()`
5. Create tests in `test/commands/<resource>.test.ts` using `MockAgent`

---

## Important Rules

- **Before making changes**: Read the relevant plan documents in `docs/plans/` (currently `cli.md` and `project.md`)
- **After making changes**: Sync updates back to the plan documents to keep them accurate
- **Test coverage**: Every change must be covered by tests. Add or update test files in `test/` mirroring the `src/` structure

---

## Pull Request Guidelines

- Build must pass: `npm run build`
- All tests must pass: `npm test`
- No formal linting step, but TypeScript compilation must succeed without errors
- Keep the KISS principle — one file, one responsibility, no DI containers or frameworks

---

## Additional Notes

- **No database** — the tool is a stateless CLI client that calls a remote HTTP API
- **Config file**: `~/.config/memo-api.json` with `{ "apiToken": "...", "at": {...}, "rt": {...} }`
- **Timeout**: HTTP requests time out after 30 seconds
- **Token priority**: `-T` flag > `MAIMEMO_API_TOKEN` env var > config `apiToken` > config OIDC `at` (auto-refreshed)
- **CJK support**: Column alignment uses `string-width` (not `.length`) for accurate CJK character width
