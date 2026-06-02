import type { CommandModule, Argv } from "yargs";
import { api } from "../client.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError, printSuccess } from "../output.js";
import { isJsonOutput, resolveArrayArg } from "../lib/helpers.js";
import type { InterpretationStatus } from "../types/interpretation.js";
import type {
  CreateInterpretationRequest,
  CreateInterpretationResponse,
  ListInterpretationsResponse,
  UpdateInterpretationRequest,
  UpdateInterpretationResponse,
} from "../types/interpretation.js";
import { resolveVocId } from "../lib/word-resolve.js";
import { confirmDelete } from "../lib/confirm.js";

interface InterpListArgs {
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

const listHandler = async (argv: InterpListArgs) => {
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

  const res = await api<ListInterpretationsResponse>(
    "/api/v1/interpretations",
    { method: "GET", query: { voc_id: vocId } },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const rows = res.interpretations.map((i) => ({ ...i }));
    printColumns(rows, "interp");
  }
};

interface InterpCreateArgs {
  token: string;
  output: string;
  vocId?: string;
  word?: string;
  interpretation?: string;
  tag?: string[];
  status?: string;
}

const createBuilder = (yargs: Argv) =>
  yargs
    .option("voc-id", { alias: "v", type: "string", description: "单词 ID" })
    .option("word", { alias: "w", type: "string", description: "单词拼写（自动调用 voc get 解析为 ID）" })
    .option("interpretation", { alias: "i", type: "string", description: "释义内容" })
    .option("tag", { alias: "g", type: "array", default: [] as string[], description: "标签（可重复，也可 -g - 从 stdin 读换行分隔值）" })
    .option("status", { alias: "s", type: "string", default: "PUBLISHED", description: "PUBLISHED 或 UNPUBLISHED" })
    .epilogue(`--word 与 --voc-id 互斥，必须指定其一。

示例:
  $ memo-api interp create -w apple -i "n. 苹果" -g 考研 -s PUBLISHED
  $ echo '{"interpretation":{"voc_id":"x","interpretation":"n. 苹果","tags":["考研"],"status":"PUBLISHED"}}' | memo-api interp create
`);

const createHandler = async (argv: InterpCreateArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: CreateInterpretationRequest;

  if (stdinJson && typeof stdinJson === "object") {
    body = stdinJson as CreateInterpretationRequest;
  } else {
    if (argv.word && argv.vocId) {
      printError("错误: --word 与 --voc-id 互斥");
      process.exit(1);
    }
    if (!argv.interpretation) {
      printError("错误: 缺少 --interpretation");
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
      interpretation: {
        voc_id: vocId,
        interpretation: argv.interpretation,
        tags,
        status: argv.status as InterpretationStatus,
      },
    };
  }

  const res = await api<CreateInterpretationResponse>(
    "/api/v1/interpretations",
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const i = res.interpretation;
    printColumns([{ ...i }], "interp");
  }
};

interface InterpUpdateArgs {
  token: string;
  output: string;
  id: string;
  interpretation?: string;
  tag?: string[];
  status?: string;
}

const updateBuilder = (yargs: Argv) =>
  yargs
    .positional("id", { type: "string", describe: "释义 ID" })
    .option("interpretation", { alias: "i", type: "string", description: "释义内容" })
    .option("tag", { alias: "g", type: "array", default: [] as string[], description: "标签（可重复）" })
    .option("status", { alias: "s", type: "string", description: "PUBLISHED / UNPUBLISHED / DELETED" })
    .epilogue(`示例:
  $ memo-api interp update id123 -i "新释义" -g A -s PUBLISHED
  $ echo '{"id":"x","interpretation":{"interpretation":"新","tags":["A"],"status":"PUBLISHED"}}' | memo-api interp update
`);

const updateHandler = async (argv: InterpUpdateArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: UpdateInterpretationRequest;
  let resolvedId: string = argv.id;

  if (stdinJson && typeof stdinJson === "object") {
    const jsonAny = stdinJson as Record<string, unknown>;
    if (jsonAny["id"]) resolvedId = String(jsonAny["id"]);
    if (jsonAny["interpretation"]) {
      body = { interpretation: jsonAny["interpretation"] as UpdateInterpretationRequest["interpretation"] };
    } else {
      body = stdinJson as UpdateInterpretationRequest;
    }
  } else {
    if (!argv.interpretation || !argv.status) {
      printError("错误: 缺少 --interpretation 或 --status");
      process.exit(1);
    }

    const tags = resolveArrayArg(argv.tag ?? [], stdinInput);

    body = {
      interpretation: {
        interpretation: argv.interpretation,
        tags,
        status: argv.status as InterpretationStatus,
      },
    };
  }

  const res = await api<UpdateInterpretationResponse>(
    `/api/v1/interpretations/${resolvedId}`,
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const i = res.interpretation;
    printColumns([{ ...i }], "interp");
  }
};

interface InterpDeleteArgs {
  token: string;
  id: string;
  force?: boolean;
}

const deleteBuilder = (yargs: Argv) =>
  yargs
    .positional("id", { type: "string", describe: "释义 ID" })
    .option("force", { alias: "f", type: "boolean", description: "跳过确认提示" });

const deleteHandler = async (argv: InterpDeleteArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let resolvedId: string = argv.id;
  if (stdinJson && typeof stdinJson === "object" && "id" in stdinJson) {
    resolvedId = String((stdinJson as Record<string, unknown>).id);
  }

  const ok = await confirmDelete("interpretation", resolvedId, argv.force);
  if (!ok) process.exit(0);

  await api<object>(`/api/v1/interpretations/${resolvedId}`, { method: "DELETE" }, token);
  printSuccess("已删除");
};

export const interpCmd: CommandModule = {
  command: "interpretation",
  aliases: ["interp"],
  describe: "释义查询与编辑（list / create / update / delete）",
  builder: (yargs) =>
    yargs
      .command("list", "获取单词的释义列表", listBuilder, listHandler as any)
      .command("create", "创建释义", createBuilder, createHandler as any)
      .command("update <id>", "更新释义", updateBuilder, updateHandler as any)
      .command("delete <id>", "删除释义", deleteBuilder, deleteHandler as any)
      .help()
      .epilogue(`示例:
  $ memo-api interp list -v xxx
  $ memo-api interp create -w apple -i "n. 苹果" -g 考研 -s PUBLISHED
`),
  handler: () => {},
};
