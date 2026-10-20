import type { CommandModule, Argv } from "yargs";
import { api } from "../client.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError, printSuccess } from "../output.js";
import { isJsonOutput, resolveArrayArg } from "../lib/helpers.js";
import type { NotepadStatus } from "../types/notepad.js";
import type {
  CreateNotepadRequest,
  CreateNotepadResponse,
  GetNotepadResponse,
  UpdateNotepadRequest,
  UpdateNotepadResponse,
} from "../types/notepad.js";
import { confirmDelete } from "../lib/confirm.js";

interface NotepadListArgs {
  token: string;
  output: string;
  limit?: number;
  offset?: number;
  id?: string[];
}

const listBuilder = (yargs: Argv) =>
  yargs
    .option("limit", { alias: "l", type: "number", default: 10, description: "查询数量，默认 10" })
    .option("offset", { alias: "o", type: "number", default: 0, description: "跳过数量，默认 0" })
    .option("id", { alias: "I", type: "array", default: [] as string[], description: "按 ID 过滤（可重复）" });

const listHandler = async (argv: NotepadListArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let query: Record<string, string> = {};

  if (stdinJson && typeof stdinJson === "object") {
    const q = stdinJson as Record<string, unknown>;
    query = { limit: String(q.limit ?? "10"), offset: String(q.offset ?? "0") };
    if (Array.isArray(q.ids)) {
      q.ids.forEach((id, i) => { query[`ids[${i}]`] = String(id); });
    }
  } else {
    query = { limit: String(argv.limit), offset: String(argv.offset) };
    const resolvedIds = resolveArrayArg(argv.id ?? [], stdinInput);
    resolvedIds.forEach((id, i) => { query[`ids[${i}]`] = String(id); });
  }

  const res = await api<{ notepads: Array<Record<string, unknown>> }>(
    "/api/v1/memo/notepads",
    { method: "GET", query },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const rows = res.notepads.map((n) => ({
      ...n,
    }));
    printColumns(rows, "notepad_list");
  }
};

interface NotepadGetArgs {
  token: string;
  output: string;
  id: string;
}

const getBuilder = (yargs: Argv) =>
  yargs
    .positional("id", { type: "string", describe: "云词本 ID" });

const getHandler = async (argv: NotepadGetArgs) => {
  const token = (argv as any).token as string;

  const res = await api<GetNotepadResponse>(
    `/api/v1/memo/notepads/${argv.id}`,
    { method: "GET" },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const n = res.notepad;
    printColumns([
      { ...n },
    ], "notepad");
  }
};

interface NotepadCreateArgs {
  token: string;
  output: string;
  title?: string;
  content?: string;
  brief?: string;
  tag?: string[];
  status?: string;
}

const createBuilder = (yargs: Argv) =>
  yargs
    .option("title", { alias: "t", type: "string", description: "标题" })
    .option("content", { alias: "c", type: "string", description: "内容" })
    .option("brief", { alias: "b", type: "string", description: "简介" })
    .option("tag", { alias: "g", type: "array", default: [] as string[], description: "标签（可重复）" })
    .option("status", { alias: "s", type: "string", default: "PUBLISHED", description: "PUBLISHED 或 UNPUBLISHED" });

const createHandler = async (argv: NotepadCreateArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: CreateNotepadRequest;

  if (stdinJson && typeof stdinJson === "object") {
    body = stdinJson as CreateNotepadRequest;
  } else {
    if (!argv.title || !argv.content) {
      printError("错误: 缺少 --title 或 --content");
      process.exit(1);
    }

    const tags = resolveArrayArg(argv.tag ?? [], stdinInput);

    body = {
      notepad: {
        status: argv.status as NotepadStatus,
        content: argv.content,
        title: argv.title,
        brief: argv.brief ?? "",
        tags,
      },
    };
  }

  const res = await api<CreateNotepadResponse>(
    "/api/v1/memo/notepads",
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const n = res.notepad;
    printColumns([
      { ...n },
    ], "notepad");
  }
};

interface NotepadUpdateArgs {
  token: string;
  output: string;
  id: string;
  title?: string;
  content?: string;
  brief?: string;
  tag?: string[];
  status?: string;
}

const updateBuilder = (yargs: Argv) =>
  yargs
    .positional("id", { type: "string", describe: "云词本 ID" })
    .option("title", { alias: "t", type: "string", description: "标题" })
    .option("content", { alias: "c", type: "string", description: "内容" })
    .option("brief", { alias: "b", type: "string", description: "简介" })
    .option("tag", { alias: "g", type: "array", default: [] as string[], description: "标签（可重复）" })
    .option("status", { alias: "s", type: "string", description: "PUBLISHED / UNPUBLISHED / DELETED" });

const updateHandler = async (argv: NotepadUpdateArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: UpdateNotepadRequest;
  let resolvedId: string = argv.id;

  if (stdinJson && typeof stdinJson === "object") {
    const jsonAny = stdinJson as Record<string, unknown>;
    if (jsonAny["id"]) resolvedId = String(jsonAny["id"]);
    if (jsonAny["notepad"]) {
      body = { notepad: jsonAny["notepad"] as UpdateNotepadRequest["notepad"] };
    } else {
      body = stdinJson as UpdateNotepadRequest;
    }
  } else {
    if (!argv.title || !argv.content || !argv.status) {
      printError("错误: 缺少 --title 或 --content 或 --status");
      process.exit(1);
    }

    const tags = resolveArrayArg(argv.tag ?? [], stdinInput);

    body = {
      notepad: {
        status: argv.status as NotepadStatus,
        content: argv.content,
        title: argv.title,
        brief: argv.brief ?? "",
        tags,
      },
    };
  }

  const res = await api<UpdateNotepadResponse>(
    `/api/v1/memo/notepads/${resolvedId}`,
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const n = res.notepad;
    printColumns([
      { ...n },
    ], "notepad");
  }
};

interface NotepadDeleteArgs {
  token: string;
  id: string;
  force?: boolean;
}

const deleteBuilder = (yargs: Argv) =>
  yargs
    .positional("id", { type: "string", describe: "云词本 ID" })
    .option("force", { alias: "f", type: "boolean", description: "跳过确认提示" });

const deleteHandler = async (argv: NotepadDeleteArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let resolvedId: string = argv.id;
  if (stdinJson && typeof stdinJson === "object" && "id" in stdinJson) {
    resolvedId = String((stdinJson as Record<string, unknown>).id);
  }

  const ok = await confirmDelete("notepad", resolvedId, argv.force);
  if (!ok) process.exit(0);

  await api<object>(`/api/v1/memo/notepads/${resolvedId}`, { method: "DELETE" }, token);
  printSuccess("已删除");
};

export const notepadCmd: CommandModule = {
  command: "notepad",
  describe: "云词本查询与编辑（list / get / create / update / delete）",
  builder: (yargs) =>
    yargs
      .command("list", "查询云词本", listBuilder, listHandler as any)
      .command("get <id>", "获取单个云词本", getBuilder, getHandler as any)
      .command("create", "创建云词本", createBuilder, createHandler as any)
      .command("update <id>", "更新云词本", updateBuilder, updateHandler as any)
      .command("delete <id>", "删除云词本", deleteBuilder, deleteHandler as any)
      .help()
      .epilogue(`示例:
  $ memo-api notepad list
  $ memo-api notepad get <id>
  $ memo-api notepad create -t "标题" -c "内容"
`),
  handler: () => {},
};
