import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { resolveVocId } from "../../src/lib/word-resolve.js";

let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;

describe("resolveVocId", () => {
  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  it("returns voc_id for existing word", async () => {
    mockAgent
      .get("https://open.maimemo.com")
      .intercept({
        path: /\/open\/api\/v1\/memo\/vocabulary/,
        method: "GET",
      })
      .reply(200, { data: { voc: { id: "voc123", spelling: "apple" } }, errors: [], success: true });

    const id = await resolveVocId("apple", "test-token");
    assert.equal(id, "voc123");
  });
});
