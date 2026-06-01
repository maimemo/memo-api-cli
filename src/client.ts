import { printError } from "./output.js";

const BASE_URL = "https://open.maimemo.com/open/";
const TIMEOUT_MS = 30_000;

let verbose = false;
export function setVerbose(v: boolean): void {
  verbose = v;
}

type FetchOptions = {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string>;
  body?: unknown;
};

export async function api<T>(
  path: string,
  options: FetchOptions,
  token: string,
): Promise<T> {
  const url = new URL(path.replace(/^\//, ""), BASE_URL);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      url.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  if (verbose) {
    process.stderr.write(`\n> ${options.method ?? "GET"} ${url.pathname}${url.search ? "?" + url.search : ""}\n`);
    process.stderr.write(`> Host: ${url.host}\n`);
    process.stderr.write(`> Authorization: Bearer ${token.slice(0, 8)}...\n`);
    if (options.body !== undefined) {
      const bodyStr = JSON.stringify(options.body);
      process.stderr.write(`> Content-Type: application/json\n`);
      process.stderr.write(`> Body: ${bodyStr.length > 200 ? bodyStr.slice(0, 200) + "..." : bodyStr}\n`);
    }
  }

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const init: RequestInit = {
      method: options.method ?? "GET",
      headers,
      signal: controller.signal,
    };

    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const res = await fetch(url.toString(), init);

    if (verbose) {
      process.stderr.write(`\n< HTTP ${res.status} ${res.statusText}\n`);
    }

    if (!res.ok) {
      await printResponseErrors(res);
      process.exit(1);
    }

    const text = await res.text();

    if (verbose) {
      const preview = text.length > 500 ? text.slice(0, 500) + "..." : text;
      process.stderr.write(`< ${preview}\n\n`);
    }

    if (!text) return {} as T;

    const json = JSON.parse(text) as { errors?: unknown[]; data?: T; success?: boolean };

    if (json.errors && json.errors.length > 0) {
      for (const e of json.errors) {
        printError(formatError(e));
      }
      process.exit(1);
    }

    if (json.success === false) {
      printError("错误: 请求未成功");
      process.exit(1);
    }

    return (json.data as T) ?? (json as unknown as T);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      printError("错误: 请求超时");
      process.exit(1);
    }
    if (err instanceof TypeError && err.message.includes("fetch")) {
      printError("错误: 网络连接失败");
      process.exit(1);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function formatError(e: unknown): string {
  if (typeof e !== "object" || e === null) return "错误: " + String(e);
  const obj = e as Record<string, unknown>;
  const code = obj.code ? String(obj.code) + ": " : "";
  const msg = obj.message ? String(obj.message) : JSON.stringify(e);
  return "错误: " + code + msg;
}

async function printResponseErrors(res: Response): Promise<void> {
  try {
    const body = await res.text();
    if (body) {
      const json = JSON.parse(body) as { errors?: unknown[]; success?: boolean };
      if (json.errors && json.errors.length > 0) {
        for (const e of json.errors) {
          printError(formatError(e));
        }
        return;
      }
    }
  } catch {
    // body is not JSON or empty, fall through to generic message
  }
  printError(`错误: HTTP ${res.status}: ${httpErrorLabel(res.status)}`);
}

function httpErrorLabel(status: number): string {
  switch (status) {
    case 401:
      return "认证失败，请检查 API Token";
    case 404:
      return "资源不存在";
    case 500:
      return "服务器内部错误";
    default:
      return `请求失败`;
  }
}
