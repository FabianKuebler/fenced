export type MessageSummary = {
  id: string;
  threadId: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  labelIds: string[];
  isUnread: boolean;
};

export type MessageDetail = MessageSummary & {
  to: string[];
  cc: string[];
  body: string;
  attachments: AttachmentInfo[];
};

export type AttachmentInfo = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

export type Label = {
  id: string;
  name: string;
  type: "system" | "user";
};

export type Draft = {
  id: string;
  message: MessageSummary;
};

export type ListMessagesParams = {
  maxResults?: number;
  q?: string;
  labelIds?: string[];
  pageToken?: string;
};

export type ListMessagesResult = {
  messages: MessageSummary[];
  nextPageToken?: string;
};

export type SendMailParams = {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  replyToMessageId?: string;
};

export type SendResult = {
  messageId: string;
  threadId: string;
};

export type ReplyParams = {
  body: string;
  cc?: string[];
  bcc?: string[];
};

export type ForwardParams = {
  to: string | string[];
  additionalBody?: string;
};

export type CreateDraftParams = {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
};

export type ListDraftsParams = {
  maxResults?: number;
  pageToken?: string;
};

export type ListDraftsResult = {
  drafts: Draft[];
  nextPageToken?: string;
};

export type ModifyLabelsParams = {
  addLabelIds?: string[];
  removeLabelIds?: string[];
};

export type AttachmentData = {
  data: string;
  filename: string;
  mimeType: string;
};
