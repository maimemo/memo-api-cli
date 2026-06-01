// 墨墨开放 API — 学习数据 (study) 类型定义
// 来源: maimemo/openapi/study/v1/study.proto

import type { StudyProgress, StudyRecord, StudyTodayItem } from "./study_model.js";

export type GetStudyProgressResponse = {
  progress: StudyProgress;
};

export type GetTodayItemsRequest = {
  is_finished?: boolean;
  is_new?: boolean;
  voc_ids: string[];
  spellings: string[];
  limit: number;
};

export type GetTodayItemsResponse = {
  today_items: StudyTodayItem[];
};

export type QueryStudyRecordsRequest = {
  next_study_date?: {
    start?: string;
    end?: string;
  };
  voc_ids: string[];
  spellings: string[];
  as_count: boolean;
  limit: number;
};

export type QueryStudyRecordsResponse = {
  records: StudyRecord[];
  count: number;
};

export type AddWordsRequest = {
  words: Array<{ id?: string; spelling?: string }>;
  advance: boolean;
};

export type AddWordsResponse = {
  added_count: number;
};

export type AdvanceStudyRequest = {
  voc_ids: string[];
  spellings: string[];
};

export type AdvanceStudyResponse = {
  advanced_count: number;
};
