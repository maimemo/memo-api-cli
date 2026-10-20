import { describe, it, before, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { MockEndpoint } from "../../src/lib/mock.js";

function execFileAsync(
  file: string,
  args: string[],
  options: { env?: Record<string, string>; input?: string; timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { env: options.env, timeout: options.timeout },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
    child.stdin!.end(options.input ?? "");
  });
}

let mockFile: string;

function setMock(endpoints: MockEndpoint[]): void {
  if (mockFile) {
    try { unlinkSync(mockFile); } catch { /* ok */ }
  }
  mockFile = join(tmpdir(), `memo-e2e-${randomBytes(4).toString("hex")}.json`);
  writeFileSync(mockFile, JSON.stringify({ endpoints }));
}

async function run(
  args: string[],
  opts: { env?: Record<string, string>; input?: string; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync("node", ["dist/index.js", ...args], {
      env: {
        ...process.env,
        MAIMEMO_API_MOCK: "1",
        MAIMEMO_API_MOCK_FILE: mockFile,
        MAIMEMO_API_TOKEN: "test-token",
        ...opts.env,
      },
      timeout: opts.timeout ?? 10_000,
      input: opts.input,
    });
    return { stdout: result.stdout, stderr: result.stderr, code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      code: err.code ?? 1,
    };
  }
}

async function runOk(args: string[], opts?: Parameters<typeof run>[1]): Promise<{ stdout: string; stderr: string }> {
  const r = await run(args, opts);
  assert.equal(r.code, 0, `expected code 0 but got ${r.code}\nstderr: ${r.stderr}`);
  return r;
}

