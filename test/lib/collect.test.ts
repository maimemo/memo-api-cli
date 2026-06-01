import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { collect } from "../../src/lib/collect.js";

describe("collect", () => {
  it("accumulates values", () => {
    const acc1 = collect("A", []);
    const acc2 = collect("B", acc1);
    assert.deepEqual(acc2, ["A", "B"]);
  });

  it("passes through '-' value", () => {
    const result = collect("-", ["A"]);
    assert.deepEqual(result, ["A", "-"]);
  });
});
