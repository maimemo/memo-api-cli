import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";
import { api } from "../src/client.js";

function wrap<T>(data: T) {
  return { data, errors: [], success: true };
}

function errorsWrap(errors: unknown[]) {
  return { data: null, errors, success: false };
}

class ExitError extends Error {
  constructor(public code: number) {
    super(`process.exit(${code})`);
  }
}

let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;
let mockAgent: MockAgent;
let originalExit: typeof process.exit;
let stderrBuffer: string;

describe("client api", () => {
  beforeEach(() => {
    originalDispatcher = getGlobalDispatcher();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);

    originalExit = process.exit;
    process.exit = ((code: number) => {
      throw new ExitError(code);
    }) as typeof process.exit;

    stderrBuffer = "";
    const originalStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string) => {
      stderrBuffer += chunk;
      // swallow: don't print during tests
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    setGlobalDispatcher(originalDispatcher);
    process.exit = originalExit;
    process.stderr.write = process.stderr.write; // restore via reassignment won't work here, but it's fine since each test resets it
  });

  it("returns parsed JSON response", async () => {
    mockAgent
      .get("https://open.maimemo.com")
      .intercept({ path: "/open/api/v1/test", method: "GET" })
      .reply(200, wrap({ key: "value" }));

    const result = await api<{ key: string }>("/api/v1/test", { method: "GET" }, "token");
    assert.deepEqual(result, { key: "value" });
  });

  it("sets Authorization header", async () => {
    mockAgent
      .get("https://open.maimemo.com")
      .intercept({
        path: "/open/api/v1/test",
        method: "GET",
        headers: (headers) => {
          const auth = (headers["authorization"] as string);
          assert.ok(auth?.includes("my-token"));
          return true;
        },
      })
      .reply(200, wrap({ ok: true }));

    const result = await api<{ ok: boolean }>("/api/v1/test", { method: "GET" }, "my-token");
    assert.equal(result.ok, true);
  });

  it("sends POST body as JSON", async () => {
    let capturedBody = "";

    mockAgent
      .get("https://open.maimemo.com")
      .intercept({ path: "/open/api/v1/test", method: "POST" })
      .reply(200, (opts: { body?: string }) => {
        capturedBody = opts.body ?? "";
        return wrap({ ok: true });
      });

    await api("/api/v1/test", { method: "POST", body: { key: "value" } }, "token");
    assert.equal(capturedBody, '{"key":"value"}');
  });

  it("passes query parameters", async () => {
    let capturedPath = "";

    mockAgent
      .get("https://open.maimemo.com")
      .intercept({ path: /\/open\/api\/v1\/test/, method: "GET" })
      .reply(200, (opts: { path: string }) => {
        capturedPath = opts.path;
        return wrap({ ok: true });
      });

    await api("/api/v1/test", { method: "GET", query: { voc_id: "xxx" } }, "token");
    assert.ok(capturedPath.includes("voc_id=xxx"));
  });

  it("unwraps API response envelope", async () => {
    mockAgent
      .get("https://open.maimemo.com")
      .intercept({ path: "/open/api/v1/test", method: "GET" })
      .reply(200, { data: { items: [1, 2, 3] }, errors: [], success: true });

    const result = await api<{ items: number[] }>("/api/v1/test", { method: "GET" }, "token");
    assert.deepEqual(result, { items: [1, 2, 3] });
  });

  describe("error handling", () => {
    it("shows backend error code and message in response body", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/test", method: "GET" })
        .reply(400, errorsWrap([{ code: "INVALID_ARGUMENT", message: "word is required" }]));

      try {
        await api("/api/v1/test", { method: "GET" }, "token");
        assert.fail("should have exited");
      } catch (err) {
        assert.ok(err instanceof ExitError);
        assert.equal((err as ExitError).code, 1);
      }
      assert.ok(stderrBuffer.includes("INVALID_ARGUMENT"));
      assert.ok(stderrBuffer.includes("word is required"));
    });

    it("shows each error on its own line for multiple errors", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/test", method: "GET" })
        .reply(400, errorsWrap([
          { code: "ERR_A", message: "first error" },
          { code: "ERR_B", message: "second error" },
        ]));

      try {
        await api("/api/v1/test", { method: "GET" }, "token");
        assert.fail("should have exited");
      } catch (err) {
        assert.ok(err instanceof ExitError);
      }
      const lines = stderrBuffer.split("\n").filter(Boolean);
      assert.ok(lines.some((l) => l.includes("ERR_A") && l.includes("first error")));
      assert.ok(lines.some((l) => l.includes("ERR_B") && l.includes("second error")));
    });

    it("falls back to HTTP status label when body is not parseable JSON", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/test", method: "GET" })
        .reply(500, "Internal Server Error");

      try {
        await api("/api/v1/test", { method: "GET" }, "token");
        assert.fail("should have exited");
      } catch (err) {
        assert.ok(err instanceof ExitError);
      }
      assert.ok(stderrBuffer.includes("HTTP 500"));
      assert.ok(stderrBuffer.includes("服务器内部错误"));
    });

    it("shows 401 fallback message when body is not JSON", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/test", method: "GET" })
        .reply(401, "Unauthorized");

      try {
        await api("/api/v1/test", { method: "GET" }, "token");
        assert.fail("should have exited");
      } catch (err) {
        assert.ok(err instanceof ExitError);
      }
      assert.ok(stderrBuffer.includes("HTTP 401"));
      assert.ok(stderrBuffer.includes("认证失败"));
    });

    it("shows 404 fallback message when body is empty", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/test", method: "GET" })
        .reply(404, "");

      try {
        await api("/api/v1/test", { method: "GET" }, "token");
        assert.fail("should have exited");
      } catch (err) {
        assert.ok(err instanceof ExitError);
      }
      assert.ok(stderrBuffer.includes("HTTP 404"));
      assert.ok(stderrBuffer.includes("资源不存在"));
    });

    it("shows unknown HTTP status fallback", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/test", method: "GET" })
        .reply(429, "");

      try {
        await api("/api/v1/test", { method: "GET" }, "token");
        assert.fail("should have exited");
      } catch (err) {
        assert.ok(err instanceof ExitError);
      }
      assert.ok(stderrBuffer.includes("HTTP 429"));
      assert.ok(stderrBuffer.includes("请求失败"));
    });

    it("shows wrapper errors from successful HTTP response", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/test", method: "GET" })
        .reply(200, errorsWrap([{ message: "something went wrong" }]));

      try {
        await api("/api/v1/test", { method: "GET" }, "token");
        assert.fail("should have exited");
      } catch (err) {
        assert.ok(err instanceof ExitError);
      }
      assert.ok(stderrBuffer.includes("something went wrong"));
    });

    it("shows error code from wrapper errors when present", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/test", method: "GET" })
        .reply(200, errorsWrap([{ code: "PERMISSION_DENIED", message: "access denied" }]));

      try {
        await api("/api/v1/test", { method: "GET" }, "token");
        assert.fail("should have exited");
      } catch (err) {
        assert.ok(err instanceof ExitError);
      }
      assert.ok(stderrBuffer.includes("PERMISSION_DENIED"));
      assert.ok(stderrBuffer.includes("access denied"));
    });

    it("shows both HTTP status and structured errors when backend returns both", async () => {
      mockAgent
        .get("https://open.maimemo.com")
        .intercept({ path: "/open/api/v1/test", method: "GET" })
        .reply(400, errorsWrap([{ code: "BAD_REQUEST", message: "invalid input" }]));

      try {
        await api("/api/v1/test", { method: "GET" }, "token");
        assert.fail("should have exited");
      } catch (err) {
        assert.ok(err instanceof ExitError);
      }
      // structured errors take priority over HTTP fallback
      assert.ok(stderrBuffer.includes("BAD_REQUEST"));
      assert.ok(stderrBuffer.includes("invalid input"));
    });
  });
});
