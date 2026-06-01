import { Command } from "commander";
import { api } from "../client.js";
import { collect } from "../lib/collect.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError, printSuccess } from "../output.js";
import { getToken, isJsonOutput, resolveArrayArg } from "../lib/helpers.js";
import type { NotepadStatus } from "../types/notepad.js";
import type {
  CreateNotepadRequest,
  CreateNotepadResponse,
  GetNotepadResponse,
  UpdateNotepadRequest,
  UpdateNotepadResponse,
} from "../types/notepad.js";
import { confirmDelete } from "../lib/confirm.js";

export const notepadCmd = new Command("notepad")
  .configureHelp({ showGlobalOptions: true })
  .description("云词本查询与编辑（list / get / create / update / delete）")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api notepad list
  $ memo-api notepad get <id>
  $ memo-api notepad create -t "标题" -c "内容"
`,
  );

notepadCmd
  .command("list")
  .description("查询云词本")
  .option("-l, --limit <n>", "查询数量，默认 10", "10")
  .option("-o, --offset <n>", "跳过数量，默认 0", "0")
  .option("-I, --id <id>", "按 ID 过滤（可重复）", collect, [])
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
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
      query = { limit: options.limit, offset: options.offset };
      const resolvedIds = resolveArrayArg(options.id, stdinInput);
      resolvedIds.forEach((id, i) => { query[`ids[${i}]`] = String(id); });
    }

    const res = await api<{ notepads: Array<Record<string, unknown>> }>(
      "/api/v1/notepads",
      { method: "GET", query },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const rows = res.notepads.map((n) => ({
        ...n,
      }));
      printColumns(rows, "notepad_list");
    }
  });

notepadCmd
  .command("get")
  .description("获取单个云词本")
  .argument("<id>", "云词本 ID")
  .action(async (id, _, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };

    const res = await api<GetNotepadResponse>(
      `/api/v1/notepads/${id}`,
      { method: "GET" },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const n = res.notepad;
      printColumns([
        { ...n },
      ], "notepad");
    }
  });

notepadCmd
  .command("create")
  .description("创建云词本")
  .option("-t, --title <title>", "标题")
  .option("-c, --content <text>", "内容")
  .option("-b, --brief <text>", "简介")
  .option("-g, --tag <tag>", "标签（可重复）", collect, [])
  .option("-s, --status <status>", "PUBLISHED 或 UNPUBLISHED", "PUBLISHED")
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: CreateNotepadRequest;

    if (stdinJson && typeof stdinJson === "object") {
      body = stdinJson as CreateNotepadRequest;
    } else {
      if (!options.title || !options.content) {
        printError("错误: 缺少 --title 或 --content");
        process.exit(1);
      }

      const tags = resolveArrayArg(options.tag, stdinInput);

      body = {
        notepad: {
          status: options.status as NotepadStatus,
          content: options.content,
          title: options.title,
          brief: options.brief ?? "",
          tags,
        },
      };
    }

    const res = await api<CreateNotepadResponse>(
      "/api/v1/notepads",
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const n = res.notepad;
      printColumns([
        { ...n },
      ], "notepad");
    }
  });

notepadCmd
  .command("update")
  .description("更新云词本")
  .argument("<id>", "云词本 ID")
  .option("-t, --title <title>", "标题")
  .option("-c, --content <text>", "内容")
  .option("-b, --brief <text>", "简介")
  .option("-g, --tag <tag>", "标签（可重复）", collect, [])
  .option("-s, --status <status>", "PUBLISHED / UNPUBLISHED / DELETED")
  .action(async (id, options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: UpdateNotepadRequest;
    let resolvedId: string = id;

    if (stdinJson && typeof stdinJson === "object") {
      const jsonAny = stdinJson as Record<string, unknown>;
      if (jsonAny["id"]) resolvedId = String(jsonAny["id"]);
      if (jsonAny["notepad"]) {
        body = { notepad: jsonAny["notepad"] as UpdateNotepadRequest["notepad"] };
      } else {
        body = stdinJson as UpdateNotepadRequest;
      }
    } else {
      if (!options.title || !options.content || !options.status) {
        printError("错误: 缺少 --title 或 --content 或 --status");
        process.exit(1);
      }

      const tags = resolveArrayArg(options.tag, stdinInput);

      body = {
        notepad: {
          status: options.status as NotepadStatus,
          content: options.content,
          title: options.title,
          brief: options.brief ?? "",
          tags,
        },
      };
    }

    const res = await api<UpdateNotepadResponse>(
      `/api/v1/notepads/${resolvedId}`,
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const n = res.notepad;
      printColumns([
        { ...n },
      ], "notepad");
    }
  });

notepadCmd
  .command("delete")
  .description("删除云词本")
  .argument("<id>", "云词本 ID")
  .option("-f, --force", "跳过确认提示")
  .action(async (id, options, cmd) => {
    const token = getToken(cmd);
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let resolvedId: string = id;
    if (stdinJson && typeof stdinJson === "object" && "id" in stdinJson) {
      resolvedId = String((stdinJson as Record<string, unknown>).id);
    }

    const ok = await confirmDelete("notepad", resolvedId, options.force);
    if (!ok) process.exit(0);

    await api<object>(`/api/v1/notepads/${resolvedId}`, { method: "DELETE" }, token);
    printSuccess("已删除");
  });
