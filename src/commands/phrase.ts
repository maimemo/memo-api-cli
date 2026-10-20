import type { CommandModule, Argv } from "yargs";
import { api } from "../client.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError, printSuccess } from "../output.js";
import { isJsonOutput, resolveArrayArg } from "../lib/helpers.js";
import type {
  CreatePhraseRequest,
  CreatePhraseResponse,
  ListPhrasesResponse,
  UpdatePhraseRequest,
  UpdatePhraseResponse,
} from "../types/phrase.js";
import { resolveVocId } from "../lib/word-resolve.js";
import { confirmDelete } from "../lib/confirm.js";

interface PhraseListArgs {
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

const listHandler = async (argv: PhraseListArgs) => {
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

  const res = await api<ListPhrasesResponse>(
    "/api/v1/memo/phrases",
    { method: "GET", query: { voc_id: vocId } },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const rows = res.phrases.map((p) => ({ ...p }));
    printColumns(rows, "phrase");
  }
};

interface PhraseCreateArgs {
  token: string;
  output: string;
  vocId?: string;
  word?: string;
  phrase?: string;
  interpretation?: string;
  tag?: string[];
  origin?: string;
}

const createBuilder = (yargs: Argv) =>
  yargs
    .option("voc-id", { alias: "v", type: "string", description: "单词 ID" })
    .option("word", { alias: "w", type: "string", description: "单词拼写（自动调用 voc get 解析为 ID）" })
    .option("phrase", { alias: "p", type: "string", description: "例句原文" })
    .option("interpretation", { alias: "i", type: "string", description: "例句翻译" })
    .option("tag", { alias: "g", type: "array", default: [] as string[], description: "标签（可重复）" })
    .option("origin", { alias: "o", type: "string", description: "来源" })
    .epilogue(`--word 与 --voc-id 互斥，必须指定其一。

示例:
  $ memo-api phrase create -w apple -p "This is an apple." -i "这是一个苹果。" -o "考研"
  $ echo '{"phrase":{"voc_id":"x","phrase":"Hello","interpretation":"你好","tags":[],"origin":"book"}}' | memo-api phrase create
`);

const createHandler = async (argv: PhraseCreateArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: CreatePhraseRequest;

  if (stdinJson && typeof stdinJson === "object") {
    body = stdinJson as CreatePhraseRequest;
  } else {
    if (argv.word && argv.vocId) {
      printError("错误: --word 与 --voc-id 互斥");
      process.exit(1);
    }
    if (!argv.phrase || !argv.interpretation) {
      printError("错误: 缺少 --phrase 或 --interpretation");
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

    const tags = resolveArrayArg(argv.tag ?? [], stdinInput);

    body = {
      phrase: {
        voc_id: vocId,
        phrase: argv.phrase,
        interpretation: argv.interpretation,
        tags,
        origin: argv.origin ?? "",
      },
    };
  }

  const res = await api<CreatePhraseResponse>(
    "/api/v1/memo/phrases",
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const p = res.phrase;
    printColumns([{ ...p }], "phrase");
  }
};

interface PhraseUpdateArgs {
  token: string;
  output: string;
  id: string;
  phrase?: string;
  interpretation?: string;
  tag?: string[];
  origin?: string;
}

const updateBuilder = (yargs: Argv) =>
  yargs
    .positional("id", { type: "string", describe: "例句 ID" })
    .option("phrase", { alias: "p", type: "string", description: "例句原文" })
    .option("interpretation", { alias: "i", type: "string", description: "例句翻译" })
    .option("tag", { alias: "g", type: "array", default: [] as string[], description: "标签（可重复）" })
    .option("origin", { alias: "o", type: "string", description: "来源" })
    .epilogue(`示例:
  $ memo-api phrase update id123 -p "Hi" -i "嗨" -g A -o "web"
`);

const updateHandler = async (argv: PhraseUpdateArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: UpdatePhraseRequest;
  let resolvedId: string = argv.id;

  if (stdinJson && typeof stdinJson === "object") {
    const jsonAny = stdinJson as Record<string, unknown>;
    if (jsonAny["id"]) resolvedId = String(jsonAny["id"]);
    if (jsonAny["phrase"]) {
      body = { phrase: jsonAny["phrase"] as UpdatePhraseRequest["phrase"] };
    } else {
      body = stdinJson as UpdatePhraseRequest;
    }
  } else {
    if (!argv.phrase || !argv.interpretation || !argv.origin) {
      printError("错误: 缺少 --phrase 或 --interpretation 或 --origin");
      process.exit(1);
    }

    const tags = resolveArrayArg(argv.tag ?? [], stdinInput);

    body = {
      phrase: {
        phrase: argv.phrase,
        interpretation: argv.interpretation,
        tags,
        origin: argv.origin,
      },
    };
  }

  const res = await api<UpdatePhraseResponse>(
    `/api/v1/memo/phrases/${resolvedId}`,
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const p = res.phrase;
    printColumns([{ ...p }], "phrase");
  }
};

interface PhraseDeleteArgs {
  token: string;
  id: string;
  force?: boolean;
}

const deleteBuilder = (yargs: Argv) =>
  yargs
    .positional("id", { type: "string", describe: "例句 ID" })
    .option("force", { alias: "f", type: "boolean", description: "跳过确认提示" });

const deleteHandler = async (argv: PhraseDeleteArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let resolvedId: string = argv.id;
  if (stdinJson && typeof stdinJson === "object" && "id" in stdinJson) {
    resolvedId = String((stdinJson as Record<string, unknown>).id);
  }

  const ok = await confirmDelete("phrase", resolvedId, argv.force);
  if (!ok) process.exit(0);

  await api<object>(`/api/v1/memo/phrases/${resolvedId}`, { method: "DELETE" }, token);
  printSuccess("已删除");
};

export const phraseCmd: CommandModule = {
  command: "phrase",
  describe: "例句查询与编辑（list / create / update / delete）",
  builder: (yargs) =>
    yargs
      .command("list", "获取单词的例句列表", listBuilder, listHandler as any)
      .command("create", "创建例句", createBuilder, createHandler as any)
      .command("update <id>", "更新例句", updateBuilder, updateHandler as any)
      .command("delete <id>", "删除例句", deleteBuilder, deleteHandler as any)
      .help()
      .epilogue(`示例:
  $ memo-api phrase list -v xxx
  $ memo-api phrase create -w apple -p "Hello" -i "你好" -o "book"
`),
  handler: () => {},
};
