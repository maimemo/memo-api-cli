import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveToken } from "../../src/lib/auth.js";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_PATH = join(homedir(), ".config", "memo-api.json");

describe("resolveToken", () => {
  let savedEnv: string | undefined;

  beforeEach(() => {
    savedEnv = process.env["MAIMEMO_API_TOKEN"];
  });

  afterEach(() => {
    if (savedEnv) {
      process.env["MAIMEMO_API_TOKEN"] = savedEnv;
    } else {
      delete process.env["MAIMEMO_API_TOKEN"];
    }
    try { unlinkSync(CONFIG_PATH); } catch { /* ignore */ }
  });

  it("uses flag token as highest priority", () => {
    process.env["MAIMEMO_API_TOKEN"] = "env-token";
    const token = resolveToken({ token: "flag-token" });
    assert.equal(token, "flag-token");
  });

  it("falls back to env var", () => {
    process.env["MAIMEMO_API_TOKEN"] = "env-token";
    const token = resolveToken({});
    assert.equal(token, "env-token");
  });

  it("falls back to config file", () => {
    delete process.env["MAIMEMO_API_TOKEN"];
    mkdirSync(join(homedir(), ".config"), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({ apiToken: "config-token" }));
    const token = resolveToken({});
    assert.equal(token, "config-token");
  });

  it("exits when no token available", () => {
    delete process.env["MAIMEMO_API_TOKEN"];
    try { unlinkSync(CONFIG_PATH); } catch { /* ignore */ }

    const originalExit = process.exit;

    let exitCode = 0;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`exit ${code}`);
    }) as typeof process.exit;

    try {
      resolveToken({});
    } catch (e) {
      // expected - process.exit throws
    } finally {
      process.exit = originalExit;
    }

    assert.equal(exitCode, 1);
  });
});
