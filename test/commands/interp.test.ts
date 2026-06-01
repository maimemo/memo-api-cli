import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { api } from "../../src/client.js";

function wrap<T>(data: T) {
  return { data, errors: [], success: true };
}

let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

describe("interp commands (integration)", () => {
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
    it("fetches interpretations by voc_id", async () => {
      const interps = [
        { id: "i1", interpretation: "n. 苹果", tags: ["考研"], status: "PUBLISHED" },
      ];

      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/interpretations/, method: "GET" })
        .reply(200, wrap({ interpretations: interps }));

      const res = await api<{ interpretations: typeof interps }>(
        "/api/v1/interpretations",
        { method: "GET", query: { voc_id: "voc123" } },
        "token",
      );

      assert.equal(res.interpretations.length, 1);
      assert.equal(res.interpretations[0]!.id, "i1");
    });

    it("returns empty list when no interpretations", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: /\/open\/api\/v1\/interpretations/, method: "GET" })
        .reply(200, wrap({ interpretations: [] }));

      const res = await api<{ interpretations: Array<Record<string, unknown>> }>(
        "/api/v1/interpretations",
        { method: "GET", query: { voc_id: "nonexist" } },
        "token",
      );

      assert.equal(res.interpretations.length, 0);
    });
  });

  describe("create", () => {
    it("creates an interpretation", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/interpretations", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.equal(body.interpretation?.interpretation, "n. 苹果");
          return wrap({
            interpretation: {
              id: "new1",
              interpretation: "n. 苹果",
              tags: ["考研"],
              status: "PUBLISHED",
            },
          });
        });

      const res = await api<{
        interpretation: { id: string; interpretation: string; tags: string[]; status: string };
      }>(
        "/api/v1/interpretations",
        {
          method: "POST",
          body: {
            interpretation: {
              voc_id: "voc123",
              interpretation: "n. 苹果",
              tags: ["考研"],
              status: "PUBLISHED",
            },
          },
        },
        "token",
      );

      assert.equal(res.interpretation.id, "new1");
    });

    it("creates an interpretation with empty tags", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/interpretations", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.deepEqual(body.interpretation?.tags, []);
          return wrap({
            interpretation: {
              id: "new2",
              interpretation: "adv. 也",
              tags: [],
              status: "PUBLISHED",
            },
          });
        });

      const res = await api<{
        interpretation: { id: string; interpretation: string; tags: string[]; status: string };
      }>(
        "/api/v1/interpretations",
        {
          method: "POST",
          body: {
            interpretation: {
              voc_id: "voc456",
              interpretation: "adv. 也",
              tags: [],
              status: "PUBLISHED",
            },
          },
        },
        "token",
      );

      assert.equal(res.interpretation.id, "new2");
    });
  });

  describe("update", () => {
    it("updates an interpretation", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/interpretations/i1", method: "POST" })
        .reply(200, (opts: { body?: string }) => {
          const body = opts.body ? JSON.parse(opts.body) : {};
          assert.equal(body.interpretation?.interpretation, "updated interp");
          return wrap({
            interpretation: {
              id: "i1",
              interpretation: "updated interp",
              tags: ["考研"],
              status: "PUBLISHED",
            },
          });
        });

      const res = await api<{
        interpretation: { id: string; interpretation: string; tags: string[]; status: string };
      }>(
        "/api/v1/interpretations/i1",
        {
          method: "POST",
          body: {
            interpretation: {
              interpretation: "updated interp",
              tags: ["考研"],
              status: "PUBLISHED",
            },
          },
        },
        "token",
      );

      assert.equal(res.interpretation.interpretation, "updated interp");
    });
  });

  describe("delete", () => {
    it("deletes an interpretation", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/interpretations/i1", method: "DELETE" })
        .reply(200, wrap({}));

      const res = await api<object>("/api/v1/interpretations/i1", { method: "DELETE" }, "token");
      assert.deepEqual(res, {});
    });
  });
});
