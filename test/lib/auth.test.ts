import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveToken } from "../../src/lib/auth.js";
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_PATH = join(homedir(), ".config", "memo-api.json");

describe("resolveToken", () => {
  let savedEnv: string | undefined;
  let originalExit: typeof process.exit;

  beforeEach(() => {
    savedEnv = process.env["MAIMEMO_API_TOKEN"];
    originalExit = process.exit;
    try { unlinkSync(CONFIG_PATH); } catch { /* ignore */ }
  });

  afterEach(() => {
    if (savedEnv) {
      process.env["MAIMEMO_API_TOKEN"] = savedEnv;
    } else {
      delete process.env["MAIMEMO_API_TOKEN"];
    }
    process.exit = originalExit;
    try { unlinkSync(CONFIG_PATH); } catch { /* ignore */ }
  });

  it("uses flag token as highest priority", async () => {
    process.env["MAIMEMO_API_TOKEN"] = "env-token";
    const result = await resolveToken({ token: "flag-token" });
    assert.equal(result.token, "flag-token");
    assert.equal(result.source, "flag");
  });

  it("falls back to env var", async () => {
    process.env["MAIMEMO_API_TOKEN"] = "env-token";
    const result = await resolveToken({});
    assert.equal(result.token, "env-token");
    assert.equal(result.source, "env");
  });

  it("falls back to config file apiToken", async () => {
    delete process.env["MAIMEMO_API_TOKEN"];
    mkdirSync(join(homedir(), ".config"), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({ apiToken: "config-token" }));
    const result = await resolveToken({});
    assert.equal(result.token, "config-token");
    assert.equal(result.source, "apiToken");
  });

  it("exits when no token available", async () => {
    delete process.env["MAIMEMO_API_TOKEN"];

    let exitCode = 0;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`exit ${code}`);
    }) as typeof process.exit;

    try {
      await resolveToken({});
    } catch {
      // expected
    }

    assert.equal(exitCode, 1);
  });

  it("uses OIDC at when available and no other token", async () => {
    delete process.env["MAIMEMO_API_TOKEN"];
    const now = Math.floor(Date.now() / 1000);
    const futureExpire = now + 3600;
    mkdirSync(join(homedir(), ".config"), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({
      at: { token: "oidc-access-token", expireAt: futureExpire },
      rt: { token: "oidc-refresh-token", expireAt: futureExpire + 86400 },
    }));

    const result = await resolveToken({});
    assert.equal(result.token, "oidc-access-token");
    assert.equal(result.source, "oidc");
  });

  it("exits when OIDC at and rt are both expired", async () => {
    delete process.env["MAIMEMO_API_TOKEN"];
    const pastExpire = Math.floor(Date.now() / 1000) - 3600;
    mkdirSync(join(homedir(), ".config"), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({
      at: { token: "oidc-access-token", expireAt: pastExpire },
      rt: { token: "oidc-refresh-token", expireAt: pastExpire },
    }));

    let exitCode = 0;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`exit ${code}`);
    }) as typeof process.exit;

    try {
      await resolveToken({});
    } catch {
      // expected
    }

    assert.equal(exitCode, 1);
  });

  it("token priority: flag > env > apiToken > oidc", async () => {
    process.env["MAIMEMO_API_TOKEN"] = "env-token";
    const now = Math.floor(Date.now() / 1000);
    const futureExpire = now + 3600;
    mkdirSync(join(homedir(), ".config"), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify({
      apiToken: "config-token",
      at: { token: "oidc-token", expireAt: futureExpire },
    }));

    const result = await resolveToken({ token: "flag-token" });
    assert.equal(result.token, "flag-token");
    assert.equal(result.source, "flag");
  });
});
