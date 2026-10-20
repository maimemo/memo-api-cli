// 墨墨开放 API — 学习数据 (study) 模型类型定义
// 来源: maimemo/openapi/study/v1/study_model.proto

export const StudyResponse = {
  STUDY_RESPONSE_UNSPECIFIED: "STUDY_RESPONSE_UNSPECIFIED",
  FAMILIAR: "FAMILIAR",
  VAGUE: "VAGUE",
  FORGET: "FORGET",
  WELL_FAMILIAR: "WELL_FAMILIAR",
  CANCEL_WELL_FAMILIAR: "CANCEL_WELL_FAMILIAR",
} as const;

export type StudyResponse = (typeof StudyResponse)[keyof typeof StudyResponse];

export type StudyProgress = {
  finished: number;
  total: number;
  study_time: number;
};

export type StudyTodayItem = {
  voc_id: string;
  voc_spelling: string;
  order: number;
  first_response?: StudyResponse;
  is_new: boolean;
  is_finished: boolean;
};

export type StudyRecordTag =
  | "STUDY_RECORD_TAG_UNSPECIFIED"
  | "STICKING"
  | "WELL_FAMILIAR";

export type StudyRecord = {
  voc_id: string;
  voc_spelling: string;
  add_date?: string;
  first_study_date?: string;
  last_study_date?: string;
  next_study_date?: string;
  last_response?: StudyResponse;
  study_count: number;
  tags: StudyRecordTag[];
};
