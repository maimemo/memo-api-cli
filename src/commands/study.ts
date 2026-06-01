import { Command } from "commander";
import { api } from "../client.js";
import { collect } from "../lib/collect.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError } from "../output.js";
import { getToken, isJsonOutput, resolveArrayArg } from "../lib/helpers.js";
import type {
  GetStudyProgressResponse,
  GetTodayItemsRequest,
  GetTodayItemsResponse,
  QueryStudyRecordsRequest,
  QueryStudyRecordsResponse,
  AddWordsRequest,
  AddWordsResponse,
  AdvanceStudyRequest,
  AdvanceStudyResponse,
} from "../types/study.js";

export const studyCmd = new Command("study")
  .configureHelp({ showGlobalOptions: true })
  .description("学习数据（progress / today / records / add / advance）")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api study progress
  $ memo-api study today
  $ memo-api study records -c
  $ memo-api study add -w apple -w banana
  $ memo-api study add --id voc123 --word happy
`,
  );

studyCmd
  .command("progress")
  .description("获取今日学习进度")
  .action(async (_, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };

    const res = await api<GetStudyProgressResponse>(
      "/api/v1/study/get_study_progress",
      { method: "POST", body: {} },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const p = res.progress;
      printColumns([{ ...p }], "study_progress");
    }
  });

studyCmd
  .command("today")
  .description("获取今日学习单词")
  .option("-F, --finished", "仅筛选已完成的")
  .option("-n, --new", "仅筛选新学单词")
  .option("-v, --voc-id <id>", "按单词 ID 筛选（可重复，最多 1000）", collect, [])
  .option("-s, --spelling <word>", "按拼写筛选（可重复，最多 1000）", collect, [])
  .option("-l, --limit <n>", "最大返回数，默认 50，上限 1000", "50")
  .addHelpText(
    "after",
    `
筛选参数：
  --finished    仅筛选已完成单词
  --no-finished 仅筛选未完成单词（Commander 自动生成）
  -n, --new     仅筛选新学单词
  --no-new      仅筛选非新学单词（Commander 自动生成）
`,
  )
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: GetTodayItemsRequest;

    if (stdinJson && typeof stdinJson === "object") {
      body = stdinJson as GetTodayItemsRequest;
    } else {
      const vocIds = resolveArrayArg(options.vocId, stdinInput);
      const spellings = resolveArrayArg(options.spelling, stdinInput);

      body = {
        voc_ids: vocIds,
        spellings,
        limit: Number(options.limit),
      };

      // Commander auto-generates --no-finished and --no-new as negations
      if (options.finished === true) {
        body.is_finished = true;
      } else if (options.finished === false) {
        body.is_finished = false;
      }

      if (options.new === true) {
        body.is_new = true;
      } else if (options.new === false) {
        body.is_new = false;
      }
    }

    const res = await api<GetTodayItemsResponse>(
      "/api/v1/study/get_today_items",
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      const rows = res.today_items.map((t) => ({ ...t }));
      printColumns(rows, "study_today");
    }

  });

studyCmd
  .command("records")
  .description("查询学习记录")
  .option("-S, --next-study-start <iso8601>", "下次学习日期起始（ISO 8601，北京时区）")
  .option("-E, --next-study-end <iso8601>", "下次学习日期截止（ISO 8601，北京时区）")
  .option("-v, --voc-id <id>", "按单词 ID 筛选（可重复）", collect, [])
  .option("-s, --spelling <word>", "按拼写筛选（可重复）", collect, [])
  .option("-c, --count", "仅返回计数")
  .option("-l, --limit <n>", "最大返回数，默认 50，上限 1000", "50")
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: QueryStudyRecordsRequest;
    let asCount = !!options.count;

    if (stdinJson && typeof stdinJson === "object") {
      body = stdinJson as QueryStudyRecordsRequest;
      asCount = body.as_count;
    } else {
      const vocIds = resolveArrayArg(options.vocId, stdinInput);
      const spellings = resolveArrayArg(options.spelling, stdinInput);

      body = {
        voc_ids: vocIds,
        spellings,
        as_count: asCount,
        limit: Number(options.limit),
      };
      if (options.nextStudyStart || options.nextStudyEnd) {
        body.next_study_date = {
          start: options.nextStudyStart,
          end: options.nextStudyEnd,
        };
      }
    }

    const res = await api<QueryStudyRecordsResponse>(
      "/api/v1/study/query_study_records",
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      if (asCount) {
        printColumns([{ count: String(res.count) }], "study_records_count");
      } else {
        const rows = res.records.map((r) => ({ ...r }));
        printColumns(rows, "study_records");
      }
    }
  });

studyCmd
  .command("add")
  .description("添加单词到学习计划")
  .option("-I, --id <id>", "单词 ID 列表（可重复，最多 1000）", collect, [])
  .option("-w, --word <word>", "单词拼写列表（可重复，最多 1000）", collect, [])
  .option("-a, --advance", "一并提前复习")
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: AddWordsRequest;

    if (stdinJson && typeof stdinJson === "object") {
      body = stdinJson as AddWordsRequest;
    } else {
      const ids = resolveArrayArg(options.id, stdinInput);
      const spellings = resolveArrayArg(options.word, stdinInput);
      if (ids.length === 0 && spellings.length === 0) {
        printError("错误: 缺少 --id 或 -w/--word");
        process.exit(1);
      }
      if (ids.length + spellings.length > 1000) {
        printError("错误: 超过最大限制 1000");
        process.exit(1);
      }
      body = {
        words: [
          ...ids.map((id: string) => ({ id })),
          ...spellings.map((spelling: string) => ({ spelling })),
        ],
        advance: !!options.advance,
      };
    }

    const res = await api<AddWordsResponse>(
      "/api/v1/study/add_words",
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      printColumns([{ added_count: String(res.added_count) }], "study_add");
    }
  });

studyCmd
  .command("advance")
  .description("提前复习")
  .option("-v, --voc-id <id>", "单词 ID 列表（可重复，最多 1000）", collect, [])
  .option("-w, --word <word>", "单词拼写列表（可重复，最多 1000）", collect, [])
  .action(async (options, cmd) => {
    const token = getToken(cmd);
    const globalOpts = (cmd as any).optsWithGlobals() as { output: string };
    const stdinInput = await readStdin();
    const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

    let body: AdvanceStudyRequest;

    if (stdinJson && typeof stdinJson === "object") {
      body = stdinJson as AdvanceStudyRequest;
    } else {
      const vocIds = resolveArrayArg(options.vocId, stdinInput);
      const spellings = resolveArrayArg(options.word, stdinInput);
      if (vocIds.length === 0 && spellings.length === 0) {
        printError("错误: 缺少 --voc-id 或 -w/--word");
        process.exit(1);
      }
      if (vocIds.length + spellings.length > 1000) {
        printError("错误: 超过最大限制 1000");
        process.exit(1);
      }
      body = { voc_ids: vocIds, spellings };
    }

    const res = await api<AdvanceStudyResponse>(
      "/api/v1/study/advance_study",
      { method: "POST", body },
      token,
    );

    if (isJsonOutput(globalOpts.output)) {
      printJson(res);
    } else {
      printColumns([{ advanced_count: String(res.advanced_count) }], "study_advance");
    }
  });
