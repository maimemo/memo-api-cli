import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

describe("CLI e2e", () => {
  it("shows top-level help", async () => {
    const { stdout } = await execFileAsync("node", ["dist/index.js", "--help"]);
    assert.ok(stdout.includes("memo-api"));
    assert.ok(stdout.includes("调用墨墨开放 API"));
    assert.ok(stdout.includes("Commands:"));
    assert.ok(stdout.includes("note"));
    assert.ok(stdout.includes("interp"));
    assert.ok(stdout.includes("phrase"));
    assert.ok(stdout.includes("notepad"));
    assert.ok(stdout.includes("voc"));
    assert.ok(stdout.includes("study"));
  });

  it("shows resource-level help", async () => {
    const { stdout } = await execFileAsync("node", ["dist/index.js", "note", "--help"]);
    assert.ok(stdout.includes("助记查询与编辑"));
    assert.ok(stdout.includes("list"));
    assert.ok(stdout.includes("create"));
    assert.ok(stdout.includes("update"));
    assert.ok(stdout.includes("delete"));
  });

  it("shows action-level help", async () => {
    const { stdout } = await execFileAsync("node", ["dist/index.js", "note", "create", "--help"]);
    assert.ok(stdout.includes("为单词创建一条助记"));
    assert.ok(stdout.includes("--voc-id"));
    assert.ok(stdout.includes("--word"));
    assert.ok(stdout.includes("--type"));
    assert.ok(stdout.includes("--note"));
  });

  it("shows global options in resource-level help", async () => {
    const { stdout } = await execFileAsync("node", ["dist/index.js", "note", "--help"]);
    assert.ok(stdout.includes("Global Options:"));
    assert.ok(stdout.includes("--token"));
    assert.ok(stdout.includes("--output"));
    assert.ok(stdout.includes("--no-color"));
    assert.ok(stdout.includes("--verbose"));
    assert.ok(stdout.includes("--no-header"));
    assert.ok(stdout.includes("--fields"));
  });

  it("shows global options in action-level help", async () => {
    const { stdout } = await execFileAsync("node", ["dist/index.js", "note", "create", "--help"]);
    assert.ok(stdout.includes("Global Options:"));
    assert.ok(stdout.includes("--token"));
    assert.ok(stdout.includes("--no-header"));
    assert.ok(stdout.includes("--fields"));
  });

  it("accepts --no-header flag without parse error", async () => {
    try {
      await execFileAsync("node", ["dist/index.js", "note", "list", "-H", "-v", "test"]);
    } catch (err: any) {
      // will fail due to auth, but should NOT say "unknown option"
      assert.ok(!err.stderr?.includes("unknown option"), `unexpected parse error: ${err.stderr}`);
      assert.ok(err.stderr?.includes("错误") || err.stderr?.includes("Token") || err.code !== 0);
    }
  });

  it("accepts --fields flag without parse error", async () => {
    try {
      await execFileAsync("node", ["dist/index.js", "note", "list", "--fields", "id,note", "-v", "test"]);
    } catch (err: any) {
      assert.ok(!err.stderr?.includes("unknown option"), `unexpected parse error: ${err.stderr}`);
      assert.ok(err.stderr?.includes("错误") || err.stderr?.includes("Token") || err.code !== 0);
    }
  });

  it("accepts --no-header and --fields combined", async () => {
    try {
      await execFileAsync("node", [
        "dist/index.js", "note", "list",
        "-H", "--fields", "id,type,note",
        "-v", "test",
      ]);
    } catch (err: any) {
      assert.ok(!err.stderr?.includes("unknown option"));
      assert.ok(err.stderr?.includes("错误") || err.stderr?.includes("Token") || err.code !== 0);
    }
  });

  it("rejects unknown subcommand gracefully", async () => {
    try {
      await execFileAsync("node", ["dist/index.js", "unknown"]);
      assert.fail("should have thrown");
    } catch (err: any) {
      assert.ok(err.stderr.includes("unknown") || err.code !== 0);
    }
  });

  it("rejects missing required args with error", async () => {
    try {
      await execFileAsync("node", ["dist/index.js", "note", "list"]);
      assert.fail("should have thrown");
    } catch (err: any) {
      assert.ok(err.stderr.includes("错误") || err.code !== 0);
    }
  });

  it("supports --output json flag", async () => {
    const { stderr } = await execFileAsync("node", ["dist/index.js", "note", "list", "-v", "test", "-O", "json"], {
      timeout: 5000,
    }).catch((err: any) => ({ stderr: err.stderr ?? "" }));
    assert.ok(stderr.includes("错误") || stderr.includes("Token"));
  });
});
