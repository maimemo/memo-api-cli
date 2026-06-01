import { Command } from "commander";
import { api } from "../client.js";
import { collect } from "../lib/collect.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError } from "../output.js";
import { getToken, isJsonOutput, resolveArrayArg } from "../lib/helpers.js";
import type {
  GetVocabularyResponse,
  ListVocabularyRequest,
  ListVocabularyResponse,
} from "../types/vocabulary.js";

export const vocCmd = new Command("vocabulary")
  .configureHelp({ showGlobalOptions: true })
  .alias("voc")
  .description("单词查询（get / query）")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api voc get -s apple
  $ memo-api voc query -s apple -s banana
  $ echo '{"spellings":["apple","banana"]}' | memo-api voc query
`,
  );

vocCmd
  .command("get")
  .description("按拼写获取单词")
  .option("-s, --spelling <word>", "单词拼写")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api voc get -s apple
  $ echo '{"spelling":"apple"}' | memo-api voc get
`,
  )
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let spelling: string;

    if (stdinJson && typeof stdinJson === "object" && "spelling" in stdinJson) {
      spelling = String((stdinJson as Record<string, unknown>).spelling);
    } else if (options.spelling) {
      spelling = options.spelling;
    } else {
      printError("错误: 缺少 --spelling 参数");
      process.exit(1);
    }

    const res = await api<GetVocabularyResponse>(
      "/api/v1/vocabulary",
      { method: "GET", query: { spelling } },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
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
  });

vocCmd
  .command("query")
  .description("批量查询单词")
  .option("-s, --spelling <word>", "按拼写查询（可重复，最多 1000）", collect, [])
  .option("-I, --id <id>", "按 ID 查询（可重复，最多 1000）", collect, [])
  .addHelpText(
    "after",
    `
--spelling 与 --id 互斥。

示例:
  $ memo-api voc query -s apple -s banana
  $ memo-api voc query -I id1 -I id2
  $ echo '{"spellings":["a","b"]}' | memo-api voc query
`,
  )
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: ListVocabularyRequest;

    if (stdinJson && typeof stdinJson === "object") {
      body = stdinJson as ListVocabularyRequest;
    } else {
      if (options.spelling.length > 0 && options.id.length > 0) {
        printError("错误: --spelling 与 --id 互斥");
        process.exit(1);
      }

      const spellings = resolveArrayArg(options.spelling, stdinInput);
      const ids = resolveArrayArg(options.id, stdinInput);

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
      "/api/v1/vocabulary/query",
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const rows = res.voc.map((v) => ({ ...v }));
      printColumns(rows, "voc");
    }
  });
