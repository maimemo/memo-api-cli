import type { CommandModule, Argv } from "yargs";
import { api } from "../client.js";
import { readStdin, tryParseJson } from "../stdin.js";
import { printJson, printColumns, printError } from "../output.js";
import { isJsonOutput, resolveArrayArg } from "../lib/helpers.js";
import { resolveVocIdsBySpellings } from "../lib/word-resolve.js";
import type { StudyRecordTag } from "../types/study_model.js";
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

interface StudyProgressArgs {
  token: string;
  output: string;
}

const progressBuilder = (yargs: Argv) => yargs;

const progressHandler = async (argv: StudyProgressArgs) => {
  const token = (argv as any).token as string;

  const res = await api<GetStudyProgressResponse>(
    "/api/v1/memo/study/get_study_progress",
    { method: "POST", body: {} },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const p = res.progress;
    printColumns([{ ...p }], "study_progress");
  }
};

interface StudyTodayArgs {
  token: string;
  output: string;
  finished?: boolean;
  vocId?: string[];
  spelling?: string[];
  limit?: number;
}

const todayBuilder = (yargs: Argv) =>
  yargs
    .option("finished", { alias: "F", type: "boolean", description: "仅筛选已完成的" })
    .option("new", { alias: "n", type: "boolean", description: "仅筛选新学单词（--no-new 筛选非新学）" })
    .option("voc-id", { alias: "v", type: "array", default: [] as string[], description: "按单词 ID 筛选（可重复，最多 1000）" })
    .option("spelling", { alias: "s", type: "array", default: [] as string[], description: "按拼写筛选（可重复，最多 1000）" })
    .option("limit", { alias: "l", type: "number", default: 50, description: "最大返回数，默认 50，上限 1000" })
    .epilogue(`筛选参数：
  --finished    仅筛选已完成单词
  --no-finished 仅筛选未完成单词
  -n, --new     仅筛选新学单词
  --no-new      仅筛选非新学单词
`);

const todayHandler = async (argv: StudyTodayArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: GetTodayItemsRequest;

  if (stdinJson && typeof stdinJson === "object") {
    body = stdinJson as GetTodayItemsRequest;
  } else {
    const vocIds = resolveArrayArg(argv.vocId ?? [], stdinInput);
    const spellings = resolveArrayArg(argv.spelling ?? [], stdinInput);

    body = {
      voc_ids: vocIds,
      spellings,
      limit: argv.limit ?? 50,
    };

    if (argv.finished === true) {
      body.is_finished = true;
    } else if (argv.finished === false) {
      body.is_finished = false;
    }

    const isNew: boolean | undefined = (argv as any).new;
    if (isNew === true) {
      body.is_new = true;
    } else if (isNew === false) {
      body.is_new = false;
    }
  }

  const res = await api<GetTodayItemsResponse>(
    "/api/v1/memo/study/get_today_items",
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    const rows = res.today_items.map((t) => ({ ...t }));
    printColumns(rows, "study_today");
  }
};

interface StudyRecordsArgs {
  token: string;
  output: string;
  nextStudyStart?: string;
  nextStudyEnd?: string;
  vocId?: string[];
  spelling?: string[];
  tag?: string[];
  count?: boolean;
  limit?: number;
}

const recordsBuilder = (yargs: Argv) =>
  yargs
    .option("next-study-start", { alias: "S", type: "string", description: "下次学习日期起始（ISO 8601，北京时区）" })
    .option("next-study-end", { alias: "E", type: "string", description: "下次学习日期截止（ISO 8601，北京时区）" })
    .option("voc-id", { alias: "v", type: "array", default: [] as string[], description: "按单词 ID 筛选（可重复）" })
    .option("spelling", { alias: "s", type: "array", default: [] as string[], description: "按拼写筛选（可重复）" })
    .option("tag", { alias: "t", type: "array", default: [] as string[], choices: ["STICKING"], description: "按标签筛选（可重复，目前仅支持 STICKING 顽固单词；与 -v/-s 同用时不生效）" })
    .option("count", { alias: "c", type: "boolean", description: "仅返回计数" })
    .option("limit", { alias: "l", type: "number", default: 50, description: "最大返回数，默认 50，上限 1000" });

const recordsHandler = async (argv: StudyRecordsArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: QueryStudyRecordsRequest;
  let asCount = !!argv.count;

  if (stdinJson && typeof stdinJson === "object") {
    body = stdinJson as QueryStudyRecordsRequest;
    asCount = body.as_count;
  } else {
    const vocIds = resolveArrayArg(argv.vocId ?? [], stdinInput);
    const spellings = resolveArrayArg(argv.spelling ?? [], stdinInput);

    body = {
      voc_ids: vocIds,
      spellings,
      as_count: asCount,
      limit: argv.limit ?? 50,
    };
    const tags = (argv.tag ?? []) as StudyRecordTag[];
    if (tags.length > 0) {
      body.tags = tags;
    }
    if (argv.nextStudyStart || argv.nextStudyEnd) {
      body.next_study_date = {
        start: argv.nextStudyStart,
        end: argv.nextStudyEnd,
      };
    }
  }

  const res = await api<QueryStudyRecordsResponse>(
    "/api/v1/memo/study/query_study_records",
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    if (asCount) {
      printColumns([{ count: String(res.count) }], "study_records_count");
    } else {
      const rows = res.records.map((r) => ({ ...r }));
      printColumns(rows, "study_records");
    }
  }
};

