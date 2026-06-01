import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { api } from "../../src/client.js";
import { printJson, printColumns, setColor, setShowHeader, setSelectedFields } from "../../src/output.js";

function wrap<T>(data: T) {
  return { data, errors: [], success: true };
}

let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

function captureStdout(fn: () => void): string {
  let captured = "";
  const original = process.stdout.write;
  process.stdout.write = ((chunk: string) => {
    captured += chunk;
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = original;
  }
  return captured;
}

describe("output format (api + print)", () => {
  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    setColor(false);
    setShowHeader(true);
    setSelectedFields("");
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
    setColor(true);
  });

  describe("printColumns with mocked API data", () => {
    it("prints tab-separated columns for note list response", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({
          notes: [
            { id: "n1", note_type: "谐音", note: "苹果=apple", status: "PUBLISHED" },
            { id: "n2", note_type: "联想", note: "红色水果", status: "PUBLISHED" },
          ],
        }));

      const res = await api<{ notes: Array<Record<string, string>> }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      const output = captureStdout(() => {
        const rows = res.notes.map((n) => ({
          id: n.id,
          note_type: n.note_type,
          note: n.note,
          status: n.status,
        }));
        printColumns(rows);
      });

      const lines = output.split("\n").filter(Boolean);
      assert.equal(lines.length, 3);
      assert.ok(lines[0]!.startsWith("id"));
      assert.ok(lines[0]!.includes("\tnote_type"));
      assert.ok(lines[0]!.includes("\tnote"));
      assert.ok(lines[0]!.includes("\tstatus"));
      assert.ok(lines[1]!.includes("谐音"));
      assert.ok(lines[1]!.includes("苹果=apple"));
      assert.ok(lines[2]!.includes("联想"));
      assert.ok(lines[2]!.includes("红色水果"));
    });

    it("collapses newlines from API response in column output", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({
          notes: [
            {
              id: "n1",
              note_type: "short",
              note: "第一行\n第二行\n第三行",
              status: "A",
            },
          ],
        }));

      const res = await api<{ notes: Array<Record<string, string>> }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      const output = captureStdout(() => {
        const rows = res.notes.map((n) => ({
          id: n.id,
          note_type: n.note_type,
          note: n.note,
          status: n.status,
        }));
        printColumns(rows);
      });

      // newlines collapsed — no literal \n in stdout output
      assert.ok(!output.includes("\n第二行"));
      assert.ok(!output.includes("\n第三行"));
      // all parts visible since short content is not truncated
      assert.ok(output.includes("第一行"));
      assert.ok(output.includes("第二行"));
      assert.ok(output.includes("第三行"));
    });

    it("truncates long API response fields in column output", async () => {
      const longNote = "a".repeat(250);
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({
          notes: [
            { id: "n1", note_type: "联想", note: longNote, status: "PUBLISHED" },
          ],
        }));

      const res = await api<{ notes: Array<Record<string, string>> }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      const output = captureStdout(() => {
        const rows = res.notes.map((n) => ({
          id: n.id,
          note_type: n.note_type,
          note: n.note,
          status: n.status,
        }));
        printColumns(rows);
      });

      const lines = output.split("\n").filter(Boolean);
      const dataLine = lines[1]!;
      const noteCell = dataLine.split("\t")[2]!;
      assert.ok(noteCell.endsWith("..."), `should end with ..., got: ${noteCell}`);
      assert.ok(noteCell.length < longNote.length);
    });

    it("does not truncate when --fields is specified", async () => {
      const longNote = "a".repeat(250);
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({
          notes: [
            { id: "n1", note_type: "联想", note: longNote, status: "PUBLISHED" },
          ],
        }));

      const res = await api<{ notes: Array<Record<string, string>> }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      setSelectedFields("note");
      const output = captureStdout(() => {
        const rows = res.notes.map((n) => ({
          id: n.id,
          note_type: n.note_type,
          note: n.note,
          status: n.status,
        }));
        printColumns(rows);
      });
      setSelectedFields("");

      const lines = output.split("\n").filter(Boolean);
      const dataLine = lines[1]!;
      // With --fields, no truncation: full longNote should appear
      assert.ok(dataLine.includes(longNote));
      assert.ok(!dataLine.includes("..."));
    });

    it("truncates any field over 200 chars regardless of field name", async () => {
      const longText = "x".repeat(250);
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({
          notes: [
            { id: longText, note_type: "谐音", note: "short note", status: "PUBLISHED" },
          ],
        }));

      const res = await api<{ notes: Array<Record<string, string>> }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      setSelectedFields("");
      const output = captureStdout(() => {
        const rows = res.notes.map((n) => ({
          id: n.id,
          note_type: n.note_type,
          note: n.note,
          status: n.status,
        }));
        printColumns(rows);
      });

      // id is 250 chars — should be truncated
      assert.ok(!output.includes(longText), "250-char id should be truncated");
      assert.ok(output.includes(longText.slice(0, 200) + "..."), "should contain truncated id");
      // note is short — should be full
      assert.ok(output.includes("short note"));
    });

    it("skips header when showHeader is false (--no-header)", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({
          notes: [
            { id: "n1", note_type: "谐音", note: "test", status: "PUBLISHED" },
          ],
        }));

      const res = await api<{ notes: Array<Record<string, string>> }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      setShowHeader(false);
      const output = captureStdout(() => {
        const rows = res.notes.map((n) => ({
          id: n.id,
          note_type: n.note_type,
          note: n.note,
          status: n.status,
        }));
        printColumns(rows);
      });
      setShowHeader(true);

      const lines = output.split("\n").filter(Boolean);
      assert.equal(lines.length, 1);
      assert.ok(lines[0]!.startsWith("n1"));
      assert.ok(!output.includes("id\t"));
    });

    it("shows only selected fields when setSelectedFields is set (--fields)", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({
          notes: [
            { id: "n1", note_type: "谐音", note: "test", status: "PUBLISHED" },
            { id: "n2", note_type: "联想", note: "abc", status: "PUBLISHED" },
          ],
        }));

      const res = await api<{ notes: Array<Record<string, string>> }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      setSelectedFields("note_type,id");
      const output = captureStdout(() => {
        const rows = res.notes.map((n) => ({
          id: n.id,
          note_type: n.note_type,
          note: n.note,
          status: n.status,
        }));
        printColumns(rows);
      });
      setSelectedFields("");

      const lines = output.split("\n").filter(Boolean);
      assert.ok(lines[0]!.startsWith("note_type"));
      assert.ok(lines[0]!.includes("\tid"));
      assert.ok(!lines[0]!.includes("note\t"));
      assert.equal(lines.length, 3);
    });

    it("shows (empty) for empty API response in column mode", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({ notes: [] }));

      const res = await api<{ notes: Array<Record<string, string>> }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      let stderrOutput = "";
      const originalStderr = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        stderrOutput += chunk;
        return true;
      }) as typeof process.stderr.write;

      try {
        const rows = res.notes.map((n) => ({
          id: n.id,
          note_type: n.note_type,
          note: n.note,
          status: n.status,
        }));
        printColumns(rows);
      } finally {
        process.stderr.write = originalStderr;
      }

      assert.ok(stderrOutput.includes("(empty)"));
    });

    it("handles CJK-aligned columns from API response", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notepads/, method: "GET" })
        .reply(200, wrap({
          notepads: [
            { id: "np-1", title: "暂无简介", brief: "短简介" },
            { id: "np-2", title: "A Very Long English Title Here", brief: "x" },
          ],
        }));

      const res = await api<{ notepads: Array<Record<string, string>> }>(
        "/api/v1/notepads",
        { method: "GET", query: { limit: "10", offset: "0" } },
        "token",
      );

      const output = captureStdout(() => {
        const rows = res.notepads.map((n) => ({
          id: n.id,
          title: n.title,
          brief: n.brief,
        }));
        printColumns(rows);
      });

      const lines = output.split("\n").filter(Boolean);
      const tabs0 = (lines[1]!.match(/\t/g) || []).length;
      const tabs1 = (lines[2]!.match(/\t/g) || []).length;
      assert.equal(tabs0, tabs1);
    });

    it("adds fields with + prefix in --fields", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({
          notes: [
            { id: "n1", note_type: "谐音", note: "test", status: "PUBLISHED" },
          ],
        }));

      const res = await api<{ notes: Array<Record<string, string>> }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      setSelectedFields("+extra_key");
      const output = captureStdout(() => {
        const rows = res.notes.map((n) => ({
          id: n.id,
          note_type: n.note_type,
          note: n.note,
          status: n.status,
          extra_key: n.extra_key ?? "",
        }));
        printColumns(rows);
      });
      setSelectedFields("");

      const header = output.split("\n")[0]!;
      assert.ok(header.includes("id"), "should include default id");
      assert.ok(header.includes("note_type"), "should include default note_type");
      assert.ok(header.includes("extra_key"), "should include added extra_key");
    });

    it("removes fields with - prefix in --fields", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({
          notes: [
            { id: "n1", note_type: "谐音", note: "test", status: "PUBLISHED" },
          ],
        }));

      const res = await api<{ notes: Array<Record<string, string>> }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      setSelectedFields("-status,note");
      const output = captureStdout(() => {
        const rows = res.notes.map((n) => ({
          id: n.id,
          note_type: n.note_type,
          note: n.note,
          status: n.status,
        }));
        printColumns(rows);
      });
      setSelectedFields("");

      const header = output.split("\n")[0]!;
      assert.ok(header.includes("id"), "should keep id");
      assert.ok(header.includes("note_type"), "should keep note_type");
      assert.ok(!header.includes("note\t"), "should remove note");
      assert.ok(!header.includes("status"), "should remove status");
    });
  });

  describe("printJson with mocked API data", () => {
    it("outputs formatted JSON from API response", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/vocabulary/, method: "GET" })
        .reply(200, wrap({ voc: { id: "v1", spelling: "apple" } }));

      const res = await api<{ voc?: { id: string; spelling: string } }>(
        "/api/v1/vocabulary",
        { method: "GET", query: { spelling: "apple" } },
        "token",
      );

      const output = captureStdout(() => printJson(res));

      const parsed = JSON.parse(output);
      assert.deepEqual(parsed, { voc: { id: "v1", spelling: "apple" } });
    });

    it("outputs empty array as valid JSON", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({ notes: [] }));

      const res = await api<{ notes: unknown[] }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      const output = captureStdout(() => printJson(res));

      const parsed = JSON.parse(output);
      assert.deepEqual(parsed, { notes: [] });
    });

    it("--no-header and --fields do not affect JSON output", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/notes/, method: "GET" })
        .reply(200, wrap({
          notes: [
            { id: "n1", note_type: "谐音", note: "test", status: "PUBLISHED" },
          ],
        }));

      const res = await api<{ notes: Array<Record<string, string>> }>(
        "/api/v1/notes",
        { method: "GET", query: { voc_id: "v1" } },
        "token",
      );

      setShowHeader(false);
      setSelectedFields("id");
      const output = captureStdout(() => printJson(res));
      setShowHeader(true);
      setSelectedFields("");

      const parsed = JSON.parse(output);
      assert.ok(parsed.notes);
      assert.ok(parsed.notes[0].note_type);
    });

    it("error output to stderr preserved during JSON mode", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/test/, method: "GET" })
        .reply(400, { errors: [{ code: "E1", message: "bad" }], data: null, success: false });

      let stderrOutput = "";
      const originalStderr = process.stderr.write;
      process.stderr.write = ((chunk: string) => {
        stderrOutput += chunk;
        return true;
      }) as typeof process.stderr.write;

      const originalExit = process.exit;
      process.exit = ((code: number) => {
        throw new Error(`exit:${code}`);
      }) as typeof process.exit;

      try {
        await api("/api/v1/test", { method: "GET" }, "token");
      } catch {
        // expected
      } finally {
        process.stderr.write = originalStderr;
        process.exit = originalExit;
      }

      assert.ok(stderrOutput.includes("错误"));
      assert.ok(stderrOutput.includes("E1"));
      assert.ok(stderrOutput.includes("bad"));
    });
  });
});
