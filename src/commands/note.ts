import { Command } from "commander";
import { api } from "../client.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError, printSuccess } from "../output.js";
import { getToken, isJsonOutput } from "../lib/helpers.js";
import type { CreateNoteRequest, CreateNoteResponse, ListNotesResponse, UpdateNoteRequest, UpdateNoteResponse } from "../types/note.js";
import { resolveVocId } from "../lib/word-resolve.js";
import { confirmDelete } from "../lib/confirm.js";

export const noteCmd = new Command("note")
  .configureHelp({ showGlobalOptions: true })
  .description("助记查询与编辑（list / create / update / delete）")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api note list --voc-id <id>
  $ memo-api note create --word apple --type 谐音 --note "这是助记"
  $ echo '{"note":{"voc_id":"x","note_type":"谐音","note":"text"}}' | memo-api note create
`,
  );

noteCmd
  .command("list")
  .description("获取单词的助记列表")
  .option("-v, --voc-id <id>", "单词 ID")
  .option("-w, --word <spelling>", "单词拼写（自动调用 voc get 解析为 ID）")
  .addHelpText("after", "--word 与 --voc-id 互斥，必须指定其一。\n")
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let vocId: string;

    if (stdinJson && typeof stdinJson === "object" && "voc_id" in stdinJson) {
      vocId = String((stdinJson as Record<string, unknown>).voc_id);
    } else {
      if (options.word && options.vocId) {
        printError("错误: --word 与 --voc-id 互斥");
        process.exit(1);
      }
      if (options.word) {
        vocId = await resolveVocId(options.word, token);
      } else if (options.vocId) {
        vocId = options.vocId;
      } else {
        printError("错误: 缺少 --voc-id 或 --word");
        process.exit(1);
      }
    }

    const res = await api<ListNotesResponse>(
      "/api/v1/notes",
      { method: "GET", query: { voc_id: vocId } },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const rows = res.notes.map((n) => ({ ...n }));
      printColumns(rows, "note");
    }
  });

noteCmd
  .command("create")
  .description("为单词创建一条助记")
  .option("-v, --voc-id <id>", "单词 ID")
  .option("-w, --word <spelling>", "单词拼写（自动调用 voc get 解析为 ID）")
  .option("-t, --type <type>", '助记类型，如"谐音"')
  .option("-n, --note <text>", "助记内容")
  .addHelpText(
    "after",
    `
--word 与 --voc-id 互斥，必须指定其一。

示例:
  $ memo-api note create --word=apple --type=谐音 --note="苹果的助记"
  $ echo '{"note":{"voc_id":"x","note_type":"谐音","note":"text"}}' | memo-api note create
`,
  )
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: CreateNoteRequest;

    if (stdinJson && typeof stdinJson === "object") {
      body = stdinJson as CreateNoteRequest;
    } else {
      if (options.word && options.vocId) {
        printError("错误: --word 与 --voc-id 互斥");
        process.exit(1);
      }
      if (!options.type || !options.note) {
        printError("错误: 缺少 --type 或 --note");
        process.exit(1);
      }

      let vocId: string;
      if (options.word) {
        vocId = await resolveVocId(options.word, token);
      } else if (options.vocId) {
        vocId = options.vocId;
      } else {
        printError("错误: 缺少 --voc-id 或 --word");
        process.exit(1);
      }

      body = {
        note: {
          voc_id: vocId,
          note_type: options.type,
          note: options.note,
        },
      };
    }

    const res = await api<CreateNoteResponse>(
      "/api/v1/notes",
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const n = res.note;
      printColumns([{ ...n }], "note");
    }
  });

noteCmd
  .command("update")
  .description("更新助记")
  .argument("<id>", "助记 ID")
  .option("-t, --type <type>", '助记类型，如"谐音"')
  .option("-n, --note <text>", "助记内容")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api note update id123 --type=谐音 --note="新内容"
  $ echo '{"id":"note_id","note":{"note_type":"谐音","note":"新内容"}}' | memo-api note update
`,
  )
  .action(async (id, options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: UpdateNoteRequest;
    let resolvedId: string = id;

    if (stdinJson && typeof stdinJson === "object") {
      const jsonAny = stdinJson as Record<string, unknown>;
      if (jsonAny["id"]) resolvedId = String(jsonAny["id"]);
      if (jsonAny["note"]) {
        body = { note: jsonAny["note"] as UpdateNoteRequest["note"] };
      } else {
        body = stdinJson as UpdateNoteRequest;
      }
    } else {
      if (!options.type || !options.note) {
        printError("错误: 缺少 --type 或 --note");
        process.exit(1);
      }
      body = {
        note: {
          note_type: options.type,
          note: options.note,
        },
      };
    }

    const res = await api<UpdateNoteResponse>(
      `/api/v1/notes/${resolvedId}`,
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const n = res.note;
      printColumns([{ ...n }], "note");
    }
  });

noteCmd
  .command("delete")
  .description("删除助记")
  .argument("<id>", "助记 ID")
  .option("-f, --force", "跳过确认提示")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api note delete id123
  $ memo-api note delete id123 -f
  $ echo '{"id":"note_id"}' | memo-api note delete -f
`,
  )
  .action(async (id, options, cmd) => {
    const token = getToken(cmd);
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let resolvedId: string = id;
    if (stdinJson && typeof stdinJson === "object" && "id" in stdinJson) {
      resolvedId = String((stdinJson as Record<string, unknown>).id);
    }

    const ok = await confirmDelete("note", resolvedId, options.force);
    if (!ok) {
      process.exit(0);
    }

    await api<object>(
      `/api/v1/notes/${resolvedId}`,
      { method: "DELETE" },
      token,
    );

    printSuccess("已删除");
  });