interface StudyAddArgs {
  token: string;
  output: string;
  id?: string[];
  word?: string[];
  advance?: boolean;
}

const addBuilder = (yargs: Argv) =>
  yargs
    .option("id", { alias: "I", type: "array", default: [] as string[], description: "单词 ID 列表（可重复，最多 1000）" })
    .option("word", { alias: "w", type: "array", default: [] as string[], description: "单词拼写列表（可重复，最多 1000）" })
    .option("advance", { alias: "a", type: "boolean", description: "一并提前复习" });

const addHandler = async (argv: StudyAddArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: AddWordsRequest;

  if (stdinJson && typeof stdinJson === "object") {
    body = stdinJson as AddWordsRequest;
  } else {
    const ids = resolveArrayArg(argv.id ?? [], stdinInput);
    const spellings = resolveArrayArg(argv.word ?? [], stdinInput);
    if (ids.length === 0 && spellings.length === 0) {
      printError("错误: 缺少 --id 或 -w/--word");
      process.exit(1);
    }
    if (ids.length + spellings.length > 1000) {
      printError("错误: 超过最大限制 1000");
      process.exit(1);
    }
    const resolvedIds = spellings.length > 0
      ? await resolveVocIdsBySpellings(spellings, token)
      : [];
    body = {
      words: [
        ...ids.map((id: string) => ({ id })),
        ...resolvedIds.map((id: string) => ({ id })),
      ],
      advance: !!argv.advance,
    };
  }

  const res = await api<AddWordsResponse>(
    "/api/v1/memo/study/add_words",
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    printColumns([{ added_count: String(res.added_count) }], "study_add");
  }
};

interface StudyAdvanceArgs {
  token: string;
  output: string;
  vocId?: string[];
  word?: string[];
}

const advanceBuilder = (yargs: Argv) =>
  yargs
    .option("voc-id", { alias: "v", type: "array", default: [] as string[], description: "单词 ID 列表（可重复，最多 1000）" })
    .option("word", { alias: "w", type: "array", default: [] as string[], description: "单词拼写列表（可重复，最多 1000）" });

const advanceHandler = async (argv: StudyAdvanceArgs) => {
  const token = (argv as any).token as string;
  const stdinInput = await readStdin();
  const stdinJson = stdinInput ? tryParseJson(stdinInput) : null;

  let body: AdvanceStudyRequest;

  if (stdinJson && typeof stdinJson === "object") {
    body = stdinJson as AdvanceStudyRequest;
  } else {
    const vocIds = resolveArrayArg(argv.vocId ?? [], stdinInput);
    const spellings = resolveArrayArg(argv.word ?? [], stdinInput);
    if (vocIds.length === 0 && spellings.length === 0) {
      printError("错误: 缺少 --voc-id 或 -w/--word");
      process.exit(1);
    }
    if (vocIds.length + spellings.length > 1000) {
      printError("错误: 超过最大限制 1000");
      process.exit(1);
    }
    const resolvedIds = spellings.length > 0
      ? await resolveVocIdsBySpellings(spellings, token)
      : [];
    body = { voc_ids: [...vocIds, ...resolvedIds] };
  }

  const res = await api<AdvanceStudyResponse>(
    "/api/v1/memo/study/advance_study",
    { method: "POST", body },
    token,
  );

  if (isJsonOutput(argv.output)) {
    printJson(res);
  } else {
    printColumns([{ advanced_count: String(res.advanced_count) }], "study_advance");
  }
};

export const studyCmd: CommandModule = {
  command: "study",
  describe: "学习数据（progress / today / records / add / advance）",
  builder: (yargs) =>
    yargs
      .command("progress", "获取今日学习进度", progressBuilder, progressHandler as any)
      .command("today", "获取今日学习单词", todayBuilder, todayHandler as any)
      .command("records", "查询学习记录", recordsBuilder, recordsHandler as any)
      .command("add", "添加单词到学习计划", addBuilder, addHandler as any)
      .command("advance", "提前复习", advanceBuilder, advanceHandler as any)
      .help()
      .epilogue(`示例:
  $ memo-api study progress
  $ memo-api study today
  $ memo-api study records -c
  $ memo-api study records -t STICKING
  $ memo-api study add -w apple -w banana
  $ memo-api study add --id voc123 --word happy
`),
  handler: () => {},
};
