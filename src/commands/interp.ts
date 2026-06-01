import { Command } from "commander";
import { api } from "../client.js";
import { collect } from "../lib/collect.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError, printSuccess } from "../output.js";
import { getToken, isJsonOutput, resolveArrayArg } from "../lib/helpers.js";
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

export const interpCmd = new Command("interpretation")
  .configureHelp({ showGlobalOptions: true })
  .alias("interp")
  .description("释义查询与编辑（list / create / update / delete）")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api interp list -v xxx
  $ memo-api interp create -w apple -i "n. 苹果" -g 考研 -s PUBLISHED
`,
  );

interpCmd
  .command("list")
  .description("获取单词的释义列表")
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

    const res = await api<ListInterpretationsResponse>(
      "/api/v1/interpretations",
      { method: "GET", query: { voc_id: vocId } },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const rows = res.interpretations.map((i) => ({ ...i }));
      printColumns(rows, "interp");
    }
  });

interpCmd
  .command("create")
  .description("创建释义")
  .option("-v, --voc-id <id>", "单词 ID")
  .option("-w, --word <spelling>", "单词拼写（自动调用 voc get 解析为 ID）")
  .option("-i, --interpretation <text>", "释义内容")
  .option("-g, --tag <tag>", "标签（可重复，也可 -g - 从 stdin 读换行分隔值）", collect, [])
  .option("-s, --status <status>", "PUBLISHED 或 UNPUBLISHED", "PUBLISHED")
  .addHelpText(
    "after",
    `
--word 与 --voc-id 互斥，必须指定其一。

示例:
  $ memo-api interp create -w apple -i "n. 苹果" -g 考研 -s PUBLISHED
  $ echo '{"interpretation":{"voc_id":"x","interpretation":"n. 苹果","tags":["考研"],"status":"PUBLISHED"}}' | memo-api interp create
`,
  )
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: CreateInterpretationRequest;

    if (stdinJson && typeof stdinJson === "object") {
      body = stdinJson as CreateInterpretationRequest;
    } else {
      if (options.word && options.vocId) {
        printError("错误: --word 与 --voc-id 互斥");
        process.exit(1);
      }
      if (!options.interpretation) {
        printError("错误: 缺少 --interpretation");
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
        interpretation: {
          voc_id: vocId,
          interpretation: options.interpretation,
          tags,
          status: options.status as InterpretationStatus,
        },
      };
    }

    const res = await api<CreateInterpretationResponse>(
      "/api/v1/interpretations",
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const i = res.interpretation;
      printColumns([{ ...i }], "interp");
    }
  });

interpCmd
  .command("update")
  .description("更新释义")
  .argument("<id>", "释义 ID")
  .option("-i, --interpretation <text>", "释义内容")
  .option("-g, --tag <tag>", "标签（可重复）", collect, [])
  .option("-s, --status <status>", "PUBLISHED / UNPUBLISHED / DELETED")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api interp update id123 -i "新释义" -g A -s PUBLISHED
  $ echo '{"id":"x","interpretation":{"interpretation":"新","tags":["A"],"status":"PUBLISHED"}}' | memo-api interp update
`,
  )
  .action(async (id, options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: UpdateInterpretationRequest;
    let resolvedId: string = id;

    if (stdinJson && typeof stdinJson === "object") {
      const jsonAny = stdinJson as Record<string, unknown>;
      if (jsonAny["id"]) resolvedId = String(jsonAny["id"]);
      if (jsonAny["interpretation"]) {
        body = { interpretation: jsonAny["interpretation"] as UpdateInterpretationRequest["interpretation"] };
      } else {
        body = stdinJson as UpdateInterpretationRequest;
      }
    } else {
      if (!options.interpretation || !options.status) {
        printError("错误: 缺少 --interpretation 或 --status");
        process.exit(1);
      }

      const tags = resolveArrayArg(options.tag, stdinInput);

      body = {
        interpretation: {
          interpretation: options.interpretation,
          tags,
          status: options.status as InterpretationStatus,
        },
      };
    }

    const res = await api<UpdateInterpretationResponse>(
      `/api/v1/interpretations/${resolvedId}`,
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const i = res.interpretation;
      printColumns([{ ...i }], "interp");
    }
  });

interpCmd
  .command("delete")
  .description("删除释义")
  .argument("<id>", "释义 ID")
  .option("-f, --force", "跳过确认提示")
  .action(async (id, options, cmd) => {
    const token = getToken(cmd);
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let resolvedId: string = id;
    if (stdinJson && typeof stdinJson === "object" && "id" in stdinJson) {
      resolvedId = String((stdinJson as Record<string, unknown>).id);
    }

    const ok = await confirmDelete("interpretation", resolvedId, options.force);
    if (!ok) process.exit(0);

    await api<object>(`/api/v1/interpretations/${resolvedId}`, { method: "DELETE" }, token);
    printSuccess("已删除");
  });
