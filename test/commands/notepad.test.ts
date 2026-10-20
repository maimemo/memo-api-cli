import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { api } from "../../src/client.js";

function wrap<T>(data: T) {
  return { data, errors: [], success: true };
}

let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

describe("notepad commands (integration)", () => {
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
    it("fetches notepads with limit and offset", async () => {
      const notepads = [
        { id: "np1", title: "笔记1", brief: "简介1", status: "PUBLISHED" },
        { id: "np2", title: "笔记2", brief: "简介2", status: "PUBLISHED" },
      ];

      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/memo\/notepads/, method: "GET" })
        .reply(200, (opts: { path: string }) => {
          assert.ok(opts.path.includes("limit=10"));
          assert.ok(opts.path.includes("offset=0"));
          return wrap({ notepads });
        });

      const res = await api<{ notepads: typeof notepads }>(
        "/api/v1/memo/notepads",
        { method: "GET", query: { limit: "10", offset: "0" } },
        "token",
      );

      assert.equal(res.notepads.length, 2);
      assert.equal(res.notepads[0]!.id, "np1");
    });

    it("fetches notepads with custom limit", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/memo\/notepads/, method: "GET" })
        .reply(200, (opts: { path: string }) => {
          assert.ok(opts.path.includes("limit=5"));
          assert.ok(opts.path.includes("offset=10"));
          return wrap({ notepads: [] });
        });

      const res = await api<{ notepads: Array<Record<string, unknown>> }>(
        "/api/v1/memo/notepads",
        { method: "GET", query: { limit: "5", offset: "10" } },
        "token",
      );

      assert.deepEqual(res.notepads, []);
    });
  });

  describe("get", () => {
    it("fetches a single notepad", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/notepads/np1", method: "GET" })
        .reply(200, wrap({
          notepad: {
            id: "np1",
            title: "测试笔记",
            content: "一些内容",
            brief: "简介",
            tags: ["tag1"],
            status: "PUBLISHED",
            type: "NOTEPAD",
            creator: 123,
            list: [],
          },
        }));

      const res = await api<{
        notepad: { id: string; title: string; content: string; brief: string; tags: string[]; status: string };
      }>(
        "/api/v1/memo/notepads/np1",
        { method: "GET" },
        "token",
      );

      assert.equal(res.notepad.id, "np1");
      assert.equal(res.notepad.title, "测试笔记");
    });

    it("returns notepad with content field", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/notepads/np2", method: "GET" })
        .reply(200, wrap({
          notepad: {
            id: "np2",
            title: "空笔记",
            content: "",
            brief: "",
            tags: [],
            status: "UNPUBLISHED",
            type: "NOTEPAD",
            creator: 456,
            list: [],
          },
        }));

      const res = await api<{
        notepad: { id: string; title: string; content: string; tags: string[]; status: string };
      }>(
        "/api/v1/memo/notepads/np2",
        { method: "GET" },
        "token",
      );

      assert.equal(res.notepad.content, "");
      assert.equal(res.notepad.status, "UNPUBLISHED");
    });
  });

  describe("create", () => {
    it("creates a notepad", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/notepads", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.equal(body.notepad?.title, "新笔记");
          assert.equal(body.notepad?.content, "笔记内容");
          return wrap({
            notepad: {
              id: "np_new",
              title: "新笔记",
              content: "笔记内容",
              brief: "简短介绍",
              tags: ["学习"],
              status: "PUBLISHED",
              type: "NOTEPAD",
              creator: 1,
              list: [],
            },
          });
        });

      const res = await api<{
        notepad: {
          id: string;
          title: string;
          content: string;
          brief: string;
          tags: string[];
          status: string;
        };
      }>(
        "/api/v1/memo/notepads",
        {
          method: "POST",
          body: {
            notepad: {
              title: "新笔记",
              content: "笔记内容",
              brief: "简短介绍",
              tags: ["学习"],
              status: "PUBLISHED",
            },
          },
        },
        "token",
      );

      assert.equal(res.notepad.id, "np_new");
      assert.deepEqual(res.notepad.tags, ["学习"]);
    });

    it("creates a notepad with UNPUBLISHED status", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/notepads", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.equal(body.notepad?.status, "UNPUBLISHED");
          return wrap({
            notepad: {
              id: "np_draft",
              title: "草稿",
              content: "草稿内容",
              brief: "",
              tags: [],
              status: "UNPUBLISHED",
              type: "NOTEPAD",
              creator: 1,
              list: [],
            },
          });
        });

      const res = await api<{
        notepad: { id: string; status: string };
      }>(
        "/api/v1/memo/notepads",
        {
          method: "POST",
          body: {
            notepad: {
              title: "草稿",
              content: "草稿内容",
              brief: "",
              tags: [],
              status: "UNPUBLISHED",
            },
          },
        },
        "token",
      );

      assert.equal(res.notepad.status, "UNPUBLISHED");
    });
  });

  describe("update", () => {
    it("updates a notepad", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/notepads/np1", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.equal(body.notepad?.title, "更新后的标题");
          return wrap({
            notepad: {
              id: "np1",
              title: "更新后的标题",
              content: "更新后的内容",
              brief: "",
              tags: ["更新"],
              status: "PUBLISHED",
              type: "NOTEPAD",
              creator: 1,
              list: [],
            },
          });
        });

      const res = await api<{
        notepad: {
          id: string;
          title: string;
          content: string;
          tags: string[];
          status: string;
        };
      }>(
        "/api/v1/memo/notepads/np1",
        {
          method: "POST",
          body: {
            notepad: {
              title: "更新后的标题",
              content: "更新后的内容",
              brief: "",
              tags: ["更新"],
              status: "PUBLISHED",
            },
          },
        },
        "token",
      );

      assert.equal(res.notepad.title, "更新后的标题");
    });
  });

  describe("delete", () => {
    it("deletes a notepad", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/notepads/np1", method: "DELETE" })
        .reply(200, wrap({}));

      const res = await api<object>("/api/v1/memo/notepads/np1", { method: "DELETE" }, "token");
      assert.deepEqual(res, {});
    });
  });
});
