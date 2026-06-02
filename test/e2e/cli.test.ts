import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";

function execFileAsync(
  file: string,
  args: string[],
  options: { env?: Record<string, string>; input?: string; timeout?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      file,
      args,
      { env: options.env, timeout: options.timeout },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout, stderr }));
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
    child.stdin!.end(options.input ?? "");
  });
}

describe("CLI e2e", () => {
  it("shows top-level help", async () => {
    const { stdout } = await execFileAsync("node", ["dist/index.js", "--help"], { timeout: 5000 });
    assert.ok(stdout.includes("memo-api"));
    assert.ok(stdout.includes("Commands:"));
    assert.ok(stdout.includes("note"));
    assert.ok(stdout.includes("interp"));
    assert.ok(stdout.includes("phrase"));
    assert.ok(stdout.includes("notepad"));
    assert.ok(stdout.includes("voc"));
    assert.ok(stdout.includes("study"));
  });

  it("shows resource-level help", async () => {
    const { stdout } = await execFileAsync("node", ["dist/index.js", "note", "--help"], { timeout: 5000 });
    assert.ok(stdout.includes("助记查询与编辑"));
    assert.ok(stdout.includes("list"));
    assert.ok(stdout.includes("create"));
    assert.ok(stdout.includes("update"));
    assert.ok(stdout.includes("delete"));
  });

  it("shows action-level help", async () => {
    const { stdout } = await execFileAsync("node", ["dist/index.js", "note", "create", "--help"], { timeout: 5000 });
    assert.ok(stdout.includes("为单词创建一条助记"));
    assert.ok(stdout.includes("--voc-id"));
    assert.ok(stdout.includes("--word"));
    assert.ok(stdout.includes("--type"));
    assert.ok(stdout.includes("--note"));
  });

  it("shows options in resource-level help", async () => {
    const { stdout } = await execFileAsync("node", ["dist/index.js", "note", "--help"], { timeout: 5000 });
    assert.ok(stdout.includes("Options:"));
    assert.ok(stdout.includes("--token"));
    assert.ok(stdout.includes("--output"));
    assert.ok(stdout.includes("--verbose"));
    assert.ok(stdout.includes("--no-header"));
    assert.ok(stdout.includes("--fields"));
  });

  it("shows options in action-level help", async () => {
    const { stdout } = await execFileAsync("node", ["dist/index.js", "note", "create", "--help"], { timeout: 5000 });
    assert.ok(stdout.includes("Options:"));
    assert.ok(stdout.includes("--token"));
    assert.ok(stdout.includes("--header"));
    assert.ok(stdout.includes("--fields"));
  });

  it("accepts --no-header flag without parse error", async () => {
    try {
      await execFileAsync("node", ["dist/index.js", "note", "list", "-H", "-v", "test"], {
        timeout: 5000,
        env: { ...process.env, MAIMEMO_API_TOKEN: "test" },
      });
    } catch (err: any) {
      assert.ok(!err.stderr?.includes("Unknown"), `unexpected parse error: ${err.stderr}`);
      assert.ok(err.stderr?.includes("错误") || err.code !== 0);
    }
  });

  it("accepts --fields flag without parse error", async () => {
    try {
      await execFileAsync("node", ["dist/index.js", "note", "list", "--fields", "id,note", "-v", "test"], {
        timeout: 5000,
        env: { ...process.env, MAIMEMO_API_TOKEN: "test" },
      });
    } catch (err: any) {
      assert.ok(!err.stderr?.includes("Unknown"), `unexpected parse error: ${err.stderr}`);
      assert.ok(err.stderr?.includes("错误") || err.code !== 0);
    }
  });

  it("accepts --no-header and --fields combined", async () => {
    try {
      await execFileAsync("node", [
        "dist/index.js", "note", "list",
        "-H", "--fields", "id,type,note",
        "-v", "test",
      ], {
        timeout: 5000,
        env: { ...process.env, MAIMEMO_API_TOKEN: "test" },
      });
    } catch (err: any) {
      assert.ok(!err.stderr?.includes("Unknown"));
      assert.ok(err.stderr?.includes("错误") || err.code !== 0);
    }
  });

  it("rejects unknown subcommand gracefully", async () => {
    try {
      await execFileAsync("node", ["dist/index.js", "unknown"], { timeout: 5000 });
      assert.fail("should have thrown");
    } catch (err: any) {
      assert.ok(
        err.stderr.includes("Unknown") || err.stderr.includes("unknown") || err.code !== 0,
        `unexpected output: ${err.stderr}`,
      );
    }
  });

  it("rejects missing required args with error", async () => {
    try {
      await execFileAsync("node", ["dist/index.js", "note", "list"], { timeout: 5000 });
      assert.fail("should have thrown");
    } catch (err: any) {
      assert.ok(err.stderr.includes("错误") || err.code !== 0);
    }
  });

  it("supports --output json flag", async () => {
    const result = await execFileAsync("node", ["dist/index.js", "note", "list", "-v", "test", "-O", "json"], {
      timeout: 5000,
      env: { ...process.env, MAIMEMO_API_TOKEN: "test" },
    }).catch((err: any) => ({ stderr: err.stderr ?? "" }));
    assert.ok(result.stderr.includes("错误"));
  });
});
