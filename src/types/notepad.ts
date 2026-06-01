// 墨墨开放 API — 云词本 (notepad) 类型定义
// 来源: maimemo/openapi/notepad/v1/notepad.proto

export const NotepadStatus = {
  NOTEPAD_STATUS_UNSPECIFIED: "NOTEPAD_STATUS_UNSPECIFIED",
  PUBLISHED: "PUBLISHED",
  UNPUBLISHED: "UNPUBLISHED",
  DELETED: "DELETED",
} as const;

export type NotepadStatus = (typeof NotepadStatus)[keyof typeof NotepadStatus];

export const NotepadType = {
  NOTEPAD_TYPE_UNSPECIFIED: "NOTEPAD_TYPE_UNSPECIFIED",
  FAVORITE: "FAVORITE",
  NOTEPAD: "NOTEPAD",
} as const;

export type NotepadType = (typeof NotepadType)[keyof typeof NotepadType];

export type NotepadParsedItem = {
  type: "PARSED_TYPE_UNSPECIFIED" | "CHAPTER" | "WORD";
  data?: {
    chapter: string;
    word: string;
  };
};

export type Notepad = {
  id: string;
  type: NotepadType;
  creator: number;
  status: NotepadStatus;
  content: string;
  title: string;
  brief: string;
  tags: string[];
  list: NotepadParsedItem[];
  created_time?: string;
  updated_time?: string;
};

export type BriefNotepad = {
  id: string;
  type: NotepadType;
  creator: number;
  status: NotepadStatus;
  title: string;
  brief: string;
  tags: string[];
  created_time?: string;
  updated_time?: string;
};

export type ListNotepadsRequest = {
  limit: number;
  offset: number;
  ids: string[];
};

export type ListNotepadsResponse = {
  notepads: BriefNotepad[];
};

export type GetNotepadResponse = {
  notepad: Notepad;
};

export type CreateNotepadRequest = {
  notepad: {
    status: NotepadStatus;
    content: string;
    title: string;
    brief: string;
    tags: string[];
  };
};

export type CreateNotepadResponse = {
  notepad: Notepad;
};

export type UpdateNotepadRequest = {
  notepad: {
    status: NotepadStatus;
    content: string;
    title: string;
    brief: string;
    tags: string[];
  };
};

export type UpdateNotepadResponse = {
  notepad: Notepad;
};

export type DeleteNotepadResponse = {
  notepad: Notepad;
};