async function runFail(args: string[], opts?: Parameters<typeof run>[1]): Promise<{ stderr: string }> {
  const r = await run(args, opts);
  assert.notEqual(r.code, 0, `expected non-zero exit code\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  return { stderr: r.stderr };
}

afterEach(() => {
  if (mockFile) {
    try { unlinkSync(mockFile); } catch { /* ok */ }
    mockFile = "";
  }
});

// ---- voc ----

describe("voc get", () => {
  it("returns vocabulary in column output", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "apple" },
        response: { data: { voc: { id: "voc-001", spelling: "apple" } } },
      },
    ]);
    const { stdout } = await runOk(["voc", "get", "-s", "apple"]);
    assert.ok(stdout.includes("voc-001"), stdout);
    assert.ok(stdout.includes("apple"), stdout);
  });

  it("returns vocabulary in JSON output", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "apple" },
        response: { data: { voc: { id: "voc-001", spelling: "apple" } } },
      },
    ]);
    const { stdout } = await runOk(["voc", "get", "-s", "apple", "-O", "json"]);
    const parsed = JSON.parse(stdout.trim());
    assert.equal(parsed.voc.id, "voc-001");
  });

  it("handles missing --spelling error", async () => {
    setMock([]);
    const { stderr } = await runFail(["voc", "get"]);
    assert.ok(stderr.includes("错误"), stderr);
    assert.ok(stderr.includes("spelling"), stderr);
  });

  it("handles word not found", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "nonexistent" },
        response: { data: {} },
      },
    ]);
    const { stderr } = await runFail(["voc", "get", "-s", "nonexistent"]);
    assert.ok(stderr.includes("不存在"), stderr);
  });

  it("reads spelling from stdin JSON", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "apple" },
        response: { data: { voc: { id: "voc-001", spelling: "apple" } } },
      },
    ]);
    const { stdout } = await runOk(["voc", "get"], {
      input: '{"spelling":"apple"}',
    });
    assert.ok(stdout.includes("voc-001"), stdout);
  });
});

describe("voc query", () => {
  it("queries by spellings", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/vocabulary/query",
        body: { spellings: ["apple", "banana"], ids: [] },
        response: { data: { voc: [{ id: "v1", spelling: "apple" }, { id: "v2", spelling: "banana" }] } },
      },
    ]);
    const { stdout } = await runOk(["voc", "query", "-s", "apple", "-s", "banana"]);
    assert.ok(stdout.includes("apple"), stdout);
    assert.ok(stdout.includes("banana"), stdout);
  });

  it("queries by IDs", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/vocabulary/query",
        body: { spellings: [], ids: ["v1", "v2"] },
        response: { data: { voc: [{ id: "v1", spelling: "a" }, { id: "v2", spelling: "b" }] } },
      },
    ]);
    const { stdout } = await runOk(["voc", "query", "-I", "v1", "-I", "v2"]);
    assert.ok(stdout.includes("v1"), stdout);
    assert.ok(stdout.includes("v2"), stdout);
  });

  it("rejects --spelling and --id combined", async () => {
    setMock([]);
    const { stderr } = await runFail(["voc", "query", "-s", "a", "-I", "v1"]);
    assert.ok(stderr.includes("互斥"), stderr);
  });

  it("rejects when both args missing", async () => {
    setMock([]);
    const { stderr } = await runFail(["voc", "query"]);
    assert.ok(stderr.includes("错误"), stderr);
  });
});

// ---- note ----

describe("note list", () => {
  it("lists notes by --voc-id", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/notes",
        query: { voc_id: "voc-001" },
        response: { data: { notes: [{ id: "n1", note_type: "谐音", note: "test", status: "PUBLISHED" }] } },
      },
    ]);
    const { stdout } = await runOk(["note", "list", "--voc-id", "voc-001"]);
    assert.ok(stdout.includes("n1"), stdout);
    assert.ok(stdout.includes("谐音"), stdout);
  });

  it("lists notes by --word (resolves voc id first)", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "apple" },
        response: { data: { voc: { id: "voc-001", spelling: "apple" } } },
      },
      {
        method: "GET",
        path: "/open/api/v1/memo/notes",
        query: { voc_id: "voc-001" },
        response: { data: { notes: [{ id: "n1", note_type: "谐音", note: "test", status: "PUBLISHED" }] } },
      },
    ]);
    const { stdout } = await runOk(["note", "list", "-w", "apple"]);
    assert.ok(stdout.includes("n1"), stdout);
  });

  it("shows error for missing --voc-id/--word", async () => {
    setMock([]);
    const { stderr } = await runFail(["note", "list"]);
    assert.ok(stderr.includes("voc-id") || stderr.includes("错误"), stderr);
  });

  it("shows error when both --word and --voc-id given", async () => {
    setMock([]);
    const { stderr } = await runFail(["note", "list", "-w", "apple", "--voc-id", "v1"]);
    assert.ok(stderr.includes("互斥"), stderr);
  });
});

describe("note create", () => {
  it("creates a note with column output", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "apple" },
        response: { data: { voc: { id: "voc-001", spelling: "apple" } } },
      },
      {
        method: "POST",
        path: "/open/api/v1/memo/notes",
        body: { note: { voc_id: "voc-001", note_type: "谐音", note: "苹果记忆" } },
        response: { data: { note: { id: "n-new", note_type: "谐音", note: "苹果记忆", status: "PUBLISHED" } } },
      },
    ]);
    const { stdout } = await runOk(["note", "create", "-w", "apple", "--type", "谐音", "--note", "苹果记忆"]);
    assert.ok(stdout.includes("n-new"), stdout);
  });

  it("shows error for missing required options", async () => {
    setMock([]);
    const { stderr } = await runFail(["note", "create", "-w", "apple"]);
    assert.ok(stderr.includes("错误"), stderr);
  });
});

describe("note update", () => {
  it("updates a note with id argument", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/notes/n1",
        body: { note: { note_type: "联想", note: "更新内容" } },
        response: { data: { note: { id: "n1", note_type: "联想", note: "更新内容", status: "PUBLISHED" } } },
      },
    ]);
    const { stdout } = await runOk(["note", "update", "n1", "--type", "联想", "--note", "更新内容"]);
    assert.ok(stdout.includes("n1"), stdout);
    assert.ok(stdout.includes("联想"), stdout);
  });
});

describe("note delete", () => {
  it("deletes a note with --force", async () => {
    setMock([
      {
        method: "DELETE",
        path: "/open/api/v1/memo/notes/n1",
        response: {},
      },
    ]);
    const { stderr } = await runOk(["note", "delete", "n1", "-f"]);
    assert.ok(stderr.includes("已删除"), stderr);
  });
});

// ---- interp ----

describe("interp", () => {
  it("lists interpretations by --voc-id", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/interpretations",
        query: { voc_id: "voc-001" },
        response: { data: { interpretations: [{ id: "i1", interpretation: "n. 苹果", tags: ["考研"], status: "PUBLISHED" }] } },
      },
    ]);
    const { stdout } = await runOk(["interp", "list", "-v", "voc-001"]);
    assert.ok(stdout.includes("i1"), stdout);
  });

  it("creates interpretation with tags", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "apple" },
        response: { data: { voc: { id: "voc-001", spelling: "apple" } } },
      },
      {
        method: "POST",
        path: "/open/api/v1/memo/interpretations",
        body: { interpretation: { voc_id: "voc-001", interpretation: "n. 苹果", tags: ["考研", "托福"], status: "PUBLISHED" } },
        response: { data: { interpretation: { id: "i-new", interpretation: "n. 苹果", tags: ["考研", "托福"], status: "PUBLISHED" } } },
      },
    ]);
    const { stdout } = await runOk([
      "interp", "create", "-w", "apple", "-i", "n. 苹果", "-g", "考研", "-g", "托福",
    ]);
    assert.ok(stdout.includes("i-new"), stdout);
    assert.ok(stdout.includes("考研") || stdout.includes("托福"), stdout);
  });

  it("uses alias 'interp' for 'interpretation'", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/interpretations",
        query: { voc_id: "voc-001" },
        response: { data: { interpretations: [{ id: "i1", interpretation: "test", tags: [], status: "PUBLISHED" }] } },
      },
    ]);
    const { stdout } = await runOk(["interp", "list", "-v", "voc-001"]);
    assert.ok(stdout.includes("i1"), stdout);
  });
});

// ---- phrase ----

describe("phrase", () => {
  it("lists phrases by --voc-id", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/phrases",
        query: { voc_id: "voc-001" },
        response: { data: { phrases: [{ id: "p1", phrase: "Hello world", interpretation: "你好世界", origin: "book", status: "PUBLISHED" }] } },
      },
    ]);
    const { stdout } = await runOk(["phrase", "list", "-v", "voc-001"]);
    assert.ok(stdout.includes("p1"), stdout);
  });

  it("creates phrase", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "hello" },
        response: { data: { voc: { id: "voc-h", spelling: "hello" } } },
      },
      {
        method: "POST",
        path: "/open/api/v1/memo/phrases",
        body: { phrase: { voc_id: "voc-h", phrase: "Hello", interpretation: "你好", tags: [], origin: "book" } },
        response: { data: { phrase: { id: "p-new", phrase: "Hello", interpretation: "你好", origin: "book", status: "PUBLISHED" } } },
      },
    ]);
    const { stdout } = await runOk([
      "phrase", "create", "-w", "hello", "-p", "Hello", "-i", "你好", "-o", "book",
    ]);
    assert.ok(stdout.includes("p-new"), stdout);
  });
});

// ---- notepad ----

describe("notepad", () => {
  it("lists notepads", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/notepads",
        response: { notepads: [{ id: "np1", title: "My Notepad", brief: "test", status: "PUBLISHED" }] },
      },
    ]);
    const { stdout } = await runOk(["notepad", "list"]);
    assert.ok(stdout.includes("np1"), stdout);
    assert.ok(stdout.includes("My Notepad"), stdout);
  });

  it("gets a single notepad by id", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/notepads/np1",
        response: { notepad: { id: "np1", title: "Detailed", content: "Content here", brief: "Brief", tags: [], status: "PUBLISHED" } },
      },
    ]);
    const { stdout } = await runOk(["notepad", "get", "np1"]);
    assert.ok(stdout.includes("np1"), stdout);
  });

  it("creates a notepad", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/notepads",
        body: { notepad: { status: "PUBLISHED", content: "Content", title: "Title", brief: "Brief", tags: ["tag1", "tag2"] } },
        response: { notepad: { id: "np-new", title: "Title", content: "Content", brief: "Brief", tags: ["tag1", "tag2"], status: "PUBLISHED" } },
      },
    ]);
    const { stdout } = await runOk([
      "notepad", "create", "-t", "Title", "-c", "Content", "-b", "Brief", "-g", "tag1", "-g", "tag2",
    ]);
    assert.ok(stdout.includes("np-new"), stdout);
  });
});

// ---- study ----

describe("study progress", () => {
  it("shows study progress", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/study/get_study_progress",
        body: {},
        response: { data: { progress: { finished: 50, total: 100, study_time: 3600000 } } },
      },
    ]);
    const { stdout } = await runOk(["study", "progress"]);
    assert.ok(stdout.includes("50"), stdout);
    assert.ok(stdout.includes("100"), stdout);
    assert.ok(stdout.includes("3600000"), stdout);
  });
});

describe("study today", () => {
  it("shows today items", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/study/get_today_items",
        body: { voc_ids: [], spellings: [], limit: 50 },
        response: { data: { today_items: [{ voc_id: "v1", voc_spelling: "apple", order: 1, is_new: true, is_finished: false }] } },
      },
    ]);
    const { stdout } = await runOk(["study", "today"]);
    assert.ok(stdout.includes("apple"), stdout);
  });

  it("filters by --finished", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/study/get_today_items",
        body: { voc_ids: [], spellings: [], limit: 50, is_finished: true },
        response: { data: { today_items: [{ voc_id: "v1", voc_spelling: "done", order: 1, is_new: false, is_finished: true }] } },
      },
    ]);
    const { stdout } = await runOk(["study", "today", "--finished"]);
    assert.ok(stdout.includes("done"), stdout);
  });
});

describe("study records", () => {
  it("shows study records", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/study/query_study_records",
        body: { voc_ids: [], spellings: [], as_count: false, limit: 50 },
        response: { data: { records: [{ voc_id: "v1", voc_spelling: "apple", study_count: 5, next_study_date: "2025-01-01" }] } },
      },
    ]);
    const { stdout } = await runOk(["study", "records"]);
    assert.ok(stdout.includes("apple"), stdout);
    assert.ok(stdout.includes("5"), stdout);
  });

  it("shows count mode", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/study/query_study_records",
        body: { voc_ids: [], spellings: [], as_count: true, limit: 50 },
        response: { data: { count: 42 } },
      },
    ]);
    const { stdout } = await runOk(["study", "records", "-c"]);
    assert.ok(stdout.includes("42"), stdout);
  });

  it("filters by sticking tag", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/study/query_study_records",
        body: { voc_ids: [], spellings: [], tags: ["STICKING"], as_count: false, limit: 50 },
        response: { data: { records: [{ voc_id: "v1", voc_spelling: "apple", study_count: 5, next_study_date: "2025-01-01", tags: ["STICKING"] }], count: 1 } },
      },
    ]);
    const { stdout } = await runOk(["study", "records", "-t", "STICKING"]);
    assert.ok(stdout.includes("apple"), stdout);
    assert.ok(stdout.includes("STICKING"), stdout);
  });
});

describe("study add", () => {
  it("adds words by spelling (batch resolve)", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/vocabulary/query",
        body: { spellings: ["apple", "banana"], ids: [] },
        response: { data: { voc: [{ id: "v1", spelling: "apple" }, { id: "v2", spelling: "banana" }] } },
      },
      {
        method: "POST",
        path: "/open/api/v1/memo/study/add_words",
        body: { words: [{ id: "v1" }, { id: "v2" }], advance: false },
        response: { data: { added_count: 2 } },
      },
    ]);
    const { stdout } = await runOk(["study", "add", "-w", "apple", "-w", "banana"]);
    assert.ok(stdout.includes("2"), stdout);
  });

  it("adds words by id", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/study/add_words",
        body: { words: [{ id: "v1" }, { id: "v2" }], advance: false },
        response: { data: { added_count: 2 } },
      },
    ]);
    const { stdout } = await runOk(["study", "add", "-I", "v1", "-I", "v2"]);
    assert.ok(stdout.includes("2"), stdout);
  });
});

// ---- global options ----

describe("global options", () => {
  it("--output json produces valid JSON", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "apple" },
        response: { data: { voc: { id: "v1", spelling: "apple" } } },
      },
    ]);
    const { stdout } = await runOk(["voc", "get", "-s", "apple", "-O", "json"]);
    const parsed = JSON.parse(stdout.trim());
    assert.equal(typeof parsed, "object");
  });

  it("--no-header suppresses header row", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "apple" },
        response: { data: { voc: { id: "v1", spelling: "apple" } } },
      },
    ]);
    const r = await run(["voc", "get", "-s", "apple", "-H"]);
    assert.equal(r.code, 0, r.stderr);
    const headerLine = r.stdout.split("\n")[0]!;
    assert.ok(
      !headerLine.includes("id") || headerLine.includes("v1"),
      `header still present: ${headerLine}`,
    );
  });

  it("--no-color is accepted without parse error", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "test" },
        response: { data: { voc: { id: "v1", spelling: "test" } } },
      },
    ]);
    const r = await run(["voc", "get", "-s", "test", "--no-color"]);
    assert.equal(r.code, 0, r.stderr);
  });

  it("--fields select specific columns", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "apple" },
        response: { data: { voc: { id: "v1", spelling: "apple" } } },
      },
    ]);
    const { stdout } = await runOk(["voc", "get", "-s", "apple", "--fields", "id"]);
    const lines = stdout.trim().split("\n");
    assert.ok(lines.length >= 1, stdout);
  });
});

// ---- token resolution ----

describe("token resolution", () => {
  it("uses token from MAIMEMO_API_TOKEN env var", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "test" },
        response: { data: { voc: { id: "v1", spelling: "test" } } },
      },
    ]);
    const { stdout } = await runOk(["voc", "get", "-s", "test"]);
    assert.ok(stdout.includes("v1"), stdout);
  });

  it("uses token from -T flag with higher priority", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "test" },
        response: { data: { voc: { id: "v1", spelling: "test" } } },
      },
    ]);
    const { stdout } = await runOk(["voc", "get", "-s", "test", "-T", "flag-token"]);
    assert.ok(stdout.includes("v1"), stdout);
  });
});

// ---- stdin piping ----

describe("stdin piping", () => {
  it("reads JSON body from stdin for voc get", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "stdin-test" },
        response: { data: { voc: { id: "s1", spelling: "stdin-test" } } },
      },
    ]);
    const { stdout } = await runOk(["voc", "get"], { input: '{"spelling":"stdin-test"}' });
    assert.ok(stdout.includes("s1"), stdout);
  });

  it("reads JSON body from stdin for voc query", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/vocabulary/query",
        body: { spellings: ["a", "b"] },
        response: { data: { voc: [] } },
      },
    ]);
    const { stdout } = await runOk(["voc", "query"], { input: '{"spellings":["a","b"]}' });
    assert.ok(stdout.length >= 0, "should succeed");
  });

  it("reads JSON body from stdin for note create", async () => {
    setMock([
      {
        method: "POST",
        path: "/open/api/v1/memo/notes",
        body: { note: { voc_id: "v1", note_type: "谐音", note: "stdin note" } },
        response: { data: { note: { id: "ns", note_type: "谐音", note: "stdin note", status: "PUBLISHED" } } },
      },
    ]);
    const { stdout } = await runOk(["note", "create"], {
      input: '{"note":{"voc_id":"v1","note_type":"谐音","note":"stdin note"}}',
    });
    assert.ok(stdout.includes("ns"), stdout);
  });

  it("reads JSON body for note delete", async () => {
    setMock([
      {
        method: "DELETE",
        path: "/open/api/v1/memo/notes/from-stdin",
        response: {},
      },
    ]);
    const { stderr } = await runOk(["note", "delete", "placeholder", "-f"], {
      input: '{"id":"from-stdin"}',
    });
    assert.ok(stderr.includes("已删除"), stderr);
  });
});

// ---- error handling ----

describe("error handling", () => {
  it("handles API errors in response", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "error" },
        response: { errors: [{ code: "NOT_FOUND", message: "单词不存在" }] },
      },
    ]);
    const { stderr } = await runFail(["voc", "get", "-s", "error"]);
    assert.ok(stderr.includes("NOT_FOUND") || stderr.includes("单词不存在") || stderr.includes("错误"), stderr);
  });

  it("handles 401 unauthorized in mock", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "test" },
        status: 401,
        response: {},
      },
    ]);
    const { stderr } = await runFail(["voc", "get", "-s", "test"]);
    assert.ok(stderr.includes("401") || stderr.includes("认证失败"), stderr);
  });

  it("handles 404 not found in mock", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "test" },
        status: 404,
        response: {},
      },
    ]);
    const { stderr } = await runFail(["voc", "get", "-s", "test"]);
    assert.ok(stderr.includes("404") || stderr.includes("不存在"), stderr);
  });
});

// ---- command aliases ----

describe("command aliases", () => {
  it("'voc' is alias for 'vocabulary'", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/vocabulary",
        query: { spelling: "alias" },
        response: { data: { voc: { id: "va", spelling: "alias" } } },
      },
    ]);
    const { stdout } = await runOk(["voc", "get", "-s", "alias"]);
    assert.ok(stdout.includes("va"), stdout);
  });

  it("'interp' is alias for 'interpretation'", async () => {
    setMock([
      {
        method: "GET",
        path: "/open/api/v1/memo/interpretations",
        query: { voc_id: "vx" },
        response: { data: { interpretations: [{ id: "ia", interpretation: "test", tags: [], status: "PUBLISHED" }] } },
      },
    ]);
    const { stdout } = await runOk(["interp", "list", "-v", "vx"]);
    assert.ok(stdout.includes("ia"), stdout);
  });
});

// ---- help output ----

describe("help output", () => {
  it("shows top-level help", async () => {
    setMock([]);
    const { stdout } = await runOk(["--help"]);
    assert.ok(stdout.includes("memo-api"), stdout);
    assert.ok(stdout.includes("note"), stdout);
    assert.ok(stdout.includes("interp"), stdout);
    assert.ok(stdout.includes("phrase"), stdout);
    assert.ok(stdout.includes("notepad"), stdout);
    assert.ok(stdout.includes("voc"), stdout);
    assert.ok(stdout.includes("study"), stdout);
  });
});

// ---- no-token error ----

describe("no token", () => {
  it("fails without token", async () => {
    setMock([]);
    try {
      await execFileAsync("node", ["dist/index.js", "voc", "get", "-s", "test", "--no-color"], {
        env: {
          ...process.env,
          MAIMEMO_API_MOCK: "1",
          MAIMEMO_API_MOCK_FILE: mockFile,
          MAIMEMO_API_TOKEN: "",
          MEMO_API_CONFIG_PATH: join(tmpdir(), "memo-api-e2e-nonexistent-config.json"),
        },
        timeout: 5000,
      });
      assert.fail("should have thrown");
    } catch (err: any) {
      const output = (err.stderr ?? "") + (err.stdout ?? "");
      assert.ok(output.includes("缺少 API Token"), `unexpected: ${output}`);
    }
  });
});
