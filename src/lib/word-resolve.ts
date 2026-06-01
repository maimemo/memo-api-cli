import { api } from "../client.js";
import type { GetVocabularyResponse } from "../types/vocabulary.js";
import { printError } from "../output.js";

export async function resolveVocId(
  spelling: string,
  token: string,
): Promise<string> {
  const res = await api<GetVocabularyResponse>(
    "/api/v1/vocabulary",
    { method: "GET", query: { spelling } },
    token,
  );

  if (!res.voc?.id) {
    printError(`错误: 单词 "${spelling}" 不存在`);
    process.exit(1);
  }

  return res.voc.id;
}
