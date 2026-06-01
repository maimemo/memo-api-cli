import { Command } from "commander";
import { api } from "../client.js";
import { collect } from "../lib/collect.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError, printSuccess } from "../output.js";
import { getToken, isJsonOutput, resolveArrayArg } from "../lib/helpers.js";
import type {
  CreatePhraseRequest,
  CreatePhraseResponse,
  ListPhrasesResponse,
  UpdatePhraseRequest,
  UpdatePhraseResponse,
  DeletePhraseResponse,
} from "../types/phrase.js";
import { resolveVocId } from "../lib/word-resolve.js";
import { confirmDelete } from "../lib/confirm.js";

export const phraseCmd = new Command("phrase")
  .configureHelp({ showGlobalOptions: true })
  .description("例句查询与编辑（list / create / update / delete）")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api phrase list -v xxx
  $ memo-api phrase create -w apple -p "Hello" -i "你好" -o "book"
`,
  );

phraseCmd
  .command("list")
  .description("获取单词的例句列表")
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

    const res = await api<ListPhrasesResponse>(
      "/api/v1/phrases",
      { method: "GET", query: { voc_id: vocId } },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const rows = res.phrases.map((p) => ({ ...p }));
      printColumns(rows, "phrase");
    }
  });

phraseCmd
  .command("create")
  .description("创建例句")
  .option("-v, --voc-id <id>", "单词 ID")
  .option("-w, --word <spelling>", "单词拼写（自动调用 voc get 解析为 ID）")
  .option("-p, --phrase <text>", "例句原文")
  .option("-i, --interpretation <text>", "例句翻译")
  .option("-g, --tag <tag>", "标签（可重复）", collect, [])
  .option("-o, --origin <origin>", "来源")
  .addHelpText(
    "after",
    `
--word 与 --voc-id 互斥，必须指定其一。

示例:
  $ memo-api phrase create -w apple -p "This is an apple." -i "这是一个苹果。" -o "考研"
  $ echo '{"phrase":{"voc_id":"x","phrase":"Hello","interpretation":"你好","tags":[],"origin":"book"}}' | memo-api phrase create
`,
  )
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: CreatePhraseRequest;

    if (stdinJson && typeof stdinJson === "object") {
      body = stdinJson as CreatePhraseRequest;
    } else {
      if (options.word && options.vocId) {
        printError("错误: --word 与 --voc-id 互斥");
        process.exit(1);
      }
      if (!options.phrase || !options.interpretation) {
        printError("错误: 缺少 --phrase 或 --interpretation");
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

      const tags = resolveArrayArg(options.tag, stdinInput);

      body = {
        phrase: {
          voc_id: vocId,
          phrase: options.phrase,
          interpretation: options.interpretation,
          tags,
          origin: options.origin ?? "",
        },
      };
    }

    const res = await api<CreatePhraseResponse>(
      "/api/v1/phrases",
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const p = res.phrase;
      printColumns([{ ...p }], "phrase");
    }
  });

phraseCmd
  .command("update")
  .description("更新例句")
  .argument("<id>", "例句 ID")
  .option("-p, --phrase <text>", "例句原文")
  .option("-i, --interpretation <text>", "例句翻译")
  .option("-g, --tag <tag>", "标签（可重复）", collect, [])
  .option("-o, --origin <origin>", "来源")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api phrase update id123 -p "Hi" -i "嗨" -g A -o "web"
`,
  )
  .action(async (id, options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: UpdatePhraseRequest;
    let resolvedId: string = id;

    if (stdinJson && typeof stdinJson === "object") {
      const jsonAny = stdinJson as Record<string, unknown>;
      if (jsonAny["id"]) resolvedId = String(jsonAny["id"]);
      if (jsonAny["phrase"]) {
        body = { phrase: jsonAny["phrase"] as UpdatePhraseRequest["phrase"] };
      } else {
        body = stdinJson as UpdatePhraseRequest;
      }
    } else {
      if (!options.phrase || !options.interpretation || !options.origin) {
        printError("错误: 缺少 --phrase 或 --interpretation 或 --origin");
        process.exit(1);
      }

      const tags = resolveArrayArg(options.tag, stdinInput);

      body = {
        phrase: {
          phrase: options.phrase,
          interpretation: options.interpretation,
          tags,
          origin: options.origin,
        },
      };
    }

    const res = await api<UpdatePhraseResponse>(
      `/api/v1/phrases/${resolvedId}`,
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const p = res.phrase;
      printColumns([{ ...p }], "phrase");
    }
  });

phraseCmd
  .command("delete")
  .description("删除例句")
  .argument("<id>", "例句 ID")
  .option("-f, --force", "跳过确认提示")
  .action(async (id, options, cmd) => {
    const token = getToken(cmd);
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let resolvedId: string = id;
    if (stdinJson && typeof stdinJson === "object" && "id" in stdinJson) {
      resolvedId = String((stdinJson as Record<string, unknown>).id);
    }

    const ok = await confirmDelete("phrase", resolvedId, options.force);
    if (!ok) process.exit(0);

    await api<object>(`/api/v1/phrases/${resolvedId}`, { method: "DELETE" }, token);
    printSuccess("已删除");
  });
