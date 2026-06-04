import { getConfig, writeConfig } from "../config.js";
import type { Config } from "../config.js";
import { refreshToken as oidcRefresh } from "./oidc.js";
import { printError } from "../output.js";

export type TokenSource = "flag" | "env" | "apiToken" | "oidc";
export type TokenResult = { token: string; source: TokenSource };

export async function resolveToken(opts: {
  token?: string | undefined;
}): Promise<TokenResult> {
  if (opts.token) {
    return { token: opts.token, source: "flag" };
  }

  const envToken = process.env["MAIMEMO_API_TOKEN"];
  if (envToken) {
    return { token: envToken, source: "env" };
  }

  const config = getConfig();

  if (config.apiToken) {
    return { token: config.apiToken, source: "apiToken" };
  }

  const oidcResult = await resolveOidcToken(config);
  if (oidcResult) {
    return oidcResult;
  }

  printError(
    "错误: 缺少 API Token。请通过 -T、MAIMEMO_API_TOKEN 环境变量提供 Token，或执行 memo-api auth login 登录。",
  );
  process.exit(1);
}


function isExpired(expireAt: number): boolean {
  return Date.now() / 1000 + 60 >= expireAt;
}

async function resolveOidcToken(config: Config): Promise<TokenResult | null> {
  if (!config.at) {
    return null;
  }

  if (!isExpired(config.at.expireAt)) {
    return { token: config.at.token, source: "oidc" };
  }

  if (!config.rt) {
    writeConfig({ apiToken: config.apiToken });
    printError("错误: 登录已过期，请重新执行 memo-api auth login");
    process.exit(1);
  }

  if (isExpired(config.rt.expireAt)) {
    writeConfig({ apiToken: config.apiToken });
    printError("错误: 登录已过期，请重新执行 memo-api auth login");
    process.exit(1);
  }

  try {
    const { at: newAt } = await oidcRefresh(config.rt.token);
    return { token: newAt.token, source: "oidc" };
  } catch {
    writeConfig({ apiToken: config.apiToken });
    printError("错误: 登录已过期，请重新执行 memo-api auth login");
    process.exit(1);
  }
}
