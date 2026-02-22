// === Types ===

type MessageSummary = {
  id: string;
  threadId: string;
  sender: string;
  subject: string;
  snippet: string;
  date: string;
  labelIds: string[];
  isUnread: boolean;
};

type MessageDetail = MessageSummary & {
  to: string[];
  cc: string[];
  body: string;
  attachments: AttachmentInfo[];
};

type AttachmentInfo = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
};

// === Reading ===

declare function searchMail(query: string, maxResults?: number): Promise<MessageSummary[]>;

declare function getMessage(messageId: string): Promise<MessageDetail>;

declare function getThread(threadId: string): Promise<MessageDetail[]>;

// === Sending ===

declare function sendMail(params: {
  to: string | string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
}): Promise<{ messageId: string; threadId: string }>;
