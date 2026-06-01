import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { api } from "../../src/client.js";

function wrap<T>(data: T) {
  return { data, errors: [], success: true };
}

let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

describe("voc commands (integration)", () => {
  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  describe("get", () => {
    it("fetches vocabulary by spelling", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/vocabulary/, method: "GET" })
        .reply(200, wrap({ voc: { id: "voc123", spelling: "apple" } }));

      const res = await api<{ voc?: { id: string; spelling: string } }>(
        "/api/v1/vocabulary",
        { method: "GET", query: { spelling: "apple" } },
        "token",
      );

      assert.equal(res.voc?.id, "voc123");
      assert.equal(res.voc?.spelling, "apple");
    });

    it("returns null voc when word not found", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/vocabulary/, method: "GET" })
        .reply(200, wrap({}));

      const res = await api<{ voc?: unknown }>(
        "/api/v1/vocabulary",
        { method: "GET", query: { spelling: "nonexist" } },
        "token",
      );

      assert.equal(res.voc, undefined);
    });
  });

  describe("query", () => {
    it("queries by spellings", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/vocabulary/query", method: "POST" })
        .reply(200, wrap({ voc: [{ id: "v1", spelling: "a" }, { id: "v2", spelling: "b" }] }));

      const res = await api<{ voc: Array<{ id: string; spelling: string }> }>(
        "/api/v1/vocabulary/query",
        { method: "POST", body: { spellings: ["a", "b"], ids: [] } },
        "token",
      );

      assert.equal(res.voc.length, 2);
    });

    it("queries by ids", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/vocabulary/query", method: "POST" })
        .reply(200, wrap({ voc: [{ id: "v1", spelling: "x" }] }));

      const res = await api<{ voc: Array<{ id: string }> }>(
        "/api/v1/vocabulary/query",
        { method: "POST", body: { spellings: [], ids: ["v1"] } },
        "token",
      );

      assert.equal(res.voc.length, 1);
    });
  });
});
