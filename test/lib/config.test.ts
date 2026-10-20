import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfig, writeConfig } from "../../src/config.js";

let tmpDir: string;
let CONFIG_PATH: string;
let savedConfigPath: string | undefined;

describe("config", () => {
  beforeEach(() => {
    savedConfigPath = process.env["MEMO_API_CONFIG_PATH"];
    tmpDir = mkdtempSync(join(tmpdir(), "memo-api-config-test-"));
    CONFIG_PATH = join(tmpDir, "memo-api.json");
    process.env["MEMO_API_CONFIG_PATH"] = CONFIG_PATH;
  });

  afterEach(() => {
    if (savedConfigPath === undefined) {
      delete process.env["MEMO_API_CONFIG_PATH"];
    } else {
      process.env["MEMO_API_CONFIG_PATH"] = savedConfigPath;
    }
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty object when file does not exist", () => {
    assert.deepEqual(getConfig(), {});
  });

  it("returns apiToken from config", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ apiToken: "test-token" }));
    assert.deepEqual(getConfig(), { apiToken: "test-token" });
  });

  it("returns OIDC tokens from config", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({
      at: { token: "at-token", expireAt: 1000 },
      rt: { token: "rt-token", expireAt: 2000 },
    }));
    const config = getConfig();
    assert.equal(config.at?.token, "at-token");
    assert.equal(config.at?.expireAt, 1000);
    assert.equal(config.rt?.token, "rt-token");
    assert.equal(config.rt?.expireAt, 2000);
  });

  it("writeConfig writes full config", () => {
    writeConfig({ apiToken: "written-token" });
    const content = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    assert.equal(content.apiToken, "written-token");
  });

  it("writeConfig writes at and rt tokens", () => {
    writeConfig({
      apiToken: "api-token",
      at: { token: "access", expireAt: 1000 },
      rt: { token: "refresh", expireAt: 2000 },
    });
    const config = getConfig();
    assert.equal(config.apiToken, "api-token");
    assert.equal(config.at?.token, "access");
    assert.equal(config.at?.expireAt, 1000);
    assert.equal(config.rt?.token, "refresh");
    assert.equal(config.rt?.expireAt, 2000);
  });

  it("writeConfig sets file permissions to 0600", () => {
    writeConfig({ apiToken: "perm-test" });
    const mode = statSync(CONFIG_PATH).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it("writeConfig overwrites existing config completely", () => {
    writeConfig({ apiToken: "old", at: { token: "old-at", expireAt: 1000 } });
    writeConfig({ apiToken: "keep", at: { token: "new-at", expireAt: 2000 } });
    const config = getConfig();
    assert.equal(config.apiToken, "keep");
    assert.equal(config.at?.token, "new-at");
  });

  it("writeConfig clears OIDC tokens by omitting them", () => {
    writeConfig({
      apiToken: "test",
      at: { token: "at", expireAt: 1000 },
      rt: { token: "rt", expireAt: 2000 },
    });
    writeConfig({ apiToken: "test" });
    const config = getConfig();
    assert.equal(config.at, undefined);
    assert.equal(config.rt, undefined);
    assert.equal(config.apiToken, "test");
  });

  it("writeConfig does not leave tmp file", () => {
    writeConfig({ apiToken: "no-tmp" });
    assert.equal(existsSync(CONFIG_PATH + ".tmp"), false);
    assert.equal(existsSync(CONFIG_PATH), true);
  });

  it("returns empty object when JSON is corrupted", () => {
    writeFileSync(CONFIG_PATH, "{bad json", "utf-8");
    assert.deepEqual(getConfig(), {});
  });
});
