import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { api } from "../../src/client.js";

function wrap<T>(data: T) {
  return { data, errors: [], success: true };
}

let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

describe("phrase commands (integration)", () => {
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
    it("fetches phrases by voc_id", async () => {
      const phrases = [
        {
          id: "p1",
          phrase: "An apple a day",
          interpretation: "一天一个苹果",
          tags: [],
          highlight: [],
          status: "PUBLISHED",
          origin: "book",
        },
      ];

      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/memo\/phrases/, method: "GET" })
        .reply(200, wrap({ phrases }));

      const res = await api<{ phrases: typeof phrases }>(
        "/api/v1/memo/phrases",
        { method: "GET", query: { voc_id: "voc123" } },
        "token",
      );

      assert.equal(res.phrases.length, 1);
      assert.equal(res.phrases[0]!.id, "p1");
    });

    it("returns empty list when no phrases", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/memo\/phrases/, method: "GET" })
        .reply(200, wrap({ phrases: [] }));

      const res = await api<{ phrases: Array<Record<string, unknown>> }>(
        "/api/v1/memo/phrases",
        { method: "GET", query: { voc_id: "nonexist" } },
        "token",
      );

      assert.equal(res.phrases.length, 0);
    });
  });

  describe("create", () => {
    it("creates a phrase", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/phrases", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.equal(body.phrase?.phrase, "Hello world");
          return wrap({
            phrase: {
              id: "new1",
              phrase: "Hello world",
              interpretation: "你好世界",
              tags: ["greeting"],
              highlight: [],
              status: "PUBLISHED",
              origin: "book",
            },
          });
        });

      const res = await api<{
        phrase: {
          id: string;
          phrase: string;
          interpretation: string;
          tags: string[];
          highlight: unknown[];
          status: string;
          origin: string;
        };
      }>(
        "/api/v1/memo/phrases",
        {
          method: "POST",
          body: {
            phrase: {
              voc_id: "voc123",
              phrase: "Hello world",
              interpretation: "你好世界",
              tags: ["greeting"],
              origin: "book",
            },
          },
        },
        "token",
      );

      assert.equal(res.phrase.id, "new1");
    });

    it("creates a phrase with empty tags and origin", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/phrases", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.deepEqual(body.phrase?.tags, []);
          assert.equal(body.phrase?.origin, "");
          return wrap({
            phrase: {
              id: "new2",
              phrase: "Hi",
              interpretation: "嗨",
              tags: [],
              highlight: [],
              status: "PUBLISHED",
              origin: "",
            },
          });
        });

      const res = await api<{
        phrase: {
          id: string;
          phrase: string;
          interpretation: string;
          tags: unknown[];
          origin: string;
        };
      }>(
        "/api/v1/memo/phrases",
        {
          method: "POST",
          body: {
            phrase: {
              voc_id: "voc456",
              phrase: "Hi",
              interpretation: "嗨",
              tags: [],
              origin: "",
            },
          },
        },
        "token",
      );

      assert.equal(res.phrase.id, "new2");
    });
  });

  describe("update", () => {
    it("updates a phrase", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/phrases/p1", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.equal(body.phrase?.phrase, "updated phrase");
          return wrap({
            phrase: {
              id: "p1",
              phrase: "updated phrase",
              interpretation: "更新的翻译",
              tags: ["updated"],
              highlight: [],
              status: "PUBLISHED",
              origin: "web",
            },
          });
        });

      const res = await api<{
        phrase: {
          id: string;
          phrase: string;
          interpretation: string;
          tags: string[];
          origin: string;
          status: string;
        };
      }>(
        "/api/v1/memo/phrases/p1",
        {
          method: "POST",
          body: {
            phrase: {
              phrase: "updated phrase",
              interpretation: "更新的翻译",
              tags: ["updated"],
              origin: "web",
            },
          },
        },
        "token",
      );

      assert.equal(res.phrase.phrase, "updated phrase");
    });
  });

  describe("delete", () => {
    it("deletes a phrase", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/memo/phrases/p1", method: "DELETE" })
        .reply(200, wrap({}));

      const res = await api<object>("/api/v1/memo/phrases/p1", { method: "DELETE" }, "token");
      assert.deepEqual(res, {});
    });
  });
});
