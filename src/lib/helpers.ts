import type { Command } from "commander";

export function getToken(cmd: Command): string {
  return (cmd as Command & { _apiToken: string })._apiToken;
}

export function isJsonOutput(mode: string): boolean {
  return mode === "json";
}

export function resolveArrayArg<T extends string>(
  values: T[],
  stdinInput: string | null,
): T[] {
  if (!values.includes("-" as T)) return values;
  if (!stdinInput) return values.filter((v) => v !== "-");

  const lines = stdinInput
    .split("\n")
    .map((s) => s.trim() as T)
    .filter(Boolean);

  const result: T[] = [];
  for (const v of values) {
    if (v === "-") {
      for (const line of lines) result.push(line);
    } else {
      result.push(v);
    }
  }
  return result;
}
