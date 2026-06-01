import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { confirmDelete } from "../../src/lib/confirm.js";

describe("confirmDelete", () => {
  it("returns true when force is set", async () => {
    const result = await confirmDelete("note", "id123", true);
    assert.equal(result, true);
  });

  describe("non-TTY without --force", () => {
    let originalIsTTY: boolean | undefined;
    let originalExit: typeof process.exit;

    beforeEach(() => {
      originalIsTTY = process.stdin.isTTY;
      originalExit = process.exit;
      Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
    });

    afterEach(() => {
      if (originalIsTTY !== undefined) {
        Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
      }
      process.exit = originalExit;
    });

    it("exits with code 1 on non-TTY without force", async () => {
      let exitCode = 0;
      process.exit = ((code?: number) => {
        exitCode = code ?? 0;
        throw new Error(`exit ${code}`);
      }) as typeof process.exit;

      try {
        await confirmDelete("note", "id123", false);
      } catch {
        // expected
      }

      assert.equal(exitCode, 1);
    });
  });
});
