import { readFileSync } from "node:fs";

export interface MockEndpoint {
  method: "GET" | "POST" | "DELETE";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  status?: number;
  response: unknown;
}

interface MockDefinition {
  endpoints: MockEndpoint[];
}

let cache: MockDefinition | null = null;

export function isMockEnabled(): boolean {
  return process.env["MAIMEMO_API_MOCK"] === "1";
}

function load(): MockDefinition {
  if (cache) return cache;
  const filePath = process.env["MAIMEMO_API_MOCK_FILE"];
  if (!filePath) {
    throw new Error(
      "MAIMEMO_API_MOCK_FILE environment variable is required when MAIMEMO_API_MOCK=1",
    );
  }
  cache = JSON.parse(readFileSync(filePath, "utf-8")) as MockDefinition;
  return cache;
}

function deepPartialMatch(
  expected: unknown,
  actual: unknown,
): boolean {
  if (expected === undefined) return true;
  if (expected === actual) return true;
  if (expected === null && actual === null) return true;
  if (typeof expected !== typeof actual) return false;
  if (expected === null || actual === null) return false;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (expected.length !== actual.length) return false;
    return expected.every((v, i) => deepPartialMatch(v, actual[i]));
  }
  if (typeof expected === "object") {
    if (typeof actual !== "object" || actual === null) return false;
    const e = expected as Record<string, unknown>;
    const a = actual as Record<string, unknown>;
    for (const key of Object.keys(e)) {
      if (!deepPartialMatch(e[key], a[key])) return false;
    }
    return true;
  }
  return false;
}

export function findEndpoint(
  method: string,
  pathname: string,
  query?: Record<string, string>,
  body?: unknown,
): MockEndpoint {
  const def = load();
  const matches = def.endpoints.filter((ep) => {
    if (ep.method.toUpperCase() !== method.toUpperCase()) return false;
    if (ep.path !== pathname) return false;
    if (ep.query) {
      if (!query) return false;
      for (const [k, v] of Object.entries(ep.query)) {
        if (query[k] !== v) return false;
      }
    }
    if (ep.body !== undefined) {
      if (!deepPartialMatch(ep.body, body)) return false;
    }
    return true;
  });

  if (matches.length === 0) {
    const qs = query ? "?" + new URLSearchParams(query).toString() : "";
    const bodyHint =
      body !== undefined ? " body=" + JSON.stringify(body).slice(0, 80) : "";
    throw new Error(
      `No mock endpoint matched ${method} ${pathname}${qs}${bodyHint}`,
    );
  }

  return matches[0]!;
}

export function clearCache(): void {
  cache = null;
}
