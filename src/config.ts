import { readFileSync, writeFileSync, renameSync, chmodSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export type TokenEntry = {
  token: string;
  expireAt: number;
};

export type Config = {
  apiToken?: string;
  at?: TokenEntry;
  rt?: TokenEntry;
};

const DEFAULT_CONFIG_PATH = join(homedir(), ".config", "memo-api.json");

export function getConfigPath(): string {
  return process.env["MEMO_API_CONFIG_PATH"] || DEFAULT_CONFIG_PATH;
}

export function getConfig(): Config {
  try {
    const raw = readFileSync(getConfigPath(), "utf-8");
    return JSON.parse(raw) as Config;
  } catch {
    return {};
  }
}

export function writeConfig(config: Config): void {
  const configPath = getConfigPath();
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const tmpPath = configPath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600, flush: true });
  renameSync(tmpPath, configPath);
  chmodSync(configPath, 0o600);
}
