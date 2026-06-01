import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { api } from "../../src/client.js";

function wrap<T>(data: T) {
  return { data, errors: [], success: true };
}

let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

describe("study commands (integration)", () => {
  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  describe("progress", () => {
    it("fetches study progress", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/study\/get_study_progress/, method: "POST" })
        .reply(200, wrap({ progress: { today_added: "5", today_review: "10" } }));

      const res = await api<{ progress: { today_added: string; today_review: string } }>(
        "/api/v1/study/get_study_progress",
        { method: "POST", body: {} },
        "token",
      );

      assert.equal(res.progress.today_added, "5");
    });
  });

  describe("add", () => {
    it("adds words by id", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/study/add_words", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.deepEqual(body.words, [{ id: "voc123" }]);
          assert.equal(body.advance, false);
          return wrap({ added_count: 1 });
        });

      const res = await api<{ added_count: number }>(
        "/api/v1/study/add_words",
        {
          method: "POST",
          body: { words: [{ id: "voc123" }], advance: false },
        },
        "token",
      );

      assert.equal(res.added_count, 1);
    });

    it("adds words by spelling", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/study/add_words", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.deepEqual(body.words, [{ spelling: "apple" }]);
          assert.equal(body.advance, false);
          return wrap({ added_count: 1 });
        });

      const res = await api<{ added_count: number }>(
        "/api/v1/study/add_words",
        {
          method: "POST",
          body: { words: [{ spelling: "apple" }], advance: false },
        },
        "token",
      );

      assert.equal(res.added_count, 1);
    });

    it("adds words by both id and spelling", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/study/add_words", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.deepEqual(body.words, [
            { id: "voc123" },
            { spelling: "apple" },
            { spelling: "banana" },
          ]);
          return wrap({ added_count: 3 });
        });

      const res = await api<{ added_count: number }>(
        "/api/v1/study/add_words",
        {
          method: "POST",
          body: {
            words: [
              { id: "voc123" },
              { spelling: "apple" },
              { spelling: "banana" },
            ],
            advance: false,
          },
        },
        "token",
      );

      assert.equal(res.added_count, 3);
    });

    it("adds words with advance flag", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/study/add_words", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.equal(body.advance, true);
          return wrap({ added_count: 2 });
        });

      const res = await api<{ added_count: number }>(
        "/api/v1/study/add_words",
        {
          method: "POST",
          body: {
            words: [{ spelling: "happy" }, { spelling: "sad" }],
            advance: true,
          },
        },
        "token",
      );

      assert.equal(res.added_count, 2);
    });
  });

  describe("today", () => {
    it("fetches today items", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/study\/get_today_items/, method: "POST" })
        .reply(200, wrap({
          today_items: [
            { voc_id: "v1", spelling: "test", is_new: false, is_finished: false },
          ],
        }));

      const res = await api<{
        today_items: Array<{ voc_id: string; spelling: string }>;
      }>(
        "/api/v1/study/get_today_items",
        { method: "POST", body: { voc_ids: [], spellings: [], limit: 50 } },
        "token",
      );

      assert.equal(res.today_items.length, 1);
    });
  });

  describe("records", () => {
    it("queries study records", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/study/query_study_records", method: "POST" })
        .reply(200, wrap({ records: [], count: 0 }));

      const res = await api<{ records: Array<unknown>; count: number }>(
        "/api/v1/study/query_study_records",
        {
          method: "POST",
          body: { voc_ids: [], spellings: [], as_count: false, limit: 50 },
        },
        "token",
      );

      assert.equal(res.count, 0);
      assert.equal(res.records.length, 0);
    });
  });

  describe("advance", () => {
    it("advances study by voc_ids", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/study/advance_study", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.deepEqual(body.voc_ids, ["v1", "v2"]);
          assert.deepEqual(body.spellings, []);
          return wrap({ advanced_count: 2 });
        });

      const res = await api<{ advanced_count: number }>(
        "/api/v1/study/advance_study",
        { method: "POST", body: { voc_ids: ["v1", "v2"], spellings: [] } },
        "token",
      );

      assert.equal(res.advanced_count, 2);
    });

    it("advances study by spellings", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/study/advance_study", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.deepEqual(body.voc_ids, []);
          assert.deepEqual(body.spellings, ["apple", "banana"]);
          return wrap({ advanced_count: 2 });
        });

      const res = await api<{ advanced_count: number }>(
        "/api/v1/study/advance_study",
        { method: "POST", body: { voc_ids: [], spellings: ["apple", "banana"] } },
        "token",
      );

      assert.equal(res.advanced_count, 2);
    });

    it("advances study by both voc_ids and spellings", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/study/advance_study", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.deepEqual(body.voc_ids, ["v1"]);
          assert.deepEqual(body.spellings, ["cherry"]);
          return wrap({ advanced_count: 2 });
        });

      const res = await api<{ advanced_count: number }>(
        "/api/v1/study/advance_study",
        { method: "POST", body: { voc_ids: ["v1"], spellings: ["cherry"] } },
        "token",
      );

      assert.equal(res.advanced_count, 2);
    });
  });
});
