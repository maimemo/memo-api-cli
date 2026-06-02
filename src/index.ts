#!/usr/bin/env node
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { noteCmd } from "./commands/note.js";
import { interpCmd } from "./commands/interp.js";
import { phraseCmd } from "./commands/phrase.js";
import { notepadCmd } from "./commands/notepad.js";
import { vocCmd } from "./commands/voc.js";
import { studyCmd } from "./commands/study.js";
import { resolveToken } from "./lib/auth.js";
import { setColor, setShowHeader, setSelectedFields } from "./output.js";
import { setVerbose } from "./client.js";

await yargs(hideBin(process.argv))
  .scriptName("memo-api")
  .usage("$0 <command> [options]")
  .epilogue(`示例:
  $ memo-api voc get --spelling=apple
  $ memo-api note list --word=apple -O json
  $ memo-api study progress
  $ echo '{"spelling":"apple"}' | memo-api voc get

高级用法:
  所有命令支持 stdin JSON 输入作为 API 请求体，管道传入时自动跳过命令行参数校验。
  数组参数可通过重复 flag 指定（-g A -g B），或通过 stdin 换行输入（-g -）。
  详情见各子命令 --help。
`)

  .option("token", { alias: "T", type: "string", description: "API Token（也可通过 MAIMEMO_API_TOKEN 环境变量或 ~/.config/memo-api.json 配置）" })
  .option("output", { alias: "O", type: "string", choices: ["json", "column"], default: "column", description: "输出格式：json 或 column" })
  .option("color", { type: "boolean", default: true, description: "是否开启颜色" })
  .option("verbose", { type: "boolean", description: "显示请求详情和原始响应" })
  .option("header", { type: "boolean", default: true, description: "是否显示表头（--no-header 关闭）" })
  .option("H", { type: "boolean", hidden: true, description: "等同于 --no-header" })
  .option("fields", { type: "string", description: "选择展示的字段（逗号分隔）。以 + 开头追加，以 - 开头移除" })

  .middleware((argv) => {
    if (argv.color === false) {
      setColor(false);
    }
    if (argv.verbose) {
      setVerbose(true);
    }
    if (argv.H === true) {
      argv.header = false;
    }
    if (argv.header === false) {
      setShowHeader(false);
    }
    if (argv.fields) {
      setSelectedFields(argv.fields);
    }
    const isHelpCommand = argv.help === true
      || (argv._.length > 0 && argv._[0] === "completion");
    if (!isHelpCommand) {
      (argv as any).token = resolveToken({ token: argv.token });
    }
  })

  .command(noteCmd)
  .command(interpCmd)
  .command(phraseCmd)
  .command(notepadCmd)
  .command(vocCmd)
  .command(studyCmd)

  .demandCommand(1, "请指定子命令。使用 --help 查看可用命令。")
  .strict()
  .recommendCommands()
  .completion()
  .help()
  .parseAsync();
