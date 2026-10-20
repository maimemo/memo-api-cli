import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { api } from "../../src/client.js";

function wrap<T>(data: T) {
  return { data, errors: [], success: true };
}

let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

describe("note commands (integration)", () => {
  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  describe("list", () => {
    it("fetches notes by voc_id", async () => {
      const notes = [
        { id: "n1", note_type: "谐音", note: "test note", status: "PUBLISHED" },
      ];

      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/memo\/notes/, method: "GET" })
        .reply(200, wrap({ notes }));

      const res = await api<{ notes: typeof notes }>(
        "/api/v1/memo/notes",
        { method: "GET", query: { voc_id: "voc123" } },
        "token",
      );

      assert.equal(res.notes.length, 1);
      assert.equal(res.notes[0]!.id, "n1");
    });

    it("returns empty list when no notes", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/memo\/notes/, method: "GET" })
        .reply(200, wrap({ notes: [] }));

      const res = await api<{ notes: Array<Record<string, unknown>> }>(
        "/api/v1/memo/notes",
        { method: "GET", query: { voc_id: "nonexist" } },
        "token",
      );

      assert.equal(res.notes.length, 0);
    });
  });

  describe("create", () => {
    it("creates a note", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/notes", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.equal(body.note?.note_type, "谐音");
          return wrap({
            note: { id: "new1", note_type: "谐音", note: "test note", status: "PUBLISHED" },
          });
        });

      const res = await api<{ note: { id: string; note_type: string; note: string; status: string } }>(
        "/api/v1/memo/notes",
        {
          method: "POST",
          body: { note: { voc_id: "voc123", note_type: "谐音", note: "test note" } },
        },
        "token",
      );

      assert.equal(res.note.id, "new1");
    });
  });

  describe("update", () => {
    it("updates a note", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/notes/n1", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.equal(body.note?.note, "updated note");
          return wrap({
            note: { id: "n1", note_type: "联想", note: "updated note", status: "PUBLISHED" },
          });
        });

      const res = await api<{ note: { id: string; note_type: string; note: string; status: string } }>(
        "/api/v1/memo/notes/n1",
        {
          method: "POST",
          body: { note: { note_type: "联想", note: "updated note" } },
        },
        "token",
      );

      assert.equal(res.note.note, "updated note");
    });
  });

  describe("delete", () => {
    it("deletes a note", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/notes/n1", method: "DELETE" })
        .reply(200, wrap({}));

      const res = await api<object>("/api/v1/memo/notes/n1", { method: "DELETE" }, "token");
      assert.deepEqual(res, {});
    });
  });
});
