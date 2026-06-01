// 墨墨开放 API — 单词 (vocabulary) 类型定义
// 来源: maimemo/openapi/vocabulary/v1/vocabulary.proto

export type Vocabulary = {
  id: string;
  spelling: string;
};

export type GetVocabularyRequest = {
  spelling: string;
};

export type GetVocabularyResponse = {
  voc?: Vocabulary;
};

export type ListVocabularyRequest = {
  /** 根据拼写查询，最多 1000 */
  spellings: string[];
  /** 根据 id 查询，最多 1000 */
  ids: string[];
};

export type ListVocabularyResponse = {
  voc: Vocabulary[];
};
