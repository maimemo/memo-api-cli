export const DEFAULT_FIELDS: Record<string, string[]> = {
  note: ["id", "note_type", "note", "status"],
  interp: ["id", "interpretation", "tags", "status"],
  phrase: ["id", "phrase", "interpretation", "origin", "status"],
  notepad_list: ["id", "title", "brief", "status"],
  notepad: ["id", "title", "content", "brief", "tags", "status"],
  voc: ["id", "spelling"],
  study_progress: ["finished", "total", "study_time"],
  study_today: ["voc_id", "voc_spelling", "order", "is_new", "is_finished"],
  study_records_count: ["count"],
  study_records: ["voc_id", "voc_spelling", "study_count", "next_study_date", "tags"],
  study_add: ["added_count"],
  study_advance: ["advanced_count"],
};
