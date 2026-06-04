import { createServer } from "node:http";
import { exec } from "node:child_process";
import type { IncomingMessage, ServerResponse, Server } from "node:http";
import type { Socket } from "node:net";
import * as client from "openid-client";
import type { Configuration } from "openid-client";
import type { TokenEntry } from "../config.js";
import { writeConfig, getConfig } from "../config.js";
import { printError, printInfo } from "../output.js";

const OIDC_CLIENT_ID = "6a2157c1fa31b7c875a8e4ba";
const OIDC_ISSUER = "https://accounts.maimemo.com/oidc";
const OIDC_REDIRECT_URI = "http://localhost:18884/callback";
const OIDC_SCOPE = "openid profile offline_access open.memo.content open.memo.study";
const CALLBACK_PORT = 18884;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;

let verbose = false;

export function setOidcVerbose(v: boolean): void {
  verbose = v;
}

function getCustomFetch(): undefined | ((...args: any[]) => any) {
  if (!verbose) return undefined;

  return async (input: any, init?: any): Promise<any> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = init?.method ?? "GET";
    process.stderr.write(`\n> ${method} ${url}\n`);
    if (init?.body) {
      const bodyStr = typeof init.body === "string" ? init.body : JSON.stringify(init.body);
      process.stderr.write(`> Body: ${bodyStr.length > 200 ? bodyStr.slice(0, 200) + "..." : bodyStr}\n`);
    }
    const res = await fetch(input, init);
    process.stderr.write(`< HTTP ${res.status} ${res.statusText}\n`);
    return res;
  };
}

