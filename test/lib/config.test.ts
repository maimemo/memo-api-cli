import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getConfig } from "../../src/config.js";

const CONFIG_PATH = join(homedir(), ".config", "memo-api.json");
let originalContent: string | null = null;

describe("getConfig", () => {
  beforeEach(() => {
    try {
      originalContent = readFileSync(CONFIG_PATH, "utf-8");
    } catch {
      originalContent = null;
    }
  });

  afterEach(() => {
    if (originalContent) {
      writeFileSync(CONFIG_PATH, originalContent);
    } else {
      try { unlinkSync(CONFIG_PATH); } catch { /* ignore */ }
    }
  });

  it("returns empty object when file does not exist", () => {
    try { unlinkSync(CONFIG_PATH); } catch { /* ignore */ }
    assert.deepEqual(getConfig(), {});
  });

  it("returns apiToken from config", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ apiToken: "test-token" }));
    assert.deepEqual(getConfig(), { apiToken: "test-token" });
  });
});
