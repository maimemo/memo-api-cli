import { Command } from "commander";
import { noteCmd } from "./commands/note.js";
import { interpCmd } from "./commands/interp.js";
import { phraseCmd } from "./commands/phrase.js";
import { notepadCmd } from "./commands/notepad.js";
import { vocCmd } from "./commands/voc.js";
import { studyCmd } from "./commands/study.js";
import { resolveToken } from "./lib/auth.js";
import { setColor, setShowHeader, setSelectedFields } from "./output.js";
import { setVerbose } from "./client.js";

const program = new Command("memo-api")
  .description("调用墨墨开放 API")
  .option("-T, --token <string>", "API Token（也可通过 MAIMEMO_API_TOKEN 环境变量或 ~/.config/memo-api.json 配置）")
  .option("-O, --output <format>", "输出格式：json 或 column", "column")
  .option("--no-color", "禁用颜色")
  .option("--verbose", "显示请求详情和原始响应")
  .option("-H, --no-header", "跳过表头行")
  .option("--fields <fields>", "选择展示的字段（逗号分隔）。以 + 开头追加，以 - 开头移除")
  .addHelpText(
    "after",
    `
示例:
  $ memo-api voc get --spelling=apple
  $ memo-api note list --word=apple -O json
  $ memo-api study progress
  $ echo '{"spelling":"apple"}' | memo-api voc get

高级用法:
  所有命令支持 stdin JSON 输入作为 API 请求体，管道传入时自动跳过命令行参数校验。
  数组参数可通过重复 flag 指定（-g A -g B），或通过 stdin 换行输入（-g -）。
  详情见各子命令 --help。
`,
  );

program.hook("preAction", (parentCmd, actionCmd) => {
  const opts = actionCmd.optsWithGlobals<{
    token?: string;
    color?: boolean;
    verbose?: boolean;
    header?: boolean;
    fields?: string;
  }>();

  if (opts.color === false) {
    setColor(false);
  }

  if (opts.verbose) {
    setVerbose(true);
  }

  if (opts.header === false) {
    setShowHeader(false);
  }

  if (opts.fields) {
    setSelectedFields(opts.fields);
  }

  const token = resolveToken({ token: opts.token });
  (actionCmd as Command & { _apiToken: string })._apiToken = token;
});

program.addCommand(noteCmd);
program.addCommand(interpCmd);
program.addCommand(phraseCmd);
program.addCommand(notepadCmd);
program.addCommand(vocCmd);
program.addCommand(studyCmd);

await program.parseAsync(process.argv);
