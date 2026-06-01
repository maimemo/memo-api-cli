// 墨墨开放 API — 释义 (interpretation) 类型定义
// 来源: maimemo/openapi/interpretation/v1/interpretation.proto

export const InterpretationStatus = {
  INTERPRETATION_STATUS_UNSPECIFIED: "INTERPRETATION_STATUS_UNSPECIFIED",
  PUBLISHED: "PUBLISHED",
  UNPUBLISHED: "UNPUBLISHED",
  DELETED: "DELETED",
} as const;

export type InterpretationStatus = (typeof InterpretationStatus)[keyof typeof InterpretationStatus];

export type Interpretation = {
  id: string;
  interpretation: string;
  tags: string[];
  status: InterpretationStatus;
  created_time?: string;
  updated_time?: string;
};

export type ListInterpretationsRequest = {
  voc_id: string;
};

export type ListInterpretationsResponse = {
  interpretations: Interpretation[];
};

export type CreateInterpretationRequest = {
  interpretation: {
    voc_id: string;
    interpretation: string;
    tags: string[];
    status: InterpretationStatus;
  };
};

export type CreateInterpretationResponse = {
  interpretation: Interpretation;
};

export type UpdateInterpretationRequest = {
  interpretation: {
    interpretation: string;
    tags: string[];
    status: InterpretationStatus;
  };
};

export type UpdateInterpretationResponse = {
  interpretation: Interpretation;
};
