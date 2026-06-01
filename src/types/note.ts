// 墨墨开放 API — 助记 (note) 类型定义
// 来源: maimemo/openapi/note/v1/note.proto

export const NoteStatus = {
  NOTE_STATUS_UNSPECIFIED: "NOTE_STATUS_UNSPECIFIED",
  PUBLISHED: "PUBLISHED",
  DELETED: "DELETED",
} as const;

export type NoteStatus = (typeof NoteStatus)[keyof typeof NoteStatus];

export type Note = {
  /** id @Example 5a7BFf4F63612e5AD9fdebB7a50D3881 */
  id: string;
  /** 类型 @Example 谐音 */
  note_type: string;
  /** 助记 @Example apple */
  note: string;
  /** 状态 @Example PUBLISHED */
  status: NoteStatus;
  /** 创建时间 ISO 8601 */
  created_time?: string;
  /** 更新时间 ISO 8601 */
  updated_time?: string;
};

export type ListNotesRequest = {
  /** 单词 id @Example 5a7BFf4F63612e5AD9fdebB7a50D3881 */
  voc_id: string;
};

export type ListNotesResponse = {
  notes: Note[];
};

export type CreateNoteRequest = {
  note: {
    voc_id: string;
    note_type: string;
    note: string;
  };
};

export type CreateNoteResponse = {
  note: Note;
};

export type UpdateNoteRequest = {
  note: {
    note_type: string;
    note: string;
  };
};

export type UpdateNoteResponse = {
  note: Note;
};
