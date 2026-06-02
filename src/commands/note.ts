import type { CommandModule, Argv } from "yargs";
import { api } from "../client.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError, printSuccess } from "../output.js";
import { isJsonOutput } from "../lib/helpers.js";
import type { CreateNoteRequest, CreateNoteResponse, ListNotesResponse, UpdateNoteRequest, UpdateNoteResponse } from "../types/note.js";
import { resolveVocId } from "../lib/word-resolve.js";
import { confirmDelete } from "../lib/confirm.js";

interface NoteListArgs {
  token: string;
  output: string;
  vocId?: string;
  word?: string;
}

const listBuilder = (yargs: Argv) =>
  yargs
    .option("voc-id", { alias: "v", type: "string", description: "单词 ID" })
    .option("word", { alias: "w", type: "string", description: "单词拼写（自动调用 voc get 解析为 ID）" })
    .epilogue("--word 与 --voc-id 互斥，必须指定其一。\n");

const listHandler = async (argv: NoteListArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let vocId: string;

  if (stdinJson && typeof stdinJson === "object" && "voc_id" in stdinJson) {
    vocId = String((stdinJson as Record<string, unknown>).voc_id);
  } else {
    if (argv.word && argv.vocId) {
      printError("错误: --word 与 --voc-id 互斥");
      process.exit(1);
    }
    if (argv.word) {
      vocId = await resolveVocId(argv.word, token);
    } else if (argv.vocId) {
      vocId = argv.vocId;
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

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const rows = res.notes.map((n) => ({ ...n }));
    printColumns(rows, "note");
  }
};

interface NoteCreateArgs {
  token: string;
  output: string;
  vocId?: string;
  word?: string;
  type?: string;
  note?: string;
}

const createBuilder = (yargs: Argv) =>
  yargs
    .option("voc-id", { alias: "v", type: "string", description: "单词 ID" })
    .option("word", { alias: "w", type: "string", description: "单词拼写（自动调用 voc get 解析为 ID）" })
    .option("type", { alias: "t", type: "string", description: '助记类型，如"谐音"' })
    .option("note", { alias: "n", type: "string", description: "助记内容" })
    .epilogue(`--word 与 --voc-id 互斥，必须指定其一。

示例:
  $ memo-api note create --word=apple --type=谐音 --note="苹果的助记"
  $ echo '{"note":{"voc_id":"x","note_type":"谐音","note":"text"}}' | memo-api note create
`);

const createHandler = async (argv: NoteCreateArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: CreateNoteRequest;

  if (stdinJson && typeof stdinJson === "object") {
    body = stdinJson as CreateNoteRequest;
  } else {
    if (argv.word && argv.vocId) {
      printError("错误: --word 与 --voc-id 互斥");
      process.exit(1);
    }
    if (!argv.type || !argv.note) {
      printError("错误: 缺少 --type 或 --note");
      process.exit(1);
    }

    let vocId: string;
    if (argv.word) {
      vocId = await resolveVocId(argv.word, token);
    } else if (argv.vocId) {
      vocId = argv.vocId;
    } else {
      printError("错误: 缺少 --voc-id 或 --word");
      process.exit(1);
    }

    body = {
      note: {
        voc_id: vocId,
        note_type: argv.type,
        note: argv.note,
      },
    };
  }

  const res = await api<CreateNoteResponse>(
    "/api/v1/notes",
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const n = res.note;
    printColumns([{ ...n }], "note");
  }
};

interface NoteUpdateArgs {
  token: string;
  output: string;
  id: string;
  type?: string;
  note?: string;
}

const updateBuilder = (yargs: Argv) =>
  yargs
    .positional("id", { type: "string", describe: "助记 ID" })
    .option("type", { alias: "t", type: "string", description: '助记类型，如"谐音"' })
    .option("note", { alias: "n", type: "string", description: "助记内容" })
    .epilogue(`示例:
  $ memo-api note update id123 --type=谐音 --note="新内容"
  $ echo '{"id":"note_id","note":{"note_type":"谐音","note":"新内容"}}' | memo-api note update
`);

const updateHandler = async (argv: NoteUpdateArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: UpdateNoteRequest;
  let resolvedId: string = argv.id;

  if (stdinJson && typeof stdinJson === "object") {
    const jsonAny = stdinJson as Record<string, unknown>;
    if (jsonAny["id"]) resolvedId = String(jsonAny["id"]);
    if (jsonAny["note"]) {
      body = { note: jsonAny["note"] as UpdateNoteRequest["note"] };
    } else {
      body = stdinJson as UpdateNoteRequest;
    }
  } else {
    if (!argv.type || !argv.note) {
      printError("错误: 缺少 --type 或 --note");
      process.exit(1);
    }
    body = {
      note: {
        note_type: argv.type,
        note: argv.note,
      },
    };
  }

  const res = await api<UpdateNoteResponse>(
    `/api/v1/notes/${resolvedId}`,
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const n = res.note;
    printColumns([{ ...n }], "note");
  }
};

interface NoteDeleteArgs {
  token: string;
  id: string;
  force?: boolean;
}

const deleteBuilder = (yargs: Argv) =>
  yargs
    .positional("id", { type: "string", describe: "助记 ID" })
    .option("force", { alias: "f", type: "boolean", description: "跳过确认提示" })
    .epilogue(`示例:
  $ memo-api note delete id123
  $ memo-api note delete id123 -f
  $ echo '{"id":"note_id"}' | memo-api note delete -f
`);

const deleteHandler = async (argv: NoteDeleteArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let resolvedId: string = argv.id;
  if (stdinJson && typeof stdinJson === "object" && "id" in stdinJson) {
    resolvedId = String((stdinJson as Record<string, unknown>).id);
  }

  const ok = await confirmDelete("note", resolvedId, argv.force);
  if (!ok) {
    process.exit(0);
  }

  await api<object>(
    `/api/v1/notes/${resolvedId}`,
    { method: "DELETE" },
    token,
  );

  printSuccess("已删除");
};

export const noteCmd: CommandModule = {
  command: "note",
  describe: "助记查询与编辑（list / create / update / delete）",
  builder: (yargs) =>
    yargs
      .command("list", "获取单词的助记列表", listBuilder, listHandler as any)
      .command("create", "为单词创建一条助记", createBuilder, createHandler as any)
      .command("update <id>", "更新助记", updateBuilder, updateHandler as any)
      .command("delete <id>", "删除助记", deleteBuilder, deleteHandler as any)
      .help()
      .epilogue(`示例:
  $ memo-api note list --voc-id <id>
  $ memo-api note create --word apple --type 谐音 --note "这是助记"
  $ echo '{"note":{"voc_id":"x","note_type":"谐音","note":"text"}}' | memo-api note create
`),
  handler: () => {},
};
