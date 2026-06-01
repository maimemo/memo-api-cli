import { getConfig } from "../config.js";
import { printError } from "../output.js";

export function resolveToken(opts: { token?: string | undefined }): string {
  const token =
    opts.token ||
    process.env["MAIMEMO_API_TOKEN"] ||
    getConfig().apiToken;

  if (!token) {
    printError(
      "错误: 缺少 API Token。请通过 -T、MAIMEMO_API_TOKEN 环境变量或 ~/.config/memo-api.json 提供。",
    );
    process.exit(1);
  }

  return token;
}