async function discover(): Promise<Configuration> {
  const issuerUrl = new URL(OIDC_ISSUER);
  const config = await client.discovery(issuerUrl, OIDC_CLIENT_ID);
  const cf = getCustomFetch();
  if (cf) {
    config[client.customFetch] = cf;
  }
  return config;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openBrowser(url: string) {
  const platform = process.platform;
  const cmd =
    platform === "darwin" ? `open "${url}"` :
    platform === "win32" ? `start "" "${url}"` :
    `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) {
      printInfo(`无法自动打开浏览器，请手动复制以上 URL 访问。`);
    }
  });
}

export async function startLogin(): Promise<{
  at: TokenEntry;
  rt: TokenEntry;
  uid: string;
  name: string;
}> {
  const oidcConfig = await discover();

  const codeVerifier = client.randomPKCECodeVerifier();
  const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
  const state = client.randomState();
  const nonce = client.randomNonce();

  const authUrl = client.buildAuthorizationUrl(oidcConfig, {
    redirect_uri: OIDC_REDIRECT_URI,
    scope: OIDC_SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
    nonce,
    prompt: "consent",
  });

  type CallbackResult = {
    callbackUrl: string;
    res: ServerResponse;
  };

  const callbackData = await new Promise<CallbackResult>((resolve, reject) => {
    let server: Server | null = null;
    const sockets = new Set<Socket>();
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      cleanup();
      reject(new Error("登录超时，请重试"));
    }, LOGIN_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      if (server) {
        server.close();
        if (!timedOut) {
          for (const s of sockets) {
            s.destroy();
          }
        }
        sockets.clear();
      }
    }

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const reqUrl = new URL(req.url ?? "/", `http://localhost:${CALLBACK_PORT}`);

      if (reqUrl.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const qs = reqUrl.searchParams;
      const error = qs.get("error");
      if (error) {
        const description = qs.get("error_description") ?? error;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html><html><body><p>登录失败: ${escapeHtml(description)}</p><p>请关闭此页面。</p></body></html>`);
        cleanup();
        reject(new Error(description));
        return;
      }

      const code = qs.get("code");
      const callbackState = qs.get("state");

      if (!code || !callbackState) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<!DOCTYPE html><html><body><p>缺少必要参数。</p><p>请关闭此页面。</p></body></html>");
        cleanup();
        reject(new Error("OIDC 回调缺少 code 或 state 参数"));
        return;
      }

      resolve({ callbackUrl: `http://localhost:${CALLBACK_PORT}${req.url}`, res });
      clearTimeout(timeout);
      server!.close();
    });

    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
    });

    server.listen(CALLBACK_PORT, "127.0.0.1", () => {
      const urlStr = authUrl.href;
      printInfo(`正在打开浏览器进行登录，如未自动打开请手动访问：\n${urlStr}`);
      openBrowser(urlStr);
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        printError("端口 18884 被占用，请关闭占用程序后重试");
        process.exit(1);
      }
      cleanup();
      reject(err);
    });
  });

  const callbackUrl = new URL(callbackData.callbackUrl);
  const callbackState = callbackUrl.searchParams.get("state");

  if (callbackState !== state) {
    callbackData.res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    callbackData.res.end("<!DOCTYPE html><html><body><p>状态验证失败。</p><p>请关闭此页面。</p></body></html>");
    throw new Error("OIDC state 不匹配，可能受到 CSRF 攻击");
  }

  const currentUrl = new URL(callbackData.callbackUrl);

  try {
    const tokens = await client.authorizationCodeGrant(
      oidcConfig,
      currentUrl,
      {
        expectedState: state,
        expectedNonce: nonce,
        pkceCodeVerifier: codeVerifier,
      },
    );

    const claims = tokens.claims();
    const uid = claims?.sub ?? "";
    let name = (claims as Record<string, unknown> | undefined)?.["name"] as string ?? "";

    if (!name) {
      try {
        const userInfo = await fetchUserInfo(tokens.access_token, oidcConfig);
        name = userInfo.name;
      } catch {
      }
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresIn = tokens.expiresIn() ?? 3600;
    const atExpireAt = now + expiresIn;

    const returnedRefreshToken = tokens.refresh_token;
    if (!returnedRefreshToken) {
      throw new Error("OIDC 未返回 refresh_token，请检查 scope 是否包含 offline_access");
    }

    const rtExpiresAt = now + (60 * 60 * 24 * 90);

    const at: TokenEntry = {
      token: tokens.access_token,
      expireAt: atExpireAt,
    };
    const rt: TokenEntry = {
      token: returnedRefreshToken,
      expireAt: rtExpiresAt,
    };

    const existingConfig = getConfig();
    writeConfig({
      apiToken: existingConfig.apiToken,
      at,
      rt,
    });

    callbackData.res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    callbackData.res.end("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>登录成功</title></head><body><h1>登录成功</h1><p>可以关闭此页面。</p></body></html>");

    return { at, rt, uid, name };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    callbackData.res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    callbackData.res.end(`<!DOCTYPE html><html><body><p>登录失败: ${escapeHtml(message)}</p><p>请关闭此页面。</p></body></html>`);
    throw err;
  }
}

export async function refreshToken(rt: string): Promise<{ at: TokenEntry }> {
  const oidcConfig = await discover();

  const tokens = await client.refreshTokenGrant(oidcConfig, rt);

  const now = Math.floor(Date.now() / 1000);
  const expiresIn = tokens.expiresIn() ?? 3600;
  const atExpireAt = now + expiresIn;

  const at: TokenEntry = {
    token: tokens.access_token,
    expireAt: atExpireAt,
  };

  const existingConfig = getConfig();
  writeConfig({
    apiToken: existingConfig.apiToken,
    at,
    rt: existingConfig.rt,
  });

  return { at };
}

async function fetchUserInfo(at: string, config?: Configuration): Promise<{
  uid: string;
  name: string;
  sub: string;
}> {
  const oidcConfig = config ?? await discover();

  const userInfo = await client.fetchUserInfo(oidcConfig, at, client.skipSubjectCheck);

  const info = userInfo as Record<string, unknown>;
  const sub = String(info["sub"] ?? "");
  const name = String(info["name"] ?? "");

  return { uid: sub, name, sub };
}

export { fetchUserInfo as getUserInfo };
