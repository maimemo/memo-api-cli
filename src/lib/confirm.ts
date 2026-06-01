import { createInterface } from "node:readline";
import { printInfo } from "../output.js";

export async function confirmDelete(
  resource: string,
  id: string,
  force?: boolean,
): Promise<boolean> {
  if (force) return true;

  if (!process.stdin.isTTY) {
    printInfo("错误: stdin 非 TTY 且未指定 --force");
    process.exit(1);
  }

  const answer = await ask(`Delete ${resource} ${id}? (y/N) `);
  return answer.toLowerCase() === "y";
}

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
