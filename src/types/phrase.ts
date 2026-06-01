// 墨墨开放 API — 例句 (phrase) 类型定义
// 来源: maimemo/openapi/phrase/v1/phrase.proto

export const PhraseStatus = {
  PHRASE_STATUS_UNSPECIFIED: "PHRASE_STATUS_UNSPECIFIED",
  PUBLISHED: "PUBLISHED",
  DELETED: "DELETED",
} as const;

export type PhraseStatus = (typeof PhraseStatus)[keyof typeof PhraseStatus];

export type PhraseHighlightRange = {
  /** 高亮起始位置 [start, end) */
  start: number;
  /** 高亮结束位置（不包含） */
  end: number;
};

export type Phrase = {
  id: string;
  phrase: string;
  interpretation: string;
  tags: string[];
  highlight: PhraseHighlightRange[];
  status: PhraseStatus;
  created_time?: string;
  updated_time?: string;
  origin: string;
};

export type ListPhrasesRequest = {
  voc_id: string;
};

export type ListPhrasesResponse = {
  phrases: Phrase[];
};

export type CreatePhraseRequest = {
  phrase: {
    voc_id: string;
    phrase: string;
    interpretation: string;
    tags: string[];
    origin: string;
  };
};

export type CreatePhraseResponse = {
  phrase: Phrase;
};

export type UpdatePhraseRequest = {
  phrase: {
    phrase: string;
    interpretation: string;
    tags: string[];
    origin: string;
  };
};

export type UpdatePhraseResponse = {
  phrase: Phrase;
};

export type DeletePhraseResponse = {
  phrase: Phrase;
};
