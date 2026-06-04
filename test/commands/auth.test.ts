import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authCmd } from "../../src/commands/auth.js";

describe("authCmd", () => {
  it("exports a CommandModule with correct structure", () => {
    assert.equal(authCmd.command, "auth");
    assert.ok(typeof authCmd.describe === "string");
    assert.ok(typeof authCmd.builder === "function");
    assert.ok(typeof authCmd.handler === "function");
  });
});
