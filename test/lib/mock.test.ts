import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

let tempFile: string;

function writeMockDef(def: unknown): string {
  const f = join(tmpdir(), `memo-mock-test-${randomBytes(4).toString("hex")}.json`);
  writeFileSync(f, JSON.stringify(def));
  return f;
}

import { isMockEnabled, findEndpoint, clearCache, type MockEndpoint } from "../../src/lib/mock.js";

describe("isMockEnabled", () => {
  it("returns true when MAIMEMO_API_MOCK is 1", () => {
    process.env["MAIMEMO_API_MOCK"] = "1";
    assert.equal(isMockEnabled(), true);
    delete process.env["MAIMEMO_API_MOCK"];
  });

  it("returns false when MAIMEMO_API_MOCK is not set", () => {
    delete process.env["MAIMEMO_API_MOCK"];
    assert.equal(isMockEnabled(), false);
  });

  it("returns false when MAIMEMO_API_MOCK is not 1", () => {
    process.env["MAIMEMO_API_MOCK"] = "0";
    assert.equal(isMockEnabled(), false);
    delete process.env["MAIMEMO_API_MOCK"];
  });
});

describe("findEndpoint", () => {
  beforeEach(() => {
    clearCache();
    delete process.env["MAIMEMO_API_MOCK_FILE"];
  });

  afterEach(() => {
    clearCache();
    delete process.env["MAIMEMO_API_MOCK_FILE"];
  });

  it("matches by method and path", () => {
    tempFile = writeMockDef({
      endpoints: [
        {
          method: "GET",
          path: "/api/v1/vocabulary",
          response: { data: { voc: { id: "v1", spelling: "test" } } },
        },
      ],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    const ep = findEndpoint("GET", "/api/v1/vocabulary");
    assert.equal(ep.path, "/api/v1/vocabulary");
    assert.deepEqual(ep.response, { data: { voc: { id: "v1", spelling: "test" } } });
  });

  it("matches method case-insensitively", () => {
    tempFile = writeMockDef({
      endpoints: [{ method: "GET", path: "/api/v1/vocabulary", response: "ok" }],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    const ep = findEndpoint("get", "/api/v1/vocabulary");
    assert.equal(ep.path, "/api/v1/vocabulary");
  });

  it("matches by query parameters (exact)", () => {
    tempFile = writeMockDef({
      endpoints: [
        {
          method: "GET",
          path: "/api/v1/vocabulary",
          query: { spelling: "apple" },
          response: { data: { voc: { id: "v1" } } },
        },
      ],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    const ep = findEndpoint("GET", "/api/v1/vocabulary", { spelling: "apple" });
    assert.deepEqual(ep.response, { data: { voc: { id: "v1" } } });
  });

  it("does not match when query params differ", () => {
    tempFile = writeMockDef({
      endpoints: [
        {
          method: "GET",
          path: "/api/v1/vocabulary",
          query: { spelling: "apple" },
          response: { data: { voc: { id: "v1" } } },
        },
      ],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    assert.throws(
      () => findEndpoint("GET", "/api/v1/vocabulary", { spelling: "banana" }),
      /No mock endpoint matched/,
    );
  });

  it("matches without query when mock has no query constraint", () => {
    tempFile = writeMockDef({
      endpoints: [
        { method: "GET", path: "/api/v1/vocabulary", response: { ok: true } },
      ],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    const ep = findEndpoint("GET", "/api/v1/vocabulary", { spelling: "any" });
    assert.deepEqual(ep.response, { ok: true });
  });

  it("matches by body (partial deep match)", () => {
    tempFile = writeMockDef({
      endpoints: [
        {
          method: "POST",
          path: "/api/v1/notes",
          body: { note: { voc_id: "v1" } },
          response: { data: { note: { id: "n1" } } },
        },
      ],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    const ep = findEndpoint("POST", "/api/v1/notes", undefined, {
      note: { voc_id: "v1", note_type: "谐音", note: "text" },
    });
    assert.deepEqual(ep.response, { data: { note: { id: "n1" } } });
  });

  it("does not match when body differs", () => {
    tempFile = writeMockDef({
      endpoints: [
        {
          method: "POST",
          path: "/api/v1/notes",
          body: { note: { voc_id: "v1" } },
          response: { data: { note: { id: "n1" } } },
        },
      ],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    assert.throws(
      () =>
        findEndpoint("POST", "/api/v1/notes", undefined, {
          note: { voc_id: "v2" },
        }),
      /No mock endpoint matched/,
    );
  });

  it("matches when mock has no body constraint", () => {
    tempFile = writeMockDef({
      endpoints: [
        { method: "POST", path: "/api/v1/notes", response: { ok: true } },
      ],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    const ep = findEndpoint("POST", "/api/v1/notes", undefined, {
      note: { voc_id: "any" },
    });
    assert.deepEqual(ep.response, { ok: true });
  });

  it("matches the first matching endpoint", () => {
    tempFile = writeMockDef({
      endpoints: [
        { method: "GET", path: "/api/v1/vocabulary", response: "first" },
        { method: "GET", path: "/api/v1/vocabulary", response: "second" },
      ],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    const ep = findEndpoint("GET", "/api/v1/vocabulary");
    assert.equal(ep.response, "first");
  });

  it("throws with helpful message when no match", () => {
    tempFile = writeMockDef({
      endpoints: [{ method: "GET", path: "/api/v1/notes", response: "ok" }],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    assert.throws(
      () => findEndpoint("POST", "/api/v1/vocabulary"),
      /No mock endpoint matched/,
    );
  });

  it("matches body arrays (exact length and values)", () => {
    tempFile = writeMockDef({
      endpoints: [
        {
          method: "POST",
          path: "/api/v1/vocabulary/query",
          body: { spellings: ["apple", "banana"] },
          response: { data: { voc: [] } },
        },
      ],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    const ep = findEndpoint("POST", "/api/v1/vocabulary/query", undefined, {
      spellings: ["apple", "banana"],
      ids: [],
    });
    assert.deepEqual(ep.response, { data: { voc: [] } });
  });

  it("does not match body array with different values", () => {
    tempFile = writeMockDef({
      endpoints: [
        {
          method: "POST",
          path: "/api/v1/vocabulary/query",
          body: { spellings: ["apple"] },
          response: { data: { voc: [] } },
        },
      ],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    assert.throws(
      () =>
        findEndpoint("POST", "/api/v1/vocabulary/query", undefined, {
          spellings: ["banana"],
          ids: [],
        }),
      /No mock endpoint matched/,
    );
  });

  it("supports status field in mock endpoint", () => {
    tempFile = writeMockDef({
      endpoints: [
        {
          method: "GET",
          path: "/api/v1/vocabulary",
          status: 404,
          response: {},
        },
      ],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    const ep = findEndpoint("GET", "/api/v1/vocabulary");
    assert.equal(ep.status, 404);
  });

  it("loads file only once (cached)", () => {
    tempFile = writeMockDef({
      endpoints: [{ method: "GET", path: "/api/v1/test", response: "ok" }],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    findEndpoint("GET", "/api/v1/test");

    writeFileSync(tempFile, JSON.stringify({ endpoints: [] }));
    const ep = findEndpoint("GET", "/api/v1/test");
    assert.equal(ep.response, "ok");
  });

  it("clearCache forces reload", () => {
    tempFile = writeMockDef({
      endpoints: [{ method: "GET", path: "/api/v1/test", response: "ok" }],
    });
    process.env["MAIMEMO_API_MOCK_FILE"] = tempFile;

    findEndpoint("GET", "/api/v1/test");

    writeFileSync(
      tempFile,
      JSON.stringify({
        endpoints: [
          { method: "GET", path: "/api/v1/test", response: "reloaded" },
        ],
      }),
    );
    clearCache();
    const ep = findEndpoint("GET", "/api/v1/test");
    assert.equal(ep.response, "reloaded");
  });
});
