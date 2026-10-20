import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import yargs from "yargs";
import { authCmd } from "../../src/commands/auth.js";

const OIDC_ORIGIN = "https://accounts.maimemo.com";

const MOCK_OIDC_CONFIG = {
  issuer: "https://accounts.maimemo.com/oidc",
  authorization_endpoint: "https://accounts.maimemo.com/oidc/auth",
  token_endpoint: "https://accounts.maimemo.com/oidc/token",
  userinfo_endpoint: "https://accounts.maimemo.com/oidc/userinfo",
};

describe("authCmd", () => {
  it("exports a CommandModule with correct structure", () => {
    assert.equal(authCmd.command, "auth");
    assert.ok(typeof authCmd.describe === "string");
    assert.ok(typeof authCmd.builder === "function");
    assert.ok(typeof authCmd.handler === "function");
  });
});

describe("auth whoami", () => {
  let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;
  let mockAgent: MockAgent;
  let originalWrite: typeof process.stdout.write;
  let captured: string;

  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    captured = "";
    originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
      captured += chunk;
      return true;
    }) as typeof process.stdout.write;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    setGlobalDispatcher(originalDispatcher);
  });

  it("prints Name before UID(anonymized) in column output", async () => {
    mockAgent
      .get(OIDC_ORIGIN)
      .intercept({ path: "/oidc/.well-known/openid-configuration" })
      .reply(200, MOCK_OIDC_CONFIG);

    mockAgent
      .get(OIDC_ORIGIN)
      .intercept({ path: "/oidc/userinfo", method: "GET" })
      .reply(200, { sub: "user-123", name: "TestUser" });

    const prog = yargs()
      .exitProcess(false)
      .middleware((argv) => {
        (argv as any).token = "access-token";
        (argv as any)._tokenSource = "oidc";
      })
      .command(authCmd);

    await prog.parseAsync("auth whoami");

    assert.ok(
      captured.includes("Name\tUID(anonymized)\nTestUser\tuser-123\n"),
      captured,
    );
  });
});
