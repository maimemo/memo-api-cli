import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tryParseJson } from "../../src/stdin.js";

describe("tryParseJson", () => {
  it("parses valid JSON", () => {
    const result = tryParseJson('{"key":"value"}');
    assert.deepEqual(result, { key: "value" });
  });

  it("returns null for invalid JSON", () => {
    assert.equal(tryParseJson("not json"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(tryParseJson(""), null);
  });

  it("parses arrays", () => {
    assert.deepEqual(tryParseJson("[1,2,3]"), [1, 2, 3]);
  });

  it("parses primitives", () => {
    assert.equal(tryParseJson("42"), 42);
    assert.equal(tryParseJson("true"), true);
    assert.equal(tryParseJson('"hello"'), "hello");
  });
});
