import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type Config = {
  apiToken?: string;
};

export function getConfig(): Config {
  try {
    const path = join(homedir(), ".config", "memo-api.json");
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as Config;
  } catch {
    return {};
  }
}
