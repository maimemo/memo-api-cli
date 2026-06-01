import { api } from "../client.js";
import type {
  GetVocabularyResponse,
  ListVocabularyResponse,
} from "../types/vocabulary.js";
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

export async function resolveVocIdsBySpellings(
  spellings: string[],
  token: string,
): Promise<string[]> {
  const res = await api<ListVocabularyResponse>(
    "/api/v1/vocabulary/query",
    { method: "POST", body: { spellings, ids: [] } },
    token,
  );

  const spellingMap = new Map(res.voc.map((v) => [v.spelling, v.id]));
  const missing = spellings.filter((s) => !spellingMap.has(s));
  if (missing.length > 0) {
    printError(`错误: 以下单词不存在: ${missing.join(", ")}`);
    process.exit(1);
  }

  return spellings.map((s) => spellingMap.get(s)!);
}
