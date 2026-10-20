import type { CommandModule, Argv } from "yargs";
import { startLogin, getUserInfo } from "../lib/oidc.js";
import { printJson, printSuccess, printError } from "../output.js";
import { isJsonOutput } from "../lib/helpers.js";

interface LoginArgs {
  output: string;
}

const loginBuilder = (_yargs: Argv) => _yargs;

const loginHandler = async (argv: LoginArgs) => {
  const result = await startLogin();

  if (isJsonOutput(argv.output)) {
    printJson({ uid: result.uid, name: result.name });
  } else {
    printSuccess(`登录成功: ${result.name} (${result.uid})`);
  }
};

interface WhoamiArgs {
  output: string;
  token: string;
}

const whoamiBuilder = (_yargs: Argv) => _yargs;

const whoamiHandler = async (argv: WhoamiArgs) => {
  const tokenSource = (argv as any)._tokenSource as string | undefined;

  if (tokenSource !== "oidc") {
    printError("错误: whoami 仅支持 OIDC 登录，请先执行 memo-api auth login");
    process.exit(1);
  }

  const token = (argv as any).token as string;
  const userInfo = await getUserInfo(token);

  if (isJsonOutput(argv.output)) {
    printJson(userInfo);
  } else {
    const uid = userInfo.uid;
    const name = userInfo.name;
    process.stdout.write(`Name\tUID(anonymized)\n`);
    process.stdout.write(`${name}\t${uid}\n`);
  }
};

export const authCmd: CommandModule = {
  command: "auth",
  describe: "OIDC 登录与身份查询（login / whoami）",
  builder: (yargs) =>
    yargs
      .command("login", "登录", loginBuilder, loginHandler as any)
      .command("whoami", "显示当前用户 UID 和昵称", whoamiBuilder, whoamiHandler as any)
      .help(),
  handler: () => {},
};
