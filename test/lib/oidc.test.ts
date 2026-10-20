import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshToken, getUserInfo } from "../../src/lib/oidc.js";

const OIDC_ORIGIN = "https://accounts.maimemo.com";

const MOCK_OIDC_CONFIG = {
  issuer: "https://accounts.maimemo.com/oidc",
  authorization_endpoint: "https://accounts.maimemo.com/oidc/auth",
  token_endpoint: "https://accounts.maimemo.com/oidc/token",
  userinfo_endpoint: "https://accounts.maimemo.com/oidc/userinfo",
};

let mockAgent: MockAgent;
let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;

describe("refreshToken", () => {
  let tmpDir: string;
  let CONFIG_PATH: string;
  let savedConfigPath: string | undefined;

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    savedConfigPath = process.env["MEMO_API_CONFIG_PATH"];
    tmpDir = mkdtempSync(join(tmpdir(), "memo-api-oidc-test-"));
    CONFIG_PATH = join(tmpDir, "memo-api.json");
    process.env["MEMO_API_CONFIG_PATH"] = CONFIG_PATH;
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
    if (savedConfigPath === undefined) {
      delete process.env["MEMO_API_CONFIG_PATH"];
    } else {
      process.env["MEMO_API_CONFIG_PATH"] = savedConfigPath;
    }
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("refreshes access token and writes new at to config", async () => {
    const now = Math.floor(Date.now() / 1000);

    mockAgent
      .get(OIDC_ORIGIN)
      .intercept({ path: "/oidc/.well-known/openid-configuration" })
      .reply(200, MOCK_OIDC_CONFIG);

    mockAgent
      .get(OIDC_ORIGIN)
      .intercept({ path: "/oidc/token", method: "POST" })
      .reply(200, {
        access_token: "new-access-token",
        token_type: "Bearer",
        expires_in: 3600,
      });

    writeFileSync(CONFIG_PATH, JSON.stringify({
      at: { token: "old-at", expireAt: now - 100 },
      rt: { token: "refresh-token", expireAt: now + 86400 },
    }));

    const result = await refreshToken("refresh-token");

    assert.equal(result.at.token, "new-access-token");
    assert.ok(result.at.expireAt > now);
  });

  it("throws when token endpoint returns error", async () => {
    mockAgent
      .get(OIDC_ORIGIN)
      .intercept({ path: "/oidc/.well-known/openid-configuration" })
      .reply(200, MOCK_OIDC_CONFIG);

    mockAgent
      .get(OIDC_ORIGIN)
      .intercept({ path: "/oidc/token", method: "POST" })
      .reply(400, { error: "invalid_grant" });

    await assert.rejects(
      () => refreshToken("bad-refresh-token"),
    );
  });
});

describe("getUserInfo", () => {
  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
  });

  it("returns uid and name from userinfo", async () => {
    mockAgent
      .get(OIDC_ORIGIN)
      .intercept({ path: "/oidc/.well-known/openid-configuration" })
      .reply(200, MOCK_OIDC_CONFIG);

    mockAgent
      .get(OIDC_ORIGIN)
      .intercept({ path: "/oidc/userinfo", method: "GET" })
      .reply(200, { sub: "user-123", name: "TestUser" });

    const result = await getUserInfo("access-token");

    assert.equal(result.uid, "user-123");
    assert.equal(result.name, "TestUser");
    assert.equal(result.sub, "user-123");
  });

  it("returns empty name when not provided", async () => {
    mockAgent
      .get(OIDC_ORIGIN)
      .intercept({ path: "/oidc/.well-known/openid-configuration" })
      .reply(200, MOCK_OIDC_CONFIG);

    mockAgent
      .get(OIDC_ORIGIN)
      .intercept({ path: "/oidc/userinfo", method: "GET" })
      .reply(200, { sub: "user-123" });

    const result = await getUserInfo("access-token");

    assert.equal(result.uid, "user-123");
    assert.equal(result.name, "");
  });
});
