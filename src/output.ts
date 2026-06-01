import chalk from "chalk";
import stringWidth from "string-width";
import { DEFAULT_FIELDS } from "./lib/default-fields.js";

let useColor = true;
let showHeader = true;
let selectedFields: string[] = [];
let fieldsMode: "replace" | "add" | "remove" = "replace";

export function setColor(enabled: boolean): void {
  useColor = enabled;
  chalk.level = enabled ? 1 : 0;
}

export function setShowHeader(v: boolean): void {
  showHeader = v;
}

export function setSelectedFields(v: string): void {
  if (!v) {
    selectedFields = [];
    fieldsMode = "replace";
    return;
  }
  const trimmed = v.trim();
  if (trimmed.startsWith("+")) {
    fieldsMode = "add";
    selectedFields = trimmed
      .slice(1)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else if (trimmed.startsWith("-")) {
    fieldsMode = "remove";
    selectedFields = trimmed
      .slice(1)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  } else {
    fieldsMode = "replace";
    selectedFields = trimmed
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function printError(message: string): void {
  process.stderr.write(useColor ? chalk.red(message) + "\n" : message + "\n");
}

export function printSuccess(message: string): void {
  process.stderr.write(useColor ? chalk.green(message) + "\n" : message + "\n");
}

export function printInfo(message: string): void {
  process.stderr.write(useColor ? chalk.gray(message) + "\n" : message + "\n");
}

function flattenValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.map(flattenValue).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function formatTime(raw: string): string {
  const date = new Date(raw);
  if (isNaN(date.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function colorizeStatus(value: string): string {
  if (!useColor) return value;
  const upper = value.toUpperCase();
  if (upper === "PUBLISHED" || upper === "FAMILIAR" || upper === "WELL_FAMILIAR") return chalk.green(value);
  if (upper === "VAGUE" || upper === "STICKING") return chalk.yellow(value);
  if (upper === "FORGET" || upper === "DELETED") return chalk.red(value);
  if (upper.endsWith("_UNSPECIFIED") || upper === "UNPUBLISHED") return chalk.gray(value);
  return value;
}

function colorizeBoolean(value: string): string {
  if (!useColor) return value;
  if (value === "true") return chalk.green(value);
  return value;
}

function toDisplayValue(v: unknown, colKey: string): string {
  const flat = flattenValue(v);
  if (!flat) return flat;
  if (colKey.endsWith("time") || colKey.endsWith("date")) return formatTime(flat);
  if (colKey === "is_new" || colKey === "is_finished") return colorizeBoolean(flat);
  if (colKey === "status" || colKey === "last_response" || colKey === "first_response") return colorizeStatus(flat);
  return flat;
}

function formatCell(raw: string, maxWidth: number): string {
  const collapsed = raw.replace(/\n/g, " ");
  if (stringWidth(collapsed) <= maxWidth) return collapsed;
  return collapsed.slice(0, maxWidth) + "...";
}

function padCell(s: string, w: number): string {
  return s + " ".repeat(Math.max(0, w - stringWidth(s)));
}

function resolveKeys(allKeys: string[], entity?: string): string[] {
  if (selectedFields.length > 0) {
    switch (fieldsMode) {
      case "replace":
        return selectedFields.filter((f) => allKeys.includes(f));
      case "add": {
        const base = entity && DEFAULT_FIELDS[entity]
          ? DEFAULT_FIELDS[entity]!.filter((f) => allKeys.includes(f))
          : allKeys;
        return [
          ...base,
          ...selectedFields.filter((f) => !base.includes(f)),
        ];
      }
      case "remove":
        return allKeys.filter((k) => !selectedFields.includes(k));
    }
  }
  if (entity && DEFAULT_FIELDS[entity]) {
    return DEFAULT_FIELDS[entity]!.filter((f) => allKeys.includes(f));
  }
  return allKeys;
}

export function printColumns(rows: Record<string, unknown>[], entity?: string): void {
  if (rows.length === 0) {
    printInfo("(empty)");
    return;
  }

  const allKeys = Object.keys(rows[0]!);
  const keys = resolveKeys(allKeys, entity);

  const perColumnMax = selectedFields.length > 0 ? Infinity : 200;

  const widths = keys.map((k) =>
    Math.max(
      stringWidth(k),
      ...rows.map((r) => stringWidth(formatCell(toDisplayValue(r[k], k), perColumnMax))),
    ),
  );

  if (showHeader) {
    const header = useColor
      ? keys.map((k, i) => chalk.bold(padCell(k, widths[i]!))).join("\t")
      : keys.map((k, i) => padCell(k, widths[i]!)).join("\t");
    process.stdout.write(header + "\n");
  }

  for (const row of rows) {
    const line = keys
      .map((k, i) => padCell(formatCell(toDisplayValue(row[k], k), perColumnMax), widths[i]!))
      .join("\t");
    process.stdout.write(line + "\n");
  }
}
