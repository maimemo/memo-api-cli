import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveArrayArg, getToken, isJsonOutput } from "../../src/lib/helpers.js";
import { Command } from "commander";

describe("resolveArrayArg", () => {
  it("returns values unchanged when no '-' marker", () => {
    const result = resolveArrayArg(["a", "b", "c"], null);
    assert.deepEqual(result, ["a", "b", "c"]);
  });

  it("replaces '-' with stdin lines", () => {
    const result = resolveArrayArg(["a", "-", "c"], "X\nY\nZ");
    assert.deepEqual(result, ["a", "X", "Y", "Z", "c"]);
  });

  it("drops '-' when no stdin", () => {
    const result = resolveArrayArg(["a", "-"], null);
    assert.deepEqual(result, ["a"]);
  });

  it("uses stdin text even if it looks like JSON", () => {
    const result = resolveArrayArg(["a", "-"], '{"key":"value"}');
    assert.deepEqual(result, ["a", '{"key":"value"}']);
  });

  it("handles empty stdin", () => {
    const result = resolveArrayArg(["a", "-"], "");
    assert.deepEqual(result, ["a"]);
  });

  it("handles multiple '-' markers", () => {
    const result = resolveArrayArg(["-", "a", "-"], "X\nY");
    assert.deepEqual(result, ["X", "Y", "a", "X", "Y"]);
  });

  it("handles stdin with empty lines", () => {
    const result = resolveArrayArg(["a", "-"], "\nX\n\nY\n");
    assert.deepEqual(result, ["a", "X", "Y"]);
  });
});

describe("isJsonOutput", () => {
  it("returns true for 'json'", () => {
    assert.equal(isJsonOutput("json"), true);
  });

  it("returns false for non-json strings", () => {
    assert.equal(isJsonOutput("column"), false);
    assert.equal(isJsonOutput("csv"), false);
    assert.equal(isJsonOutput(""), false);
  });
});
