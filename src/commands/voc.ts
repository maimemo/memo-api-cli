import type { CommandModule, Argv } from "yargs";
import { api } from "../client.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError } from "../output.js";
import { isJsonOutput, resolveArrayArg } from "../lib/helpers.js";
import type {
  GetVocabularyResponse,
  ListVocabularyRequest,
  ListVocabularyResponse,
} from "../types/vocabulary.js";

interface VocGetArgs {
  token: string;
  output: string;
  spelling?: string;
}

const getBuilder = (yargs: Argv) =>
  yargs
    .option("spelling", { alias: "s", type: "string", description: "单词拼写" })
    .epilogue(`示例:
  $ memo-api voc get -s apple
  $ echo '{"spelling":"apple"}' | memo-api voc get
`);

const getHandler = async (argv: VocGetArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let spelling: string;

  if (stdinJson && typeof stdinJson === "object" && "spelling" in stdinJson) {
    spelling = String((stdinJson as Record<string, unknown>).spelling);
  } else if (argv.spelling) {
    spelling = argv.spelling;
  } else {
    printError("错误: 缺少 --spelling 参数");
    process.exit(1);
  }

  const res = await api<GetVocabularyResponse>(
    "/api/v1/memo/vocabulary",
    { method: "GET", query: { spelling } },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const voc = res.voc;
    if (voc) {
      printColumns([{ ...voc }], "voc");
    } else {
      process.stderr.write("单词不存在\n");
      process.exit(1);
    }
  }
};

interface VocQueryArgs {
  token: string;
  output: string;
  spelling?: string[];
  id?: string[];
}

const queryBuilder = (yargs: Argv) =>
  yargs
    .option("spelling", { alias: "s", type: "array", default: [] as string[], description: "按拼写查询（可重复，最多 1000）" })
    .option("id", { alias: "I", type: "array", default: [] as string[], description: "按 ID 查询（可重复，最多 1000）" })
    .epilogue(`--spelling 与 --id 互斥。

示例:
  $ memo-api voc query -s apple -s banana
  $ memo-api voc query -I id1 -I id2
  $ echo '{"spellings":["a","b"]}' | memo-api voc query
`);

const queryHandler = async (argv: VocQueryArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: ListVocabularyRequest;

  if (stdinJson && typeof stdinJson === "object") {
    body = stdinJson as ListVocabularyRequest;
  } else {
    if ((argv.spelling?.length ?? 0) > 0 && (argv.id?.length ?? 0) > 0) {
      printError("错误: --spelling 与 --id 互斥");
      process.exit(1);
    }

    const spellings = resolveArrayArg(argv.spelling ?? [], stdinInput);
    const ids = resolveArrayArg(argv.id ?? [], stdinInput);

    if (spellings.length > 0) {
      if (spellings.length > 1000) {
        printError("错误: 超过最大限制 1000");
        process.exit(1);
      }
      body = { spellings, ids: [] };
    } else if (ids.length > 0) {
      if (ids.length > 1000) {
        printError("错误: 超过最大限制 1000");
        process.exit(1);
      }
      body = { spellings: [], ids };
    } else {
      printError("错误: 需指定 --spelling 或 --id");
      process.exit(1);
    }
  }

  const res = await api<ListVocabularyResponse>(
    "/api/v1/memo/vocabulary/query",
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const rows = res.voc.map((v) => ({ ...v }));
    printColumns(rows, "voc");
  }
};

export const vocCmd: CommandModule = {
  command: "vocabulary",
  aliases: ["voc"],
  describe: "单词查询（get / query）",
  builder: (yargs) =>
    yargs
      .command("get", "按拼写获取单词", getBuilder, getHandler as any)
      .command("query", "批量查询单词", queryBuilder, queryHandler as any)
      .help(),
  handler: () => {},
};
